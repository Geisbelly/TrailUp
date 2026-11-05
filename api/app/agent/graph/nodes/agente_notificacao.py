"""Notificação push personalizada por aluno e por perfil BrainHex, com RAG (#66).

Ordem de decisão (decisão de 01/11):
1. **RAG + LLM:** com o Vector Store configurado, o modelo consulta a base de evidências
   (`file_search`, o mesmo caminho do mentor, #165) para escolher tom e horário para o perfil,
   e diz em `evidencia` o que embasou a escolha;
2. **LLM sem RAG:** sem RAG (ou se ele falhar), o mesmo prompt segue só a assinatura editorial do
   perfil;
3. **Regra:** modelo fora do ar, texto pronto no tom do perfil. Nunca fica sem notificação: o motivo
   (emoção negativa, inatividade) é dado, não opinião do modelo.

O horário que sai do modelo passa por uma guarda: nunca no passado, nunca a mais de 24 h e nunca
entre 22h e 7h de Brasília. Ele vai para `notificacoes_ia.horario_sugerido`, e quem decide de fato é
o banco (`notificacoes_ia_promover`, 20261102_01): suporte sai logo, lembrete vai para o horário
habitual do aluno quando há, e o silêncio vale no fuso dele. O texto recebe o tópico em andamento e
o próximo conteúdo (`foco`), também no texto pronto da regra.

O que vai ao modelo não identifica o aluno (#195); na rota de menor nada vai ao modelo, pelos dois
caminhos (o RAG também é barrado antes da busca).

**O texto fala com o aluno, em palavras simples.** O modelo recebia a assinatura editorial do
perfil, feita para o MATERIAL de estudo, e copiava os marcadores dela para o push: com o Mastermind,
"hipótese", "evidência", "trade-off" e "modelo" chegavam ao aluno ("A evidência sugere que
consolidar o próximo bloco otimiza o aprendizado", produção, 01/11). Agora o perfil entra como um
jeito de falar próprio da notificação (`_JEITO_NA_NOTIFICACAO`), e `problemas_do_texto` recusa
vocabulário de sistema, placeholder e frase longa. Texto recusado volta ao modelo uma vez, com os
problemas; se ainda vier errado, vale o texto pronto do perfil.

**O banco só entrega texto que passou por esta guarda** (`20261102_24`). A guarda vale na geração, mas
a sugestão espera na fila até o horário do aluno: o texto de 01/11, escrito antes dela, saiu em
02/11 às 14:30. Todo texto que sai daqui leva `contexto.texto_guarda` = `TEXTO_GUARDA_VERSAO`, e
`notificacoes_entregar` suprime a sugestão da API sem a marca ou com marca abaixo de
`notificacoes_config.texto_guarda_versao_minima`. Mudou a guarda de um jeito que torna recusável o
que antes passava? Suba `TEXTO_GUARDA_VERSAO` e, numa migração, o mínimo do banco.
"""

import re
import unicodedata
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.agent.graph.nodes.agente_intervencao import _TERMOS_DE_EMOCAO
from app.core.settings import Settings
from app.schemas.notificacao import NotificacaoPayload
from app.services.llm import JsonLLMService, StructuredOutputError
from app.services.openai_rag import OpenAIRagService
from app.services.personalizacao import _build_profile_editorial_context, _normalize_profile_label

BRASILIA = timezone(timedelta(hours=-3))
_SILENCIO_INICIO = 22
_SILENCIO_FIM = 7


class NotificacaoGerada(BaseModel):
    tipo: Literal["suporte", "lembrete", "conquista"]
    titulo: str = Field(min_length=1, max_length=60)
    corpo: str = Field(min_length=1, max_length=200)
    horario: datetime
    prioridade: int = Field(ge=0, le=3)
    evidencia: str | None = Field(default=None, max_length=300)


# Mesma regra de `perfilVisualDoAluno` (mobile/src/utils/brainHex.ts) e de
# `notificacoes_perfil_do_aluno` (20261103_12): o perfil escolhido vale quando é representativo
# (1º ou 2º com afinidade > 0, ou afinidade >= 20); senão, o dominante.
_SINAL_MINIMO = 20.0


def _perfil_da_tela(state: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """O perfil que o app mostra ao aluno, e os perfis em ordem de afinidade.

    O texto sai com o guia e o tom DESTE perfil: é o guia que o aluno vê na tela, e o banco resolve
    `{guia}` e escolhe o material pelo mesmo perfil. Usar o dominante fazia quem escolheu o
    secundário receber o recado de outro guia.
    """
    perfis = [p for p in state.get("perfil_brainhex") or [] if isinstance(p, dict)]

    def chave(p: dict[str, Any]) -> str:
        return _normalize_profile_label(p.get("perfil") or p.get("nome")) or ""

    # Desempate pelo nome, como o app e o banco: a ordem de chegada das linhas não decide.
    perfis = sorted(perfis, key=lambda p: (-float(p.get("afinidade") or 0), chave(p)))
    if not perfis:
        return "Mastermind", perfis
    ativo = _normalize_profile_label(state.get("perfil_ativo"))
    if ativo:
        for i, p in enumerate(perfis):
            afinidade = float(p.get("afinidade") or 0)
            if chave(p) == ativo and ((i <= 1 and afinidade > 0) or afinidade >= _SINAL_MINIMO):
                return ativo, perfis
    return str(perfis[0].get("perfil") or perfis[0].get("nome")), perfis


# Como cada perfil fala NUMA NOTIFICAÇÃO: em palavras simples, sem os marcadores da assinatura
# editorial (que são do material de estudo e viravam jargão no push). `exemplo` mostra o tom; o
# modelo não deve copiá-lo.
_JEITO_NA_NOTIFICACAO: dict[str, dict[str, str]] = {
    "Seeker": {
        "tom_voz": "curioso e animado, convida a descobrir algo novo",
        "exemplo": "Tem uma coisa nova em Frações esperando por você. Bora descobrir?",
    },
    "Survivor": {
        "tom_voz": "calmo e seguro, propõe um passo pequeno, sem pressa e sem pressão",
        "exemplo": "Um passo pequeno em Frações hoje já ajuda. Vai no seu ritmo.",
    },
    "Daredevil": {
        "tom_voz": "animado e direto, chama para um desafio rápido",
        "exemplo": "Desafio rápido em Frações: topa resolver um agora?",
    },
    "Mastermind": {
        "tom_voz": "calmo e claro, mostra como a ideia nova se liga ao que o aluno já sabe",
        "exemplo": "A próxima parte de Frações se liga ao que você já viu. Que tal entender como?",
    },
    "Conqueror": {
        "tom_voz": "direto e confiante, fala de vencer a próxima etapa",
        "exemplo": "Falta pouco para fechar Frações. Mais uma etapa e é sua!",
    },
    "Socializer": {
        "tom_voz": "acolhedor, fala da turma e de fazer junto",
        "exemplo": "Sua turma está avançando em Frações. Vem junto no próximo passo!",
    },
    "Achiever": {
        "tom_voz": "organizado e motivador, fala de meta e de progresso",
        "exemplo": "Mais um item de Frações e sua meta chega mais perto. Vamos?",
    },
}


def _chave_das_tabelas(perfil: str | None) -> str:
    """A chave das tabelas de texto deste módulo, que grafam "Socializer".

    `_normalize_profile_label` devolve "Socialiser" (a grafia do banco). Sem esta ponte, o
    Socializer caía no `else "Mastermind"` das tabelas e recebia o tom e os textos do Mastermind.
    """
    rotulo = _normalize_profile_label(perfil)
    rotulo = "Socializer" if rotulo == "Socialiser" else rotulo
    return rotulo if rotulo in _TEXTOS_DA_REGRA else "Mastermind"


def _contexto_do_perfil(state: dict[str, Any]) -> dict[str, Any]:
    da_tela, perfis = _perfil_da_tela(state)
    ctx = _build_profile_editorial_context(da_tela, perfis)
    perfil = ctx.get("perfil_dominante")
    chave = _chave_das_tabelas(perfil)
    return {"perfil_dominante": perfil, "guia_nome": ctx.get("guia_nome"), **_JEITO_NA_NOTIFICACAO[chave]}


# Palavras de sistema ou de relatório que não são para o aluno. Casam pelo radical, sem acento.
_TERMOS_DE_SISTEMA = re.compile(
    r"\b(evidencias?|hipoteses?|trade-?offs?|otimiz\w*|consolid\w*|valid\w*|progressao|"
    r"metricas?|algoritmos?|sistemas?|telemetria|engajamento|desempenho|brainhex|perfis|perfil|"
    r"modulos?|ciclos?|blocos?|modelos?|analis\w*|analise|dados|estrategic\w*|eficiencia)\b"
)
# O aluno não pode ler que foi observado. Casa sem acento, como os termos de sistema.
_TERMOS_DE_VIGILANCIA = re.compile(
    r"\b(monitor\w*|vigi\w*|rastre\w*|detect\w*|camera|cameras|coletad\w*"
    r"|acompanh(?:amos|ando|ei) (?:cada|seus?|suas?|voce|tudo))\b"
)
# Só aqui, não em `_TERMOS_DE_EMOCAO`: aquele filtra também o texto que o professor lê, onde falar de
# cansaço da turma é legítimo. Ao aluno, o sistema não pode dizer o que ele sente (DAT-45).
_EMOCAO_AO_ALUNO = re.compile(r"\b(desanimad\w*|desanimo|cansad\w*|cansaco|abatid\w*|angusti\w*|nervos[oa]s?)\b")
# Sobre o texto sem nome de tópico: "O aluno e a escola" pode ser tópico do professor.
_TERCEIRA_PESSOA = re.compile(r"\b[oa] (alun[oa]|estudante)\b")
_PLACEHOLDER = re.compile(r"[\[\]{}<>]|\bMOCK\b|\bAlun[oa]\b|\bEstudante\b")
_PALAVRAS_POR_FRASE = 18
# Versão desta guarda, gravada em `contexto.texto_guarda`. O banco não entrega abaixo do mínimo dele.
TEXTO_GUARDA_VERSAO = 3


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn").lower()


def problemas_do_texto(titulo: str, corpo: str, foco: dict[str, Any] | None = None) -> list[str]:
    """Pura. O que impede o texto de ir ao aluno; lista vazia = pode ir.

    O nome do tópico e do próximo conteúdo é do professor ("Ciclo da água", "Modelo atômico") e sai
    da conta antes da busca por termo de sistema.
    """
    texto = f"{titulo}. {corpo}"
    problemas: list[str] = []
    # `{nome}` é o único marcador aceito: o banco o troca pelo nome do aluno na entrega (20261103_12).
    if (titulo.count("{nome}") + corpo.count("{nome}")) > 1:
        problemas.append("usa {nome} mais de uma vez")
    if _PLACEHOLDER.search(texto.replace("{nome}", "")):
        problemas.append("tem placeholder ou marcação ([...], MOCK, 'Aluno')")
    livre = _sem_acento(texto)
    for nome in ((foco or {}).get("topico"), (foco or {}).get("proximo_conteudo")):
        if nome:
            livre = livre.replace(_sem_acento(str(nome)), " ")
    if _TERCEIRA_PESSOA.search(livre):
        problemas.append("fala do aluno na terceira pessoa")
    termos = sorted({m.group(0) for m in _TERMOS_DE_SISTEMA.finditer(livre)})
    if termos:
        problemas.append("usa palavras de sistema: " + ", ".join(termos))
    # DAT-45: o sistema não mede emoção, e o modelo recebe `emocao_atual` para escolher o que dizer.
    emocoes = sorted({m.group(0) for r in (_TERMOS_DE_EMOCAO, _EMOCAO_AO_ALUNO) for m in r.finditer(livre)})
    if emocoes:
        problemas.append("atribui emoção ao aluno: " + ", ".join(emocoes))
    vigilancia = sorted({m.group(0) for m in _TERMOS_DE_VIGILANCIA.finditer(livre)})
    if vigilancia:
        problemas.append("diz que o aluno foi observado: " + ", ".join(vigilancia))
    frases = [f for f in re.split(r"[.!?]+", corpo) if f.strip()]
    if any(len(f.split()) > _PALAVRAS_POR_FRASE for f in frases):
        problemas.append(f"tem frase com mais de {_PALAVRAS_POR_FRASE} palavras")
    return problemas


def _motivo(state: dict[str, Any]) -> str:
    emocao = state.get("emocao_atual") or {}
    if float(emocao.get("valencia", 0) or 0) <= -0.4:
        return "emocao_negativa"
    tipos = {str(e.get("tipo", "")).lower() for e in state.get("eventos_novos") or [] if isinstance(e, dict)}
    return "inatividade" if "inatividade" in tipos else "engajamento"


def ajustar_horario(proposto: datetime | None, agora: datetime) -> datetime:
    """Pura. Entre 5 min e 24 h a partir de agora, e fora do silêncio (22h–7h de Brasília)."""
    minimo, maximo = agora + timedelta(minutes=5), agora + timedelta(hours=24)
    if proposto is None or proposto.tzinfo is None:
        horario = minimo
    else:
        horario = min(max(proposto.astimezone(UTC), minimo), maximo)
    local = horario.astimezone(BRASILIA)
    if local.hour >= _SILENCIO_INICIO or local.hour < _SILENCIO_FIM:
        dia = local.date() if local.hour < _SILENCIO_FIM else local.date() + timedelta(days=1)
        local = datetime(dia.year, dia.month, dia.day, _SILENCIO_FIM, 0, tzinfo=BRASILIA)
    return local.astimezone(UTC)


# Regra (último degrau): o texto segue o tom do perfil. Uma linha por perfil e por motivo.
_TEXTOS_DA_REGRA: dict[str, dict[str, tuple[str, str]]] = {
    "Seeker": {
        "suporte": ("Uma pista de cada vez", "Que tal explorar só o próximo trecho? Ele está mais curto e guiado."),
        "lembrete": ("Tem trilha para explorar", "Seu próximo tópico guarda uma descoberta. Dá uma olhada quando puder."),
    },
    "Survivor": {
        "suporte": ("Passo a passo, com segurança", "O próximo passo está mais curto. Faça um item e siga no seu ritmo."),
        "lembrete": ("Seu plano continua de pé", "Um passo pequeno hoje mantém a trilha em dia. Retome do ponto onde parou."),
    },
    "Daredevil": {
        "suporte": ("Respira e volta pro jogo", "Missão curta: um item agora e você já sai do lugar."),
        "lembrete": ("Desafio esperando", "Tem uma missão rápida na sua trilha. Topa resolver hoje?"),
    },
    "Mastermind": {
        "suporte": ("Vamos por partes", "Comece só pela primeira parte do próximo assunto. Ela já está pronta para você."),
        "lembrete": ("Uma ideia nova te espera", "Tem uma ideia nova que se liga ao que você já sabe. Volte quando puder."),
    },
    "Conqueror": {
        "suporte": ("Recupere o ritmo", "Uma etapa curta agora e você volta ao controle da trilha."),
        "lembrete": ("Sua próxima conquista", "Falta pouco para fechar este tópico. Avance mais uma etapa hoje."),
    },
    "Socializer": {
        "suporte": ("Você não está sozinho", "Vamos juntos no próximo passo: ele está mais curto e guiado."),
        "lembrete": ("Sua turma está avançando", "Que tal acompanhar a turma? Seu próximo passo já está pronto."),
    },
    "Achiever": {
        "suporte": ("Um item de cada vez", "Feche só o próximo item da lista. Cada passo conta para a sua meta."),
        "lembrete": ("Mais um passo na meta", "Seu próximo item está pronto. Avance hoje e veja o progresso subir."),
    },
}


# Mesma regra, quando se sabe o tópico em andamento: lembrete ligado ao progresso
# funciona, genérico e frequente pode gerar ansiedade (DAT-33, DAT-45). `{topico}`
# entra cortado em `_LIMITE_TOPICO` para o corpo caber nos 200 caracteres.
_TEXTOS_COM_TOPICO: dict[str, dict[str, str]] = {
    "Seeker": {
        "suporte": "Em {topico}, explore só o próximo trecho. Ele está mais curto e guiado.",
        "lembrete": "{topico} ainda guarda uma descoberta. Dá uma olhada quando puder.",
    },
    "Survivor": {
        "suporte": "Em {topico}, o próximo passo está mais curto. Faça um item e siga no seu ritmo.",
        "lembrete": "Um passo pequeno em {topico} hoje mantém a trilha em dia.",
    },
    "Daredevil": {
        "suporte": "Missão curta em {topico}: um item agora e você já sai do lugar.",
        "lembrete": "Tem uma missão rápida em {topico}. Topa resolver hoje?",
    },
    "Mastermind": {
        "suporte": "Vamos por partes em {topico}: a primeira já está pronta para você.",
        "lembrete": "Tem uma ideia de {topico} que se liga ao que você já sabe. Bora ver?",
    },
    "Conqueror": {
        "suporte": "Uma etapa curta em {topico} e você volta ao controle da trilha.",
        "lembrete": "Falta pouco para fechar {topico}. Avance mais uma etapa hoje.",
    },
    "Socializer": {
        "suporte": "Vamos juntos no próximo passo de {topico}: ele está mais curto e guiado.",
        "lembrete": "Sua turma está avançando em {topico}. Seu próximo passo já está pronto.",
    },
    "Achiever": {
        "suporte": "Feche só o próximo item de {topico}. Cada passo conta para a sua meta.",
        "lembrete": "O próximo item de {topico} está pronto. Avance hoje e veja o progresso subir.",
    },
}
_LIMITE_TOPICO = 60


# Marcação no começo do nome ("[MOCK] Aceleração") é do cadastro, não do aluno.
_MARCACAO_NO_INICIO = re.compile(r"^\s*(\[[^\]]*\]\s*)+")


def _nome_limpo(nome: Any) -> str:
    return _MARCACAO_NO_INICIO.sub("", str(nome or "")).strip()[:_LIMITE_TOPICO]


def _foco(state: dict[str, Any]) -> dict[str, Any]:
    """Tópico em andamento, percentual e próximo conteúdo (montado por `build_initial_state`)."""
    foco = state.get("foco_estudo") if isinstance(state.get("foco_estudo"), dict) else {}
    topico = _nome_limpo(foco.get("topico"))
    if not topico:
        return {}
    proximo = _nome_limpo(foco.get("proximo_conteudo")) or None
    return {
        "topico": topico,
        "percentual_concluido": foco.get("percentual_concluido"),
        "proximo_conteudo": proximo,
    }


def notificacao_da_regra(
    perfil: str, motivo: str, agora: datetime, foco: dict[str, Any] | None = None
) -> NotificacaoPayload:
    """Pura. Sem modelo: texto no tom do perfil (com o tópico, se houver), horário pela guarda."""
    chave = _chave_das_tabelas(perfil)
    tipo = "suporte" if motivo == "emocao_negativa" else "lembrete"
    titulo, corpo = _TEXTOS_DA_REGRA[chave][tipo]
    topico = (foco or {}).get("topico")
    if topico:
        corpo = _TEXTOS_COM_TOPICO[chave][tipo].format(topico=topico)
    proposto = agora + (timedelta(minutes=5) if tipo == "suporte" else timedelta(minutes=30))
    contexto: dict[str, Any] = {"motivo": motivo, "perfil": perfil, "origem": "regra"}
    if topico:
        contexto["topico"] = topico
    return NotificacaoPayload(
        tipo=tipo,
        titulo=titulo,
        corpo=corpo,
        horario=ajustar_horario(proposto, agora),
        prioridade=2 if tipo == "suporte" else 1,
        contexto=contexto,
    )


def _payload_do_modelo(state: dict[str, Any], perfil: dict[str, Any], motivo: str, agora: datetime) -> dict[str, Any]:
    emocao = state.get("emocao_atual") or {}
    desempenho = state.get("desempenho_recente") or {}
    return {
        # Minimização (#195): nada que identifique o aluno.
        "perfil": perfil,
        "motivo": motivo,
        "agora": agora.astimezone(BRASILIA).isoformat(),
        "emocao_atual": {k: emocao.get(k) for k in ("emocao_primaria", "valencia") if k in emocao},
        "desempenho_recente": {
            k: desempenho.get(k) for k in ("media_acertos", "percentual_concluido", "topico_concluido") if k in desempenho
        },
        "eventos_novos": [str(e.get("tipo")) for e in state.get("eventos_novos") or [] if isinstance(e, dict)][:10],
        # Nome do tópico e do conteúdo é do professor, não do aluno: não identifica ninguém.
        "foco": _foco(state),
    }


async def agente_notificacao(state: dict[str, Any], settings: Settings, agora: datetime | None = None) -> dict[str, Any]:
    agora = agora or datetime.now(UTC)
    perfil = _contexto_do_perfil(state)
    motivo = _motivo(state)
    payload = _payload_do_modelo(state, perfil, motivo, agora)
    llm = JsonLLMService(settings)

    async def gerar(dados: dict[str, Any], usar_rag: bool) -> NotificacaoGerada | None:
        try:
            return await llm.ainvoke_structured(
                prompt_name="notificacao_personalizada.txt",
                payload=dados,
                schema=NotificacaoGerada,
                use_rag=usar_rag,
            )
        except StructuredOutputError:
            return None

    gerada: NotificacaoGerada | None = None
    origem = "regra"
    revisada = False
    recusa: list[str] = []
    tentativas = [True, False] if OpenAIRagService(settings).is_configured() else [False]
    for usar_rag in tentativas:
        candidata = await gerar(payload, usar_rag)
        if candidata is None:
            continue
        recusa = problemas_do_texto(candidata.titulo, candidata.corpo, payload["foco"])
        if recusa:
            # Uma revisão só, sem RAG: o modelo vê o próprio texto e o que estava errado.
            pedido = {"titulo": candidata.titulo, "corpo": candidata.corpo, "problemas": recusa}
            candidata = await gerar({**payload, "revisar": pedido}, False)
            if candidata is not None and not problemas_do_texto(candidata.titulo, candidata.corpo, payload["foco"]):
                recusa, revisada = [], True
            else:
                candidata = None
        if candidata is not None:
            gerada, origem = candidata, ("rag" if usar_rag else "modelo")
        break

    if gerada is None:
        notificacao = notificacao_da_regra(perfil["perfil_dominante"], motivo, agora, payload["foco"])
        if recusa:
            notificacao.contexto["texto_do_modelo_recusado"] = recusa
    else:
        contexto: dict[str, Any] = {"motivo": motivo, "perfil": perfil["perfil_dominante"], "origem": origem}
        if revisada:
            contexto["revisado"] = True
        if payload["foco"]:
            contexto["topico"] = payload["foco"]["topico"]
        if gerada.evidencia:
            contexto["evidencia"] = gerada.evidencia
        notificacao = NotificacaoPayload(
            tipo=gerada.tipo,
            titulo=gerada.titulo.strip(),
            corpo=gerada.corpo.strip(),
            horario=ajustar_horario(gerada.horario, agora),
            prioridade=gerada.prioridade,
            contexto=contexto,
        )

    notificacao.contexto["texto_guarda"] = TEXTO_GUARDA_VERSAO
    return {
        "notificacao_payload": notificacao.model_dump(mode="json"),
        "completed_nodes": ["agente_notificacao"],
        "messages": [f"notificacao definida: {notificacao.tipo} ({notificacao.contexto.get('origem')})"],
    }

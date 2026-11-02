"""Motor determinístico de sugestão de material por aluno.

Decide **quais formatos** usar e **em que ordem**, para um aluno específico,
entre os que realmente existem para aquele conteúdo. Ver
``docs/superpowers/specs/2026-08-25-sugestao-de-material-por-aluno-design.md`` e
``docs/superpowers/specs/2026-11-01-recomendacao-conteudo-x-aluno-design.md``.

Por que determinístico e não LLM (decisão validada em 2026-08-25):

* **explicável** — cada posição carrega os motivos que a sustentam, e é isso que
  torna o log de sugestões auditável;
* **reprodutível** — mesma entrada, mesma saída. Sem isso não há como medir
  efetividade: a comparação entre versões viraria comparação entre sorteios;
* **sem cota** — a geração de conteúdo já disputa a cota do Gemini; ordenar
  material não precisa disputar também.

A ordem sai em **camadas**, e a preferência do aluno nunca passa por cima de
uma camada mais alta:

0. **necessidade forte do aluno** — dificuldade no tópico leva os cards ao topo
   (DAT-21). O aluno já passou pelo conteúdo quando ela aparece;
1. **o que o conteúdo pede** — formato essencial para entender aquele conteúdo
   (diagrama pede apresentação, fórmula pede texto). A análise é por IA, na
   fila (``demanda_formato.py``); aqui só entra o resultado;
2. **preferência e uso** — perfil BrainHex, modo de estudo declarado e
   telemetria. Ordena dentro de cada camada.

As camadas são recalculadas a cada decisão, nunca acumuladas: quando a
necessidade some, o formato volta para onde a preferência o põe, e a revisão
registra por quê.

Os pesos por perfil NÃO foram inventados aqui: são a tradução das "pistas de
entrega" que o próprio sistema já declara em
``api/app/agent/prompts/planejador_conteudo.txt``, para que motor e prompt
concordem em vez de divergirem. E são hipótese (ver ``evidencias_pedagogicas``).
"""

from __future__ import annotations

import unicodedata
from typing import Any, Iterable

from app.services.evidencias_pedagogicas import CATALOGO_VERSAO, evidencia

# Ordem canônica: usada como critério de desempate estável. Sem ela, formatos
# empatados sairiam em ordem arbitrária de dicionário e a sugestão deixaria de
# ser reprodutível — quebrando a métrica de efetividade.
FORMATOS_CANONICOS: tuple[str, ...] = ("markdown", "audio", "apresentacao", "cards", "pdf")

# Peso por perfil BrainHex, derivado das pistas de entrega do prompt:
#   Achiever   — metas claras, progresso, consolidação, desafio mensurável
#   Conqueror  — confronto, domínio, pressão saudável, feedback direto
#   Socializer — narrativa, contexto humano, cooperação, personagens
#   Daredevil  — ritmo rápido, surpresa, mudança de estímulo
#   Mastermind — lógica, estrutura, relações causais, profundidade
#   Seeker     — curiosidade, conexões inesperadas, exploração
#   Survivor   — segurança, passo a passo, apoio, redução de fricção
_PESOS_POR_PERFIL: dict[str, dict[str, float]] = {
    "achiever": {"cards": 1.0, "markdown": 0.7, "apresentacao": 0.6, "audio": 0.3, "pdf": 0.3},
    "conqueror": {"cards": 1.0, "markdown": 0.6, "apresentacao": 0.5, "audio": 0.3, "pdf": 0.3},
    # O áudio do Socializador é diálogo entre DOIS guardiões (é o único perfil
    # com secondaryGuideName) — narrativa com personagens é literalmente o
    # formato dele, não uma preferência estimada.
    "socializer": {"audio": 1.0, "markdown": 0.6, "apresentacao": 0.6, "cards": 0.4, "pdf": 0.2},
    "daredevil": {"apresentacao": 1.0, "cards": 0.8, "audio": 0.5, "markdown": 0.4, "pdf": 0.2},
    "mastermind": {"markdown": 1.0, "apresentacao": 0.7, "pdf": 0.5, "cards": 0.5, "audio": 0.3},
    "seeker": {"apresentacao": 0.9, "markdown": 0.8, "audio": 0.5, "cards": 0.5, "pdf": 0.4},
    # Survivor: passo a passo escrito e áudio (baixa fricção — dá para ouvir
    # sem sustentar leitura).
    "survivor": {"markdown": 1.0, "audio": 0.8, "apresentacao": 0.5, "cards": 0.4, "pdf": 0.3},
}

# Ajuste pelo modo de operação declarado pelo aluno. Os três primeiros são os
# do prompt do planejador; os dois últimos são os nomes que o banco guarda de
# verdade (``"modoOperacao".nome``: "Conteúdo Primeiro", "Pergunta Primeiro",
# "Misto"). Medido em 01/11: nenhum aluno tinha um dos três do prompt, então o
# ajuste nunca era aplicado. "Misto" é neutro de propósito.
_AJUSTE_POR_MODO: dict[str, dict[str, float]] = {
    "imediato": {"cards": 0.3, "audio": 0.2, "markdown": -0.2, "pdf": -0.2},
    "analitico": {"markdown": 0.3, "pdf": 0.2, "cards": -0.1},
    "exploratorio": {"apresentacao": 0.3, "audio": 0.1},
    "conteudo_primeiro": {"markdown": 0.2, "apresentacao": 0.2, "audio": 0.1, "cards": -0.2},
    "pratica_primeiro": {"cards": 0.35, "markdown": -0.1},
}

# Nome gravado no banco (sem acento, minúsculo, com "_") -> chave do ajuste.
# "Pergunta primeiro" e "atividade primeiro" são a mesma escolha que o app já
# lê em ``modoFromTexto`` (``mobile/src/utils/presentationOrder.ts``).
_ALIAS_MODO = {
    "conteudo_primeiro": "conteudo_primeiro",
    "pergunta_primeiro": "pratica_primeiro",
    "atividade_primeiro": "pratica_primeiro",
    "pratica_primeiro": "pratica_primeiro",
}

_ROTULO_PERFIL = {
    "achiever": "Realizador",
    "conqueror": "Conquistador",
    "socializer": "Socializador",
    "daredevil": "Aventureiro",
    "mastermind": "Estrategista",
    "seeker": "Explorador",
    "survivor": "Sobrevivente",
}

_MOTIVO_POR_PERFIL_FORMATO = {
    ("achiever", "cards"): "progresso mensurável",
    ("conqueror", "cards"): "desafio direto",
    ("socializer", "audio"): "narrativa em diálogo",
    ("daredevil", "apresentacao"): "ritmo e estímulo visual",
    ("mastermind", "markdown"): "profundidade e estrutura",
    ("seeker", "apresentacao"): "exploração visual",
    ("survivor", "markdown"): "passo a passo",
    ("survivor", "audio"): "menos fricção",
}

_MOTIVO_POR_MODO = {
    "imediato": "modo imediato: curto e direto",
    "analitico": "modo analítico: sequência guiada",
    "exploratorio": "modo exploratório: variedade de mídia",
    "conteudo_primeiro": "modo conteúdo primeiro: material antes da prática",
    "pratica_primeiro": "modo pergunta primeiro: prática antes do material",
}

_PESO_MINIMO_PARA_MOTIVO = 0.15


# A API grava o Socializador com a grafia britanica ("Socialiser") em vários
# pontos (``context.py``, ``agente_perfil.py``), enquanto a fonte oficial dos
# perfis usa "socializer". Sem o alias, o perfil cairia fora do vetor de
# afinidades em silêncio — justamente o perfil cuja preferência por áudio é a
# mais marcada de todos.
_ALIAS_PERFIL = {"socialiser": "socializer"}


def _normalizar_perfil(nome: Any) -> str:
    chave = str(nome or "").strip().lower()
    return _ALIAS_PERFIL.get(chave, chave)


def normalizar_modo(modo: Any) -> str:
    """Chave do ajuste para o modo gravado no banco ou vindo do prompt.

    "Conteúdo Primeiro" vira ``conteudo_primeiro``; modo desconhecido devolve a
    forma normalizada, que não casa com nenhum ajuste (e por isso não mexe).
    """
    texto = unicodedata.normalize("NFKD", str(modo or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c)).strip().lower()
    chave = "_".join(texto.replace("-", " ").split())
    return _ALIAS_MODO.get(chave, chave)


def _afinidades(perfis: Iterable[Any]) -> list[tuple[str, float, float]]:
    """Vetor de afinidades como (perfil, afinidade 0..100, peso relativo 0..1).

    O peso é o quanto a afinidade passa da **fatia uniforme** (soma ÷ 7, o que o
    aluno teria se não se inclinasse para perfil nenhum), dividido pelo maior
    excesso. Somar o vetor cru, como antes, fazia os seis perfis secundários
    abafarem o dominante: o quiz devolve vetores quase planos (18, 16, 14, 14,
    13, 13, 12), e os seis alunos medidos em 01/11 recebiam a mesma ordem —
    Aventureiro dominante abria por texto. Um aluno 70% Estrategista e 60%
    Socializador continua diferente de um Estrategista puro: os dois passam da
    fatia uniforme.

    Vetor perfeitamente plano não tem perfil que se destaque; aí ninguém pesa,
    e a ordem cai na canônica em vez de inventar uma inclinação.
    """
    brutas: dict[str, float] = {}
    for item in perfis or []:
        if isinstance(item, dict):
            nome = _normalizar_perfil(
                item.get("perfil") or item.get("nome") or item.get("perfil_nome")
            )
            bruto = item.get("afinidade", item.get("score", 0))
        else:
            nome = _normalizar_perfil(item)
            bruto = 100
        if nome not in _PESOS_POR_PERFIL:
            continue
        try:
            afinidade = float(bruto)
        except (TypeError, ValueError):
            afinidade = 0.0
        # Afinidade vem 0..100 no banco; valores fora da faixa são aparados em
        # vez de virarem peso negativo ou dominante absoluto.
        afinidade = max(0.0, min(100.0, afinidade))
        brutas[nome] = max(afinidade, brutas.get(nome, 0.0))

    soma = sum(brutas.values())
    if soma <= 0:
        return []
    fatia_uniforme = soma / len(_PESOS_POR_PERFIL)
    excessos = {nome: af - fatia_uniforme for nome, af in brutas.items()}
    maior = max(excessos.values())
    if maior <= 0:
        return []
    return [
        (nome, brutas[nome], excesso / maior)
        for nome, excesso in excessos.items()
        if excesso > 0
    ]


# ---------------------------------------------------------------------------
# Camadas: necessidade do aluno e o que o conteúdo pede
# ---------------------------------------------------------------------------

CAMADA_NECESSIDADE = 0
CAMADA_CONTEUDO = 1
CAMADA_PREFERENCIA = 2

# Regras cuja evidência é recalculada a cada decisão: elas moram na camada e
# saem quando o motivo some.
_REGRAS_DE_CAMADA = frozenset({"reexposicao_quiz", "demanda_do_conteudo"})

# Dimensão da análise do conteúdo -> formatos que a atendem.
FORMATOS_POR_DIMENSAO: dict[str, tuple[str, ...]] = {
    "visual": ("apresentacao",),
    "escrito": ("markdown", "pdf"),
    "sonoro": ("audio",),
    "pratica": ("cards",),
}
NIVEIS_DEMANDA = ("essencial", "ajuda", "indiferente")
_ROTULO_DIMENSAO = {
    "visual": "ver (imagem, diagrama)",
    "escrito": "ler com atenção (texto, fórmula)",
    "sonoro": "ouvir",
    "pratica": "praticar",
}
# "Ajuda" pesa como uma preferência forte, não como camada: o conteúdo se
# beneficia do formato, mas não depende dele.
_BONUS_AJUDA_DO_CONTEUDO = 0.35

# Dificuldade no tópico exige mais de um item com acerto: uma questão errada é
# tropeço, não dificuldade.
_ACERTO_SUFICIENTE = 60.0
_MINIMO_ITENS_DIFICULDADE = 2
_FORMATO_DE_REEXPOSICAO = "cards"

# O que o app mostra ao aluno no "comece por aqui". Frases curtas, sobre o
# conteúdo e sobre ele — nunca nota interna do sistema.
_FRASE_CONTEUDO = {
    "apresentacao": "Este conteúdo se entende melhor vendo: comece pela apresentação.",
    "markdown": "Este conteúdo pede leitura atenta: comece pelo texto.",
    "pdf": "Este conteúdo pede leitura atenta: comece pelo texto.",
    "audio": "Este conteúdo se entende melhor ouvindo: comece pelo áudio.",
    "cards": "Este conteúdo se fixa praticando: comece pelos cards.",
}
_FRASE_DIFICULDADE = "Você teve dificuldade nas atividades deste tópico: praticar com os cards ajuda a fixar."
_FRASE_MODO = {
    "conteudo_primeiro": "Você prefere ver o conteúdo antes de praticar.",
    "pratica_primeiro": "Você prefere começar praticando.",
    "imediato": "Você prefere material curto e direto.",
    "analitico": "Você prefere uma sequência guiada.",
    "exploratorio": "Você prefere variar o tipo de material.",
}
_FRASE_PERFIL = "Combina com o seu jeito de estudar."


def demanda_por_formato(demanda: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Traduz a demanda do conteúdo (por dimensão) para formato.

    ``demanda`` é o agregado do tópico (``demanda_formato.agregar_do_topico``):
    ``{"dimensoes": {"visual": {"nivel", "motivo", "conteudos"}, ...}, "origem"}``.
    Nível desconhecido conta como indiferente: análise malformada não pode
    virar camada.
    """
    resultado: dict[str, dict[str, Any]] = {}
    dimensoes = (demanda or {}).get("dimensoes") or {}
    for dimensao, formatos in FORMATOS_POR_DIMENSAO.items():
        dado = dimensoes.get(dimensao) or {}
        nivel = str(dado.get("nivel") or "").strip().lower()
        if nivel not in ("essencial", "ajuda"):
            continue
        for formato in formatos:
            resultado[formato] = {
                "dimensao": dimensao,
                "nivel": nivel,
                "motivo": str(dado.get("motivo") or "").strip(),
                "conteudos": list(dado.get("conteudos") or []),
            }
    return resultado


def _em_dificuldade(desempenho_topico: dict[str, Any] | None) -> bool:
    """O aluno está com dificuldade no tópico? Acerto médio baixo em itens suficientes."""
    if not desempenho_topico:
        return False
    media = desempenho_topico.get("media_acertos")
    itens = int(desempenho_topico.get("itens") or 0)
    return (
        media is not None
        and itens >= _MINIMO_ITENS_DIFICULDADE
        and float(media) < _ACERTO_SUFICIENTE
    )


def _arredondado(valor: Any) -> float | None:
    return round(float(valor), 2) if valor is not None else None


def _aplicar_camadas(
    itens: list[dict[str, Any]],
    *,
    demanda: dict[str, Any] | None,
    desempenho_topico: dict[str, Any] | None,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Recalcula camada, ajuste do conteúdo e evidências de camada de cada item.

    Muta ``itens`` (que já são cópias). Devolve as mudanças em texto (para os
    motivos da revisão) e as necessidades encontradas (para o log).
    """
    por_formato = demanda_por_formato(demanda)
    dificuldade = _em_dificuldade(desempenho_topico)
    origem_demanda = (demanda or {}).get("origem")
    mudancas: list[str] = []
    necessidades: list[dict[str, Any]] = []
    formatos_presentes = {item.get("formato") for item in itens}

    for item in itens:
        formato = item.get("formato")
        camada_antes = int(item.get("camada", CAMADA_PREFERENCIA))
        ajuste_antes = float(item.get("ajuste_conteudo") or 0.0)

        evidencias = [
            ev
            for ev in item.get("evidencias") or []
            if not (isinstance(ev, dict) and ev.get("regra") in _REGRAS_DE_CAMADA)
        ]
        camada = CAMADA_PREFERENCIA
        ajuste = 0.0
        motivos_camada: list[str] = []

        pedido = por_formato.get(formato)
        if pedido:
            rotulo = _ROTULO_DIMENSAO[pedido["dimensao"]]
            texto = f"o conteúdo pede {rotulo}" + (
                f": {pedido['motivo']}" if pedido["motivo"] else ""
            )
            if pedido["nivel"] == "essencial":
                camada = CAMADA_CONTEUDO
            else:
                ajuste = _BONUS_AJUDA_DO_CONTEUDO
                texto = texto.replace("o conteúdo pede", "o conteúdo se beneficia de", 1)
            motivos_camada.append(texto)
            evidencias.append(
                evidencia(
                    "demanda_do_conteudo",
                    dimensao=pedido["dimensao"],
                    nivel=pedido["nivel"],
                    origem=origem_demanda,
                    conteudos=pedido["conteudos"] or None,
                )
            )

        if dificuldade and formato == _FORMATO_DE_REEXPOSICAO:
            camada = CAMADA_NECESSIDADE
            motivos_camada.insert(0, "dificuldade no tópico: praticar com cards")
            evidencias.append(
                evidencia(
                    "reexposicao_quiz",
                    media_acertos=_arredondado((desempenho_topico or {}).get("media_acertos")),
                    itens=int((desempenho_topico or {}).get("itens") or 0),
                )
            )

        item["camada"] = camada
        item["ajuste_conteudo"] = round(ajuste, 4)
        item["motivos_camada"] = motivos_camada
        item["evidencias"] = evidencias

        if camada < camada_antes or (camada == camada_antes and ajuste > ajuste_antes):
            mudancas.append(f"{formato}: {motivos_camada[0]}")
        elif camada > camada_antes or ajuste < ajuste_antes:
            if camada_antes == CAMADA_NECESSIDADE:
                mudancas.append(f"{formato}: dificuldade superada, volta à ordem do aluno")
            else:
                mudancas.append(f"{formato}: o conteúdo deixou de pedir este formato")

    if dificuldade:
        necessidades.append(
            {
                "id": "dificuldade_no_topico",
                "acao": (
                    "cards_no_topo"
                    if _FORMATO_DE_REEXPOSICAO in formatos_presentes
                    else "sem_cards_gerados"
                ),
                "media_acertos": _arredondado((desempenho_topico or {}).get("media_acertos")),
                "itens": int((desempenho_topico or {}).get("itens") or 0),
            }
        )

    # Formato que o conteúdo pede como essencial mas não foi gerado: a sugestão
    # não inventa formato (mandaria o aluno a um beco sem saída), só registra
    # para o console mostrar ao professor.
    dimensoes = (demanda or {}).get("dimensoes") or {}
    for dimensao, formatos in FORMATOS_POR_DIMENSAO.items():
        dado = dimensoes.get(dimensao) or {}
        if str(dado.get("nivel") or "").lower() != "essencial":
            continue
        if not any(formato in formatos_presentes for formato in formatos):
            necessidades.append(
                {
                    "id": "formato_essencial_faltando",
                    "dimensao": dimensao,
                    "formatos": list(formatos),
                    "motivo": str(dado.get("motivo") or "").strip() or None,
                }
            )

    return mudancas, necessidades


def _motivo_aluno(item: dict[str, Any]) -> str | None:
    """A frase que o app mostra ao aluno para este formato."""
    camada = int(item.get("camada", CAMADA_PREFERENCIA))
    formato = item.get("formato")
    if camada == CAMADA_NECESSIDADE:
        return _FRASE_DIFICULDADE
    if camada == CAMADA_CONTEUDO or float(item.get("ajuste_conteudo") or 0) > 0:
        return _FRASE_CONTEUDO.get(formato)
    regras = {
        ev.get("regra"): ev for ev in item.get("evidencias") or [] if isinstance(ev, dict)
    }
    modo = regras.get("modo_operacao")
    if modo and float((modo.get("dados") or {}).get("ajuste") or 0) > 0:
        frase = _FRASE_MODO.get((modo.get("dados") or {}).get("modo"))
        if frase:
            return frase
    if "perfil_formato" in regras:
        return _FRASE_PERFIL
    return None


def _indice_canonico(formato: Any) -> int:
    return (
        FORMATOS_CANONICOS.index(formato)
        if formato in FORMATOS_CANONICOS
        else len(FORMATOS_CANONICOS)
    )


def _ordenar(itens: list[dict[str, Any]]) -> None:
    """Ordena por camada, depois pelo score (preferência + uso + ajuste do conteúdo).

    Desempate pela ordem canônica (índice), nunca pela ordem de iteração de
    dicionário — é o que garante reprodutibilidade.
    """
    itens.sort(
        key=lambda item: (
            int(item.get("camada", CAMADA_PREFERENCIA)),
            -(float(item.get("score") or 0) + float(item.get("ajuste_conteudo") or 0)),
            _indice_canonico(item.get("formato")),
        )
    )
    for posicao, item in enumerate(itens, start=1):
        item["posicao"] = posicao
        item["motivo_aluno"] = _motivo_aluno(item)


def sugerir_ordem_material(
    *,
    perfis: Iterable[Any],
    formatos_disponiveis: Iterable[str],
    modo_operacao: str | None = None,
    demanda: dict[str, Any] | None = None,
    desempenho_topico: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Devolve a ordem sugerida e o formato inicial, com os motivos de cada um.

    Só considera formato que existe de fato: sugerir áudio para um tópico sem
    áudio gerado mandaria o aluno num beco sem saída.

    Cada item leva ``evidencias``: a regra do catálogo que o moveu e os números
    do aluno que ela viu. O peso por perfil sai marcado como hipótese, porque é
    o que a base de evidências diz dele (ver ``evidencias_pedagogicas``).
    """
    disponiveis = [
        formato
        for formato in FORMATOS_CANONICOS
        if formato in {str(f).strip().lower() for f in (formatos_disponiveis or [])}
    ]
    if not disponiveis:
        return {"formato_inicial": None, "ordem": []}

    modo = normalizar_modo(modo_operacao)
    ajuste_modo = _AJUSTE_POR_MODO.get(modo, {})
    afinidades = _afinidades(perfis)

    itens: list[dict[str, Any]] = []
    for formato in disponiveis:
        score = 0.0
        motivos: list[str] = []
        evidencias: list[dict[str, Any]] = []
        afinidades_que_contam: dict[str, int] = {}
        pesos_que_contam: dict[str, float] = {}

        for perfil, afinidade, peso_perfil in afinidades:
            contribuicao = _PESOS_POR_PERFIL[perfil].get(formato, 0.0) * peso_perfil
            score += contribuicao
            if contribuicao >= _PESO_MINIMO_PARA_MOTIVO:
                detalhe = _MOTIVO_POR_PERFIL_FORMATO.get((perfil, formato))
                rotulo = _ROTULO_PERFIL[perfil]
                motivos.append(f"{rotulo}: {detalhe}" if detalhe else f"afinidade {rotulo}")
                afinidades_que_contam[perfil] = round(afinidade)
                pesos_que_contam[perfil] = round(peso_perfil, 4)

        if afinidades_que_contam:
            evidencias.append(
                evidencia(
                    "perfil_formato",
                    afinidades=afinidades_que_contam,
                    pesos_relativos=pesos_que_contam,
                    contribuicao=round(score, 4),
                )
            )

        ajuste = ajuste_modo.get(formato, 0.0)
        if ajuste:
            score += ajuste
            if ajuste > 0 and modo in _MOTIVO_POR_MODO:
                motivos.append(_MOTIVO_POR_MODO[modo])
            evidencias.append(evidencia("modo_operacao", modo=modo, ajuste=ajuste))

        itens.append(
            {
                "formato": formato,
                "score": round(score, 4),
                "motivos": motivos,
                "evidencias": evidencias,
            }
        )

    _, necessidades = _aplicar_camadas(
        itens, demanda=demanda, desempenho_topico=desempenho_topico
    )
    _ordenar(itens)

    return {
        "formato_inicial": itens[0]["formato"],
        "ordem": itens,
        "necessidades": necessidades,
    }


# ---------------------------------------------------------------------------
# Revisão: ajustar a ordem com o que a telemetria, o aluno e o conteúdo mostram
# ---------------------------------------------------------------------------

# Ajustes de score por sinal. Valores pequenos de propósito: a revisão corrige
# a sugestão, não a substitui — o perfil do aluno continua sendo a base.
_PENALIDADE_SKIMMING = 0.5
_PENALIDADE_LEITURA_LENTA_COM_ERRO = 0.25
_PENALIDADE_ABANDONO = 0.6
_BONUS_ACERTO_ALTO = 0.4
_BONUS_ENGAJAMENTO = 0.3

# Limiares de leitura dos sinais.
_ACERTO_ALTO = 75.0
_PERCENTUAL_ABANDONO = 40.0
_TEMPO_MIN_ABANDONO = 3.0

MINIMO_EVIDENCIA_PADRAO = 2
LIMIAR_MUDANCA_PADRAO = 0.35


def _tem_evidencia(sinal: dict[str, Any]) -> bool:
    """Formato sobre o qual a telemetria disse algo utilizável."""
    if sinal.get("skimming") or sinal.get("leitura_lenta"):
        return True
    if sinal.get("acertos") is not None or sinal.get("percentual") is not None:
        return True
    return float(sinal.get("active_sec") or 0) > 0


def _ajuste_por_sinal(
    sinal: dict[str, Any], active_sec_medio: float
) -> tuple[float, list[str], list[dict[str, Any]]]:
    """Ajuste de score, motivos legíveis e as evidências que moveram o score.

    Só vira evidência o que mexeu no score: "leitura lenta, mas com bom
    desempenho" é motivo (explica por que NÃO desceu), não evidência.
    """
    ajuste = 0.0
    motivos: list[str] = []
    engajamento = False
    desempenho = False

    acertos = sinal.get("acertos")
    acertos_valor = float(acertos) if acertos is not None else None

    if sinal.get("skimming"):
        ajuste -= _PENALIDADE_SKIMMING
        motivos.append("passou os olhos sem ler")
        engajamento = True

    if sinal.get("leitura_lenta"):
        # Leitura lenta COM bom desempenho não é problema: o formato funciona,
        # o aluno só leva mais tempo. Penalizar aqui empurraria para baixo
        # justamente o material que está dando resultado.
        if acertos_valor is not None and acertos_valor >= _ACERTO_SUFICIENTE:
            motivos.append("leitura lenta, mas com bom desempenho")
        else:
            ajuste -= _PENALIDADE_LEITURA_LENTA_COM_ERRO
            motivos.append("leitura lenta sem desempenho")
            engajamento = True

    percentual = sinal.get("percentual")
    tempo_min = sinal.get("tempo_min")
    if (
        percentual is not None
        and float(percentual) < _PERCENTUAL_ABANDONO
        and tempo_min is not None
        and float(tempo_min) >= _TEMPO_MIN_ABANDONO
    ):
        # Tempo gasto sem avançar é abandono, não dificuldade momentânea.
        ajuste -= _PENALIDADE_ABANDONO
        motivos.append("abandonado no meio")
        engajamento = True

    if acertos_valor is not None and acertos_valor >= _ACERTO_ALTO:
        ajuste += _BONUS_ACERTO_ALTO
        motivos.append("desempenho alto depois deste formato")
        desempenho = True

    active_sec = float(sinal.get("active_sec") or 0)
    if active_sec_medio > 0 and active_sec > active_sec_medio * 1.25:
        ajuste += _BONUS_ENGAJAMENTO
        motivos.append("tempo ativo acima da média")
        engajamento = True

    evidencias: list[dict[str, Any]] = []
    if engajamento:
        evidencias.append(
            evidencia(
                "engajamento_comportamental",
                skimming=True if sinal.get("skimming") else None,
                leitura_lenta=True if sinal.get("leitura_lenta") else None,
                active_sec=round(active_sec, 1),
                active_sec_medio=round(active_sec_medio, 1),
                percentual=_arredondado(percentual),
                tempo_min=_arredondado(tempo_min),
            )
        )
    if desempenho:
        evidencias.append(evidencia("desempenho_do_aluno", acertos=acertos_valor))

    return ajuste, motivos, evidencias


def _copia(item: dict[str, Any]) -> dict[str, Any]:
    """Cópia rasa com as listas copiadas: a revisão nunca muta a ordem recebida."""
    return {
        **item,
        "motivos": list(item.get("motivos") or []),
        "evidencias": list(item.get("evidencias") or []),
    }


def revisar_ordem_material(
    *,
    ordem_atual: list[dict[str, Any]],
    sinais_por_formato: dict[str, dict[str, Any]],
    minimo_evidencia: int = MINIMO_EVIDENCIA_PADRAO,
    limiar_mudanca: float = LIMIAR_MUDANCA_PADRAO,
    desempenho_topico: dict[str, Any] | None = None,
    demanda: dict[str, Any] | None = None,
    observacoes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Decide se a ordem muda, e devolve a decisão pronta para o log.

    Sempre devolve uma decisão — inclusive ``mantida``. O log registra as três
    ações (``criada``/``revisada``/``mantida``) porque "o sistema olhou e
    decidiu não mexer" é informação: sem isso, não há como distinguir um motor
    estável de um motor que nunca rodou.

    Dois freios valem para a telemetria, que é o que evita reordenar por ruído:

    * **mínimo de evidência** — com telemetria de menos formatos que
      ``minimo_evidencia``, os sinais por formato não entram;
    * **limiar de mudança** — mesmo com nova ordem, só aceita se algum score
      mudou acima de ``limiar_mudanca``.

    Mudança de **camada** não passa por esses freios: ``desempenho_topico``
    (``{"media_acertos", "itens"}``) é desempenho do tópico, não atribuição a
    formato, e ``demanda`` é o que o conteúdo pede. As duas são recalculadas a
    cada decisão; entrar ou sair de uma camada é sempre uma revisão, mesmo que
    a ordem fique igual, porque o "por quê" mostrado ao aluno mudou.

    ``observacoes`` vai só para o snapshot do log (ex.: estado mental negativo
    recorrente). Não reordena: nenhuma regra do catálogo liga emoção a formato
    (DAT-45).
    """
    if not ordem_atual:
        return {
            "acao": "mantida",
            "ordem": [],
            "motivos": ["sem sugestão anterior para revisar"],
            "evidencia": {"formatos_com_evidencia": 0, "catalogo_versao": CATALOGO_VERSAO},
            "necessidades": [],
        }

    com_evidencia = {
        formato: sinal
        for formato, sinal in (sinais_por_formato or {}).items()
        if _tem_evidencia(sinal)
    }

    evidencia_snapshot: dict[str, Any] = {
        "formatos_com_evidencia": len(com_evidencia),
        "minimo_evidencia": minimo_evidencia,
        "limiar_mudanca": limiar_mudanca,
        "sinais": com_evidencia,
        "catalogo_versao": CATALOGO_VERSAO,
    }
    if desempenho_topico:
        evidencia_snapshot["desempenho_topico"] = desempenho_topico
    if demanda:
        evidencia_snapshot["demanda_do_conteudo"] = {
            "origem": demanda.get("origem"),
            "versao": demanda.get("versao"),
            "assinatura": demanda.get("assinatura"),
            "dimensoes": {
                dimensao: (dado or {}).get("nivel")
                for dimensao, dado in (demanda.get("dimensoes") or {}).items()
            },
        }
    if observacoes:
        evidencia_snapshot["observacoes"] = observacoes

    usar_sinais = len(com_evidencia) >= minimo_evidencia
    nova_ordem = [_copia(item) for item in ordem_atual]
    maior_delta = 0.0
    motivos_da_revisao: list[str] = []

    if usar_sinais:
        valores_active = [float(s.get("active_sec") or 0) for s in com_evidencia.values()]
        active_sec_medio = sum(valores_active) / len(valores_active) if valores_active else 0.0
        for item in nova_ordem:
            sinal = com_evidencia.get(item.get("formato"))
            if sinal is None:
                continue
            ajuste, motivos, evidencias = _ajuste_por_sinal(sinal, active_sec_medio)
            maior_delta = max(maior_delta, abs(ajuste))
            item["score"] = round(float(item.get("score") or 0) + ajuste, 4)
            # Os motivos da revisão ficam SOMADOS aos originais: o log tem que
            # mostrar tanto por que o formato entrou quanto por que subiu ou
            # desceu depois.
            item["motivos"].extend(motivos)
            item["evidencias"].extend(evidencias)
            motivos_da_revisao.extend(f"{item.get('formato')}: {motivo}" for motivo in motivos)

    mudancas_de_camada, necessidades = _aplicar_camadas(
        nova_ordem, demanda=demanda, desempenho_topico=desempenho_topico
    )
    motivos_da_revisao.extend(mudancas_de_camada)
    if necessidades:
        evidencia_snapshot["necessidades"] = necessidades

    _ordenar(nova_ordem)

    ordem_mudou = [i.get("formato") for i in nova_ordem] != [
        i.get("formato") for i in ordem_atual
    ]
    evidencia_snapshot["maior_delta"] = round(maior_delta, 4)
    evidencia_snapshot["ordem_mudou"] = ordem_mudou
    evidencia_snapshot["mudou_camada"] = bool(mudancas_de_camada)

    if mudancas_de_camada:
        return {
            "acao": "revisada",
            "ordem": nova_ordem,
            "motivos": motivos_da_revisao,
            "evidencia": evidencia_snapshot,
            "necessidades": necessidades,
        }

    if not usar_sinais:
        return {
            "acao": "mantida",
            "ordem": ordem_atual,
            "motivos": [
                f"evidência insuficiente: {len(com_evidencia)} de {minimo_evidencia} formatos"
            ],
            "evidencia": evidencia_snapshot,
            "necessidades": necessidades,
        }

    if not ordem_mudou:
        return {
            "acao": "mantida",
            "ordem": nova_ordem,
            "motivos": motivos_da_revisao or ["sinais não alteraram a ordem"],
            "evidencia": evidencia_snapshot,
            "necessidades": necessidades,
        }

    if maior_delta < limiar_mudanca:
        # Reordenar por diferença mínima confunde o aluno (o material "pula de
        # lugar" sem motivo perceptível) e polui a métrica de efetividade com
        # revisões que não significam nada.
        return {
            "acao": "mantida",
            "ordem": ordem_atual,
            "motivos": [
                f"mudança abaixo do limiar ({round(maior_delta, 2)} < {limiar_mudanca})"
            ],
            "evidencia": evidencia_snapshot,
            "necessidades": necessidades,
        }

    return {
        "acao": "revisada",
        "ordem": nova_ordem,
        "motivos": motivos_da_revisao,
        "evidencia": evidencia_snapshot,
        "necessidades": necessidades,
    }

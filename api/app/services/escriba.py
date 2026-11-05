"""Escriba: o assistente de IA do professor no console.

Responde perguntas sobre as turmas do professor autenticado, com base nos
mesmos dados agregados que o dashboard mostra (views de métricas da turma) e
no retrato por aluno/tópico que os Insights já montam. Nada é gravado: a
conversa vive no navegador e volta aqui como `historico` a cada pergunta.

A turma pedida é conferida contra a lista de turmas DO PROFESSOR antes de
qualquer leitura — o modelo nunca recebe dado de turma alheia, então não
tem como responder sobre ela mesmo que a pergunta insista.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph.guardrails import GuardrailViolation, gerar_validado
from app.schemas.escriba import EscribaSaida, PerguntaEscriba, RespostaEscriba, SecaoDaResposta
from app.services import assinatura_chat
from app.services.guia_do_app import guia_do_app
from app.services.insights_turma import InsightsTurmaService
from app.services.llm import JsonLLMService, load_prompt
from app.services.pseudonimizacao import pseudonimizar_texto, refs_citadas, restaurar_refs

logger = logging.getLogger(__name__)

# "Todas as turmas" com muitas turmas estouraria o contexto do modelo.
MAX_TURMAS = 5
MAX_RESPOSTA = 1500
MAX_HISTORICO = 8
MAX_DESTINOS = 6
MAX_SECOES = 6
MAX_TEXTO_DA_SECAO = 500

# Para onde a Lumi pode mandar o professor: as views de turma de
# `frontend/src/pages/consoleSections.ts` (sem Aprovações e Painel técnico, que
# são só do dono) e as sub-abas da Economia (`ABAS_DA_ECONOMIA` em economiaRegras.ts).
# Paridade testada em test_escriba.py. Destino fora daqui é descartado: o
# modelo não inventa link.
_VIEWS_DO_CONSOLE = (
    "dashboard", "recomendacoes", "trilha", "missoes", "conquistas", "notas", "eventos", "economia",
    "classes", "personalizacoes", "ranks", "batalhas", "guildas", "profile",
)
_ABAS_DA_ECONOMIA = ("valores", "alunos", "prazos", "loja", "fundo", "metas", "historico")
DESTINOS_DO_CONSOLE = frozenset(_VIEWS_DO_CONSOLE) | {f"economia.{aba}" for aba in _ABAS_DA_ECONOMIA}


# Tutoriais guiados que a Lumi pode abrir: os ids de
# `frontend/src/components/console/escriba/tutoriais.ts`. Paridade testada em
# test_escriba.py. Como nos destinos, id fora daqui é descartado.
TUTORIAIS_DO_CONSOLE = frozenset(
    {
        "conhecer_console",
        "criar_turma",
        "matricular_alunos",
        "registrar_presenca",
        "montar_trilha",
        "criar_missao",
        "criar_evento",
        "criar_conquista",
        "criar_ranking",
        "configurar_economia",
    }
)

_NOMES_DAS_VIEWS = {
    "Visão geral": "dashboard",
    "Recomendações": "recomendacoes",
    "Trilhas": "trilha",
    "Missões": "missoes",
    "Conquistas": "conquistas",
    "Notas": "notas",
    "Eventos": "eventos",
    "Economia": "economia",
    "Turmas": "classes",
    "Personalizações": "personalizacoes",
    "Rankings": "ranks",
    "Rank de batalhas": "batalhas",
    "Guildas": "guildas",
    "Meus dados": "profile",
}
_NOMES_DA_ECONOMIA = {
    "Valores": "economia.valores",
    "Moedas por aluno": "economia.alunos",
    "Prazos e tempo": "economia.prazos",
    "Loja": "economia.loja",
    "Fundo da turma": "economia.fundo",
    "Metas": "economia.metas",
    "Histórico": "economia.historico",
}
_NOME_EXATO = {nome.casefold(): codigo for nome, codigo in (_NOMES_DAS_VIEWS | _NOMES_DA_ECONOMIA).items()}


def _alternativas(nomes: dict[str, str]) -> str:
    return "|".join(re.escape(nome) for nome in sorted(nomes, key=len, reverse=True))


# "Economia > Valores". Sem o prefixo, "Valores" e "Metas" são palavras comuns.
_ABA_DA_ECONOMIA = re.compile(rf"\bEconomia\s*[>›]\s*({_alternativas(_NOMES_DA_ECONOMIA)})")
# "em Turmas", "a aba Notas", "Trilhas > ...": maiúscula de propósito, é o nome no menu.
_ABA_DO_MENU = re.compile(
    rf"(?:\b(?:[Ee]m|[Aa]ba|[Mm]enu|[Aa]bra|[Nn]a|[Nn]o)\s+({_alternativas(_NOMES_DAS_VIEWS)})\b)"
    rf"|\b({_alternativas(_NOMES_DAS_VIEWS)})\s*[>›]"
)


def _destinos_citados(texto: str) -> list[str]:
    """As partes do console que o texto cita, na ordem em que aparecem. O botão não
    depende só de o modelo preencher `destinos`."""
    achados = [(m.start(), _NOMES_DA_ECONOMIA[m.group(1)]) for m in _ABA_DA_ECONOMIA.finditer(texto)]
    achados += [(m.start(), _NOMES_DAS_VIEWS[m.group(1) or m.group(2)]) for m in _ABA_DO_MENU.finditer(texto)]
    codigos = [codigo for _, codigo in sorted(achados, key=lambda item: item[0])]
    if any(c.startswith("economia.") for c in codigos):
        codigos = [c for c in codigos if c != "economia"]
    return list(dict.fromkeys(codigos))


def _destinos_validos(destinos: list[str] | None) -> list[str]:
    vistos: list[str] = []
    for destino in destinos or []:
        d = str(destino).strip().lower()
        if d in DESTINOS_DO_CONSOLE and d not in vistos:
            vistos.append(d)
    return vistos[:MAX_DESTINOS]


def _destino_da_secao(secao: Any) -> str | None:
    """O que o modelo disse; senão o título, se for nome de aba; senão a parte citada."""
    validos = _destinos_validos([secao.destino])
    if validos:
        return validos[0]
    pelo_titulo = _NOME_EXATO.get(secao.titulo.strip().casefold())
    if pelo_titulo:
        return pelo_titulo
    citados = _destinos_citados(f"{secao.titulo}: {secao.texto}")
    return citados[0] if citados else None


def checar_refs_existem(saida: EscribaSaida, contexto: dict[str, Any]) -> GuardrailViolation | None:
    """`restaurar_refs` deixa como está a ref que não conhece, então um aluno inventado apareceria
    na tela como "A99". Conferir aqui não gasta chamada de modelo."""
    textos = [saida.resposta, *(f"{s.titulo} {s.texto}" for s in getattr(saida, "secoes", None) or [])]
    citadas = set().union(*(refs_citadas(texto) for texto in textos))
    desconhecidas = sorted(citadas - set(contexto.get("nomes_por_ref") or {}))
    if desconhecidas:
        return GuardrailViolation(
            regra="refs_existem",
            mensagem=f"alunos citados que nao estao no payload: {desconhecidas}. Cite so refs de turmas[].alunos.",
        )
    return None


def _montar_resposta(saida: EscribaSaida, turmas: list[int], agora: datetime, nomes_por_ref: dict[str, Any] | None = None) -> RespostaEscriba:
    """Do que o modelo devolveu ao que o console desenha. Refs viram nomes em CADA
    texto: a seção não pode ser o lugar por onde "A3" chega à tela."""

    def limpo(texto: str, limite: int) -> str:
        restaurado = restaurar_refs(texto, nomes_por_ref) if nomes_por_ref else texto
        return (restaurado or "").strip()[:limite]

    introducao = limpo(saida.resposta, MAX_RESPOSTA)
    secoes: list[SecaoDaResposta] = []
    for secao in getattr(saida, "secoes", None) or []:
        titulo, texto = limpo(secao.titulo, 120), limpo(secao.texto, MAX_TEXTO_DA_SECAO)
        if titulo and texto and len(secoes) < MAX_SECOES:
            secoes.append(SecaoDaResposta(titulo=titulo, texto=texto, destino=_destino_da_secao(secao)))

    corrido = "\n\n".join([introducao, *(f"{s.titulo}: {s.texto}" for s in secoes)]).strip()[:MAX_RESPOSTA]
    if not corrido:
        raise EscribaIndisponivel("resposta vazia")

    destinos = _destinos_validos(
        [*(s.destino for s in secoes if s.destino), *(getattr(saida, "destinos", None) or []), *_destinos_citados(saida.resposta or "")]
    )
    tutorial = str(getattr(saida, "tutorial", None) or "").strip().lower()
    return RespostaEscriba(
        resposta=corrido,
        introducao=introducao if secoes else "",
        secoes=secoes,
        turmas=turmas,
        gerado_em=agora,
        destinos=destinos,
        tutorial=tutorial if tutorial in TUTORIAIS_DO_CONSOLE else None,
    )


# F5: a taxa de abandono vem do modelo de evasao do core (`20261031_08`, % dos alunos com dado em
# risco alto); o retorno semanal e as contagens dos tres sinais vem da `20261031_05`.
_GERAL = (
    "total_alunos, taxa_media_conclusao_pct, media_nota_turma, taxa_media_acertos_pct, "
    "taxa_media_acertos_sem_erro_pct, taxa_risco_abandono_pct, alunos_risco_alto, retorno_semanal_pct, "
    "alunos_inativos, alunos_estagnados, "
    "alunos_evadidos, alunos_sem_dado, sessoes_medias_por_aluno, tempo_ativo_medio_seg, "
    "media_tentativas_por_questao, taxa_media_uso_chat_pct"
)
_POR_PERFIL = (
    "perfil_nome, total_alunos_segmento, taxa_conclusao_topicos_pct, media_nota, taxa_acertos_pct, "
    "taxa_risco_abandono_pct, alunos_inativos, alunos_estagnados"
)


# Pergunta sobre o produto (como usar o console, o app, privacidade) não
# precisa de dado de aluno: vai ao modelo só com o guia do produto, sem ler
# turma nenhuma. A classificação é conservadora — na dúvida, é pergunta sobre a
# turma e segue o caminho com dados, que também leva o guia. Errar para esse
# lado só deixa de economizar dado; nunca deixa a pergunta sem resposta.
_PRODUTO = re.compile(
    r"\b(como\s+(eu\s+)?(uso|usar|fa[cç]o|fazer|configur\w*|cri[oa]r?|cadastr\w*|matricul\w*|registr\w*|abr[eio]r?|"
    r"duplic\w*|export\w*|ativ\w*|lig[ao]r?|deslig\w*|funciona\w*|edit\w*|gero|gerar|apag\w*|exclu\w*)|"
    r"onde\s+(fica|ficam|vejo|encontro|configuro|est[aá]|mudo|altero)|para\s+que\s+serve|o\s+que\s+(é|e|significa|faz)\b|"
    r"aba|abas|tela|bot[aã]o|console|menu|app|aplicativo|vers[aã]o\s+web|privacidade|lgpd|consentimento|termos|"
    r"dados\s+pessoais|reten[cç][aã]o|passo\s+a\s+passo)\b",
    re.IGNORECASE,
)
# Sinais de que a pergunta é sobre os dados da turma (ou de um aluno).
_DADO_DA_TURMA = re.compile(
    r"\b(alun[oa]s?|quem|minha\s+turma|da\s+turma|nesta\s+turma|desempenho|m[eé]dia|risco|abandon\w*|evas\w*|"
    r"parad[oa]s?|inativ\w*|acert\w*|err(a|am|ando|ou)|dificuldade|atrasad\w*|engajad\w*|melhor(es)?|pior(es)?|A\d+)\b",
    re.IGNORECASE,
)
# "o aluno vê", "app do aluno": falam do produto, não de um aluno.
_ALUNO_DO_PRODUTO = re.compile(
    r"\b((app|aplicativo|vers[aã]o\s+web|tela|perfil|loja|carteira)\s+do\s+aluno|o\s+aluno\s+(v[eê]|recebe|ganha|faz|consegue|pode)|"
    r"os\s+alunos\s+(v[eê]em|recebem|ganham|fazem|conseguem|podem))\b",
    re.IGNORECASE,
)
# Palavras com maiúscula que são do produto; qualquer outra no meio da frase
# pode ser nome de aluno e tira a pergunta do caminho sem dados.
_VOCABULARIO = {
    "lumi", "trailup", "brainhex", "economia", "visão", "geral", "recomendações", "trilha", "trilhas", "missões",
    "missão", "conquistas", "notas", "eventos", "evento", "turmas", "turma", "personalizações", "rankings", "ranking",
    "rank", "batalhas", "guildas", "guilda", "meus", "dados", "aprovações", "valores", "moedas", "loja", "fundo",
    "metas", "histórico", "prazos", "tempo", "perfil", "social", "notificações", "android", "google", "gemini",
    "lgpd", "coleta", "acessos", "web", "app", "csv", "pdf", "ia", "console", "privacidade", "termos", "presença",
    "matrículas", "seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever",
}
# Começo de frase também tem maiúscula; só estas palavras passam ali. Outra
# palavra no começo pode ser nome ("Ana faltou?") e conta como citação.
_INICIO_DE_FRASE = {
    "como", "onde", "qual", "quais", "o", "a", "os", "as", "e", "em", "para", "pra", "por", "que", "quando", "quanto",
    "quantos", "quantas", "me", "eu", "tem", "há", "pode", "posso", "preciso", "quero", "queria", "gostaria",
    "obrigado", "obrigada", "oi", "olá", "ok", "certo", "sim", "não", "nao", "bom", "boa", "legal", "mas", "então",
    "isso", "esse", "essa", "este", "esta", "um", "uma", "no", "na", "do", "da", "se", "já", "agora", "também",
    "ainda", "explique", "explica", "mostre", "mostra", "diga", "ajuda", "ajude", "é", "existe", "dá", "da",
    "consigo", "devo", "vale", "depois", "antes", "aí", "ali", "lá", "cadê", "qualquer", "todo", "toda", "cada",
}
_PALAVRA_MAIUSCULA = re.compile(r"(?<![\w@])([A-ZÀ-Ý][\wÀ-ÿ]*)")


def _parece_citar_aluno(texto: str) -> bool:
    """Nome próprio fora do vocabulário do produto, ref A1... ou e-mail."""
    if re.search(r"\bA\d+\b|@", texto):
        return True
    for m in _PALAVRA_MAIUSCULA.finditer(texto):
        palavra = m.group(1).lower()
        if palavra in _VOCABULARIO:
            continue
        antes = texto[: m.start()].rstrip()
        if (not antes or antes[-1] in ".!?:;\n-•(\"“>*") and palavra in _INICIO_DE_FRASE:
            continue
        return True
    return False


def pergunta_de_produto(texto: str) -> bool:
    texto = texto.strip()
    if not _PRODUTO.search(texto) or _parece_citar_aluno(texto):
        return False
    return not _DADO_DA_TURMA.search(_ALUNO_DO_PRODUTO.sub(" ", texto))


@lru_cache(maxsize=1)
def guia_do_produto() -> str:
    # O lado do aluno e a privacidade são a mesma base dos Guardiões.
    return f"{load_prompt('lumi_conhecimento.md')}\n\n{guia_do_app()}"


class TurmaNaoPermitida(Exception):
    """A turma pedida não é do professor autenticado."""


class EscribaIndisponivel(Exception):
    """O modelo não respondeu; não existe resposta de reserva."""


def _limpo(valor: Any) -> Any:
    if isinstance(valor, bool) or valor is None:
        return valor
    try:
        return round(float(valor), 1)
    except (TypeError, ValueError):
        return valor


def _linha(row: dict[str, Any]) -> dict[str, Any]:
    linha = {k: _limpo(v) if k not in ("perfil_nome", "metrica", "faixa") else v for k, v in row.items()}
    # As views devolvem nota 0 quando não há nota nenhuma; o dashboard mostra
    # "—" nesse caso (Fase 2) e o modelo não pode ler isso como "tirou zero".
    for chave in ("media_nota_turma", "media_nota"):
        if linha.get(chave) == 0:
            linha[chave] = None
    return linha


def _renumerar_refs(contextos: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cada retrato numera A1... da própria turma; com várias turmas no mesmo
    payload, a ref precisa ser única. Devolve os contextos sem o mapa de nomes
    (que não vai ao modelo) e o mapa ref global -> nome."""
    nomes_por_ref: dict[str, Any] = {}
    saida: list[dict[str, Any]] = []
    n = 0
    for contexto in contextos:
        contexto = dict(contexto)
        locais = contexto.pop("_nomes_por_ref", None) or {}
        alunos = []
        for aluno in contexto.get("alunos") or []:
            n += 1
            nova = f"A{n}"
            nomes_por_ref[nova] = locais.get(aluno.get("ref"))
            alunos.append({**{k: v for k, v in aluno.items() if k not in ("nome", "email")}, "ref": nova})
        contexto["alunos"] = alunos
        saida.append(contexto)
    return saida, nomes_por_ref


class EscribaService:
    def __init__(
        self,
        session: AsyncSession,
        llm: JsonLLMService,
        *,
        segredo: str | None = None,
        prazo_total: float | None = None,
    ) -> None:
        self.session = session
        self.llm = llm
        self.segredo = segredo
        self.prazo_total = prazo_total

    async def turmas_do_professor(self, professor_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text("SELECT id, descricao FROM classe WHERE professor_id = CAST(:professor_id AS uuid) ORDER BY id"),
            {"professor_id": professor_id},
        )
        return [dict(r) for r in result.mappings()]

    async def _ler(self, rotulo: str, sql: str, classe_id: int) -> list[dict[str, Any]]:
        try:
            result = await self.session.execute(text(sql), {"classe_id": classe_id})
            return [_linha(dict(r)) for r in result.mappings()]
        except Exception as exc:
            logger.warning("Escriba: sem '%s' da classe %s (%s)", rotulo, classe_id, exc)
            await self.session.rollback()
            return []

    async def contexto_da_turma(self, turma: dict[str, Any], agora: datetime) -> dict[str, Any]:
        classe_id = int(turma["id"])
        geral = await self._ler(
            "geral", f"SELECT {_GERAL} FROM vw_metricas_turma_geral_classe WHERE classe_id = :classe_id", classe_id
        )
        por_perfil = await self._ler(
            "por perfil",
            # Mesmo recorte padrão do gráfico do dashboard: o perfil majoritário de
            # cada aluno. Os outros segmentos repetem o perfil com outro critério.
            f"SELECT {_POR_PERFIL} FROM vw_metricas_turma_perfil_classe "
            "WHERE classe_id = :classe_id AND segmento = 'majoritario' ORDER BY perfil_nome",
            classe_id,
        )
        distribuicao = await self._ler(
            "distribuicao",
            "SELECT metrica, faixa, total_alunos, percentual FROM vw_metricas_distribuicao_turma_classe "
            "WHERE classe_id = :classe_id ORDER BY metrica, faixa",
            classe_id,
        )
        retrato, _refs_turma, nomes_por_ref = await InsightsTurmaService(self.session, self.llm).coletar_contexto(
            classe_id, agora, incluir_descartados=False
        )
        return {
            "turma": turma.get("descricao") or f"Turma {classe_id}",
            "geral": geral[0] if geral else None,
            "por_perfil": por_perfil,
            "distribuicao": distribuicao,
            # Só a ref (A1...) vai ao modelo (#195); `perguntar` renumera entre
            # turmas e troca as refs da resposta pelos nomes.
            "alunos": retrato.get("alunos", []),
            "topicos": retrato.get("topicos", []),
            "_nomes_por_ref": nomes_por_ref,
        }

    async def _gerar(self, payload: dict[str, Any], guardrails: list[Any], contexto: dict[str, Any]) -> EscribaSaida:
        async def _auditar(violacao: GuardrailViolation, fase: str) -> None:
            logger.warning("Escriba: %s (%s): %s", violacao.regra, fase, violacao.mensagem)

        def _sem_resposta() -> dict[str, Any]:
            # Não existe resposta de reserva: número da turma inventado é pior que erro.
            raise EscribaIndisponivel("modelo sem resposta valida")

        return await gerar_validado(
            self.llm,
            prompt_name="escriba.txt",
            payload=payload,
            schema=EscribaSaida,
            guardrails=guardrails,
            fallback_factory=_sem_resposta,
            contexto=contexto,
            on_violation=_auditar,
            prazo_total=self.prazo_total,
        )

    def _falas_confiaveis(self, professor_id: str, pedido: PerguntaEscriba) -> list[dict[str, str]]:
        """As falas do professor e as da Lumi com assinatura válida. O console assina desde que a API
        assina, então fala sem assinatura aqui é aba antiga ou fala escrita à mão: fica de fora."""
        falas = []
        for fala in pedido.historico[-MAX_HISTORICO:]:
            if fala.papel == "escriba" and not (
                self.segredo
                and assinatura_chat.confere(
                    fala.assinatura, fala.texto, segredo=self.segredo, usuario_id=professor_id, canal="lumi"
                )
            ):
                logger.info("Escriba: fala sem assinatura valida fora do historico")
                continue
            falas.append({"papel": fala.papel, "texto": fala.texto})
        return falas

    async def perguntar(self, professor_id: str, pedido: PerguntaEscriba, agora: datetime | None = None) -> RespostaEscriba:
        resposta = await self._responder(professor_id, pedido, agora or datetime.now(UTC))
        if not self.segredo:
            return resposta
        assinatura = assinatura_chat.assinar(
            resposta.resposta, segredo=self.segredo, usuario_id=professor_id, canal="lumi"
        )
        return resposta.model_copy(update={"assinatura": assinatura})

    async def _responder(self, professor_id: str, pedido: PerguntaEscriba, agora: datetime) -> RespostaEscriba:
        turmas = await self.turmas_do_professor(professor_id)
        if pedido.classe_id is not None:
            escopo = [t for t in turmas if int(t["id"]) == pedido.classe_id]
            if not escopo:
                raise TurmaNaoPermitida(str(pedido.classe_id))
        else:
            escopo = turmas[:MAX_TURMAS]

        falas = self._falas_confiaveis(professor_id, pedido)
        if pergunta_de_produto(pedido.pergunta):
            return await self._responder_sobre_o_produto(pedido, falas, agora)

        if not escopo:
            return RespostaEscriba(
                resposta="Você ainda não tem turmas no TrailUp. Quando criar uma e os alunos começarem a estudar, eu consigo ler os dados dela.",
                turmas=[],
                gerado_em=agora,
            )

        contextos = [await self.contexto_da_turma(t, agora) for t in escopo]
        turmas_payload, nomes_por_ref = _renumerar_refs(contextos)
        # Pergunta e histórico do professor citam alunos pelo nome (e o histórico
        # volta com os nomes que restauramos): vão ao modelo como refs.
        payload = {
            "pergunta": pseudonimizar_texto(pedido.pergunta.strip(), nomes_por_ref),
            "historico": [{**m, "texto": pseudonimizar_texto(m["texto"], nomes_por_ref)} for m in falas],
            # Chave com "_" é do servidor (ids, mapa de nomes): nunca vai ao modelo.
            "guia_do_produto": guia_do_produto(),
            "turmas": [{k: v for k, v in t.items() if not k.startswith("_")} for t in turmas_payload],
        }
        # Sem rota de IA por idade, de propósito (decisão de 04/11/2026): a
        # regra "IA só para maiores" da #195/#933 vale para o ALUNO usar a
        # IA, não para o professor perguntar sobre as próprias turmas. Aluno
        # menor ou sem data de nascimento entra no payload como os outros,
        # só pela ref (A1...), sem nome, e-mail nem UUID.
        saida = await self._gerar(payload, [checar_refs_existem], {"nomes_por_ref": nomes_por_ref})
        return _montar_resposta(saida, [int(t["id"]) for t in escopo], agora, nomes_por_ref)

    async def _responder_sobre_o_produto(
        self, pedido: PerguntaEscriba, falas: list[dict[str, str]], agora: datetime
    ) -> RespostaEscriba:
        """Pergunta sobre o produto: nenhuma turma é lida e nenhum dado de aluno
        vai ao modelo. Do histórico só seguem as perguntas do professor que não
        citam aluno; as respostas da Lumi ficam de fora, porque as que falaram
        da turma voltaram com o nome do aluno restaurado."""
        payload = {
            "pergunta": pedido.pergunta.strip(),
            "historico": [m for m in falas if m["papel"] == "professor" and not _parece_citar_aluno(m["texto"])],
            "guia_do_produto": guia_do_produto(),
            "turmas": [],
        }
        return _montar_resposta(await self._gerar(payload, [], {}), [], agora)

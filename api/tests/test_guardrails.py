import asyncio

from app.agent.graph.guardrails import (
    GuardrailViolation,
    checar_evidencia_dominio,
    checar_ordem_sequencial,
    checar_topicos_existem,
    gerar_validado,
)
from app.schemas.trilha_config import TrilhaConfig
from app.services.llm import StructuredOutputError


def _topicos():
    return [
        {"id": 10, "ordem": 1},
        {"id": 11, "ordem": 2},
        {"id": 12, "ordem": 3},
    ]


def test_checar_ordem_sequencial_detecta_pulo_de_topico_incompleto() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=12, proximos_topicos=[], justificativa="x")
    contexto = {
        "topicos_classe": _topicos(),
        "progresso_trilha": {"10": {"percentual_concluido": 40}},
    }

    violacao = checar_ordem_sequencial(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "ordem_sequencial"


def test_checar_ordem_sequencial_aceita_avanco_com_anteriores_completos() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=12, proximos_topicos=[], justificativa="x")
    contexto = {
        "topicos_classe": _topicos(),
        "progresso_trilha": {
            "10": {"percentual_concluido": 100},
            "11": {"percentual_concluido": 100},
        },
    }

    assert checar_ordem_sequencial(trilha, contexto) is None


def test_checar_topicos_existem_detecta_id_inexistente() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=999, proximos_topicos=[10], justificativa="x")
    contexto = {"topicos_classe": _topicos()}

    violacao = checar_topicos_existem(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "topicos_existem"


def test_checar_topicos_existem_aceita_ids_validos() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=10, proximos_topicos=[11, 12], justificativa="x")
    contexto = {"topicos_classe": _topicos()}

    assert checar_topicos_existem(trilha, contexto) is None


def test_checar_evidencia_dominio_rejeita_avanco_sem_reforco_com_baixo_desempenho() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {"desempenho_recente": {"media_acertos": 30}}

    violacao = checar_evidencia_dominio(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "evidencia_dominio"


def test_checar_evidencia_dominio_aceita_avanco_sem_reforco_com_bom_desempenho() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {"desempenho_recente": {"media_acertos": 80}}

    assert checar_evidencia_dominio(trilha, contexto) is None


class _FakeLLM:
    def __init__(self, respostas: list[object]) -> None:
        self._respostas = list(respostas)
        self.chamadas: list[dict] = []

    async def ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        self.chamadas.append({"prompt_name": prompt_name, "payload": payload})
        proxima = self._respostas.pop(0)
        if isinstance(proxima, Exception):
            raise proxima
        return schema.model_validate(proxima)


def test_gerar_validado_retorna_de_primeira_quando_sem_violacao() -> None:
    llm = _FakeLLM([{"classe_id": 1, "topico_foco": 10, "justificativa": "ok"}])

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 10
    assert len(llm.chamadas) == 1


def test_gerar_validado_faz_1_retry_com_correcao_quando_guardrail_viola() -> None:
    llm = _FakeLLM(
        [
            {"classe_id": 1, "topico_foco": 10, "justificativa": "primeira tentativa"},
            {"classe_id": 1, "topico_foco": 11, "justificativa": "corrigida"},
        ]
    )

    chamou = {"vezes": 0}

    def guardrail_falha_na_primeira(trilha, _contexto):
        chamou["vezes"] += 1
        if trilha.topico_foco == 10:
            return GuardrailViolation(regra="teste", mensagem="topico errado")
        return None

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[guardrail_falha_na_primeira],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 11
    assert len(llm.chamadas) == 2
    assert "teste" in llm.chamadas[1]["payload"]["correcao"]


def test_gerar_validado_cai_no_fallback_apos_2_tentativas_e_avisa_violacao() -> None:
    llm = _FakeLLM(
        [
            {"classe_id": 1, "topico_foco": 10, "justificativa": "1"},
            {"classe_id": 1, "topico_foco": 10, "justificativa": "2"},
        ]
    )

    def guardrail_sempre_viola(_trilha, _contexto):
        return GuardrailViolation(regra="teste", mensagem="sempre viola")

    violacoes_avisadas: list[tuple[GuardrailViolation, str]] = []

    async def on_violation(violacao, fase):
        violacoes_avisadas.append((violacao, fase))

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[guardrail_sempre_viola],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
            on_violation=on_violation,
        )
    )

    assert resultado.justificativa == "fallback"
    assert len(llm.chamadas) == 2
    assert len(violacoes_avisadas) == 2
    assert violacoes_avisadas[-1][1] == "fallback_final"


def test_gerar_validado_trata_structured_output_error_como_violacao_de_schema() -> None:
    llm = _FakeLLM(
        [
            StructuredOutputError("json invalido"),
            {"classe_id": 1, "topico_foco": 10, "justificativa": "corrigida"},
        ]
    )

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 10
    assert "json invalido" in llm.chamadas[1]["payload"]["correcao"]

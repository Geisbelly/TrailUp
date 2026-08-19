from app.agent.graph.guardrails import (
    GuardrailViolation,
    checar_evidencia_dominio,
    checar_ordem_sequencial,
    checar_topicos_existem,
)
from app.schemas.trilha_config import TrilhaConfig


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

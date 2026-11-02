import pytest

from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.repositories.mental_state import MentalStateHistoryRepository
from app.services.memoria_aluno import _detectar_recorrencia, atualizar_memoria, ler_memoria


def test_detectar_recorrencia_marca_3_de_5_mesmo_kind_negativo() -> None:
    registros = [
        {"kind": "dificuldade"},
        {"kind": "sem_alerta"},
        {"kind": "dificuldade"},
        {"kind": "dificuldade"},
        {"kind": "sem_alerta"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is True
    assert resultado.kind == "dificuldade"
    assert resultado.ocorrencias == 3


def test_detectar_recorrencia_nao_marca_kinds_mistos_sem_maioria() -> None:
    registros = [
        {"kind": "dificuldade"},
        {"kind": "abandono"},
        {"kind": "dificuldade"},
        {"kind": "abandono"},
        {"kind": "sem_alerta"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False
    assert resultado.kind is None
    assert resultado.ocorrencias == 0


def test_detectar_recorrencia_ignora_kinds_positivos() -> None:
    registros = [{"kind": "sem_alerta"}] * 5

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False


def test_emocao_antiga_nao_conta_mais_como_alerta() -> None:
    # DAT-45: o historico guarda estado de estudo; rotulo de emocao nao vira recorrencia.
    assert _detectar_recorrencia([{"kind": "anxious"}] * 5).recorrente is False


def test_detectar_recorrencia_ignora_registros_alem_da_janela_de_5() -> None:
    # 3 ocorrencias de 'dificuldade', mas fora da janela dos 5 mais recentes.
    registros = [
        {"kind": "sem_alerta"},
        {"kind": "sem_alerta"},
        {"kind": "sem_alerta"},
        {"kind": "sem_alerta"},
        {"kind": "sem_alerta"},
        {"kind": "dificuldade"},
        {"kind": "dificuldade"},
        {"kind": "dificuldade"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False


def test_detectar_recorrencia_com_lista_vazia() -> None:
    assert _detectar_recorrencia([]).recorrente is False


@pytest.mark.asyncio
async def test_ler_memoria_combina_dominio_e_recorrencia(monkeypatch) -> None:
    async def fake_buscar_por_classe(self, *, aluno_id, classe_id):
        return {
            "10": {
                "dominio_estimado": 0.72,
                "tendencia": "ascendente",
                "confianca": 0.66,
                "atualizado_em": None,
            }
        }

    async def fake_listar_por_aluno(self, *, aluno_id, limit=50):
        return [{"kind": "dificuldade"}] * 3

    monkeypatch.setattr(AlunoTopicoDominioRepository, "buscar_por_classe", fake_buscar_por_classe)
    monkeypatch.setattr(MentalStateHistoryRepository, "listar_por_aluno", fake_listar_por_aluno)

    memoria = await ler_memoria(object(), aluno_id="aluno-1", classe_id=32)

    assert memoria.dominio_por_topico["10"].dominio_estimado == 0.72
    assert memoria.mental_state_recorrente.recorrente is True
    assert memoria.mental_state_recorrente.kind == "dificuldade"


@pytest.mark.asyncio
async def test_ler_memoria_devolve_vazio_em_falha_de_leitura(monkeypatch) -> None:
    async def fake_buscar_por_classe(self, *, aluno_id, classe_id):
        raise RuntimeError("tabela indisponivel")

    monkeypatch.setattr(AlunoTopicoDominioRepository, "buscar_por_classe", fake_buscar_por_classe)

    memoria = await ler_memoria(object(), aluno_id="aluno-1", classe_id=32)

    assert memoria.dominio_por_topico == {}
    assert memoria.mental_state_recorrente.recorrente is False


@pytest.mark.asyncio
async def test_atualizar_memoria_faz_upsert_com_resumo_de_performance(monkeypatch) -> None:
    chamadas = []

    async def fake_upsert(self, **kwargs):
        chamadas.append(kwargs)

    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", fake_upsert)

    await atualizar_memoria(
        object(),
        aluno_id="aluno-1",
        topico_id=10,
        performance_resumo={"dominio_estimado": 0.8, "tendencia": "ascendente", "confianca": 0.7},
    )

    assert chamadas == [
        {
            "aluno_id": "aluno-1",
            "topico_id": 10,
            "dominio_estimado": 0.8,
            "tendencia": "ascendente",
            "confianca": 0.7,
        }
    ]


@pytest.mark.asyncio
async def test_atualizar_memoria_nao_falha_sem_topico_id(monkeypatch) -> None:
    chamadas = []

    async def fake_upsert(self, **kwargs):
        chamadas.append(kwargs)

    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", fake_upsert)

    await atualizar_memoria(
        object(),
        aluno_id="aluno-1",
        topico_id=None,
        performance_resumo={"dominio_estimado": 0.8, "tendencia": "ascendente", "confianca": 0.7},
    )

    assert chamadas == []


@pytest.mark.asyncio
async def test_atualizar_memoria_engole_falha_de_upsert(monkeypatch) -> None:
    async def fake_upsert(self, **kwargs):
        raise RuntimeError("conexao perdida")

    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", fake_upsert)

    await atualizar_memoria(
        object(),
        aluno_id="aluno-1",
        topico_id=10,
        performance_resumo={"dominio_estimado": 0.8, "tendencia": "ascendente", "confianca": 0.7},
    )

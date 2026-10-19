"""Fase 6: o texto da LLM só entra se disser a mesma meta; qualquer falha deixa o molde."""

import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import missao_diaria_texto as modulo
from app.services.llm import StructuredOutputError
from app.services.missao_diaria_texto import (
    TextoMissao,
    TextoMissoesDiarias,
    alvo_e_unidade,
    enriquecer_coorte,
    montar_payload,
    processar_job_missao_diaria,
    validar_texto,
)

MINUTOS = {"metrica": "minutos_no_dia", "minutos": 10, "dia": "2026-10-19"}
ATIVIDADES = {
    "metrica": "eventos_no_dia",
    "minimo": 2,
    "evento": "atividade_concluida",
    "dia": "2026-10-19",
    "fuso": "America/Sao_Paulo",
}
ACOES = {"metrica": "eventos_no_dia", "minimo": 5, "dia": "2026-10-19", "fuso": "America/Sao_Paulo"}


# --------------------------------------------------------------------------- validação


def test_alvo_vem_do_criterio() -> None:
    assert alvo_e_unidade(MINUTOS)[0] == 10
    assert alvo_e_unidade(ATIVIDADES)[0] == 2
    assert alvo_e_unidade(ACOES)[0] == 5
    # Métrica acumulada não é de diária: sem alvo conhecido, não reescreve.
    assert alvo_e_unidade({"metrica": "minutos_totais", "minutos": 10}) is None
    assert alvo_e_unidade({"metrica": "minutos_no_dia", "minutos": "x"}) is None


def test_texto_que_diz_a_mesma_meta_passa() -> None:
    assert validar_texto(
        "Explorador do dia", "Descubra algo novo em 10 minutos de estudo hoje.", MINUTOS
    ) == ("Explorador do dia", "Descubra algo novo em 10 minutos de estudo hoje.")
    assert isinstance(validar_texto("Mão na massa", "Conclua 2 atividades hoje.", ATIVIDADES), tuple)
    assert isinstance(validar_texto("Movimento", "Faça 5 ações na trilha hoje.", ACOES), tuple)


def test_espacos_e_quebras_sao_normalizados() -> None:
    assert validar_texto("  Ritmo \n forte ", "Estude\n10 minutos   hoje.", MINUTOS) == (
        "Ritmo forte",
        "Estude 10 minutos hoje.",
    )


@pytest.mark.parametrize(
    ("titulo", "descricao", "criterio", "motivo"),
    [
        ("Foco", "Estude 15 minutos hoje.", MINUTOS, "numero_diferente_do_alvo"),
        ("Foco", "Estude 10 minutos e faça 3 atividades.", MINUTOS, "numero_diferente_do_alvo"),
        ("Foco total", "Estude dez minutos hoje, sem pressa.", MINUTOS, "descricao_sem_o_alvo"),
        ("Foco", "Estude 10 minutos hoje, cinco a mais.", MINUTOS, "numero_por_extenso"),
        ("Foco", "Faça 10 exercícios hoje com calma.", MINUTOS, "descricao_sem_a_unidade"),
        ("Foco", "Estude 10 minutos e ganhe moedas.", MINUTOS, "fala_de_recompensa"),
        ("Foco", "Estude 10 minutos: https://x.y", MINUTOS, "marcacao_ou_link"),
        ("**Foco**", "Estude 10 minutos hoje.", MINUTOS, "marcacao_ou_link"),
        ("F", "Estude 10 minutos hoje.", MINUTOS, "titulo_fora_do_tamanho"),
        ("Foco", "10 min", MINUTOS, "descricao_fora_do_tamanho"),
        ("Foco", "x" * 201, MINUTOS, "descricao_fora_do_tamanho"),
        ("Foco", "Estude 2 conteúdos hoje.", ATIVIDADES, "descricao_sem_a_unidade"),
        ("Foco", "Estude 10 minutos hoje.", {"metrica": "dias_seguidos"}, "metrica_sem_alvo_conhecido"),
    ],
)
def test_texto_que_muda_a_meta_e_recusado(titulo, descricao, criterio, motivo) -> None:
    assert validar_texto(titulo, descricao, criterio) == motivo


def test_payload_leva_a_meta_do_criterio_e_o_tom_do_perfil() -> None:
    payload = montar_payload(
        materia="Química",
        perfil="seeker",
        missoes=[
            {"slot": 1, "titulo": "Dez minutos hoje", "descricao": "Passe pelo menos 10 minutos.", "criterio": MINUTOS},
            {"slot": 2, "titulo": "X", "descricao": "Y", "criterio": {"metrica": "dias_seguidos"}},
        ],
    )
    assert payload["turma"] == {"materia": "Química"}
    assert "descoberta" in payload["perfil"]["tom"]
    assert [item["slot"] for item in payload["missoes"]] == [1]
    assert payload["missoes"][0]["alvo"] == 10


# --------------------------------------------------------------------------- fluxo


class _Sessao:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


def _missoes():
    return [
        {"id": 11, "slot": 1, "titulo": "Dez minutos hoje", "descricao": "Passe pelo menos 10 minutos estudando hoje.", "criterio": MINUTOS},
        {"id": 12, "slot": 2, "titulo": "Conclua atividades", "descricao": "Conclua 2 atividade(s) hoje.", "criterio": ATIVIDADES},
    ]


@pytest.fixture
def banco(monkeypatch):
    escritas: list[dict] = []

    async def reescrever(_session, **kwargs):
        escritas.append(kwargs)
        return True

    monkeypatch.setattr(modulo, "_missoes_da_coorte", AsyncMock(return_value=_missoes()))
    monkeypatch.setattr(modulo, "_materia_da_turma", AsyncMock(return_value="Química"))
    monkeypatch.setattr(modulo, "_reescrever", reescrever)
    return escritas


def _llm(resposta=None, erro: Exception | None = None):
    llm = SimpleNamespace()
    llm.ainvoke_structured = AsyncMock(side_effect=erro) if erro else AsyncMock(return_value=resposta)
    return llm


SETTINGS = SimpleNamespace(gemini_model_default="gemini-teste")


async def _rodar(sessao, llm):
    return await enriquecer_coorte(
        session=sessao, settings=SETTINGS, classe_id=7, perfil="seeker", dia=date(2026, 10, 19), llm=llm
    )


@pytest.mark.asyncio
async def test_llm_fora_do_ar_deixa_o_molde_e_nao_escreve(banco) -> None:
    sessao = _Sessao()
    resultado = await _rodar(sessao, _llm(erro=StructuredOutputError("Nenhum provedor LLM disponivel")))

    assert banco == []
    assert sessao.commits == 0
    assert resultado.status == "failed"
    assert resultado.reescritas == 0
    assert "texto do molde mantido" in resultado.last_error()


@pytest.mark.asyncio
async def test_llm_pendurada_cai_no_molde_pelo_timeout(banco, monkeypatch) -> None:
    monkeypatch.setattr(modulo, "LLM_TIMEOUT_SEC", 0.01)

    async def pendura(**_kwargs):
        await asyncio.sleep(5)

    llm = SimpleNamespace(ainvoke_structured=pendura)
    resultado = await _rodar(_Sessao(), llm)

    assert banco == []
    assert resultado.status == "failed"


@pytest.mark.asyncio
async def test_reescreve_o_que_passa_e_mantem_o_resto(banco) -> None:
    resposta = TextoMissoesDiarias(
        missoes=[
            TextoMissao(slot=1, titulo="Explorador do dia", descricao="Descubra algo novo em 10 minutos de estudo hoje."),
            # Muda a meta: 3 em vez de 2. Fica o molde.
            TextoMissao(slot=2, titulo="Caçador", descricao="Conclua 3 atividades hoje."),
        ]
    )
    sessao = _Sessao()
    resultado = await _rodar(sessao, _llm(resposta))

    assert [escrita["missao_id"] for escrita in banco] == [11]
    assert banco[0]["modelo"] == "gemini/gemini-teste"
    assert resultado.status == "completed"
    assert resultado.reescritas == 1
    assert resultado.mantidas == {2: "numero_diferente_do_alvo"}
    assert "1 de 2 no texto do molde" in resultado.last_error()
    assert sessao.commits == 1
    # A leitura é encerrada antes da chamada externa.
    assert sessao.rollbacks == 1


@pytest.mark.asyncio
async def test_slot_que_a_llm_esqueceu_fica_no_molde(banco) -> None:
    resposta = TextoMissoesDiarias(
        missoes=[TextoMissao(slot=1, titulo="Explorador", descricao="Estude 10 minutos hoje, sem pressa.")]
    )
    resultado = await _rodar(_Sessao(), _llm(resposta))

    assert resultado.reescritas == 1
    assert resultado.mantidas == {2: "slot_ausente_na_resposta"}


@pytest.mark.asyncio
async def test_banco_que_recusa_nao_vira_sucesso(banco, monkeypatch) -> None:
    monkeypatch.setattr(modulo, "_reescrever", AsyncMock(return_value=False))
    resposta = TextoMissoesDiarias(
        missoes=[TextoMissao(slot=1, titulo="Explorador", descricao="Estude 10 minutos hoje, sem pressa.")]
    )
    resultado = await _rodar(_Sessao(), _llm(resposta))

    assert resultado.reescritas == 0
    assert resultado.mantidas[1] == "banco_recusou_a_reescrita"


@pytest.mark.asyncio
async def test_sem_missao_nao_chama_a_llm(monkeypatch) -> None:
    monkeypatch.setattr(modulo, "_missoes_da_coorte", AsyncMock(return_value=[]))
    llm = _llm(TextoMissoesDiarias(missoes=[]))
    resultado = await _rodar(_Sessao(), llm)

    llm.ainvoke_structured.assert_not_called()
    assert resultado.status == "completed"
    assert resultado.last_error() is None


@pytest.mark.asyncio
async def test_payload_sem_dia_falha_sem_tocar_no_banco(monkeypatch) -> None:
    leitura = AsyncMock(return_value=_missoes())
    monkeypatch.setattr(modulo, "_missoes_da_coorte", leitura)
    resultado = await processar_job_missao_diaria(
        session=_Sessao(), settings=SETTINGS, job={"classe_id": 7, "payload": {"perfil": "seeker"}}
    )

    assert resultado.status == "failed"
    leitura.assert_not_called()


# --------------------------------------------------------------------------- worker


class _SessionCtx:
    async def __aenter__(self):
        return _Sessao()

    async def __aexit__(self, *_args):
        return False


@pytest.mark.asyncio
async def test_worker_despacha_missao_diaria_e_finaliza(monkeypatch) -> None:
    from app.services import personalizacao_jobs as jobs_module
    from app.services.missao_diaria_texto import ResultadoCoorte

    job = {"id": "job-md", "classe_id": 7, "kind": "missao_diaria", "payload": {"dia": "2026-10-19", "perfil": "seeker"}}
    finalizados: list[tuple[str, str | None]] = []

    async def claim_next_job(_self, **_kwargs):
        return job

    async def finalize_job(_self, *, job_id, status, last_error):
        assert job_id == "job-md"
        finalizados.append((status, last_error))

    processar = AsyncMock(return_value=ResultadoCoorte(status="completed", lidas=2, reescritas=2))
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.claim_next_job", claim_next_job
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.finalize_job", finalize_job
    )
    monkeypatch.setattr(jobs_module, "processar_job_missao_diaria", processar)

    app = SimpleNamespace(
        state=SimpleNamespace(
            session_factory=_SessionCtx,
            settings=SimpleNamespace(personalizacao_job_stale_processing_min=40),
        )
    )

    assert await jobs_module.process_personalizacao_job_once(app) is True
    processar.assert_awaited_once()
    assert finalizados == [("completed", None)]


@pytest.mark.asyncio
async def test_worker_excecao_vira_failed_com_molde_mantido(monkeypatch) -> None:
    from app.services import personalizacao_jobs as jobs_module

    job = {"id": "job-md", "classe_id": 7, "kind": "missao_diaria", "payload": {"dia": "2026-10-19"}}
    finalizados: list[tuple[str, str | None]] = []

    async def claim_next_job(_self, **_kwargs):
        return job

    async def finalize_job(_self, *, job_id, status, last_error):
        finalizados.append((status, last_error))

    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.claim_next_job", claim_next_job
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.finalize_job", finalize_job
    )
    monkeypatch.setattr(jobs_module, "processar_job_missao_diaria", AsyncMock(side_effect=RuntimeError("banco caiu")))

    app = SimpleNamespace(
        state=SimpleNamespace(
            session_factory=_SessionCtx,
            settings=SimpleNamespace(personalizacao_job_stale_processing_min=40),
        )
    )

    assert await jobs_module.process_personalizacao_job_once(app) is True
    assert finalizados[0][0] == "failed"
    assert "texto do molde mantido" in finalizados[0][1]

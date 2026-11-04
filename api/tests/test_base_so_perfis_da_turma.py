"""A base por perfil so e' gerada para os perfis que a turma tem.

Decisao de produto: texto, audio, apresentacao e falas do boss da base saem so
para os perfis que algum aluno matriculado tem como principal OU secundario.
A geracao continua antecipada; quando entra aluno com perfil novo, a matricula
enfileira a base desse perfil.
"""

import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.services import boss_falas
from app.services import personalizacao_jobs as jobs_module
from app.services.personalizacao_jobs import (
    _MOTIVO_PERFIL_SEM_ALUNO,
    _MOTIVO_TURMA_SEM_ALUNO,
    JOB_KIND_CLASS_DELTA,
    JOB_KIND_ENROLLMENT,
    JOB_KIND_FULL_SYNC,
    _build_targets,
    _garantir_base_dos_perfis_do_aluno,
    _perfis_presentes_na_turma,
    _pular_base_de_perfil_ausente,
)


@pytest.fixture(autouse=True)
def _enfileirar_sem_trava(monkeypatch):
    """A trava so existe num Postgres de verdade: aqui a sessao e' um `object()`.
    A corrida e' medida em `test_e2e_job_manual_um_por_pedido.py`."""
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.travar_enfileiramento",
        AsyncMock(return_value=None),
    )


_LISTAR = (
    "app.repositories.conteudo_classe.ConteudoClasseRepository."
    "listar_alunos_classe_com_perfil_dominante"
)
_MAPEAR_TODOS = (
    "app.repositories.conteudo_classe.ConteudoClasseRepository."
    "mapear_todos_conteudos_por_topicos"
)
_FALTANDO = (
    "app.repositories.conteudo_classe.ConteudoClasseRepository."
    "mapear_topicos_sem_base_por_perfil"
)


class _Sessao:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return None

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


def _app() -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace(session_factory=_Sessao, settings=None))


# --------------------------------------------------------------------------
# Quais perfis a turma tem
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_principais_x_y_e_secundario_w_geram_so_x_y_w(monkeypatch) -> None:
    alunos = [
        # X = conqueror (principal), Y = seeker (secundario deste, principal do outro)
        {"aluno_id": "a1", "perfil_dominante": "conqueror", "perfil_secundario": "seeker"},
        # W = socializer so aparece como secundario
        {"aluno_id": "a2", "perfil_dominante": "seeker", "perfil_secundario": "socializer"},
        {"aluno_id": "a3", "perfil_dominante": "conqueror", "perfil_secundario": "seeker"},
    ]
    monkeypatch.setattr(_LISTAR, AsyncMock(return_value=alunos))
    monkeypatch.setattr(_MAPEAR_TODOS, AsyncMock(return_value={117: [125, 126]}))

    targets, topics, profile_map = await _build_targets(
        session=object(), kind=JOB_KIND_CLASS_DELTA, classe_id=32, topico_ids=[117]
    )

    assert topics == [117]
    assert {t["brainhex_profile_key"] for t in targets} == {"seeker", "conqueror", "socializer"}
    # Um target por (conteudo x perfil presente), todos base sem dono.
    assert len(targets) == 2 * 3
    assert {t["aluno_id"] for t in targets} == {None}
    assert all(t["is_profile_template"] for t in targets)
    assert profile_map == {}


def test_perfis_presentes_saem_na_ordem_canonica_e_sem_chave_desconhecida() -> None:
    alunos = [
        {"aluno_id": "a1", "perfil_dominante": "achiever", "perfil_secundario": "seeker"},
        {"aluno_id": "a2", "perfil_dominante": "nao-existe", "perfil_secundario": None},
    ]
    assert _perfis_presentes_na_turma(alunos) == ["seeker", "achiever"]


@pytest.mark.asyncio
async def test_turma_sem_aluno_gera_zero_targets(monkeypatch) -> None:
    monkeypatch.setattr(_LISTAR, AsyncMock(return_value=[]))
    monkeypatch.setattr(_MAPEAR_TODOS, AsyncMock(return_value={117: [125]}))

    targets, topics, _ = await _build_targets(
        session=object(), kind=JOB_KIND_FULL_SYNC, classe_id=54, topico_ids=[117]
    )

    assert topics == [117]
    assert targets == []


@pytest.mark.asyncio
async def test_enqueue_base_em_turma_vazia_grava_o_motivo(monkeypatch) -> None:
    monkeypatch.setattr(jobs_module, "_build_targets", AsyncMock(return_value=([], [117], {})))
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.list_open_jobs_by_payload",
        AsyncMock(return_value=[]),
    )
    criar = AsyncMock(return_value={"id": "job-vazio"})
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job_com_targets",
        criar,
    )
    monkeypatch.setattr(
        jobs_module,
        "get_job_detail",
        AsyncMock(return_value={"job": {"id": "job-vazio"}, "targets": []}),
    )

    await jobs_module.enqueue_personalizacao_job(
        session=object(),
        kind=JOB_KIND_FULL_SYNC,
        classe_id=54,
        trigger_source="test",
        topico_ids=[117],
    )

    kwargs = criar.await_args.kwargs
    assert kwargs["targets"] == []
    assert kwargs["payload"]["sem_targets_motivo"] == _MOTIVO_TURMA_SEM_ALUNO


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "alunos",
    [
        [{"aluno_id": "a1", "perfil_dominante": "seeker", "perfil_secundario": "survivor"}],
        [],
    ],
)
async def test_pedido_explicito_de_perfil_e_respeitado(monkeypatch, alunos) -> None:
    """O professor pediu `achiever`: gera achiever, tenha a turma esse perfil
    ou nao (e mesmo sem aluno nenhum)."""
    monkeypatch.setattr(_LISTAR, AsyncMock(return_value=alunos))
    monkeypatch.setattr(_MAPEAR_TODOS, AsyncMock(return_value={117: [125]}))

    targets, _, _ = await _build_targets(
        session=object(),
        kind="manual_profile_generate",
        classe_id=32,
        topico_ids=[117],
        brainhex_profile_keys=["achiever"],
    )

    assert [t["brainhex_profile_key"] for t in targets] == ["achiever"]
    assert targets[0]["aluno_id"] is None


# --------------------------------------------------------------------------
# Principal e secundario no repositorio
# --------------------------------------------------------------------------


class _Resultado:
    def __init__(self, linhas):
        self._linhas = linhas

    def mappings(self):
        return self._linhas


class _SessaoComLinhas:
    def __init__(self, linhas):
        self._linhas = linhas
        self.sql: list[str] = []

    async def execute(self, statement, _params=None):
        self.sql.append(str(statement))
        return _Resultado(self._linhas)


@pytest.mark.asyncio
async def test_repositorio_devolve_principal_e_secundario_e_sem_perfil_vira_mastermind() -> None:
    sessao = _SessaoComLinhas(
        [
            {
                "aluno_id": "a1",
                "perfil_nome": "Seeker",
                "afinidade": 40,
                "perfil_secundario_nome": "Socializer",
            },
            # Aluno sem nenhuma linha em aluno_perfil: os dois LEFT JOIN vem nulos.
            {"aluno_id": "a2", "perfil_nome": None, "afinidade": None, "perfil_secundario_nome": None},
        ]
    )

    alunos = await ConteudoClasseRepository(sessao).listar_alunos_classe_com_perfil_dominante(7)

    assert alunos == [
        {"aluno_id": "a1", "perfil_dominante": "seeker", "perfil_secundario": "socializer", "afinidade": 40.0},
        {"aluno_id": "a2", "perfil_dominante": "mastermind", "perfil_secundario": None, "afinidade": 0.0},
    ]
    sql = sessao.sql[0]
    # Secundario e' o 2o da MESMA ordenacao do principal.
    assert "ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC" in sql
    assert "po.rn = 1" in sql
    assert "ps.rn = 2" in sql


@pytest.mark.asyncio
async def test_aluno_sem_aluno_perfil_gera_so_mastermind(monkeypatch) -> None:
    monkeypatch.setattr(
        _LISTAR,
        AsyncMock(
            return_value=[{"aluno_id": "a1", "perfil_dominante": "mastermind", "perfil_secundario": None}]
        ),
    )
    monkeypatch.setattr(_MAPEAR_TODOS, AsyncMock(return_value={117: [125]}))

    targets, _, _ = await _build_targets(
        session=object(), kind=JOB_KIND_FULL_SYNC, classe_id=32, topico_ids=[117]
    )

    assert [t["brainhex_profile_key"] for t in targets] == ["mastermind"]


def test_consulta_de_base_faltando_usa_cast_e_nao_dois_pontos_duplos() -> None:
    fonte = inspect.getsource(ConteudoClasseRepository.mapear_topicos_sem_base_por_perfil)
    assert "CAST(:perfis AS text[])" in fonte
    assert ":perfis::" not in fonte
    # Base existente e geracao ja enfileirada contam como cobertas.
    assert "base.aluno_id IS NULL" in fonte
    assert "j.status IN ('pending', 'processing', 'partial')" in fonte


# --------------------------------------------------------------------------
# Matricula de perfil novo
# --------------------------------------------------------------------------


def _job_matricula(aluno_id: str = "novo") -> dict:
    return {"id": "job-matricula", "kind": JOB_KIND_ENROLLMENT, "classe_id": 32, "aluno_id": aluno_id, "payload": {}}


@pytest.mark.asyncio
async def test_matricula_de_perfil_novo_enfileira_a_base_do_principal_e_do_secundario(monkeypatch) -> None:
    alunos = [
        {"aluno_id": "antigo", "perfil_dominante": "seeker", "perfil_secundario": "conqueror"},
        {"aluno_id": "novo", "perfil_dominante": "achiever", "perfil_secundario": "survivor"},
    ]
    monkeypatch.setattr(_LISTAR, AsyncMock(return_value=alunos))
    faltando = AsyncMock(return_value={"achiever": [118, 117], "survivor": [117, 118]})
    monkeypatch.setattr(_FALTANDO, faltando)
    enfileirar = AsyncMock(return_value={"job": {"id": "job-base"}, "targets": []})
    monkeypatch.setattr(jobs_module, "enqueue_personalizacao_job", enfileirar)

    await _garantir_base_dos_perfis_do_aluno(app=_app(), job=_job_matricula())

    # So os perfis do aluno que entrou -- nao os da turma inteira.
    assert faltando.await_args.kwargs["perfis"] == ["survivor", "achiever"]
    # Os dois faltam nos mesmos topicos: um job so.
    assert enfileirar.await_count == 1
    kwargs = enfileirar.await_args.kwargs
    assert kwargs["kind"] == JOB_KIND_FULL_SYNC
    assert kwargs["classe_id"] == 32
    assert kwargs["topico_ids"] == [117, 118]
    # Pedido explicito: o job nasce so com esses perfis, como base sem dono.
    assert kwargs["brainhex_profile_keys"] == ["achiever", "survivor"]
    assert "aluno_id" not in kwargs


@pytest.mark.asyncio
async def test_job_enfileirado_pela_matricula_gera_base_sem_dono_do_perfil_novo(monkeypatch) -> None:
    """O job que a matricula enfileira vira targets de base (aluno_id NULL) do
    perfil novo -- e' o que os proximos alunos do perfil vao derivar."""
    monkeypatch.setattr(
        _LISTAR,
        AsyncMock(return_value=[{"aluno_id": "novo", "perfil_dominante": "achiever", "perfil_secundario": "survivor"}]),
    )
    monkeypatch.setattr(_MAPEAR_TODOS, AsyncMock(return_value={117: [125]}))

    targets, _, _ = await _build_targets(
        session=object(),
        kind=JOB_KIND_FULL_SYNC,
        classe_id=32,
        topico_ids=[117],
        brainhex_profile_keys=["achiever", "survivor"],
    )

    assert {(t["aluno_id"], t["brainhex_profile_key"]) for t in targets} == {
        (None, "achiever"),
        (None, "survivor"),
    }


@pytest.mark.asyncio
async def test_matricula_de_perfil_que_a_turma_ja_tem_nao_enfileira_nada(monkeypatch) -> None:
    monkeypatch.setattr(
        _LISTAR,
        AsyncMock(return_value=[{"aluno_id": "novo", "perfil_dominante": "seeker", "perfil_secundario": "conqueror"}]),
    )
    monkeypatch.setattr(_FALTANDO, AsyncMock(return_value={}))
    enfileirar = AsyncMock()
    monkeypatch.setattr(jobs_module, "enqueue_personalizacao_job", enfileirar)

    await _garantir_base_dos_perfis_do_aluno(app=_app(), job=_job_matricula())

    enfileirar.assert_not_awaited()


@pytest.mark.asyncio
async def test_garantir_base_so_age_em_job_de_matricula(monkeypatch) -> None:
    listar = AsyncMock()
    monkeypatch.setattr(_LISTAR, listar)

    await _garantir_base_dos_perfis_do_aluno(
        app=_app(), job={"kind": JOB_KIND_CLASS_DELTA, "classe_id": 32, "aluno_id": None}
    )

    listar.assert_not_awaited()


@pytest.mark.asyncio
async def test_falha_ao_garantir_a_base_nao_derruba_a_matricula(monkeypatch) -> None:
    monkeypatch.setattr(_LISTAR, AsyncMock(side_effect=RuntimeError("banco fora")))

    # Nao levanta.
    await _garantir_base_dos_perfis_do_aluno(app=_app(), job=_job_matricula())


# --------------------------------------------------------------------------
# Worker: class-delta do banco ainda chega com os 7
# --------------------------------------------------------------------------

_PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")


def _targets_dos_7() -> list[dict]:
    return [
        {
            "id": indice,
            "aluno_id": None,
            "topico_id": 117,
            "conteudo_id": 125,
            "brainhex_profile_key": perfil,
            "status": "pending",
            "attempts": 0,
            "media_kind": None,
        }
        for indice, perfil in enumerate(_PERFIS, start=1)
    ]


@pytest.mark.asyncio
async def test_worker_pula_base_de_perfil_que_a_turma_nao_tem(monkeypatch) -> None:
    monkeypatch.setattr(
        _LISTAR,
        AsyncMock(return_value=[{"aluno_id": "a1", "perfil_dominante": "seeker", "perfil_secundario": "achiever"}]),
    )
    atualizar = AsyncMock()
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_target_status",
        atualizar,
    )
    job = {"id": "job-delta", "kind": JOB_KIND_CLASS_DELTA, "classe_id": 32, "payload": {}}

    resultado = await _pular_base_de_perfil_ausente(app=_app(), job=job, targets=_targets_dos_7())

    pulados = {call.kwargs["target_id"] for call in atualizar.await_args_list}
    assert pulados == {2, 3, 4, 5, 6}
    assert {call.kwargs["status"] for call in atualizar.await_args_list} == {"skipped"}
    assert {call.kwargs["last_error"] for call in atualizar.await_args_list} == {_MOTIVO_PERFIL_SEM_ALUNO}
    por_perfil = {t["brainhex_profile_key"]: t["status"] for t in resultado}
    assert por_perfil["seeker"] == "pending"
    assert por_perfil["achiever"] == "pending"
    assert por_perfil["daredevil"] == "skipped"


@pytest.mark.asyncio
async def test_worker_turma_vazia_pula_toda_a_base(monkeypatch) -> None:
    monkeypatch.setattr(_LISTAR, AsyncMock(return_value=[]))
    atualizar = AsyncMock()
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_target_status",
        atualizar,
    )
    job = {"id": "job-delta", "kind": JOB_KIND_CLASS_DELTA, "classe_id": 32, "payload": {}}

    resultado = await _pular_base_de_perfil_ausente(app=_app(), job=job, targets=_targets_dos_7())

    assert atualizar.await_count == 7
    assert {t["status"] for t in resultado} == {"skipped"}


@pytest.mark.asyncio
async def test_worker_nao_filtra_pedido_explicito(monkeypatch) -> None:
    listar = AsyncMock(return_value=[])
    monkeypatch.setattr(_LISTAR, listar)
    atualizar = AsyncMock()
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.update_target_status",
        atualizar,
    )
    job = {
        "id": "job-manual",
        "kind": "manual_profile_generate",
        "classe_id": 32,
        "payload": {"brainhex_profile_keys": ["daredevil"]},
    }
    targets = [t for t in _targets_dos_7() if t["brainhex_profile_key"] == "daredevil"]

    resultado = await _pular_base_de_perfil_ausente(app=_app(), job=job, targets=targets)

    assert resultado == targets
    listar.assert_not_awaited()
    atualizar.assert_not_awaited()


@pytest.mark.asyncio
async def test_worker_falha_ao_ler_turma_nao_pula_nada(monkeypatch) -> None:
    monkeypatch.setattr(_LISTAR, AsyncMock(side_effect=RuntimeError("banco fora")))
    job = {"id": "job-delta", "kind": JOB_KIND_CLASS_DELTA, "classe_id": 32, "payload": {}}
    targets = _targets_dos_7()

    resultado = await _pular_base_de_perfil_ausente(app=_app(), job=job, targets=targets)

    assert resultado == targets


@pytest.mark.asyncio
async def test_falas_do_boss_nao_saem_para_perfil_sem_aluno(monkeypatch) -> None:
    chamadas: list[tuple[int, str]] = []

    async def _gerar(*, session, settings, topico_id, perfil):
        chamadas.append((topico_id, perfil))
        return boss_falas.ResultadoFalas(status="gerado")

    monkeypatch.setattr(jobs_module, "gerar_falas_do_topico", _gerar)
    targets = [
        {"topico_id": 1, "conteudo_id": 10, "brainhex_profile_key": "survivor", "aluno_id": None,
         "status": "skipped", "last_error": _MOTIVO_PERFIL_SEM_ALUNO},
        {"topico_id": 1, "conteudo_id": 10, "brainhex_profile_key": "daredevil", "aluno_id": None,
         "status": "pending", "last_error": None},
        # Base ja pronta continua podendo receber fala.
        {"topico_id": 1, "conteudo_id": 10, "brainhex_profile_key": "conqueror", "aluno_id": None,
         "status": "skipped", "last_error": None},
    ]

    await jobs_module._gerar_falas_boss_do_job(
        app=_app(), job={"kind": JOB_KIND_CLASS_DELTA}, targets=targets
    )

    assert sorted(chamadas) == [(1, "conqueror"), (1, "daredevil")]


def _alvo_de_matricula() -> tuple[dict, dict]:
    aluno = "11111111-1111-1111-1111-111111111111"
    job = {
        "id": "job-matricula",
        "kind": JOB_KIND_ENROLLMENT,
        "classe_id": 54,
        "aluno_id": aluno,
        "payload": {},
        "media_snapshot": {},
    }
    target = {
        "id": 1,
        "aluno_id": aluno,
        "topico_id": 131,
        "conteudo_id": 192,
        "brainhex_profile_key": "achiever",
        "is_profile_template": False,
        "status": "pending",
        "attempts": 0,
        "personalizacao_id": None,
    }
    return job, target


@pytest.mark.asyncio
async def test_primeiro_aluno_de_perfil_novo_espera_a_base_enfileirada_em_vez_de_gerar_a_sua(monkeypatch) -> None:
    """Sem isto o primeiro aluno de um perfil novo custava DUAS geracoes: a
    linha so dele e a base que a matricula enfileirou em paralelo."""
    jobs = jobs_module

    job, target = _alvo_de_matricula()
    monkeypatch.setattr(jobs, "derivar_personalizacao_do_base", AsyncMock(return_value=None))
    na_fila = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs, "_base_do_perfil_na_fila", na_fila)
    contrato = AsyncMock(return_value=True)
    monkeypatch.setattr(jobs, "brainhex_contract_ready", contrato)

    resultado = await jobs._process_media_render_target(app=object(), session=object(), job=job, target=target)

    assert resultado == {"deferred": True, "reason": jobs._MOTIVO_ESPERA_BASE_DO_PERFIL}
    assert na_fila.await_args.kwargs["brainhex_profile_key"] == "achiever"
    assert na_fila.await_args.kwargs["conteudo_id"] == 192
    contrato.assert_not_awaited()  # nao chegou perto da geracao


@pytest.mark.asyncio
async def test_sem_base_e_sem_fila_a_matricula_segue_para_a_geracao_normal(monkeypatch) -> None:
    """A espera tem fim: base que falhou nao deixa target aberto, e o aluno nao
    fica preso -- cai na geracao normal."""
    jobs = jobs_module

    job, target = _alvo_de_matricula()
    monkeypatch.setattr(jobs, "derivar_personalizacao_do_base", AsyncMock(return_value=None))
    monkeypatch.setattr(jobs, "_base_do_perfil_na_fila", AsyncMock(return_value=False))
    monkeypatch.setattr(jobs, "brainhex_contract_ready", AsyncMock(return_value=False))

    app = SimpleNamespace(state=SimpleNamespace(settings=object()))
    resultado = await jobs._process_media_render_target(app=app, session=object(), job=job, target=target)

    assert resultado == {"deferred": True, "reason": jobs._MICROSERVICE_CONTRACT_DEFERRED_REASON}


def test_base_na_fila_usa_o_mesmo_criterio_da_matricula() -> None:
    jobs = jobs_module

    fonte = inspect.getsource(jobs._base_do_perfil_na_fila)
    for trecho in (
        "j.status IN ('pending', 'processing', 'partial')",
        "tg.aluno_id IS NULL",
        "tg.media_kind IS NULL",
        "tg.status IN ('pending', 'processing')",
        "CAST(:conteudo_id AS BIGINT)",
    ):
        assert trecho in fonte

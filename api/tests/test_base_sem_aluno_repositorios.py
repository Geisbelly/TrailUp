"""Guardas para a base por perfil (aluno_id NULL) nos repositorios.

Sao testes de inspecao de fonte porque o SQL mora em string dentro do metodo e
as falhas que eles pegam sao SILENCIOSAS: `= NULL` nunca casa, entao a consulta
volta vazia e o codigo segue como se nao houvesse nada -- em vez de estourar.
"""

import inspect

import pytest

from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.materiais import MateriaisRepository
from app.services import personalizacao as personalizacao_service


def test_on_conflict_repete_o_predicado_do_indice_por_aluno():
    """A 20260827_04 acrescentou `aluno_id IS NOT NULL` ao predicado dos indices
    por aluno. ON CONFLICT so casa indice parcial quando o predicado informado
    IMPLICA o do indice: sem repetir, o Postgres levanta "no unique or exclusion
    constraint matching" em TODO save -- nao so na base."""
    fonte = inspect.getsource(ConteudoPersonalizadoRepository)

    assert (
        "WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL"
        in fonte
    )
    assert (
        "WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL AND conteudo_id IS NULL"
        in fonte
    )
    # Nenhuma clausula pode ter sobrado com o predicado antigo.
    assert "WHERE topico_id IS NOT NULL AND conteudo_id IS NOT NULL\n" not in fonte


def test_on_conflict_da_base_e_chaveado_em_classe():
    fonte = inspect.getsource(ConteudoPersonalizadoRepository)

    assert "ON CONFLICT (classe_id, topico_id, conteudo_id, brainhex_profile_key)" in fonte
    assert "ON CONFLICT (classe_id, topico_id, brainhex_profile_key)" in fonte
    assert (
        "WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL"
        in fonte
    )


def test_salvar_e_claim_aceitam_base_sem_dono():
    assert (
        inspect.signature(ConteudoPersonalizadoRepository.salvar)
        .parameters["aluno_id"]
        .annotation
        == "str | None"
    )
    assert (
        inspect.signature(ConteudoPersonalizadoRepository.claim_new_generation)
        .parameters["aluno_id"]
        .annotation
        == "str | None"
    )


def test_cards_ativos_casa_base_sem_aluno():
    """Com `= NULL` a busca volta vazia e os cards sao regerados a cada
    tentativa -- o que muda o source_hash e orfaniza a geracao anterior."""
    fonte = inspect.getsource(ArtefatosPersonalizadosRepository)

    assert "aluno_id IS NOT DISTINCT FROM CAST(:aluno_id AS UUID)" in fonte
    assert "WHERE aluno_id = CAST(:aluno_id AS UUID)" not in fonte


def test_materiais_orfaos_casam_base_sem_aluno():
    fonte = inspect.getsource(MateriaisRepository)

    assert "aluno_id IS NOT DISTINCT FROM CAST(:aluno_id AS UUID)" in fonte
    assert "WHERE aluno_id = CAST(:aluno_id AS UUID)" not in fonte


@pytest.mark.asyncio
async def test_derivar_do_base_copia_materiais_sem_regerar() -> None:
    """Enrollment nao deve regerar midia: a base ja tem o material do perfil.
    30 alunos do mesmo perfil viram 30 derivacoes de UMA geracao."""
    from app.services.personalizacao_jobs import derivar_personalizacao_do_base

    executed: list[str] = []

    class FakeResult:
        def scalar(self):
            return 4242

    class FakeSession:
        async def execute(self, sql, params=None):
            executed.append(str(sql))
            return FakeResult()

    novo_id = await derivar_personalizacao_do_base(
        session=FakeSession(),
        aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        classe_id=32,
        topico_id=117,
        conteudo_id=125,
        brainhex_profile_key="seeker",
    )

    assert novo_id == 4242
    sql = "\n".join(executed)
    assert "INSERT INTO conteudo_personalizado" in sql
    assert "FROM conteudo_personalizado base" in sql
    assert "base.aluno_id IS NULL" in sql
    # A derivacao copia; nao pode inventar geracao nova.
    assert "base.materiais" in sql
    assert "base.source_hash" in sql


def test_enrollment_deriva_antes_de_gerar() -> None:
    """O ramo tem que devolver {"record": ...}: o chamador so marca o target
    como completed quando record["status"] == "pronto"."""
    import inspect

    from app.services import personalizacao_jobs

    fonte = inspect.getsource(personalizacao_jobs._process_media_render_target)
    assert "derivar_personalizacao_do_base" in fonte
    assert "JOB_KIND_ENROLLMENT" in fonte


def test_contexto_da_base_nao_busca_aluno() -> None:
    """A base e (classe x topico x perfil) montada do conteudo do professor.
    Buscar aluno ali trazia modo_operacao, eventos, progresso e desempenho --
    nada disso se aplica -- e estourava com aluno_id nulo:
    `invalid input for query argument $1: 'None' (invalid UUID)` e
    `Aluno None nao encontrado.`

    O resultado de fetch_aluno_context so alimentava perfil_brainhex/
    perfil_dominante (que o worker sobrescreve com o perfil do target) e
    contexto_aluno. Para a base, os dois sao descartaveis."""
    fonte = inspect.getsource(personalizacao_service.fetch_personalizacao_context)

    assert "if aluno_id is None:" in fonte
    # A CHAMADA (nao a mencao em comentario) tem que estar no ramo do else.
    assert "else:\n        context = await context_repo.fetch_aluno_context(" in fonte
    # E nunca incondicional, na margem da funcao.
    assert "\n    context = await context_repo.fetch_aluno_context(" not in fonte


def test_fetch_personalizacao_context_aceita_base_sem_dono() -> None:
    assert (
        inspect.signature(personalizacao_service.fetch_personalizacao_context)
        .parameters["aluno_id"]
        .annotation
        == "str | None"
    )

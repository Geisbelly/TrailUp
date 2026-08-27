"""Guardas para a base por perfil (aluno_id NULL) nos repositorios.

Sao testes de inspecao de fonte porque o SQL mora em string dentro do metodo e
as falhas que eles pegam sao SILENCIOSAS: `= NULL` nunca casa, entao a consulta
volta vazia e o codigo segue como se nao houvesse nada -- em vez de estourar.
"""

import inspect

from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.materiais import MateriaisRepository


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

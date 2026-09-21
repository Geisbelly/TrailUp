"""A base por perfil nao tem dono, e `str(None)` transformava isso em texto.

Reproducao do que parou a geracao do personalizado em producao. Medido em
`personalizacao_job_targets`, 268 alvos com a MESMA falha, a ultima em
2026-09-13:

    asyncpg.exceptions.DataError: invalid input for query argument $1:
    'None' (invalid UUID 'None': length must be between 32..36 characters)
    [SQL: SELECT a.id, a.nome, ... FROM alunos a WHERE a.id = $1]
    [parameters: ('None',)]

O detalhe que faz este teste existir: a guarda `if aluno_id is None` JA existia
em `fetch_personalizacao_context` desde `e4d50ae` (10/09), e as falhas sao de
13/09 -- DEPOIS dela. Guarda por identidade nao pega texto: `'None'` tem quatro
caracteres e nao e nulo, entao ela passava batido e o estouro acontecia na
borda do asyncpg, longe de quem cometeu o erro.

Por isso aqui se testa COMPORTAMENTO (a busca de aluno nao acontece), e nao a
forma do fonte: um `grep` por `is None` continuaria verde com o defeito vivo.
"""

from __future__ import annotations

import inspect

import pytest

from app.core.identidade import dono_de, identificador_de_dono
from app.services import personalizacao as personalizacao_service
from app.services import personalizacao_jobs

# --------------------------------------------------------------------------
# O conversor
# --------------------------------------------------------------------------

def test_ausencia_em_qualquer_grafia_vira_none():
    assert identificador_de_dono(None) is None
    # `str(None)`, que e exatamente o que producao produziu.
    assert identificador_de_dono("None") is None
    assert identificador_de_dono("none") is None
    # JSON e JS chegam com as proprias grafias de ausencia.
    assert identificador_de_dono("null") is None
    assert identificador_de_dono("undefined") is None
    assert identificador_de_dono("") is None
    assert identificador_de_dono("   ") is None


def test_dono_de_verdade_atravessa_intacto():
    uuid = "6ee781ea-2a93-4e19-b3ef-0d5fe0092915"
    assert identificador_de_dono(uuid) == uuid
    assert identificador_de_dono(f"  {uuid}  ") == uuid
    assert dono_de({"aluno_id": uuid}) == uuid


def test_dono_de_aceita_linha_sem_dono_e_linha_ausente():
    assert dono_de({"aluno_id": None}) is None
    assert dono_de({}) is None
    assert dono_de(None) is None


# --------------------------------------------------------------------------
# A fronteira: com 'None' a busca de aluno nao pode acontecer
# --------------------------------------------------------------------------

class _ChegouNaFonte(Exception):
    """Marca o ponto logo DEPOIS da guarda, para parar o teste ali."""


class _ContextoEspiao:
    chamadas: list[str] = []

    def __init__(self, session):  # noqa: D107 - dublê
        pass

    async def fetch_aluno_context(self, *, aluno_id, classe_id):
        _ContextoEspiao.chamadas.append(str(aluno_id))
        # Em producao esta chamada chegava ao asyncpg com 'None' e estourava.
        raise AssertionError(
            f"buscou aluno com aluno_id={aluno_id!r} -- a base nao tem dono"
        )


class _FontesDubles:
    def __init__(self, session):  # noqa: D107 - dublê
        pass

    async def seed_from_class_content(self, **kwargs):
        raise _ChegouNaFonte()


class _ClasseDubles:
    def __init__(self, session):  # noqa: D107 - dublê
        pass


@pytest.fixture
def _dubles(monkeypatch):
    _ContextoEspiao.chamadas = []
    monkeypatch.setattr(personalizacao_service, "ContextRepository", _ContextoEspiao)
    monkeypatch.setattr(personalizacao_service, "FontesPersonalizacaoRepository", _FontesDubles)
    monkeypatch.setattr(personalizacao_service, "ConteudoClasseRepository", _ClasseDubles)
    return _ContextoEspiao


@pytest.mark.asyncio
@pytest.mark.parametrize("sem_dono", [None, "None", "null", ""])
async def test_base_sem_dono_nunca_busca_aluno(_dubles, sem_dono):
    """O caso que quebrou: `'None'` precisa ser tratado como ausencia."""
    with pytest.raises(_ChegouNaFonte):
        await personalizacao_service.fetch_personalizacao_context(
            aluno_id=sem_dono,
            classe_id=54,
            topico_id=134,
            conteudo_id=194,
            settings=object(),
            session=object(),
        )

    assert _dubles.chamadas == [], (
        f"aluno_id={sem_dono!r} chegou a buscar aluno: {_dubles.chamadas}"
    )


@pytest.mark.asyncio
async def test_com_dono_de_verdade_a_busca_acontece(_dubles):
    """Controle negativo: sem ele, uma guarda que barra TUDO passaria no teste
    acima e teria silenciado o contexto do aluno de verdade."""
    uuid = "6ee781ea-2a93-4e19-b3ef-0d5fe0092915"
    with pytest.raises(AssertionError, match="a base nao tem dono"):
        await personalizacao_service.fetch_personalizacao_context(
            aluno_id=uuid,
            classe_id=54,
            topico_id=134,
            conteudo_id=194,
            settings=object(),
            session=object(),
        )

    assert _dubles.chamadas == [uuid]


# --------------------------------------------------------------------------
# A classe do defeito
# --------------------------------------------------------------------------
# A varredura de fonte (ninguem volta a escrever `str(linha["aluno_id"])`) mora
# em `test_target_sem_dono.py`, que ja era o dono dela. Duas copias da mesma
# regra divergem -- foi o que aconteceu com a propria guarda que este arquivo
# testa: tres arquivos a afirmavam, em tres versoes diferentes.


def test_seed_progress_recusa_base_com_frase_em_vez_de_erro_de_uuid():
    """Progresso e' comportamento e exige dono. Sem a precondicao, a base
    chegava ate o asyncpg e o erro saia como 'invalid UUID' -- sem dizer qual
    regra foi violada nem onde."""
    fonte = inspect.getsource(personalizacao_jobs._seed_progress)
    assert "dono = dono_de(record)" in fonte
    assert "raise ValueError(" in fonte
    assert "aluno_id=dono," in fonte

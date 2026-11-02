"""`20261102_07` medida no Postgres local (esqueleto da produção, mesmo banco do e2e da trava).

- RLS, lida como `authenticated` com as claims de quem chama, como o PostgREST faria:
  - o aluno lê só a própria sugestão;
  - o professor dono lê a sugestão, o log e a demanda da turma;
  - a turma retida pelo estudo não vê a sugestão;
  - ninguém escreve pelo cliente.
- Gatilhos:
  - a atividade concluída pelo aluno marca a sugestão dele no tópico, e só a dele;
  - a análise nova do conteúdo marca as sugestões do tópico;
  - a falha do gatilho não desfaz a escrita que o disparou.
- O SQL que a API roda (`SugestaoMaterialRepository`, `demanda_formato`) contra o banco migrado.
"""

from __future__ import annotations

import json
from datetime import timedelta

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as coorte
from tests import test_e2e_trava_personalizacao as trava

M_07 = f5.modulo("20261102_07_recomendacao_conteudo_x_aluno.py")

pytestmark = f5.e2e

DEMANDA_VISUAL = {
    "visual": {"nivel": "essencial", "motivo": "diagrama"},
    "escrito": {"nivel": "indiferente", "motivo": ""},
    "sonoro": {"nivel": "indiferente", "motivo": ""},
    "pratica": {"nivel": "ajuda", "motivo": "prática"},
}


def _banco():
    return trava._banco(*f5.sql_de(M_07))


def _semear(c) -> None:
    coorte._semear(c)
    for tabela in ("conteudos", "atividade_aluno", "fontes_personalizacao"):
        f5.afrouxa(c, tabela)
    c.execute(
        "INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo) VALUES"
        " (100, 10, 'C1', 'texto', 'Texto'), (101, 10, 'C2', 'arquivo', NULL), (200, 20, 'C3', 'texto', 'x')"
    )
    # As atividades 500 (tópico 10) e 501 (tópico 11) vêm de `coorte._semear`.
    # Sugestão do tópico inteiro para A e B no tópico 10, e para A no 11.
    for aluno, topico in ((f5.A, 10), (f5.B, 10), (f5.A, 11)):
        c.execute(
            "INSERT INTO public.personalizacao_sugestao (aluno_id, classe_id, topico_id, formato_inicial, ordem)"
            " VALUES (%s, %s, %s, 'markdown', '[]')",
            (aluno, f5.TURMA, topico),
        )
    c.execute(
        "INSERT INTO public.personalizacao_sugestao_log (aluno_id, classe_id, topico_id, versao, acao)"
        " VALUES (%s, %s, 10, 1, 'criada')",
        (f5.A, f5.TURMA),
    )


def _pendentes(c) -> set[tuple[str, int, str]]:
    return {
        (str(aluno), topico, motivo)
        for aluno, topico, motivo in c.execute(
            "SELECT aluno_id, topico_id, revisao_motivo FROM public.personalizacao_sugestao WHERE revisao_pendente"
        ).fetchall()
    }


def _limpar(c) -> None:
    c.execute(
        "UPDATE public.personalizacao_sugestao SET revisao_pendente = false, revisao_motivo = NULL, revisao_pendente_em = NULL"
    )


def _como_aluno(c, quem, sql: str, params=()) -> None:
    """Escrita como `authenticated`: o gatilho roda com os privilégios do dono, não do aluno."""
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        c.execute(sql, params)
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise
    finally:
        f5.como(c, None)


# ------------------------------------------------------------------------------------------ RLS


def test_aluno_le_so_a_propria_sugestao_e_o_professor_a_da_turma() -> None:
    with _banco() as c:
        _semear(c)
        contar = "SELECT count(*) FROM public.personalizacao_sugestao"
        assert coorte._como(c, f5.A, contar)[0][0] == 2
        assert coorte._como(c, f5.B, contar)[0][0] == 1
        assert coorte._como(c, f5.PROF, contar)[0][0] == 3
        assert coorte._como(c, coorte.OUTRO_PROF, contar)[0][0] == 0
        # O log é do professor.
        log = "SELECT count(*) FROM public.personalizacao_sugestao_log"
        assert coorte._como(c, f5.A, log)[0][0] == 0
        assert coorte._como(c, f5.PROF, log)[0][0] == 1


def test_turma_retida_nao_ve_a_sugestao_e_o_professor_ve() -> None:
    with _banco() as c:
        _semear(c)
        hoje = trava._hoje(c)
        trava._coorte(c, f5.TURMA, "intervencao", hoje + timedelta(days=10), None)
        contar = "SELECT count(*) FROM public.personalizacao_sugestao"
        assert coorte._como(c, f5.A, contar)[0][0] == 0
        assert coorte._como(c, f5.PROF, contar)[0][0] == 3


def test_cliente_nao_escreve_na_sugestao_nem_na_demanda() -> None:
    with _banco() as c:
        _semear(c)
        for sql in (
            "UPDATE public.personalizacao_sugestao SET formato_inicial = 'audio'",
            f"INSERT INTO public.personalizacao_sugestao (aluno_id, topico_id) VALUES ('{f5.A}', 12)",
            "INSERT INTO public.conteudo_demanda_formato (classe_id, topico_id, conteudo_id, demanda, origem,"
            " source_hash, versao) VALUES (1, 10, 100, '{}', 'professor', 'h', 'v')",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _como_aluno(c, f5.A, sql)


def test_demanda_e_lida_pelo_professor_dono_e_nao_pelo_aluno() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.conteudo_demanda_formato (classe_id, topico_id, conteudo_id, demanda, origem,"
            " source_hash, versao) VALUES (%s, 10, 100, %s, 'modelo', 'h', 'v')",
            (f5.TURMA, json.dumps(DEMANDA_VISUAL)),
        )
        contar = "SELECT count(*) FROM public.conteudo_demanda_formato"
        assert coorte._como(c, f5.PROF, contar)[0][0] == 1
        assert coorte._como(c, coorte.OUTRO_PROF, contar)[0][0] == 0
        assert coorte._como(c, f5.A, contar)[0][0] == 0


# ------------------------------------------------------------------------------------------ gatilhos


def test_atividade_concluida_pelo_aluno_marca_so_a_sugestao_dele_no_topico() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status) VALUES (%s, 500, 'em andamento')",
            (f5.A,),
        )
        # Em andamento não marca.
        assert _pendentes(c) == set()

        # O aluno escreve como `authenticated`; o gatilho grava na sugestão como dono.
        _como_aluno(
            c, f5.A,
            "UPDATE public.atividade_aluno SET status = 'concluido', acertos_percentual = 40"
            " WHERE aluno_id = %s AND atividade_id = 500",
            (f5.A,),
        )
        assert _pendentes(c) == {(str(f5.A), 10, "atividade_concluida")}

        # Já concluída, mexer em outra coluna não marca de novo.
        _limpar(c)
        c.execute("UPDATE public.atividade_aluno SET tempo_gasto_min = 3 WHERE atividade_id = 500")
        c.execute("UPDATE public.atividade_aluno SET status = 'concluido' WHERE atividade_id = 500")
        assert _pendentes(c) == set()

        # Nota corrigida (revisão do professor, gabarito) marca.
        c.execute("UPDATE public.atividade_aluno SET acertos_percentual = 80 WHERE atividade_id = 500")
        assert _pendentes(c) == {(str(f5.A), 10, "atividade_concluida")}


def test_insert_ja_concluido_marca_e_a_sugestao_registra_a_hora() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status, acertos_percentual)"
            " VALUES (%s, 501, 'concluido', 100)",
            (f5.A,),
        )
        assert _pendentes(c) == {(str(f5.A), 11, "atividade_concluida")}
        assert c.execute(
            "SELECT revisao_pendente_em IS NOT NULL FROM public.personalizacao_sugestao WHERE topico_id = 11"
        ).fetchone()[0]


def test_falha_do_gatilho_nao_desfaz_a_conclusao() -> None:
    with _banco() as c:
        _semear(c)
        # Força o UPDATE da sugestão a falhar.
        c.execute(
            "ALTER TABLE public.personalizacao_sugestao ADD CONSTRAINT e2e_quebra CHECK (NOT revisao_pendente) NOT VALID"
        )
        c.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status, acertos_percentual)"
            " VALUES (%s, 500, 'concluido', 50)",
            (f5.A,),
        )
        assert c.execute("SELECT status::text FROM public.atividade_aluno WHERE atividade_id = 500").fetchone() == (
            "concluido",
        )
        assert _pendentes(c) == set()


def test_analise_nova_do_conteudo_marca_as_sugestoes_do_topico() -> None:
    with _banco() as c:
        _semear(c)
        inserir = (
            "INSERT INTO public.conteudo_demanda_formato (classe_id, topico_id, conteudo_id, demanda, origem,"
            " source_hash, versao) VALUES (%s, 10, 100, %s, 'heuristica', 'h', 'v')"
            " ON CONFLICT (conteudo_id) DO UPDATE SET demanda = EXCLUDED.demanda, origem = EXCLUDED.origem"
        )
        c.execute(inserir, (f5.TURMA, json.dumps(DEMANDA_VISUAL)))
        assert _pendentes(c) == {(str(f5.A), 10, "demanda_do_conteudo"), (str(f5.B), 10, "demanda_do_conteudo")}

        # A mesma análise de novo (o modelo confirmou a regra fixa) não marca.
        _limpar(c)
        c.execute(inserir, (f5.TURMA, json.dumps(DEMANDA_VISUAL)))
        assert _pendentes(c) == set()


# ------------------------------------------------------------------------------------------ SQL da API


@pytest.fixture
async def sessoes():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    with _banco() as c:
        _semear(c)
        url = "postgresql+asyncpg://" + f5._dsn_para(c.info.dbname).split("://", 1)[1]
        engine = create_async_engine(url)
        try:
            yield c, async_sessionmaker(engine, expire_on_commit=False)
        finally:
            await engine.dispose()


@pytest.mark.asyncio
async def test_repositorio_le_a_marca_lista_e_so_limpa_a_que_atendeu(sessoes) -> None:
    from app.repositories.sugestao_material import SugestaoMaterialRepository

    c, fabrica = sessoes
    c.execute(
        "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status, acertos_percentual)"
        " VALUES (%s, 500, 'concluido', 30), (%s, 501, 'concluido', 90)",
        (f5.A, f5.A),
    )
    async with fabrica() as s:
        repo = SugestaoMaterialRepository(s)
        assert await repo.topicos_com_revisao_pendente(aluno_id=str(f5.A), classe_id=f5.TURMA) == [10, 11]
        assert await repo.topicos_com_revisao_pendente(aluno_id=str(f5.A), classe_id=coorte.TURMA2) == []
        lida = await repo.buscar(aluno_id=str(f5.A), topico_id=10)
        assert lida["revisao_pendente"] is True and lida["revisao_motivo"] == "atividade_concluida"
        assert await repo.desempenho_no_topico(aluno_id=str(f5.A), topico_id=10) == {"media_acertos": 30.0, "itens": 1}
        await s.commit()

    # Outra conclusão depois da leitura: a marca muda de hora e não pode ser engolida.
    c.execute("UPDATE public.atividade_aluno SET acertos_percentual = 35 WHERE atividade_id = 500")
    async with fabrica() as s:
        repo = SugestaoMaterialRepository(s)
        await repo.limpar_revisao_pendente(sugestao_id=lida["id"], marcada_em=lida["revisao_pendente_em"])
        await s.commit()
    assert (str(f5.A), 10, "atividade_concluida") in _pendentes(c)

    async with fabrica() as s:
        repo = SugestaoMaterialRepository(s)
        relida = await repo.buscar(aluno_id=str(f5.A), topico_id=10)
        await repo.limpar_revisao_pendente(sugestao_id=relida["id"], marcada_em=relida["revisao_pendente_em"])
        await s.commit()
    assert (str(f5.A), 10, "atividade_concluida") not in _pendentes(c)


@pytest.mark.asyncio
async def test_demanda_le_fontes_grava_e_respeita_o_professor(sessoes) -> None:
    from app.services import demanda_formato

    c, fabrica = sessoes
    c.execute(
        "INSERT INTO public.fontes_personalizacao (classe_id, topico_id, conteudo_id, visibilidade, tipo, descricao, origem)"
        " VALUES (%s, 10, 101, 'classe', 'arquivo', 'Texto do PDF', 'sync_conteudo'),"
        "        (%s, 10, 101, 'aluno', 'arquivo', 'Anotação do aluno', 'upload'),"
        "        (%s, 10, 101, 'classe', 'link', 'https://exemplo.invalid/x', 'sync_conteudo')",
        (f5.TURMA, f5.TURMA, f5.TURMA),
    )
    async with fabrica() as s:
        assert await demanda_formato._textos_das_fontes(s, [100, 101]) == {101: ["Texto do PDF"]}
        assert await demanda_formato.ler_do_topico(s, 10) is None
        for conteudo_id, origem in ((100, "professor"), (101, "heuristica")):
            await demanda_formato._gravar(
                s, classe_id=f5.TURMA, topico_id=10, conteudo_id=conteudo_id,
                demanda=DEMANDA_VISUAL, origem=origem, source_hash="h1",
            )
        await s.commit()
        # O worker regrava os dois; a linha do professor fica como estava.
        for conteudo_id in (100, 101):
            await demanda_formato._gravar(
                s, classe_id=f5.TURMA, topico_id=10, conteudo_id=conteudo_id,
                demanda={**DEMANDA_VISUAL, "visual": {"nivel": "ajuda", "motivo": "m"}}, origem="modelo",
                source_hash="h2",
            )
        await s.commit()
        gravadas = await demanda_formato._gravadas(s, topico_id=10)
        assert gravadas == {
            100: {"origem": "professor", "source_hash": "h1"},
            101: {"origem": "modelo", "source_hash": "h2"},
        }
        agregado = await demanda_formato.ler_do_topico(s, 10)
        assert agregado["origem"] == "misto"
        assert agregado["dimensoes"]["visual"] == {"nivel": "essencial", "motivo": "diagrama", "conteudos": [100]}


def test_downgrade_tira_tudo() -> None:
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M_07, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regclass('public.conteudo_demanda_formato')").fetchone()[0] is None
        assert c.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_atividade_aluno_sugestao_revisar'"
        ).fetchone()[0] == 0
        assert c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'personalizacao_sugestao'"
            " AND column_name LIKE 'revisao%'"
        ).fetchone()[0] == 0
        assert c.execute(
            "SELECT count(*) FROM pg_policies WHERE tablename = 'personalizacao_sugestao'"
        ).fetchone()[0] == 0

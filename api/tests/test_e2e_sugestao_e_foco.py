"""SQL da #66 que a API roda, medido no Postgres local (esqueleto da produção).

- `SugestaoMaterialRepository.criar`: duas criações concorrentes, uma linha e um ``criada``;
- `SugestaoMaterialRepository.desempenho_no_topico`: só atividade concluída, enum com acento;
- `ContextRepository.fetch_foco_de_estudo`: tópico do ciclo ou o em andamento, e o próximo
  conteúdo não concluído.
"""

from __future__ import annotations

import asyncio

import pytest

from tests import _f5_banco as f5

pytestmark = [f5.e2e, pytest.mark.asyncio]

INDICE = """
CREATE UNIQUE INDEX personalizacao_sugestao_alvo_uidx
  ON personalizacao_sugestao (aluno_id, topico_id, COALESCE(conteudo_id, -1));
"""


@pytest.fixture
def banco():
    with f5.banco(INDICE) as c:
        f5.semear_turma(c)
        for t in ("atividades", "atividade_aluno", "conteudos", "conteudo_aluno", "topico_aluno"):
            f5.afrouxa(c, t)
        yield c


@pytest.fixture
async def sessoes(banco):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    url = "postgresql+asyncpg://" + f5._dsn_para(banco.info.dbname).split("://", 1)[1]
    engine = create_async_engine(url)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def test_criacao_concorrente_grava_uma_linha_e_um_criada(banco, sessoes):
    from app.repositories.sugestao_material import SugestaoMaterialRepository
    from app.services.sugestao_ciclo import garantir_sugestao

    async def uma():
        async with sessoes() as s:
            r = await garantir_sugestao(
                SugestaoMaterialRepository(s),
                aluno_id=str(f5.A),
                topico_id=10,
                classe_id=f5.TURMA,
                perfis=[{"perfil": "socializer", "afinidade": 100}],
                formatos_disponiveis=["markdown", "audio"],
            )
            await s.commit()
            return r

    resultados = await asyncio.gather(*(uma() for _ in range(4)))

    linhas = banco.execute("SELECT versao, origem FROM personalizacao_sugestao").fetchall()
    log = banco.execute("SELECT acao, evidencia->>'catalogo_versao' FROM personalizacao_sugestao_log").fetchall()
    assert linhas == [(1, "inicial")]
    assert [acao for acao, _ in log] == ["criada"]
    assert log[0][1]
    assert all(r and r["formato_inicial"] == "audio" for r in resultados)


async def test_desempenho_no_topico_so_conta_atividade_concluida(banco, sessoes):
    from app.repositories.sugestao_material import SugestaoMaterialRepository

    banco.execute(
        f"""
INSERT INTO atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES
  (1, 10, 'a'), (2, 10, 'b'), (3, 10, 'c'), (4, 11, 'd');
INSERT INTO atividade_aluno (aluno_id, atividade_id, status, acertos_percentual) VALUES
  ('{f5.A}', 1, 'concluido', 30), ('{f5.A}', 2, 'concluido', 50),
  ('{f5.A}', 3, 'em andamento', 0), ('{f5.A}', 4, 'concluido', 100);
"""
    )
    async with sessoes() as s:
        repo = SugestaoMaterialRepository(s)
        desempenho = await repo.desempenho_no_topico(aluno_id=str(f5.A), topico_id=10)
        vazio = await repo.desempenho_no_topico(aluno_id=str(f5.B), topico_id=10)

    assert desempenho == {"media_acertos": 40.0, "itens": 2}
    assert vazio is None


async def test_foco_de_estudo_pega_o_topico_e_o_proximo_conteudo(banco, sessoes):
    from app.repositories.context import ContextRepository

    banco.execute(
        f"""
INSERT INTO conteudos (id, topico_id, titulo, tipo, ordem) OVERRIDING SYSTEM VALUE VALUES
  (1, 11, 'Introdução', 'texto', 1), (2, 11, 'Soma de frações', 'texto', 2), (3, 12, 'Outro', 'texto', 1);
INSERT INTO conteudo_aluno (aluno_id, conteudo_id, status, percentual_concluido) VALUES
  ('{f5.A}', 1, 'concluido', 100);
INSERT INTO topico_aluno (aluno_id, topico_id, status, percentual_concluido, updated_at) VALUES
  ('{f5.A}', 11, 'em andamento', 42.4, now()),
  ('{f5.A}', 12, 'em andamento', 10, now() - interval '1 day');
"""
    )
    async with sessoes() as s:
        repo = ContextRepository(s)
        em_andamento = await repo.fetch_foco_de_estudo(aluno_id=str(f5.A), classe_id=f5.TURMA, topico_id=None)
        do_ciclo = await repo.fetch_foco_de_estudo(aluno_id=str(f5.A), classe_id=f5.TURMA, topico_id=12)
        nada = await repo.fetch_foco_de_estudo(aluno_id=str(f5.B), classe_id=f5.TURMA, topico_id=None)

    assert em_andamento == {
        "topico_id": 11, "topico": "Dois", "percentual_concluido": 42, "proximo_conteudo": "Soma de frações",
    }
    assert do_ciclo["topico"] == "Tres" and do_ciclo["proximo_conteudo"] == "Outro"
    assert nada is None

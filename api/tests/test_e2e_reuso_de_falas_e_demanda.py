"""Falas do boss e demanda de formato copiadas entre turmas, com o SQL e o driver de verdade.

O teste de unidade troca a consulta por um dublê. Aqui rodam `gerar_falas_do_topico` e
`analisar_demanda_do_topico` inteiros no asyncpg, com um modelo que falha se for chamado:

- a turma nova ganha linhas próprias, e a segunda rodada as vê como atuais;
- as linhas da turma de origem não mudam;
- a versão velha não serve de origem;
- fala desligada pelo professor não chega a outra turma, e a decisão sobrevive à cópia do mesmo texto;
- análise do professor e regra fixa não servem de origem, e a análise do professor não é sobrescrita.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.services import boss_falas, demanda_formato
from app.services.boss_falas import gerar_falas_do_topico
from app.services.demanda_formato import analisar_demanda_do_topico
from tests import _f5_banco as f5

REUSO = f5.modulo("20261104_08_reuso_de_personalizacao.py")
FALAS = f5.modulo("20261101_11_falas_do_boss.py")
REVISAO = f5.modulo("20261102_19_boss_falas_revisao_do_professor.py")
DEMANDA = f5.modulo("20261102_07_recomendacao_conteudo_x_aluno.py")

PERFIL = "conqueror"
IMPRESSAO = "f" * 64


def _banco():
    return f5.banco(*f5.sql_de(REUSO), FALAS.TABELA, REVISAO.COLUNAS, REVISAO.GATILHO, DEMANDA.TABELA)


def _semear(c) -> None:
    """Turma 1 (origem, conteúdo 1) e turma 2 (mesmo texto, conteúdo 2, tópico com outro nome)."""
    f5.semear_turma(c)
    for tabela in ("conteudos", "conteudo_personalizado"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
  VALUES (2, 1, '{f5.PROF}', 'Outra');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (20, 2, 'Outro nome', 1);
INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo) OVERRIDING SYSTEM VALUE VALUES
  (1, 10, 'Frações', 'texto', 'Igual'), (2, 20, 'Frações', 'texto', 'Igual');
"""
    )
    c.execute(
        """
        INSERT INTO public.conteudo_personalizado
          (aluno_id, classe_id, topico_id, conteudo_id, brainhex_profile_key, ciclo_id, plano, materiais,
           formato_prioritario, formatos_gerados, status, source_hash, impressao_conteudo)
        VALUES (NULL, 1, 10, 1, 'seeker', 'ciclo-a', '{}', '{}', 'cards', ARRAY['cards'], 'pronto', 'hash-a', %s)
        """,
        (IMPRESSAO,),
    )


def _hash_das_falas_da_origem() -> str:
    return boss_falas.hash_do_topico(
        perfil=PERFIL,
        topico={"nome": "Um", "descricao": None},
        conteudos=[{"id": 1, "titulo": "Frações", "conteudo": "Igual"}],
    )


def _hash_da_demanda_da_origem() -> str:
    return demanda_formato.hash_do_topico(
        topico={"nome": "Um", "descricao": None},
        conteudos=[{"id": 1, "titulo": "Frações", "tipo": "texto", "conteudo": "Igual", "textos_fonte": []}],
    )


def _falas_na_origem(c, *, versao: str | None = None, ativa: bool = True) -> None:
    c.execute(
        """
        INSERT INTO public.boss_falas
          (classe_id, topico_id, conteudo_id, perfil, nome, falas, source_hash, versao, ativa)
        VALUES (1, 10, 1, %s, 'Soberano das Frações', %s, %s, %s, %s)
        """,
        (
            PERFIL,
            json.dumps({"entrada": ["Fala da origem."]}),
            _hash_das_falas_da_origem(),
            versao or boss_falas.BOSS_FALAS_VERSION,
            ativa,
        ),
    )


def _demanda_na_origem(c, *, origem: str = "modelo", versao: str | None = None) -> None:
    c.execute(
        """
        INSERT INTO public.conteudo_demanda_formato
          (classe_id, topico_id, conteudo_id, demanda, origem, source_hash, versao)
        VALUES (1, 10, 1, %s, %s, %s, %s)
        """,
        (
            json.dumps({"visual": {"nivel": "essencial", "motivo": "da origem"}}),
            origem,
            _hash_da_demanda_da_origem(),
            versao or demanda_formato.DEMANDA_FORMATO_VERSION,
        ),
    )


async def _impressao_igual(conteudo_ids: list[int]) -> dict[int, str]:
    return dict.fromkeys(conteudo_ids, IMPRESSAO)


def _modelo_proibido() -> AsyncMock:
    servico = AsyncMock()
    servico.ainvoke_structured.side_effect = AssertionError("o modelo nao podia ser chamado")
    return servico


def _rodar(c, fn):
    """Roda `fn(session)` numa sessão asyncpg no banco descartável de `c`."""
    dsn = f5._dsn_para(c.info.dbname)

    async def _principal():
        engine = create_async_engine(dsn.replace("postgresql://", "postgresql+asyncpg://", 1))
        try:
            async with AsyncSession(engine) as session:
                return await fn(session)
        finally:
            await engine.dispose()

    return asyncio.run(_principal())


def _falas(c, conteudo_id: int):
    return c.execute(
        "SELECT classe_id, topico_id, nome, falas, source_hash, ativa FROM public.boss_falas"
        " WHERE conteudo_id = %s AND perfil = %s",
        (conteudo_id, PERFIL),
    ).fetchone()


def _gerar_falas(c, llm):
    async def _fn(session):
        return await gerar_falas_do_topico(
            session=session, settings=None, topico_id=20, perfil=PERFIL, llm=llm, ler_impressoes=_impressao_igual
        )

    return _rodar(c, _fn)


def _analisar(c, llm):
    async def _fn(session):
        return await analisar_demanda_do_topico(
            session=session, settings=None, topico_id=20, llm=llm, ler_impressoes=_impressao_igual
        )

    return _rodar(c, _fn)


@f5.e2e
def test_falas_copiadas_viram_linha_da_turma_nova_sem_modelo() -> None:
    with _banco() as c:
        _semear(c)
        _falas_na_origem(c)
        antes = _falas(c, 1)

        resultado = _gerar_falas(c, _modelo_proibido())

        assert (resultado.status, resultado.gravados) == ("reaproveitado", 1)
        classe, topico, nome, falas, source_hash, ativa = _falas(c, 2)
        assert (classe, topico, nome, ativa) == (2, 20, "Soberano das Frações", True)
        assert falas == {"entrada": ["Fala da origem."]}
        assert source_hash != antes[4]
        assert _falas(c, 1) == antes
        # O próximo poll não paga nada.
        assert _gerar_falas(c, _modelo_proibido()).status == "atual"


@f5.e2e
def test_falas_de_versao_velha_nao_servem_de_origem() -> None:
    with _banco() as c:
        _semear(c)
        _falas_na_origem(c, versao="2020-01-01.1")

        resultado = _gerar_falas(c, AsyncMock(ainvoke_structured=AsyncMock(side_effect=RuntimeError("cota"))))

        assert resultado.status == "failed"
        assert _falas(c, 2) is None


@f5.e2e
def test_fala_desligada_pelo_professor_nao_chega_a_outra_turma() -> None:
    with _banco() as c:
        _semear(c)
        _falas_na_origem(c, ativa=False)

        resultado = _gerar_falas(c, AsyncMock(ainvoke_structured=AsyncMock(side_effect=RuntimeError("cota"))))

        assert resultado.status == "failed"
        assert _falas(c, 2) is None


@f5.e2e
def test_copia_do_mesmo_texto_nao_religa_o_que_o_professor_desligou() -> None:
    with _banco() as c:
        _semear(c)
        _falas_na_origem(c)
        _gerar_falas(c, _modelo_proibido())
        c.execute("UPDATE public.boss_falas SET ativa = false, source_hash = 'velho' WHERE conteudo_id = 2")

        assert _gerar_falas(c, _modelo_proibido()).status == "reaproveitado"

        assert _falas(c, 2)[5] is False


@f5.e2e
def test_demanda_copiada_vira_linha_da_turma_nova_sem_modelo() -> None:
    with _banco() as c:
        _semear(c)
        _demanda_na_origem(c)

        resultado = _analisar(c, _modelo_proibido())

        assert (resultado.status, resultado.gravados) == ("reaproveitado", 1)
        linha = c.execute(
            "SELECT classe_id, topico_id, origem, demanda FROM public.conteudo_demanda_formato WHERE conteudo_id = 2"
        ).fetchone()
        assert linha == (2, 20, "modelo", {"visual": {"nivel": "essencial", "motivo": "da origem"}})
        assert _analisar(c, _modelo_proibido()).status == "atual"


@f5.e2e
def test_demanda_do_professor_regra_fixa_e_versao_velha_nao_servem_de_origem() -> None:
    for origem, versao in (("professor", None), ("heuristica", None), ("modelo", "2020-01-01.1")):
        with _banco() as c:
            _semear(c)
            _demanda_na_origem(c, origem=origem, versao=versao)

            resultado = _analisar(c, AsyncMock(ainvoke_structured=AsyncMock(side_effect=RuntimeError("cota"))))

            assert resultado.status == "heuristica"
            assert c.execute(
                "SELECT origem FROM public.conteudo_demanda_formato WHERE conteudo_id = 2"
            ).fetchone() == ("heuristica",)

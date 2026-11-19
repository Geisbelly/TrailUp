"""`20261118_01` num Postgres local descartável: quem lê o quê, e as contas das views.

Turma 1 (professor PROF): aluno A conversa duas vezes no tópico 10 às 10:00 e 10:30 e tem uma
tentativa antes (40%, 09:00) e uma depois (80%, 11:00) da primeira conversa; aluno B conversa uma vez.
Turma 2 (OUTRO_PROF): uma conversa do aluno C, que o PROF não pode ver.
"""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M = f5.modulo("20261118_01_chat_guia_registros.py")
_TENTATIVAS = "20261101_13_tentativas_com_tempo_do_servidor.py"
TENTATIVAS = _trecho(_TENTATIVAS, "CREATE TABLE IF NOT EXISTS public.atividade_tentativas (", "\n);")
RLS_TENTATIVAS = "ALTER TABLE public.atividade_tentativas ENABLE ROW LEVEL SECURITY;\n" + _trecho(
    _TENTATIVAS, "CREATE POLICY atividade_tentativas_sel", ";"
)


def _banco():
    return f5.banco(e.GRANTS_SUPABASE, POSSE, e.RETENCAO, TENTATIVAS, RLS_TENTATIVAS, *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("atividades",):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{e.OUTRO_PROF}', 'p2@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{e.OUTRO_PROF}', 'Outro');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
  VALUES (2, 1, '{e.OUTRO_PROF}', 'T2');
INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (100, 10, 'Lista');
INSERT INTO public.atividade_tentativas
  (aluno_id, atividade_id, classe_id, numero, iniciada_em, respondida_em, cronometrada, acertos_percentual)
VALUES
  ('{f5.A}', 100, 1, 1, '2026-11-10T08:50:00Z', '2026-11-10T09:00:00Z', false, 40),
  ('{f5.A}', 100, 1, 2, '2026-11-10T10:50:00Z', '2026-11-10T11:00:00Z', false, 80);
INSERT INTO public.chat_guia_registros
  (aluno_id, classe_id, topico_id, escopo, intencao, assunto, conceitos, dificuldade, origem, versao, criado_em)
VALUES
  ('{f5.A}', 1, 10, 'modulo', 'duvida_materia', 'soma de frações', '{{mmc,frações}}', 'travado', 'modelo', 'v1',
   '2026-11-10T10:00:00Z'),
  ('{f5.A}', 1, 10, 'modulo', 'pedido_resposta', NULL, '{{}}', 'nenhuma', 'modelo', 'v1', '2026-11-10T10:30:00Z'),
  ('{f5.B}', 1, 10, 'modulo', 'duvida_materia', 'mmc', '{{mmc}}', 'alguma', 'modelo', 'v1', '2026-11-10T10:40:00Z'),
  ('{f5.C}', 2, NULL, 'trilha_home', 'navegacao_app', 'onde fica: perfil.loja', '{{}}', 'nenhuma', 'regra', 'v1',
   '2026-11-10T10:45:00Z');
"""
    )


def _contar(c, quem, tabela: str) -> int:
    return e._como(c, quem, f"SELECT count(*) FROM public.{tabela}")[0][0]


@f5.e2e
def test_aluno_le_o_proprio_e_o_professor_so_as_turmas_dele() -> None:
    with _banco() as c:
        _semear(c)
        assert _contar(c, f5.A, "chat_guia_registros") == 2
        assert _contar(c, f5.B, "chat_guia_registros") == 1
        assert _contar(c, f5.PROF, "chat_guia_registros") == 3
        assert _contar(c, e.OUTRO_PROF, "chat_guia_registros") == 1


@f5.e2e
def test_acerto_antes_e_depois_da_primeira_conversa() -> None:
    with _banco() as c:
        _semear(c)
        linhas = e._como(
            c,
            f5.PROF,
            "SELECT aluno_id, perguntas, pedidos_resposta, travado, tentativas_antes, acerto_antes_pct,"
            " tentativas_depois, acerto_depois_pct FROM public.vw_chat_guia_aluno_topico WHERE topico_id = 10"
            " ORDER BY aluno_id",
        )
        def _f(v):
            return None if v is None else float(v)

        assert [(*linha[:5], _f(linha[5]), linha[6], _f(linha[7])) for linha in linhas] == [
            (f5.A, 2, 1, 1, 1, 40.0, 1, 80.0),
            (f5.B, 1, 0, 0, 0, None, 0, None),
        ]


@f5.e2e
def test_dificuldade_da_sala_por_conceito() -> None:
    with _banco() as c:
        _semear(c)
        linhas = e._como(
            c,
            f5.PROF,
            "SELECT conceito, mencoes, alunos, alunos_com_dificuldade FROM public.vw_chat_guia_conceitos_turma"
            " WHERE classe_id = 1 ORDER BY conceito",
        )
        assert linhas == [("frações", 1, 1, 1), ("mmc", 2, 2, 2)]
        resumo = e._como(
            c,
            f5.PROF,
            "SELECT perguntas, alunos, pedidos_resposta, alunos_travados FROM public.vw_chat_guia_turma_topico"
            " WHERE classe_id = 1 AND topico_id = 10",
        )
        assert resumo == [(3, 2, 1, 1)]


@f5.e2e
def test_anonimo_nao_le_e_cliente_nao_escreve() -> None:
    with _banco() as c:
        _semear(c)
        for objeto in ("chat_guia_registros", "vw_chat_guia_aluno_topico", "vw_chat_guia_conceitos_turma"):
            c.execute("BEGIN")
            c.execute("SET LOCAL ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(f"SELECT 1 FROM public.{objeto}")
            c.execute("ROLLBACK")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            e._como(
                c,
                f5.A,
                "INSERT INTO public.chat_guia_registros (aluno_id, classe_id, escopo, intencao, origem, versao)"
                f" VALUES ('{f5.A}', 1, 'modulo', 'outro', 'modelo', 'v1') RETURNING id",
            )


@f5.e2e
def test_prazo_registrado_e_conta_apagada_leva_junto() -> None:
    with _banco() as c:
        _semear(c)
        politica = c.execute(
            "SELECT acao, dias, dias_pesquisa FROM public.retencao_politica WHERE tabela = 'chat_guia_registros'"
        ).fetchall()
        assert politica == [("apagar", M.DIAS, M.DIAS_PESQUISA)]
        c.execute("DELETE FROM public.classe_aluno WHERE aluno_id = %s", (f5.B,))
        c.execute("DELETE FROM public.alunos WHERE id = %s", (f5.B,))
        assert c.execute("SELECT count(*) FROM public.chat_guia_registros WHERE aluno_id = %s", (f5.B,)).fetchone() == (0,)


@f5.e2e
def test_repositorio_grava_e_le_pelo_driver_da_api() -> None:
    """As SQLs de `ChatGuiaRegistrosRepository` pelo asyncpg, como a API roda (CAST de lista, make_interval)."""
    import asyncio
    from urllib.parse import urlsplit, urlunsplit

    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.repositories.chat_guia_registros import ChatGuiaRegistrosRepository
    from app.services.mascaramento_chat import RegistroDoChat

    with _banco() as c:
        _semear(c)
        # Traz as linhas para dentro da janela de memória, mantendo a ordem entre elas.
        c.execute(
            "UPDATE public.chat_guia_registros SET criado_em = now() - (timestamptz '2026-11-11T00:00:00Z' - criado_em)"
        )
        url = urlsplit(f5.DSN)._replace(scheme="postgresql+asyncpg", path=f"/{c.info.dbname}")

        async def rodar():
            engine = create_async_engine(urlunsplit(url))
            try:
                async with AsyncSession(engine) as session:
                    repo = ChatGuiaRegistrosRepository(session)
                    await repo.gravar(
                        RegistroDoChat("duvida_materia", "mmc", ["mmc"], "travado"),
                        aluno_id=f5.C, classe_id=1, topico_id=10, conteudo_id=None,
                        escopo="modulo", origem="modelo", guardrail=True,
                    )
                    await session.commit()
                    return (
                        await repo.recentes_do_aluno(aluno_id=f5.A, classe_id=1),
                        await repo.dificuldades_da_turma(classe_id=1, topico_id=10),
                        await repo.nomes_da_turma(1),
                    )
            finally:
                await engine.dispose()

        recentes, turma, nomes = asyncio.run(rodar())
        assert [r["intencao"] for r in recentes] == ["pedido_resposta", "duvida_materia"]
        assert recentes[1]["conceitos"] == ["mmc", "frações"]
        # A, B e C (o novo) tiveram dificuldade em mmc: três alunos, o mínimo para aparecer.
        assert turma == [{"conceito": "mmc", "alunos": 3}]
        assert {n["nome"] for n in nomes} == {"A", "B", "C"}

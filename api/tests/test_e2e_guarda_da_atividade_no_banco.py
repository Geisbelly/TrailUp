"""`20261102_04`: o aluno não grava a própria nota, nem responde depois do prazo (#136, fase 5).

Banco local com o esqueleto de produção, a `20261101_13` inteira (as RPCs de tentativa), o recálculo
por resposta real de `20260920_08` e a guarda. As escritas do aluno rodam como `authenticated` com as
claims dele, como o PostgREST faria; o que se mede é o que fica gravado.
"""

from __future__ import annotations

from decimal import Decimal

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_tentativas_com_tempo_do_servidor as fase1
from tests.test_e2e_kpis_por_topico import _trecho

pytestmark = f5.e2e

M = f5.modulo("20261102_04_guarda_da_atividade_no_banco.py")
RECALCULO = _trecho(
    "20260920_08_activity_answer_completion.py",
    "CREATE OR REPLACE FUNCTION public.trailup_recalcular_atividade_respostas",
    "FOR EACH ROW EXECUTE FUNCTION public.trailup_progresso_after_resposta();",
)
# Só as colunas que a guarda lê (a tabela inteira é de `20261101_12`).
REVISAO = """
CREATE TABLE public.alteracao_aluno (
  aluno_id uuid NOT NULL, atividade_id bigint, decisao_efetiva text,
  revisar_desde timestamptz, revisada_em timestamptz
);
"""
GRANTS = (
    "GRANT SELECT, INSERT, UPDATE ON public.atividade_aluno, public.questao_aluno TO authenticated;"
    "GRANT SELECT ON public.questoes TO authenticated;"
)
ATIVIDADE = fase1.ATIVIDADE
QUESTOES = (701, 702)
OUTRA = 501  # outra atividade do mesmo tópico, com uma questão própria


def _banco(com_guarda: bool = True):
    guarda = f5.sql_de(M) if com_guarda else []
    return fase1._banco(RECALCULO, REVISAO, GRANTS, *guarda)


def _semear(c, *, prazo: str = "NULL") -> None:
    fase1._semear(c, prazo=prazo)
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima)"
        " OVERRIDING SYSTEM VALUE VALUES (%s, 10, 'Outra', 10)",
        (OUTRA,),
    )
    f5.afrouxa(c, "questoes")
    c.execute(
        "INSERT INTO public.questoes (id, atividade_id, enunciado) OVERRIDING SYSTEM VALUE VALUES"
        " (%s, %s, 'q1'), (%s, %s, 'q2'), (703, %s, 'q3')",
        (QUESTOES[0], ATIVIDADE, QUESTOES[1], ATIVIDADE, OUTRA),
    )


def _upsert(c, colunas: dict, quem=f5.A):
    """O upsert do `supabase-js`: INSERT ... ON CONFLICT DO UPDATE só com o que foi mandado."""
    linha = {"aluno_id": str(quem), "atividade_id": ATIVIDADE, **colunas}
    nomes = ", ".join(linha)
    marcas = ", ".join(["%s"] * len(linha))
    sets = ", ".join(f"{n} = EXCLUDED.{n}" for n in linha)
    return fase1._como(
        c,
        quem,
        f"INSERT INTO public.atividade_aluno ({nomes}) VALUES ({marcas})"
        f" ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET {sets} RETURNING id",
        tuple(psycopg.types.json.Json(v) if isinstance(v, dict) else v for v in linha.values()),
    )


def _responder_questao(c, questao: int, atividade: int = ATIVIDADE, quem=f5.A, tentativa: int = 1):
    return fase1._como(
        c,
        quem,
        "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta,"
        " acertos_percentual) VALUES (%s, %s, %s, %s, 'x', true, 100) RETURNING id",
        (quem, questao, atividade, tentativa),
    )


def _evento(c, tipo: str, referencia: str, quem=f5.A):
    return fase1._como(
        c,
        quem,
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor) VALUES (%s, %s, %s, 1) RETURNING tipo",
        (quem, tipo, referencia),
    )


def _linha(c, aluno=f5.A):
    return c.execute(
        "SELECT status::text, percentual_concluido, acertos_percentual, pontuacao_obtida"
        " FROM public.atividade_aluno WHERE aluno_id = %s AND atividade_id = %s",
        (aluno, ATIVIDADE),
    ).fetchone()


def test_aluno_nao_grava_nota_nem_conclusao_mas_marca_visita_e_inicio() -> None:
    with _banco() as c:
        _semear(c)
        # O fallback antigo de `registrarConclusao`: o que a medição de 01/11 viu passar.
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="conclusao e do servidor"):
            _upsert(c, {"status": "concluido", "percentual_concluido": 100, "acertos_percentual": 100,
                        "pontuacao_obtida": 999})
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="nota, acerto"):
            _upsert(c, {"status": "em andamento", "pontuacao_obtida": 10})
        assert _linha(c) is None

        # `marcarIniciada` e `registrarVisita` continuam passando.
        _upsert(c, {"status": "em andamento", "ultima_visualizacao": "2026-11-01T12:00:00"})
        _upsert(c, {"ultima_visualizacao": "2026-11-01T12:05:00"})
        assert _linha(c) == ("em andamento", Decimal("0"), Decimal("0"), None)

        for colunas in ({"acertos_percentual": 100}, {"pontuacao_obtida": 10}, {"percentual_concluido": 100},
                        {"tempo_gasto_min": 60}, {"avaliacao_metadata": {"professor": {"nota": 10}}}):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _upsert(c, colunas)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="conclusao e do servidor"):
            _upsert(c, {"status": "concluido"})
        assert _linha(c) == ("em andamento", Decimal("0"), Decimal("0"), None)


def test_a_rpc_conclui_e_abrir_de_novo_nao_desfaz() -> None:
    with _banco() as c:
        _semear(c)
        t = fase1._iniciar(c)["tentativa_id"]
        fase1._responder(c, t, 80, 8)
        assert _linha(c) == ("concluido", Decimal("100"), Decimal("80"), Decimal("8"))

        # `marcarIniciada` ao refazer: antes rebaixava a conclusão até a resposta chegar.
        _upsert(c, {"status": "em andamento", "ultima_visualizacao": "2026-11-01T13:00:00"})
        assert _linha(c) == ("concluido", Decimal("100"), Decimal("80"), Decimal("8"))

        # A segunda tentativa, pela RPC, continua valendo (a última vale).
        t2 = fase1._iniciar(c)["tentativa_id"]
        fase1._responder(c, t2, 50, 5)
        assert _linha(c) == ("concluido", Decimal("100"), Decimal("50"), Decimal("5"))


def test_id_do_cliente_sai_da_sequencia() -> None:
    with _banco() as c:
        _semear(c)
        (novo,) = _upsert(c, {"id": 10**12, "status": "em andamento"})[0]
        assert novo != 10**12


def test_resposta_depois_do_prazo_so_na_revisao_pedida() -> None:
    with _banco() as c:
        _semear(c, prazo="now() - interval '1 day'")
        with pytest.raises(psycopg.errors.RaiseException, match="prazo_expirado"):
            _responder_questao(c, QUESTOES[0])
        assert _linha(c) is None  # a medição de 01/11 via `concluido` aqui

        # O professor pediu revisão: ela vale depois do prazo (20261101_12).
        c.execute(
            "INSERT INTO public.alteracao_aluno VALUES (%s, %s, 'revisar', now() - interval '1 hour', NULL)",
            (f5.A, ATIVIDADE),
        )
        _responder_questao(c, QUESTOES[0])
        _responder_questao(c, QUESTOES[1])
        assert _linha(c)[0] == "concluido"  # o recálculo do servidor continua concluindo

        c.execute("UPDATE public.alteracao_aluno SET revisada_em = now()")
        with pytest.raises(psycopg.errors.RaiseException, match="prazo_expirado"):
            _responder_questao(c, QUESTOES[0], tentativa=2)


def test_resposta_no_prazo_conclui_pelo_recalculo_e_questao_de_outra_atividade_e_recusada() -> None:
    with _banco() as c:
        _semear(c, prazo="now() + interval '1 day'")
        _responder_questao(c, QUESTOES[0])
        assert _linha(c)[:2] == ("em andamento", Decimal("50.00"))
        _responder_questao(c, QUESTOES[1])
        assert _linha(c)[:2] == ("concluido", Decimal("100.00"))

        # A questão 703 é da OUTRA atividade: o prazo conferido seria o da atividade dita.
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="questao_de_outra_atividade"):
            _responder_questao(c, 703, atividade=ATIVIDADE)
        _responder_questao(c, 703, atividade=OUTRA)


def test_evento_de_atividade_so_com_a_atividade_concluida() -> None:
    with _banco() as c:
        _semear(c)
        ref = f"atividade:{ATIVIDADE}"
        for tipo in ("atividade_concluida", "atividade_acertada", "atividade_revisada"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege, match="so com a atividade concluida"):
                _evento(c, tipo, ref)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _evento(c, "atividade_acertada", "")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _evento(c, "atividade_acertada", f"{ref} ")

        # Não pagam ou não são de atividade do professor: seguem como estavam.
        _evento(c, "atividade_errada", ref)
        _evento(c, "topico_atividade_acertada", "item:10:quiz")

        t = fase1._iniciar(c)["tentativa_id"]
        fase1._responder(c, t, 100, 10)
        assert _evento(c, "atividade_acertada", ref) == [("atividade_acertada",)]
        assert _evento(c, "atividade_concluida", ref) == [("atividade_concluida",)]

        # Concluída por OUTRO aluno não vale para este.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _evento(c, "atividade_acertada", ref, quem=f5.B)


def test_o_servidor_continua_gravando() -> None:
    """O dono (RPC, worker, migration) passa pela guarda sem nada mudar."""
    with _banco() as c:
        _semear(c, prazo="now() - interval '1 day'")
        c.execute(
            "INSERT INTO public.atividade_aluno (id, aluno_id, atividade_id, status, acertos_percentual, pontuacao_obtida)"
            " VALUES (77, %s, %s, 'concluido', 90, 9)",
            (f5.A, ATIVIDADE),
        )
        c.execute("UPDATE public.atividade_aluno SET pontuacao_obtida = 10 WHERE id = 77")
        c.execute(
            "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, resposta) VALUES (%s, %s, %s, 'x')",
            (f5.A, QUESTOES[0], ATIVIDADE),
        )
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) VALUES (%s, 'atividade_acertada', 'x')",
            (f5.B,),
        )
        assert c.execute("SELECT id, pontuacao_obtida FROM public.atividade_aluno").fetchone() == (77, Decimal("10"))


def test_toda_coluna_de_atividade_aluno_tem_dono() -> None:
    """Coluna nova em `atividade_aluno` precisa entrar numa das listas da guarda."""
    with _banco() as c:
        colunas = dict(
            c.execute(
                "SELECT column_name, column_default FROM information_schema.columns"
                " WHERE table_schema = 'public' AND table_name = 'atividade_aluno'"
            ).fetchall()
        )
        assert set(colunas) == set(M.CHAVES) | set(M.COLUNAS_LIVRES) | set(M.DEFAULTS_DO_SERVIDOR)
        for coluna, padrao in M.DEFAULTS_DO_SERVIDOR.items():
            assert (colunas[coluna] or "NULL") == padrao, coluna


def test_downgrade_volta_ao_estado_anterior() -> None:
    with _banco() as c:
        _semear(c, prazo="now() - interval '1 day'")
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        _upsert(c, {"status": "concluido", "pontuacao_obtida": 999})
        assert _linha(c) == ("concluido", Decimal("0"), Decimal("0"), Decimal("999"))
        _responder_questao(c, QUESTOES[0])  # depois do prazo, e passa

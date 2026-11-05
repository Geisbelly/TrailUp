"""`20261105_15` (#154, fase 2): duelo dentro do evento, só entre inscritos.

Banco do e2e do rank do evento (`20261104_01`) com a `20261104_07` por cima, que é a view de
produção. `arena_desafio_criar` é um dublê: a criação do Social não está em teste aqui, só o que a
`evento_duelo_criar` cobra antes e depois dela. `fn_arena_cobrar_limite_diario` e
`fn_desafio_encerrar` também são dublês, para o `arena_convite_responder` real rodar.

Papel de cliente de verdade (`SET LOCAL ROLE` + claims). Postgres LOCAL.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_duelo_fora_do_xp as duelo
from tests import test_e2e_rank_do_evento as rde
from tests import test_e2e_rank_do_evento_por_tempo as tempo

pytestmark = [f5.e2e]

if f5.DSN:
    import psycopg

M = f5.modulo("20261105_15_duelo_no_evento.py")
ALUNO, RIVAL, FORA = rde.PEQUENA[0], rde.PEQUENA[1], rde.PEQUENA[2]

DUBLES = """
CREATE OR REPLACE FUNCTION public.arena_desafio_criar(
  p_classe_id bigint, p_formato text DEFAULT 'solo', p_modo text DEFAULT 'precisao', p_quantidade integer DEFAULT 5,
  p_guilda_id uuid DEFAULT NULL, p_aliado uuid DEFAULT NULL, p_adversarios uuid[] DEFAULT NULL, p_guilda_rival uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.guilda_desafios (id, classe_id, criado_por, modo, formato)
  VALUES (v_id, p_classe_id, auth.uid(), p_modo, p_formato);
  INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado) VALUES (v_id, auth.uid(), 1, 'aceito');
  INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe)
  SELECT v_id, a, 2 FROM unnest(COALESCE(p_adversarios, '{}'::uuid[])) a;
  RETURN jsonb_build_object('id', v_id, 'formato', p_formato, 'modo', p_modo, 'quantidade', p_quantidade);
END $f$;
GRANT EXECUTE ON FUNCTION public.arena_desafio_criar(bigint, text, text, integer, uuid, uuid, uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_arena_cobrar_limite_diario(p_desafio_id uuid, p_aluno uuid)
RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE OR REPLACE FUNCTION public.fn_desafio_encerrar(p_desafio_id uuid)
RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{"resultado": "sem_adversario"}'::jsonb $f$;
"""


@contextmanager
def _banco(aplica: bool = True):
    with tempo._banco() as c:
        f5.afrouxa(c, "guilda_desafios")
        c.execute("ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_criado_por_fkey")
        c.execute(DUBLES)
        if aplica:
            for sql in f5.sql_de(M):
                c.execute(sql)
        yield c


def _evento_aberto(c, *inscritos, criterios=("ranqueada",)) -> uuid.UUID:
    evento = rde._evento(c, 1, criterios=criterios)
    rde._abrir(c, evento)
    rde._inscreve(c, evento, *inscritos)
    return evento


def _criar(c, quem, evento, adversarios) -> dict:
    with c.transaction():
        rde._como_cliente(c, quem)
        return c.execute(
            "SELECT public.evento_duelo_criar(%s, p_adversarios => %s::uuid[])", (evento, list(adversarios))
        ).fetchone()[0]


def _aceitar(c, quem, desafio) -> dict:
    with c.transaction():
        rde._como_cliente(c, quem)
        return c.execute("SELECT public.arena_convite_responder(%s, true)", (desafio,)).fetchone()[0]


def _desafio(c, desafio) -> tuple:
    return c.execute(
        "SELECT evento_id, consequencia FROM public.guilda_desafios WHERE id = %s", (desafio,)
    ).fetchone()


def _desafios(c) -> int:
    return c.execute("SELECT count(*) FROM public.guilda_desafios").fetchone()[0]


# --- criar ---------------------------------------------------------------------------------------


def test_inscrito_cria_duelo_ligado_ao_evento_sem_elo_nem_aposta() -> None:
    with _banco() as c:
        evento = _evento_aberto(c, ALUNO, RIVAL)
        r = _criar(c, ALUNO, evento, [RIVAL])
        assert r["evento_id"] == str(evento) and r["consequencia"] == "evento"
        # `evento` tira o Elo (só `ranqueada` move) e a aposta (só `ranqueada` paga −6).
        assert _desafio(c, r["id"]) == (evento, "evento")


@pytest.mark.parametrize(
    ("inscritos", "adversarios", "erro"),
    [
        ((RIVAL,), [RIVAL], "evento_duelo_sem_inscricao"),  # quem cria não se inscreveu
        ((ALUNO,), [RIVAL], "evento_duelo_participante_sem_inscricao"),  # o adversário não
        ((ALUNO, RIVAL), [], "evento_duelo_sem_adversario"),  # duelo sem equipe 2
    ],
)
def test_recusa_e_nao_deixa_desafio_pela_metade(inscritos, adversarios, erro) -> None:
    with _banco() as c:
        evento = _evento_aberto(c, *inscritos)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match=erro):
            _criar(c, ALUNO, evento, adversarios)
        assert _desafios(c) == 0


def test_evento_encerrado_nao_aceita_duelo() -> None:
    with _banco() as c:
        evento = _evento_aberto(c, ALUNO, RIVAL)
        c.execute("SELECT public.fn_evento_classe_encerrar_agora(%s)", (evento,))
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="evento_duelo_evento_fechado"):
            _criar(c, ALUNO, evento, [RIVAL])


def test_ninguem_liga_duelo_a_evento_por_fora() -> None:
    with _banco() as c:
        evento = _evento_aberto(c, ALUNO, RIVAL)
        duelo._desafio(c, duelo.DUELO, 1, rde.PROF, ALUNO, RIVAL)
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("UPDATE public.guilda_desafios SET evento_id = %s WHERE id = %s", (evento, duelo.DUELO))
        with c.transaction():
            rde._como_cliente(c, ALUNO)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT public.fn_evento_duelo_cobrar(%s, %s)", (duelo.DUELO, ALUNO))


# --- aceitar --------------------------------------------------------------------------------------


def test_quem_saiu_do_evento_nao_aceita() -> None:
    with _banco() as c:
        evento = _evento_aberto(c, ALUNO, RIVAL)
        desafio = _criar(c, ALUNO, evento, [RIVAL])["id"]
        rde._rpc(c, RIVAL, "evento_classe_sair", evento)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="evento_duelo_sem_inscricao"):
            _aceitar(c, RIVAL, desafio)
        # O convite segue aberto, e recusar continua possível.
        with c.transaction():
            rde._como_cliente(c, RIVAL)
            assert c.execute("SELECT public.arena_convite_responder(%s, false)", (desafio,)).fetchone()[0]["estado"] == "recusado"


def test_inscrito_aceita_e_duelo_do_social_nao_e_cobrado() -> None:
    with _banco() as c:
        evento = _evento_aberto(c, ALUNO, RIVAL)
        desafio = _criar(c, ALUNO, evento, [RIVAL])["id"]
        assert _aceitar(c, RIVAL, desafio)["estado"] == "aceito"
        # Duelo do Social (sem evento): aceitar não olha inscrição nenhuma.
        duelo._desafio(c, duelo.COOPERATIVO, 1, rde.PROF, ALUNO, FORA)
        assert _aceitar(c, FORA, duelo.COOPERATIVO)["estado"] == "aceito"


# --- rank do evento -------------------------------------------------------------------------------


def _ponto(c, aluno, desafio, valor: int) -> None:
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor)"
        " VALUES (%s, 1, 'desafio_vencido', %s, %s)",
        (aluno, duelo._ref(1, uuid.UUID(str(desafio))), valor),
    )


def test_duelo_do_evento_conta_no_ranqueada_do_proprio_evento() -> None:
    with _banco() as c:
        evento = _evento_aberto(c, ALUNO, RIVAL)
        outro = _evento_aberto(c, ALUNO, RIVAL)
        rank = rde._rank(c, evento, rde.TIPO_RANQUEADA)
        rank_outro = rde._rank(c, outro, rde.TIPO_RANQUEADA)
        antes, antes_outro = rde._posicoes(c, rank)[ALUNO][1], rde._posicoes(c, rank_outro)[ALUNO][1]

        desafio = _criar(c, ALUNO, evento, [RIVAL])["id"]
        _ponto(c, ALUNO, desafio, 40)

        assert rde._posicoes(c, rank)[ALUNO][1] == antes + 40
        assert rde._posicoes(c, rank_outro)[ALUNO][1] == antes_outro  # outro evento não vê


def test_sem_a_migration_o_duelo_do_evento_ficaria_fora_do_rank() -> None:
    """O defeito que a troca na view corrige: `consequencia = 'evento'` não entrava no `ranqueada`."""
    with _banco(aplica=False) as c:
        for sql in f5.sql_de(M):
            if "CREATE OR REPLACE VIEW" not in sql:
                c.execute(sql)
        evento = _evento_aberto(c, ALUNO, RIVAL)
        rank = rde._rank(c, evento, rde.TIPO_RANQUEADA)
        antes = rde._posicoes(c, rank)[ALUNO][1]
        _ponto(c, ALUNO, _criar(c, ALUNO, evento, [RIVAL])["id"], 40)
        assert rde._posicoes(c, rank)[ALUNO][1] == antes


def test_ranks_sem_evento_nao_mudam() -> None:
    with _banco(aplica=False) as c:
        linhas = lambda: c.execute(  # noqa: E731
            "SELECT * FROM public.vw_rank_posicoes_por_classe_todas ORDER BY 1, 2, 3"
        ).fetchall()
        antes = linhas()
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert linhas() == antes


def test_downgrade_limpa() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        existe = c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'guilda_desafios' AND column_name = 'evento_id'"
        ).fetchone()[0]
        assert existe == 0
        assert c.execute("SELECT to_regprocedure('public.evento_duelo_criar(uuid, text, text, integer, uuid, uuid, uuid[], uuid)')").fetchone()[0] is None

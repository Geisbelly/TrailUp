"""`20261103_15`: o duelo contra adversário sai do XP, e recusar batalha não custa nada (#154).

Cada conta é medida com um duelo e um desafio cooperativo lado a lado: o primeiro some, o segundo
fica. Sem o cooperativo, um filtro que tirasse todo `desafio_*` passaria nestes testes.

Roda contra Postgres LOCAL (`TRAILUP_E2E_RETENCAO_DATABASE_URL`). Dados sintéticos.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from tests import _f5_banco as f5
from tests import test_e2e_faixas_de_xp as faixas
from tests import test_e2e_peso_do_xp_na_nota as peso
from tests import test_e2e_pontos_do_evento_no_rank as ev
from tests import test_e2e_ranking_le_config_por_wrapper as rkw

M = f5.modulo("20261103_15_duelo_fora_do_xp.py")
pytestmark = [f5.e2e]

DUELO = uuid.UUID(int=7001)
COOPERATIVO = uuid.UUID(int=7002)


def _marca(c) -> None:
    c.execute(M.COLUNA)
    c.execute(M.MARCA)


def _desafio(c, desafio: uuid.UUID, classe: int, criador, aluno, rival=None) -> None:
    f5.afrouxa(c, "guilda_desafios")
    c.execute("ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_criado_por_fkey")
    c.execute(
        "INSERT INTO public.guilda_desafios (id, classe_id, criado_por, modo, formato)"
        " VALUES (%s, %s, %s, 'todos', 'solo')",
        (desafio, classe, criador),
    )
    c.execute(
        "INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe) VALUES (%s, %s, 1)",
        (desafio, aluno),
    )
    if rival:
        c.execute(
            "INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe) VALUES (%s, %s, 2)",
            (desafio, rival),
        )


def _ref(classe: int, desafio: uuid.UUID) -> str:
    return f"classe:{classe}:desafio:{desafio}"


def _lado_a_lado(c, classe: int, aluno, rival, criador) -> None:
    """Um duelo que paga 40 e um cooperativo que paga 10."""
    _desafio(c, DUELO, classe, criador, aluno, rival)
    _desafio(c, COOPERATIVO, classe, criador, aluno)
    for desafio, valor in ((DUELO, 40), (COOPERATIVO, 10)):
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor)"
            " VALUES (%s, %s, 'desafio_vencido', %s, %s)",
            (aluno, classe, _ref(classe, desafio), valor),
        )


def _fora(c) -> dict[str, bool]:
    return {
        str(r[0]).rsplit(":", 1)[-1]: r[1]
        for r in c.execute("SELECT referencia, fora_do_xp FROM public.eventos_aluno WHERE tipo LIKE 'desafio%'")
    }


# --- marca -----------------------------------------------------------------------------------


def test_so_o_duelo_e_marcado_e_o_cliente_nao_escolhe() -> None:
    with peso._banco() as c:
        peso._semear(c)
        _marca(c)
        _lado_a_lado(c, f5.TURMA, f5.A, f5.B, f5.PROF)

        assert _fora(c) == {str(DUELO): True, str(COOPERATIVO): False}

        # Quem escreve não decide: nem para sair do XP, nem para voltar.
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, fora_do_xp)"
            " VALUES (%s, %s, 'conquista_desbloqueada', 'conquista:9', 5, true)",
            (f5.A, f5.TURMA),
        )
        c.execute("UPDATE public.eventos_aluno SET fora_do_xp = false WHERE referencia = %s", (_ref(f5.TURMA, DUELO),))
        assert c.execute(
            "SELECT count(*) FROM public.eventos_aluno WHERE fora_do_xp"
        ).fetchone()[0] == 1
        assert c.execute(
            "SELECT fora_do_xp FROM public.eventos_aluno WHERE referencia = 'conquista:9'"
        ).fetchone()[0] is False


def test_o_backfill_marca_o_que_ja_existia() -> None:
    with peso._banco() as c:
        peso._semear(c)
        c.execute(M.COLUNA)
        _desafio(c, DUELO, f5.TURMA, f5.PROF, f5.A, f5.B)
        _desafio(c, COOPERATIVO, f5.TURMA, f5.PROF, f5.A)
        for desafio in (DUELO, COOPERATIVO):
            c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor)"
                " VALUES (%s, %s, 'desafio_vencido', %s, 10)",
                (f5.A, f5.TURMA, _ref(f5.TURMA, desafio)),
            )
        assert set(_fora(c).values()) == {False}

        c.execute(M.MARCA)
        c.execute(M.MARCA_O_QUE_JA_EXISTE)

        assert _fora(c) == {str(DUELO): True, str(COOPERATIVO): False}


# --- nota, CSV e faixa ------------------------------------------------------------------------


def test_duelo_nao_mexe_na_nota_mas_o_cooperativo_sim() -> None:
    with peso._banco() as c:
        peso._semear(c)
        _marca(c)
        c.execute(M.XP_NOVO)
        peso._turma(c, peso=20, meta=100)  # nota 6; com XP 10: 0,8 × 6 + 0,2 × 1 = 5 → fica 6

        _lado_a_lado(c, f5.TURMA, f5.A, f5.B, f5.PROF)

        assert c.execute(
            "SELECT public.fn_xp_da_matricula(%s, %s)", (f5.A, f5.TURMA)
        ).fetchone()[0] == Decimal("10")


def test_recalcular_baixa_a_nota_que_o_duelo_tinha_subido() -> None:
    with peso._banco() as c:
        peso._semear(c)
        _marca(c)
        peso._turma(c, peso=50, meta=100)
        _lado_a_lado(c, f5.TURMA, f5.A, f5.B, f5.PROF)
        peso._xp(c, 60)  # XP antigo: 110 → nota_xp 10 → nota final 8
        assert peso._notas(c)[1] == Decimal("8.00")

        c.execute(M.XP_NOVO)
        c.execute(M.RECALCULA_NOTAS)

        # XP certo: 70 → nota_xp 7 → 0,5 × 6 + 0,5 × 7 = 6,5
        assert peso._notas(c)[1] == Decimal("6.50")


def test_csv_do_professor_nao_conta_duelo() -> None:
    with peso._banco() as c:
        peso._semear(c)
        _marca(c)
        c.execute(M.notas_novas())
        _lado_a_lado(c, f5.TURMA, f5.A, f5.B, f5.PROF)

        c.execute("BEGIN")
        try:
            f5.como(c, f5.PROF)
            c.execute("SET LOCAL ROLE authenticated")
            cur = c.execute("SELECT * FROM public.professor_notas_da_turma(%s)", (f5.TURMA,))
            nomes = [d.name for d in cur.description]
            linhas = [dict(zip(nomes, linha)) for linha in cur.fetchall()]
        finally:
            c.execute("ROLLBACK")
        linha = next(r for r in linhas if str(r["aluno_id"]) == str(f5.A))
        # O `_semear` das notas já dá XP ao aluno A: o que importa é que o duelo de 40 não entra.
        base = c.execute(
            "SELECT sum(valor) FROM public.eventos_aluno WHERE aluno_id = %s AND classe_id = %s AND NOT fora_do_xp",
            (f5.A, f5.TURMA),
        ).fetchone()[0]
        assert linha["xp"] == base


def test_faixa_nao_conta_duelo() -> None:
    with faixas._banco() as c:
        faixas._semear_notas(c)
        _marca(c)
        c.execute(M.faixa_nova())
        antes = faixas._faixa(c)["xp"]

        _lado_a_lado(c, f5.TURMA, f5.A, f5.B, f5.PROF)

        assert faixas._faixa(c)["xp"] == antes + 10


# --- apuração do evento e piso ----------------------------------------------------------------


def test_apuracao_nao_soma_duelo_mas_quem_duelou_participou() -> None:
    with ev._banco() as c:
        _marca(c)
        c.execute(M.apuracao_nova())
        f5.afrouxa(c, "eventos_aluno")
        _desafio(c, DUELO, 1, ev.PROF, ev.C, ev.A)
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, concedido_por)"
            " VALUES (%s, 1, 'presenca_aula', 'classe:1:desafio:" + str(DUELO) + "', 40, %s)",
            (ev.C, ev.PROF),
        )
        c.execute(
            "UPDATE public.eventos_aluno SET tipo = 'desafio_vencido' WHERE aluno_id = %s", (ev.C,)
        )
        ev._apurar(c, ev.EVENTO)

        pontos, participou = c.execute(
            "SELECT pontos, participou FROM public.eventos_classe_resultado WHERE evento_id = %s AND aluno_id = %s",
            (ev.EVENTO, ev.C),
        ).fetchone()
        assert (pontos, participou) == (0, True)


def _derrota(c, desafio: uuid.UUID, aluno) -> int:
    return c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor)"
        " VALUES (%s, 1, 'desafio_derrota', %s, 0) RETURNING valor",
        (aluno, _ref(1, desafio)),
    ).fetchone()[0]


# O que o gatilho chama e não está em teste aqui: aposta e atraso neutros, piso no padrão.
DUBLES_DO_PISO = """
CREATE OR REPLACE FUNCTION public.fn_fator_de_aposta(p text) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 1::numeric $$;
CREATE OR REPLACE FUNCTION public.fn_fator_de_atraso(a uuid, r text, q timestamptz) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 1::numeric $$;
CREATE OR REPLACE FUNCTION public.app_ranqueada_piso_pontos() RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 0::numeric $$;
CREATE OR REPLACE FUNCTION public.fn_pontos_do_evento(p text) RETURNS numeric LANGUAGE sql STABLE
  AS $$ SELECT CASE p WHEN 'desafio_derrota' THEN -6 WHEN 'desafio_vencido' THEN 12 ELSE 0 END::numeric $$;
"""


def test_piso_olha_o_saldo_de_duelos_e_nao_o_xp_de_estudo() -> None:
    with ev._banco() as c:
        _marca(c)
        c.execute(M.gatilho_novo())
        c.execute(DUBLES_DO_PISO)
        f5.afrouxa(c, "eventos_aluno")
        _desafio(c, DUELO, 1, ev.PROF, ev.A, ev.B)

        # A tem 7 de presença na semente: antes, a derrota descontava desse XP de estudo.
        assert _derrota(c, DUELO, ev.A) == 0

        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor)"
            " VALUES (%s, 1, 'desafio_vencido', %s, 0)",
            (ev.B, _ref(1, DUELO)),
        )
        assert _derrota(c, DUELO, ev.B) == -6


# --- rank -------------------------------------------------------------------------------------


def _pontuacao_no_rank(c, rank_id: int, aluno) -> Decimal:
    return c.execute(
        "SELECT pontuacao FROM public.vw_rank_posicoes_por_classe_todas WHERE rank_id = %s AND id_aluno = %s",
        (rank_id, aluno),
    ).fetchone()[0]


def test_rank_pontuacao_ignora_duelo_e_ranqueada_conta() -> None:
    with rkw._banco() as c:
        _marca(c)
        c.execute(M.view_nova())
        pontuacao, ranqueada = 11, 902  # 11 é o rank por pontuação da turma 1 na semente
        c.execute(
            "INSERT INTO public.rank_tipo (id, nome, criterio) OVERRIDING SYSTEM VALUE VALUES (902, 'R', 'ranqueada')"
        )
        c.execute(
            "INSERT INTO public.ranks (id, tipo_id, classe_id, periodo, inicio) OVERRIDING SYSTEM VALUE VALUES"
            " (%s, 902, 1, '2026.2', now() - interval '1 day')",
            (ranqueada,),
        )
        aluno, rival = rkw.PEQUENA[0], rkw.PEQUENA[1]
        base = _pontuacao_no_rank(c, pontuacao, aluno)

        _lado_a_lado(c, 1, aluno, rival, rkw.PROF)

        assert _pontuacao_no_rank(c, pontuacao, aluno) == base + 10
        assert _pontuacao_no_rank(c, ranqueada, aluno) == 50  # os dois têm consequência ranqueada


def test_cliente_le_o_ranking_sem_precisar_de_funcao_nova() -> None:
    with rkw._banco() as c:
        _marca(c)
        c.execute(M.view_nova())

        assert rkw._le_ranking(c, rkw.ALUNO)  # 42501 aqui é a regressão de 29/10


# --- a migration inteira ----------------------------------------------------------------------


def _instala_o_que_ela_substitui(c) -> None:
    for sql in (
        peso.REFERENCIA,
        peso.RESOLVE,
        *f5.sql_de(peso.M06),
        peso.M10.NOTA,
        peso.GRANTS,
        *f5.sql_de(peso.M),
        *f5.sql_de(faixas.M),
    ):
        c.execute(sql)


def test_upgrade_e_downgrade_inteiros_sobre_dado_existente() -> None:
    """A API aplica a migration ao subir: um passo que falhe aqui é 502 no deploy."""
    with rkw._banco() as c:
        _instala_o_que_ela_substitui(c)
        aluno, rival = rkw.PEQUENA[0], rkw.PEQUENA[1]
        _desafio(c, DUELO, 1, rkw.PROF, aluno, rival)
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor)"
            " VALUES (%s, 1, 'desafio_vencido', %s, 40)",
            (aluno, _ref(1, DUELO)),
        )
        c.execute("UPDATE public.classe SET xp_peso_nota_pct = 50, xp_meta_nota = 100 WHERE id = 1")
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 6 WHERE aluno_id = %s AND classe_id = 1', (aluno,))
        rank = 11
        antes = _pontuacao_no_rank(c, rank, aluno)
        nota_antes = c.execute(
            "SELECT nota_final FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = 1", (aluno,)
        ).fetchone()[0]

        for sql in f5.sql_de(M):
            c.execute(sql)

        assert _pontuacao_no_rank(c, rank, aluno) == antes - 40
        nota_depois = c.execute(
            "SELECT nota_final FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = 1", (aluno,)
        ).fetchone()[0]
        assert nota_depois < nota_antes

        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)

        assert _pontuacao_no_rank(c, rank, aluno) == antes
        assert c.execute(
            "SELECT nota_final FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = 1", (aluno,)
        ).fetchone()[0] == nota_antes
        assert not c.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'eventos_aluno' AND column_name = 'fora_do_xp'"
        ).fetchone()

        for sql in f5.sql_de(M):  # e sobe de novo depois de descer
            c.execute(sql)
        assert _pontuacao_no_rank(c, rank, aluno) == antes - 40

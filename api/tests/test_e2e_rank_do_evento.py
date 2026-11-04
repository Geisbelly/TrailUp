"""`20261104_01`: rank do evento, com inscrição, num Postgres de verdade (#155, fase 2).

Monta o ranking como o e2e do wrapper (`20261029_04`) e põe por cima o que a migration substitui: a
fase 1 (`20261103_15`), o abrir/encerrar da `20261025_04` com a varredura, a guarda de
`eventos_classe` da `20261017_09` e a de `ranks` da `20261021_16`. A apuração é um dublê que credita
1000 pontos a cada aluno da turma: é o que prova que o crédito do evento fica fora do rank.

O papel de cliente é de verdade (`SET LOCAL ROLE` + claims). Roda contra Postgres LOCAL
(`TRAILUP_E2E_RETENCAO_DATABASE_URL`). Dados sintéticos.
"""

from __future__ import annotations

import json
import re
import uuid
from contextlib import contextmanager
from decimal import Decimal

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_duelo_fora_do_xp as duelo
from tests import test_e2e_ranking_le_config_por_wrapper as rkw

pytestmark = [f5.e2e]

if f5.DSN:
    import psycopg

M = f5.modulo("20261104_01_rank_do_evento.py")
M0425 = f5.modulo("20261025_04_evento_abre_e_encerra_no_horario.py")
M1016 = f5.modulo("20261021_16_rank_periodo_manual.py")
M1017 = f5.modulo("20261017_01_eventos_classe_tabela.py")

PROF = rkw.PROF
PEQUENA = rkw.PEQUENA  # turma 1: 3 alunos (30, 20, 10 pontos)
GRANDE = rkw.GRANDE  # turma 2: 9 alunos (90 ... 10)

TIPO_PONTUACAO, TIPO_RANQUEADA, TIPO_MISSOES = 1, 903, 904

_TEXTO_2403 = (f5.VERSOES / "20261024_03_retencao_e_expurgo.py").read_text(encoding="utf-8")
RETENCAO = re.search(r"CREATE TABLE IF NOT EXISTS public\.retencao_politica \(.*?\n\);", _TEXTO_2403, re.S).group(0)

_TEXTO_1701 = (f5.VERSOES / "20261017_01_eventos_classe_tabela.py").read_text(encoding="utf-8")
GATILHO_EVENTO = re.search(r"CREATE TRIGGER trg_eventos_classe_guarda.*?;", _TEXTO_1701, re.S).group(0)
RLS_EVENTO = re.search(
    r"ALTER TABLE public\.eventos_classe ENABLE ROW LEVEL SECURITY;.*?"
    r"GRANT SELECT, INSERT, UPDATE, DELETE ON public\.eventos_classe TO authenticated;",
    _TEXTO_1701,
    re.S,
).group(0)

# A apuração de verdade está no e2e dos pontos do evento. Aqui só importa QUANDO o crédito nasce.
APURAR_DUBLE = """
CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar(p_evento_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
BEGIN
  INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, classe_id)
  SELECT ca.aluno_id, 'evento_classe_pontos', 'classe:' || e.classe_id || ':evento:' || e.id, 1000, e.classe_id
    FROM public.eventos_classe e JOIN public.classe_aluno ca ON ca.classe_id = e.classe_id
   WHERE e.id = p_evento_id;
  RETURN 0;
END $f$;
"""

TIPOS = f"""
INSERT INTO public.rank_tipo (id, nome, criterio) OVERRIDING SYSTEM VALUE VALUES
  ({TIPO_RANQUEADA}, 'Ranqueada', 'ranqueada'), ({TIPO_MISSOES}, 'Missões', 'missoes');
"""


def _instala_o_que_ela_substitui(c) -> None:
    c.execute(RETENCAO)
    duelo._marca(c)
    c.execute(duelo.M.view_nova())
    c.execute(M0425.COLUNA)
    c.execute(M0425.CONGELAR)
    c.execute(APURAR_DUBLE)
    c.execute(M0425.MIOLOS)
    c.execute(M0425.VARREDURA)
    c.execute(M.guarda_evento_antiga())
    c.execute(GATILHO_EVENTO)
    c.execute(RLS_EVENTO)
    c.execute(M1016.GUARDA)
    c.execute(M1016.NOVO_PERIODO)
    c.execute(TIPOS)


@contextmanager
def _banco(aplica: bool = True):
    with rkw._banco() as c:
        _instala_o_que_ela_substitui(c)
        if aplica:
            for sql in f5.sql_de(M):
                c.execute(sql)
        yield c


def _evento(c, classe: int, *, pecas=("arena",), criterios=(), inicio="-1 day", fim="1 day",
            titulo="Maratona de novembro") -> uuid.UUID:
    evento = uuid.uuid4()
    c.execute(
        "INSERT INTO public.eventos_classe (id, classe_id, titulo, inicio, fim, pecas, arena_criterios, criado_por)"
        " VALUES (%s, %s, %s, now() + %s::interval, now() + %s::interval, %s::jsonb, %s::text[], %s)",
        (evento, classe, titulo, inicio, fim, json.dumps(list(pecas)), list(criterios), PROF),
    )
    return evento


def _abrir(c, evento) -> dict:
    return c.execute("SELECT public.fn_evento_classe_abrir_agora(%s)", (evento,)).fetchone()[0]


def _ranks_do_evento(c, evento) -> dict[int, tuple]:
    return {
        r[0]: r[1:]
        for r in c.execute(
            "SELECT tipo_id, id, periodo, inicio, fim FROM public.ranks WHERE evento_id = %s", (evento,)
        )
    }


def _rank(c, evento, tipo: int = TIPO_PONTUACAO) -> int:
    return _ranks_do_evento(c, evento)[tipo][0]


def _como_cliente(c, uid, papel: str = "authenticated") -> None:
    rkw._como_cliente(c, uid, papel)


def _rpc(c, uid, funcao: str, evento) -> dict:
    with c.transaction():
        _como_cliente(c, uid)
        return c.execute(f"SELECT public.{funcao}(%s)", (evento,)).fetchone()[0]


def _inscreve(c, evento, *alunos) -> None:
    for aluno in alunos:
        _rpc(c, aluno, "evento_classe_inscrever", evento)


def _posicoes(c, rank_id: int) -> dict:
    return {
        r[0]: (r[1], r[2], r[3])
        for r in c.execute(
            "SELECT id_aluno, posicao, pontuacao, percentual_do_lider"
            " FROM public.vw_rank_posicoes_por_classe_todas WHERE rank_id = %s",
            (rank_id,),
        )
    }


# --- abrir e encerrar -----------------------------------------------------------------------------


def test_abrir_cria_um_rank_por_criterio_com_a_janela_do_evento() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao", "ranqueada"), titulo="  " + "M" * 60 + "  ")
        assert _abrir(c, evento)["ranks"] == 2

        ranks = _ranks_do_evento(c, evento)
        assert set(ranks) == {TIPO_PONTUACAO, TIPO_RANQUEADA}
        inicio, fim = c.execute("SELECT inicio, fim FROM public.eventos_classe WHERE id = %s", (evento,)).fetchone()
        for _, periodo, r_inicio, r_fim in ranks.values():
            assert (r_inicio, r_fim) == (inicio, fim)
            assert periodo == "M" * 40  # título cortado em 40, sem os espaços

        # Abrir de novo não cria nada (o miolo devolve `novo: false` antes).
        assert _abrir(c, evento)["novo"] is False
        assert len(_ranks_do_evento(c, evento)) == 2


def test_arena_sem_criterio_vale_ranqueada_e_sem_arena_nao_tem_rank() -> None:
    with _banco() as c:
        sem_criterio = _evento(c, 1)
        _abrir(c, sem_criterio)
        assert set(_ranks_do_evento(c, sem_criterio)) == {TIPO_RANQUEADA}

        sem_arena = _evento(c, 1, pecas=("missoes",))
        _abrir(c, sem_arena)
        assert _ranks_do_evento(c, sem_arena) == {}


def test_criterio_sem_tipo_e_pulado_sem_impedir_a_abertura() -> None:
    with _banco() as c:
        c.execute("DELETE FROM public.rank_tipo WHERE id = %s", (TIPO_MISSOES,))
        evento = _evento(c, 1, criterios=("pontuacao", "missoes"))
        assert _abrir(c, evento)["status"] == "aberto"
        assert set(_ranks_do_evento(c, evento)) == {TIPO_PONTUACAO}


def test_a_varredura_abre_o_agendado_com_o_rank() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",))
        c.execute("UPDATE public.eventos_classe SET abrir_no_inicio = true WHERE id = %s", (evento,))
        resultado = c.execute("SELECT public.fn_eventos_classe_varrer()").fetchone()[0]
        assert (resultado["abertos"], resultado["falhas"]) == (1, 0)
        assert set(_ranks_do_evento(c, evento)) == {TIPO_PONTUACAO}


def test_encerrar_antes_da_hora_encurta_o_rank_e_o_credito_fica_fora() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",))
        _abrir(c, evento)
        _inscreve(c, evento, *PEQUENA)
        rank = _rank(c, evento)
        antes = _posicoes(c, rank)

        c.execute("SELECT public.fn_evento_classe_encerrar_agora(%s)", (evento,))

        fim_rank, encerrado = c.execute(
            "SELECT r.fim, e.encerrado_em FROM public.ranks r JOIN public.eventos_classe e ON e.id = r.evento_id"
            " WHERE r.id = %s",
            (rank,),
        ).fetchone()
        assert fim_rank == encerrado
        # o dublê creditou 1000 a cada um; nada disso entra no rank do evento
        assert c.execute("SELECT count(*) FROM public.eventos_aluno WHERE tipo = 'evento_classe_pontos'").fetchone()[0] == 3
        assert _posicoes(c, rank) == antes


def test_encerrar_antes_de_comecar_nao_quebra_a_janela() -> None:
    with _banco() as c:
        evento = _evento(c, 1, inicio="1 day", fim="2 days", criterios=("pontuacao",))
        _abrir(c, evento)
        c.execute("SELECT public.fn_evento_classe_encerrar_agora(%s)", (evento,))
        inicio, fim = c.execute("SELECT inicio, fim FROM public.ranks WHERE evento_id = %s", (evento,)).fetchone()
        assert fim == inicio


# --- a view -----------------------------------------------------------------------------------------


def test_so_inscrito_aparece_e_quem_sai_some() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",))
        _abrir(c, evento)
        rank = _rank(c, evento)
        assert _posicoes(c, rank) == {}

        _inscreve(c, evento, PEQUENA[1], PEQUENA[2])
        posicoes = _posicoes(c, rank)
        assert set(posicoes) == {PEQUENA[1], PEQUENA[2]}
        assert posicoes[PEQUENA[1]][:2] == (1, Decimal(20))  # o primeiro da turma não entrou

        assert _rpc(c, PEQUENA[1], "evento_classe_sair", evento) == {"inscrito": False, "novo": True}
        assert set(_posicoes(c, rank)) == {PEQUENA[2]}
        assert _posicoes(c, rank)[PEQUENA[2]][0] == 1


def test_duelo_conta_no_rank_do_evento_e_nao_no_da_turma() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",))
        _abrir(c, evento)
        aluno, rival = PEQUENA[0], PEQUENA[1]
        _inscreve(c, evento, aluno)
        rank = _rank(c, evento)
        no_evento = _posicoes(c, rank)[aluno][1]
        na_turma = duelo._pontuacao_no_rank(c, 11, aluno)

        duelo._lado_a_lado(c, 1, aluno, rival, PROF)  # duelo 40 + cooperativo 10

        assert _posicoes(c, rank)[aluno][1] == no_evento + 50
        assert duelo._pontuacao_no_rank(c, 11, aluno) == na_turma + 10


def test_percentual_so_aparece_com_8_inscritos() -> None:
    with _banco() as c:
        evento = _evento(c, 2, criterios=("pontuacao",))
        _abrir(c, evento)
        rank = _rank(c, evento)

        _inscreve(c, evento, *GRANDE[:7])
        assert {p[2] for p in _posicoes(c, rank).values()} == {None}

        _inscreve(c, evento, GRANDE[7])
        percentuais = {p[2] for p in _posicoes(c, rank).values()}
        assert None not in percentuais and Decimal(100) in percentuais


def test_corte_de_visibilidade_vale_no_rank_do_evento() -> None:
    with _banco() as c:
        c.execute(
            "INSERT INTO public.app_config (chave, valor, descricao, publico)"
            " VALUES ('rank_limite_visivel', '3', 't', true)"
            " ON CONFLICT (chave) DO UPDATE SET valor = '3'"
        )
        evento = _evento(c, 2, criterios=("pontuacao",))
        _abrir(c, evento)
        rank = _rank(c, evento)
        _inscreve(c, evento, *GRANDE)
        ultimo = GRANDE[-1]

        visiveis = {aluno for r, _, _, aluno in rkw._le_ranking(c, ultimo) if r == rank}
        assert visiveis == {*GRANDE[:3], ultimo}
        professor = {aluno for r, _, _, aluno in rkw._le_ranking(c, PROF) if r == rank}
        assert professor == set(GRANDE)


def test_ranks_sem_evento_nao_mudam_linha_a_linha() -> None:
    consulta = "SELECT * FROM public.vw_rank_posicoes_por_classe_todas ORDER BY rank_id, id_aluno"
    with _banco(aplica=False) as c:
        antes = c.execute(consulta).fetchall()
    with _banco() as c:
        _abrir(c, _evento(c, 1, criterios=("pontuacao", "ranqueada")))
        depois = [
            r for r in c.execute(consulta).fetchall()
            if not c.execute("SELECT evento_id FROM public.ranks WHERE id = %s", (r[0],)).fetchone()[0]
        ]
    assert antes and depois == antes


def test_view_nao_ganha_funcao_e_segue_sem_grant_para_o_cliente() -> None:
    with _banco() as c:
        definicao = c.execute(
            "SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)"
        ).fetchone()[0]
        assert "evento_inscricoes" in definicao
        for papel in ("anon", "authenticated"):
            assert not c.execute(
                "SELECT has_table_privilege(%s, 'public.vw_rank_posicoes_por_classe_todas', 'SELECT')", (papel,)
            ).fetchone()[0]
        assert rkw._le_ranking(c, PEQUENA[0])  # 42501 aqui seria a regressão de 29/10


# --- inscrição e RLS, com o papel de verdade --------------------------------------------------------


def test_inscrever_e_idempotente() -> None:
    with _banco() as c:
        evento = _evento(c, 1)
        _abrir(c, evento)
        assert _rpc(c, PEQUENA[0], "evento_classe_inscrever", evento) == {"inscrito": True, "novo": True}
        assert _rpc(c, PEQUENA[0], "evento_classe_inscrever", evento) == {"inscrito": True, "novo": False}
        assert _rpc(c, PEQUENA[1], "evento_classe_sair", evento) == {"inscrito": False, "novo": False}


@pytest.mark.parametrize(
    ("como", "erro"),
    [
        ("outra_turma", psycopg.errors.InsufficientPrivilege if f5.DSN else None),
        ("professor", psycopg.errors.InsufficientPrivilege if f5.DSN else None),
        ("rascunho", psycopg.errors.InvalidParameterValue if f5.DSN else None),
        ("sem_arena", psycopg.errors.InvalidParameterValue if f5.DSN else None),
        ("encerrado", psycopg.errors.InvalidParameterValue if f5.DSN else None),
    ],
)
def test_inscrever_recusa(como: str, erro) -> None:
    with _banco() as c:
        evento = _evento(c, 1, pecas=("missoes",) if como == "sem_arena" else ("arena",))
        if como != "rascunho":
            _abrir(c, evento)
        if como == "encerrado":
            c.execute("SELECT public.fn_evento_classe_encerrar_agora(%s)", (evento,))
        quem = {"outra_turma": GRANDE[0], "professor": PROF}.get(como, PEQUENA[0])
        with pytest.raises(erro):
            _rpc(c, quem, "evento_classe_inscrever", evento)


def test_sair_de_evento_encerrado_e_recusado() -> None:
    with _banco() as c:
        evento = _evento(c, 1)
        _abrir(c, evento)
        _inscreve(c, evento, PEQUENA[0])
        c.execute("SELECT public.fn_evento_classe_encerrar_agora(%s)", (evento,))
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            _rpc(c, PEQUENA[0], "evento_classe_sair", evento)


def test_cliente_nao_escreve_na_tabela() -> None:
    with _banco() as c:
        evento = _evento(c, 1)
        _abrir(c, evento)
        _inscreve(c, evento, PEQUENA[0])
        for sql in (
            "INSERT INTO public.evento_inscricoes (evento_id, aluno_id) VALUES (%s, %s)",
            "DELETE FROM public.evento_inscricoes WHERE evento_id = %s AND aluno_id = %s",
            "UPDATE public.evento_inscricoes SET inscrito_em = now() WHERE evento_id = %s AND aluno_id = %s",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c, PEQUENA[1] if "INSERT" in sql else PEQUENA[0])
                    c.execute(sql, (evento, PEQUENA[1] if "INSERT" in sql else PEQUENA[0]))


def test_aluno_le_a_propria_inscricao_e_professor_le_as_da_turma() -> None:
    with _banco() as c:
        evento = _evento(c, 1)
        _abrir(c, evento)
        _inscreve(c, evento, PEQUENA[0], PEQUENA[1])

        def _le(uid, papel="authenticated"):
            with c.transaction():
                _como_cliente(c, uid, papel)
                return {r[0] for r in c.execute("SELECT aluno_id FROM public.evento_inscricoes")}

        assert _le(PEQUENA[0]) == {PEQUENA[0]}
        assert _le(PEQUENA[2]) == set()  # 0 aqui não é o bug: ele não se inscreveu
        assert _le(PROF) == {PEQUENA[0], PEQUENA[1]}
        assert _le(GRANDE[0]) == set()
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _le(PEQUENA[0], "anon")


# --- guardas ---------------------------------------------------------------------------------------


def test_rank_do_evento_nao_e_criado_nem_editado_nem_excluido_por_fora() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",))
        _abrir(c, evento)
        rank = _rank(c, evento)
        for sql, args in (
            ("INSERT INTO public.ranks (tipo_id, classe_id, periodo, evento_id) VALUES (2, 1, 'x', %s)", (evento,)),
            ("UPDATE public.ranks SET periodo = 'outro' WHERE id = %s", (rank,)),
            ("UPDATE public.ranks SET evento_id = %s WHERE id = 11", (evento,)),
            ("DELETE FROM public.ranks WHERE id = %s", (rank,)),
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    c.execute(sql, args)

        # apagar o evento leva o rank junto (cascata)
        c.execute("DELETE FROM public.eventos_classe WHERE id = %s", (evento,))
        assert c.execute("SELECT count(*) FROM public.ranks WHERE id = %s", (rank,)).fetchone()[0] == 0


def test_novo_periodo_recusa_rank_de_evento_e_ignora_o_titulo_do_evento() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",), titulo="2026.3")
        _abrir(c, evento)
        rank = _rank(c, evento)
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            with c.transaction():
                _como_cliente(c, PROF)
                c.execute("SELECT public.fn_rank_novo_periodo(%s, '2026.4')", (rank,))
        # o rank da turma (11, pontuação) pode abrir um período com o mesmo nome do evento
        with c.transaction():
            _como_cliente(c, PROF)
            novo = c.execute("SELECT public.fn_rank_novo_periodo(11, '2026.3')").fetchone()[0]
        assert novo["ja_feito"] is False


def test_criterios_congelam_ao_abrir_e_so_valem_os_tres() -> None:
    with _banco() as c:
        evento = _evento(c, 1, criterios=("pontuacao",))
        c.execute("UPDATE public.eventos_classe SET arena_criterios = '{missoes}' WHERE id = %s", (evento,))
        _abrir(c, evento)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                c.execute("UPDATE public.eventos_classe SET arena_criterios = '{ranqueada}' WHERE id = %s", (evento,))
        with pytest.raises(psycopg.errors.CheckViolation):
            _evento(c, 1, criterios=("tempo",))


# --- downgrade ------------------------------------------------------------------------------------


def test_downgrade_volta_e_apaga_os_ranks_de_evento() -> None:
    with _banco() as c:
        antes = c.execute(
            "SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)"
        ).fetchone()[0]
        _abrir(c, _evento(c, 1, criterios=("pontuacao",)))
        with c.transaction():
            for sql in f5.sql_de(M, "downgrade"):
                c.execute(sql)
        depois = c.execute(
            "SELECT pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass)"
        ).fetchone()[0]
        assert "evento_inscricoes" not in depois and "evento_id" not in depois and depois != antes
        assert c.execute("SELECT to_regclass('public.evento_inscricoes')").fetchone()[0] is None
        assert c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'ranks' AND column_name = 'evento_id'"
        ).fetchone()[0] == 0
        # e o caminho antigo volta a funcionar
        evento = uuid.uuid4()
        c.execute(
            "INSERT INTO public.eventos_classe (id, classe_id, titulo, inicio, fim, pecas, criado_por)"
            " VALUES (%s, 1, 'Depois', now(), now() + interval '1 day', '[\"arena\"]', %s)",
            (evento, PROF),
        )
        assert _abrir(c, evento)["novo"] is True

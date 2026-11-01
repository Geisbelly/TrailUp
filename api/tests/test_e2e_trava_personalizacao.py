"""`20261102_05`: trava da personalização no baseline e na turma de comparação (#13).

Banco local com o esqueleto de produção, a cohort da `_02`/`_03` e as policies permissivas que o
aluno tem em produção (`20260913_18` para material e cards, `20261101_11` para as falas do boss).
Nas tabelas que o esqueleto traz sem policy, as permissivas `e2e_*` imitam as de produção: o
aluno lê o que é dele ou da turma dele, o professor dono lê o da turma. A trava é RESTRITIVA, então
o que se põe à prova aqui é que ela só estreita: o aluno da turma retida deixa de ver, e ninguém
passa a ver o que não via.

Tudo é lido como `authenticated` com as claims de quem chama, como o PostgREST faria.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as coorte

M_POSSE = f5.modulo("20260826_09_rls_posse_por_tabela.py")
M_ARTEFATOS_BASE = f5.modulo("20260913_18_aluno_le_artefatos_base.py")
M_BOSS = f5.modulo("20261101_11_falas_do_boss.py")
M_TRAVA = f5.modulo("20261102_05_trava_da_personalizacao.py")

TABELAS = ("conteudo_personalizado", "cards_personalizados", "boss_falas", "personalizacao_jobs")

# O que produção já tem e o esqueleto não: RLS ligada e um caminho permissivo para cada papel.
PERMISSIVAS = """
ALTER TABLE public.conteudo_personalizado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards_personalizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalizacao_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY e2e_professor_sel ON public.conteudo_personalizado FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));
CREATE POLICY e2e_professor_sel ON public.cards_personalizados FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));
CREATE POLICY e2e_minhas_classes_sel ON public.personalizacao_jobs FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_minhas_classes())
         AND (aluno_id IS NULL OR aluno_id = auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor())));
"""


def _banco(*depois: str):
    return f5.banco(
        coorte.GRANTS_SUPABASE, M_POSSE.HELPERS, coorte.APP_E_DEV, coorte.TENTATIVAS, coorte.RETENCAO,
        *f5.sql_de(coorte.M_CATALOGO), *f5.sql_de(coorte.M_COORTE), *f5.sql_de(coorte.M_RPC),
        *f5.sql_de(M_ARTEFATOS_BASE), *f5.sql_de(M_BOSS), PERMISSIVAS, *f5.sql_de(M_TRAVA), *depois,
    )


def _hoje(c) -> date:
    return c.execute("SELECT (now() AT TIME ZONE 'UTC')::date").fetchone()[0]


def _gerado(c) -> None:
    """Em cada turma: base e derivação do material, um card, as falas do boss e um job."""
    for tabela in ("conteudos", "cards_personalizados", "personalizacao_jobs"):
        f5.afrouxa(c, tabela)
    c.execute(
        "INSERT INTO public.conteudos (id, topico_id, titulo, tipo) VALUES (100, 10, 'C1', 'texto'), (200, 20, 'C2', 'texto')"
    )
    for classe, topico, conteudo, aluno in ((f5.TURMA, 10, 100, f5.A), (coorte.TURMA2, 20, 200, f5.B)):
        c.execute(
            "INSERT INTO public.conteudo_personalizado (aluno_id, classe_id, topico_id, ciclo_id, status, gerado_em, materiais)"
            " VALUES (NULL, %s, %s, 'base', 'pronto', now(), '{}'), (%s, %s, %s, 'aluno', 'pronto', now(), '{}')",
            (classe, topico, aluno, classe, topico),
        )
        c.execute(
            "INSERT INTO public.cards_personalizados (aluno_id, classe_id, topico_id, ciclo_id, titulo, descricao)"
            " VALUES (NULL, %s, %s, 'base', 'Card', 'D')",
            (classe, topico),
        )
        c.execute(
            "INSERT INTO public.boss_falas (classe_id, topico_id, conteudo_id, perfil, nome, falas, source_hash, versao)"
            " VALUES (%s, %s, %s, 'seeker', 'Boss', '{}', 'h', 'v1')",
            (classe, topico, conteudo),
        )
        c.execute(
            "INSERT INTO public.personalizacao_jobs (kind, classe_id, trigger_source) VALUES ('class-delta', %s, 'db')",
            (classe,),
        )


def _coorte(c, classe: int, braco: str, corte: date, fim: date | None) -> None:
    coorte._coorte(c, classe, braco, str(corte - timedelta(days=7)), str(corte), str(fim) if fim else None)


def _vistos(c, quem, classe: int) -> dict[str, int]:
    return {
        tabela: coorte._como(c, quem, f"SELECT count(*) FROM public.{tabela} WHERE classe_id = %s", (classe,))[0][0]
        for tabela in TABELAS
    }


TUDO_DA_TURMA_PARA_O_ALUNO = {
    "conteudo_personalizado": 2, "cards_personalizados": 1, "boss_falas": 1, "personalizacao_jobs": 1,
}
NADA = dict.fromkeys(TABELAS, 0)


# ------------------------------------------------------------------------------------------ RLS


@f5.e2e
def test_aluno_de_turma_retida_nao_ve_o_que_a_ia_gerou_e_o_professor_ve() -> None:
    with _banco() as c:
        coorte._semear(c)
        _gerado(c)
        hoje = _hoje(c)
        # Antes do registro: tudo visível (base + derivação do A, card, falas, job).
        assert _vistos(c, f5.A, f5.TURMA) == TUDO_DA_TURMA_PARA_O_ALUNO
        # Registrada hoje com baseline daqui a 3 dias: retida desde já (pré-estudo).
        _coorte(c, f5.TURMA, "intervencao", hoje + timedelta(days=10), None)
        assert _vistos(c, f5.A, f5.TURMA) == NADA
        assert _vistos(c, f5.B, f5.TURMA) == NADA
        # O professor dono continua vendo: precisa revisar o que vai ser liberado.
        assert _vistos(c, f5.PROF, f5.TURMA) == TUDO_DA_TURMA_PARA_O_ALUNO
        # A outra turma do B não está no estudo: ele segue vendo a base, a derivação dele e o resto.
        assert _vistos(c, f5.B, coorte.TURMA2) == TUDO_DA_TURMA_PARA_O_ALUNO


@f5.e2e
def test_trava_restritiva_nao_abre_nada_para_quem_nao_via() -> None:
    with _banco() as c:
        coorte._semear(c)
        _gerado(c)
        hoje = _hoje(c)
        _coorte(c, f5.TURMA, "intervencao", hoje + timedelta(days=10), None)
        # A não está na turma 2; o outro professor não é dono de nenhuma das duas.
        assert _vistos(c, f5.A, coorte.TURMA2) == NADA
        assert _vistos(c, coorte.OUTRO_PROF, f5.TURMA) == NADA
        assert _vistos(c, coorte.OUTRO_PROF, coorte.TURMA2) == NADA
        # Derivação de outro aluno, na turma não retida: continua invisível para o C.
        assert coorte._como(
            c, f5.C, "SELECT count(*) FROM public.conteudo_personalizado WHERE aluno_id = %s", (f5.B,)
        )[0][0] == 0


@pytest.mark.parametrize(
    ("braco", "corte", "fim", "retida"),
    [
        ("intervencao", 1, None, True),  # o corte é amanhã
        ("intervencao", 0, None, False),  # o corte é hoje: liberada
        ("intervencao", -20, -1, False),  # estudo encerrado
        ("comparacao", -10, None, True),  # comparação sem fim: segue retida
        ("comparacao", -10, 0, True),  # o fim é hoje: ainda retida
        ("comparacao", -10, -1, False),  # o fim foi ontem: liberada (lista de espera)
    ],
)
@f5.e2e
def test_liberacao_pela_data_sem_job(braco: str, corte: int, fim: int | None, retida: bool) -> None:
    with _banco() as c:
        coorte._semear(c)
        _gerado(c)
        hoje = _hoje(c)
        _coorte(c, f5.TURMA, braco, hoje + timedelta(days=corte), hoje + timedelta(days=fim) if fim is not None else None)
        assert _vistos(c, f5.A, f5.TURMA) == (NADA if retida else TUDO_DA_TURMA_PARA_O_ALUNO)
        assert c.execute("SELECT public.estudo_personalizacao_retida(%s)", (f5.TURMA,)).fetchone()[0] is retida


@f5.e2e
def test_helper_so_fala_das_turmas_do_proprio_aluno_e_a_api_tem_a_sua() -> None:
    with _banco() as c:
        coorte._semear(c)
        hoje = _hoje(c)
        _coorte(c, f5.TURMA, "intervencao", hoje + timedelta(days=10), None)
        _coorte(c, coorte.TURMA2, "comparacao", hoje + timedelta(days=10), None)
        retidas = "SELECT array_agg(x ORDER BY x) FROM public.app_classes_retidas_do_aluno() x"
        assert coorte._como(c, f5.A, retidas)[0][0] == [f5.TURMA]  # A só está na turma 1
        assert coorte._como(c, f5.B, retidas)[0][0] == [f5.TURMA, coorte.TURMA2]
        assert coorte._como(c, f5.PROF, retidas)[0][0] is None  # professor não é aluno de nenhuma
        # A função da API e a regra não têm EXECUTE para cliente: diriam quem é o grupo de comparação.
        for sql in (
            "SELECT public.estudo_personalizacao_retida(1)",
            "SELECT public.estudo_coorte_retem('comparacao', current_date, NULL, 'UTC')",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                coorte._como(c, f5.A, sql)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            coorte._anon(c, "SELECT public.app_classes_retidas_do_aluno()")
        assert c.execute("SELECT public.estudo_personalizacao_retida(%s)", (f5.TURMA,)).fetchone()[0] is True
        assert c.execute("SELECT public.estudo_personalizacao_retida(%s)", (3,)).fetchone()[0] is False


@f5.e2e
def test_trava_e_restritiva_e_so_de_select() -> None:
    """Restritiva: só estreita as permissivas. Só de SELECT: escrita do aluno não muda."""
    with _banco() as c:
        policies = c.execute(
            "SELECT tablename, permissive, cmd FROM pg_policies WHERE policyname = 'estudo_trava_sel' ORDER BY 1"
        ).fetchall()
        assert policies == [(t, "RESTRICTIVE", "SELECT") for t in sorted(TABELAS)]


# ------------------------------------------------------------------------------------------ RPC


@f5.e2e
def test_contaminacao_vira_exposicao_medida() -> None:
    with _banco() as c:
        coorte._semear(c)
        coorte._dados_da_turma1(c)
        c.execute("UPDATE public.estudo_coorte SET registrado_em = '2026-10-01T00:00:00Z' WHERE classe_id = %s", (f5.TURMA,))
        coorte._n_minimo(c, 1)
        t = coorte._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        # Material pronto em 10/10 é o esperado agora; o que contamina é o A ter estudado material
        # personalizado em 08/10, dentro do baseline retido.
        assert t["contaminacao"] == {
            "material_pronto_antes_do_corte": True,
            "exposicao_antes_do_registro": False,
            "comparacao_recebeu_personalizacao": None,
            "baseline_contaminado": True,
        }
        assert t["trava"] == {"retida_agora": False, "libera_em": "2026-10-18"}

        # Sem a exposição, o material pronto antes do corte não acusa mais nada.
        c.execute("DELETE FROM public.telemetria_time_metric_entries WHERE scope = 'material'")
        t = coorte._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        assert t["contaminacao"]["baseline_contaminado"] is False
        assert t["contaminacao"]["material_pronto_antes_do_corte"] is True

        # Exposição antes de a turma entrar no estudo: efeito de antes, não contaminação do baseline.
        s = uuid.uuid4()
        f5.sessao(c, s, f5.A, "2026-09-20T09:00:00Z", None)
        f5.tempo(c, s, f5.A, "material", 10, 60, 0, "2026-09-20T10:00:00Z")
        t = coorte._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        assert t["contaminacao"]["exposicao_antes_do_registro"] is True
        assert t["contaminacao"]["baseline_contaminado"] is False


@f5.e2e
def test_comparacao_contaminada_so_por_exposicao_e_limitacoes_novas() -> None:
    with _banco() as c:
        coorte._semear(c)
        coorte._dados_da_turma1(c)
        coorte._coorte(c, coorte.TURMA2, "comparacao", "2026-10-04", "2026-10-18", "2026-10-31", rotulo="B")
        # Material pronto na comparação, como a geração continua: não acusa.
        c.execute(
            "INSERT INTO public.conteudo_personalizado (classe_id, topico_id, ciclo_id, status, gerado_em, materiais)"
            " VALUES (%s, 20, 'ciclo-2', 'pronto', '2026-10-20T10:00:00Z', '{}')",
            (coorte.TURMA2,),
        )
        coorte._n_minimo(c, 1)
        r = coorte._rpc(c, f5.PROF, [f5.TURMA, coorte.TURMA2])
        comp = r["coortes"][1]
        assert comp["contaminacao"]["comparacao_recebeu_personalizacao"] is False
        assert comp["trava"] == {"retida_agora": False, "libera_em": "2026-11-01"}

        # O B estudou material personalizado na comparação, depois do corte: escapou.
        s = uuid.uuid4()
        f5.sessao(c, s, f5.B, "2026-10-20T09:00:00Z", None)
        f5.tempo(c, s, f5.B, "material", 20, 60, 0, "2026-10-20T10:00:00Z")
        c.execute("UPDATE public.telemetria_sessoes SET classe_id = %s WHERE id = %s", (coorte.TURMA2, s))
        for tabela in ("telemetria_time_metric_entries", "telemetria_lotes"):
            c.execute(f"UPDATE public.{tabela} SET classe_id = %s WHERE sessao_id = %s", (coorte.TURMA2, s))
        r = coorte._rpc(c, f5.PROF, [f5.TURMA, coorte.TURMA2])
        assert r["coortes"][1]["contaminacao"]["comparacao_recebeu_personalizacao"] is True

        limitacoes = r["limitacoes"]
        assert not any(item.startswith("sem trava") for item in limitacoes)
        assert any("retida desde o registro" in item for item in limitacoes)
        assert any("regras fixas do jogo" in item for item in limitacoes)


# ------------------------------------------------------------------------------------- downgrade


@f5.e2e
def test_downgrade_volta_a_rpc_da_03_e_tira_a_trava() -> None:
    with _banco(*f5.sql_de(M_TRAVA, "downgrade")) as c:
        assert c.execute("SELECT count(*) FROM pg_policies WHERE policyname = 'estudo_trava_sel'").fetchone()[0] == 0
        for fn in ("estudo_coorte_retem", "app_classes_retidas_do_aluno", "estudo_personalizacao_retida"):
            assert c.execute("SELECT to_regproc(%s)", (f"public.{fn}",)).fetchone()[0] is None
        coorte._semear(c)
        coorte._dados_da_turma1(c)
        coorte._n_minimo(c, 1)
        t = coorte._rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        assert set(t["contaminacao"]) == {
            "material_pronto_antes_do_corte", "comparacao_recebeu_personalizacao", "baseline_contaminado",
        }
        assert "trava" not in t

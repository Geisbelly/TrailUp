"""`20261116_01`: cobertura do material (texto, áudio e deck nativo) num Postgres local descartável.

Aluno A, turma 1, tópico 10. Os números esperados estão calculados à mão:

| material      | tipo                  | lotes                                                       | cobertura |
|---------------|-----------------------|-------------------------------------------------------------|-----------|
| `m:texto`     | `markdown`            | 3000/1000 e rolou 500; 3000/1000 e 1500; build velho, 2000 | 1500 ÷ 2000 = 0,75 |
| `m:curto`     | `texto`               | conteúdo 600 numa janela de 800                             | 1 (cabe inteiro) |
| `m:audio`     | `audio`               | 200 s, posição 50; 200 s, posição 150                       | 0,75 |
| `m:passou`    | `audio`               | 200 s, posição 250                                          | 1 (limitado) |
| `m:slides`    | `apresentacao-slides` | 1 de 4; 3 de 4                                              | 0,75 |
| `m:pdf`       | `pdf`                 | com alturas                                                 | nula: tipo sem medida |
| `m:velho`     | `audio`               | build anterior, sem medida                                  | nula, não zero |
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M = f5.modulo("20261116_01_cobertura_do_material.py")
ALUNOS_DO_PROF = _trecho(
    "20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_alunos_do_professor()", "$$;"
)
# A RLS de produção da tabela (`20260831_01`): o aluno lê o próprio, o professor os alunos dele.
RLS_TEMPO = """
ALTER TABLE public.telemetria_time_metric_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY telemetria_time_metric_entries_select_own ON public.telemetria_time_metric_entries
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
CREATE POLICY telemetria_time_metric_entries_professor_sel ON public.telemetria_time_metric_entries
  FOR SELECT TO authenticated USING (aluno_id IN (SELECT public.app_alunos_do_professor()));
"""


def _banco():
    return f5.banco(
        e.GRANTS_SUPABASE, POSSE, ALUNOS_DO_PROF, RLS_TEMPO, e.APP_E_DEV, e.RETENCAO,
        *f5.sql_de(e.M_CATALOGO), *f5.sql_de(M),
    )


def _lote(c, sid, chave: str, tipo: str, quando: str, profundidade: float = 0, ativo: float = 60,
          **medidas) -> None:
    lote = uuid.uuid4()
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, topico_id, screen_name, route_name,"
        " flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,"
        " scroll_distance_px, max_depth_px, payload)"
        " VALUES (%s, %s, %s, %s, 10, 't', 'r', 'interval', %s, 0, %s, %s, 0, 0, 0, 0, '{}')",
        (lote, sid, f5.A, f5.TURMA, quando, ativo, ativo),
    )
    colunas = ", ".join(medidas)
    marcas = ", ".join(["%s"] * len(medidas))
    c.execute(
        "INSERT INTO public.telemetria_time_metric_entries (lote_id, sessao_id, aluno_id, classe_id, topico_id,"
        " conteudo_id, scope, item_key, material_key, material_tipo, dwell_sec, active_sec, idle_sec, max_depth_px,"
        f" captured_at{', ' + colunas if colunas else ''})"
        f" VALUES (%s, %s, %s, %s, 10, 5, 'material', 'content:5', %s, %s, %s, %s, 0, %s, %s{', ' + marcas if marcas else ''})",
        (lote, sid, f5.A, f5.TURMA, chave, tipo, ativo, ativo, profundidade, quando, *medidas.values()),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{e.OUTRO_PROF}', 'p2@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{e.OUTRO_PROF}', 'Outro');
"""
    )
    s = uuid.uuid4()
    f5.sessao(c, s, f5.A, "2026-11-10T10:00:00Z", None)
    _lote(c, s, "m:texto", "markdown", "2026-11-10T10:01:00Z", 500, conteudo_altura_px=3000, janela_altura_px=1000)
    _lote(c, s, "m:texto", "markdown", "2026-11-10T10:02:00Z", 1500, conteudo_altura_px=3000, janela_altura_px=1000)
    _lote(c, s, "m:texto", "markdown", "2026-11-10T10:03:00Z", 2000)  # build velho: a rolagem não entra
    _lote(c, s, "m:curto", "texto", "2026-11-10T10:04:00Z", 0, conteudo_altura_px=600, janela_altura_px=800)
    _lote(c, s, "m:audio", "audio", "2026-11-10T10:05:00Z", midia_duracao_seg=200, midia_posicao_max_seg=50)
    _lote(c, s, "m:audio", "audio", "2026-11-10T10:06:00Z", ativo=90, midia_duracao_seg=200, midia_posicao_max_seg=150)
    _lote(c, s, "m:passou", "audio", "2026-11-10T10:07:00Z", midia_duracao_seg=200, midia_posicao_max_seg=250)
    _lote(c, s, "m:slides", "apresentacao-slides", "2026-11-10T10:08:00Z", slides_vistos=1, slides_total=4)
    _lote(c, s, "m:slides", "apresentacao-slides", "2026-11-10T10:09:00Z", slides_vistos=3, slides_total=4)
    _lote(c, s, "m:pdf", "pdf", "2026-11-10T10:10:00Z", 900, conteudo_altura_px=3000, janela_altura_px=1000)
    _lote(c, s, "m:velho", "audio", "2026-11-10T10:11:00Z")


def _cobertura(c, quem):
    linhas = e._como(
        c, quem,
        "SELECT material_key, tipo_cobertura, cobertura, tempo_ativo_seg FROM public.vw_metricas_cobertura_material",
    )
    return {chave: (tipo, None if cob is None else float(cob), float(ativo)) for chave, tipo, cob, ativo in linhas}


@f5.e2e
def test_fracao_por_tipo_de_material() -> None:
    with _banco() as c:
        _semear(c)
        r = _cobertura(c, f5.A)
        assert r == {
            "m:texto": ("texto", 0.75, 180.0),
            "m:curto": ("texto", 1.0, 60.0),
            "m:audio": ("audio", 0.75, 150.0),
            "m:passou": ("audio", 1.0, 60.0),
            "m:slides": ("apresentacao", 0.75, 120.0),
            "m:pdf": (None, None, 60.0),
            "m:velho": ("audio", None, 60.0),
        }


@f5.e2e
def test_aluno_le_o_proprio_e_o_professor_os_alunos_dele() -> None:
    with _banco() as c:
        _semear(c)
        assert len(_cobertura(c, f5.PROF)) == 7
        assert _cobertura(c, f5.B) == {}
        assert _cobertura(c, e.OUTRO_PROF) == {}
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            e._anon(c, "SELECT count(*) FROM public.vw_metricas_cobertura_material")


@f5.e2e
def test_view_e_security_invoker_e_o_catalogo_tem_a_chave() -> None:
    with _banco() as c:
        opcoes = c.execute(
            "SELECT reloptions FROM pg_class WHERE relname = 'vw_metricas_cobertura_material'"
        ).fetchone()[0]
        assert "security_invoker=on" in opcoes
        assert c.execute(
            "SELECT publico FROM public.metricas_catalogo WHERE chave = 'prof.cobertura_material'"
        ).fetchone()[0] == ["professor", "dev"]


@f5.e2e
def test_downgrade_tira_as_colunas_e_sobe_de_novo() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        colunas = {
            linha[0]
            for linha in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'telemetria_time_metric_entries'"
            ).fetchall()
        }
        assert not colunas & {nome for nome, _ in M.COLUNAS}
        assert c.execute("SELECT to_regclass('public.vw_metricas_cobertura_material')").fetchone()[0] is None
        for sql in f5.sql_de(M):
            c.execute(sql)


def test_sql_sem_porcento_nem_parametro_acidental_e_cadeia() -> None:
    from sqlalchemy import text

    assert M.down_revision == "20261115_06"
    for sql in (M.ADICIONA, M.VIEW, M.CATALOGO, M.DOWNGRADE):
        assert "%" not in sql
        assert text(sql).compile().params == {}
    assert "WITH (security_invoker = on)" in M.VIEW
    assert "CHECK" not in M.ADICIONA  # medida estranha não pode custar o lote


def test_colunas_da_migration_batem_com_a_api() -> None:
    from app.repositories.telemetria import COLUNAS_DE_COBERTURA

    assert [nome for nome, _ in M.COLUNAS] == [nome for nome, _ in COLUNAS_DE_COBERTURA]
    inteiros = {nome for nome, tipo in M.COLUNAS if tipo == "integer"}
    assert inteiros == {nome for nome, inteiro in COLUNAS_DE_COBERTURA if inteiro}

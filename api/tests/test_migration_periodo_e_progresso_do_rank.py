"""A `20261025_02` define o formato de `ranks.periodo` e tira o percentual do líder onde engana (#155)."""

import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

# O pai vem do arquivo: se outra migration do dia entrar antes, só o `down_revision` muda.
_ARQUIVO = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261025_02_periodo_e_progresso_do_rank.py"
PAI = re.search(r'^down_revision = "([^"]+)"', _ARQUIVO.read_text(encoding="utf-8"), re.M).group(1)


def _sql(intervalo: str, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue().replace("%%", "%")


def _upgrade() -> str:
    return _sql(f"{PAI}:20261025_02")


def _view(sql: str) -> str:
    inicio = sql.index("CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas")
    fim = sql.index("JOIN alunos a ON a.id = o.aluno_id", inicio)
    return sql[inicio : sql.index(";", fim) + 1]


def test_periodo_validado_so_quando_gravado_ou_trocado() -> None:
    sql = _upgrade()
    assert "CREATE TRIGGER trg_ranks_periodo_formato" in sql
    assert "BEFORE INSERT OR UPDATE OF periodo ON public.ranks" in sql
    assert "IF TG_OP = 'UPDATE' AND NEW.periodo IS NOT DISTINCT FROM OLD.periodo THEN" in sql
    assert "NEW.periodo := btrim(NEW.periodo);" in sql
    assert "char_length(NEW.periodo) > 40" in sql
    # a mesma mensagem da RPC `fn_rank_novo_periodo`, que o console já traduz
    assert "'O nome do período vai de 1 a 40 caracteres.' USING ERRCODE = '22023'" in sql
    # sem CHECK: ele seria reavaliado no UPDATE de `fim` de uma linha legada
    assert "ADD CONSTRAINT" not in sql


def test_formato_documentado_na_coluna() -> None:
    sql = _upgrade()
    assert "COMMENT ON COLUMN public.ranks.periodo IS" in sql
    assert "AAAA.S" in sql and "1 a 40 caracteres" in sql


def test_percentual_some_em_elo_rank_pequeno_e_lider_sem_ponto() -> None:
    view = _view(_upgrade())
    assert "WHEN o.criterio = 'elo'::text THEN NULL::numeric" in view
    assert "WHEN count(*) OVER (PARTITION BY o.rank_id) < pcfg.min_participantes THEN NULL::numeric" in view
    assert "WHEN max(o.pontuacao) OVER (PARTITION BY o.rank_id) <= 0::numeric THEN NULL::numeric" in view
    assert "LEAST(GREATEST(round(" in view
    assert "fn_app_config_int('rank_progresso_min_participantes', 8)" in view
    assert "CROSS JOIN progresso_config pcfg" in view


def test_view_mantem_as_colunas_e_o_resto() -> None:
    view = _view(_upgrade())
    for coluna in ("o.rank_id", "o.classe_id", "o.posicao", "a.id AS id_aluno", "a.nome AS nome_aluno",
                   "o.pontuacao", "AS percentual_do_lider", "END AS medalha"):
        assert coluna in view
    assert "WHEN 'elo'::text THEN COALESCE(elo.rating::numeric, ecfg.inicial)" in view
    assert "GRANT" not in view


def test_chave_de_config_privada_e_idempotente() -> None:
    sql = _upgrade()
    assert "('rank_progresso_min_participantes', '8'," in sql
    assert "ON CONFLICT (chave) DO NOTHING" in sql


def test_downgrade_volta_a_view_da_elo() -> None:
    sql = _sql(f"20261025_02:{PAI}", downgrade=True)
    assert "progresso_config" not in sql
    assert "round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)" in sql
    assert "DROP TRIGGER IF EXISTS trg_ranks_periodo_formato ON public.ranks;" in sql
    assert "DELETE FROM public.app_config WHERE chave = 'rank_progresso_min_participantes';" in sql

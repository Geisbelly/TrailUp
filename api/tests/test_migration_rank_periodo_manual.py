"""Fase 5 do plano: rotação manual do ranking (`20261021_16`).

O comportamento foi exercitado num Postgres 17 local com o esqueleto das tabelas envolvidas (ver o
PR): backfill sem mudar posições, duplo clique, posse, guarda do cliente, RLS do pódio e
downgrade/upgrade. Estes testes travam o LUGAR e a FORMA de cada regra no SQL gerado.
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M16 = _modulo("20261021_16_rank_periodo_manual.py")
_M08 = _modulo("20261021_08_telas_eixos_e_missoes.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_15:20261021_16", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_16:20261021_15", sql=True)
    return output.getvalue()


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    return sql[inicio : sql.index("$function$;", inicio)]


def _cte(view: str, nome: str) -> str:
    inicio = view.index(f"{nome} AS (")
    return view[inicio : view.index("\n        ), ", inicio)]


def test_encadeia_depois_da_15_do_pr_567() -> None:
    assert _M16.revision == "20261021_16"
    assert _M16.down_revision == "20261021_15"


def test_janela_no_ranking_com_backfill_que_nao_muda_as_posicoes() -> None:
    sql = _sem_comentarios(_upgrade_sql())
    assert "ADD COLUMN IF NOT EXISTS inicio timestamptz" in sql
    assert "ADD COLUMN IF NOT EXISTS fim timestamptz" in sql
    # Backfill ANTES do NOT NULL, e a partir da criação da turma (não da do ranking).
    backfill = sql.index("UPDATE public.ranks r\n   SET inicio = COALESCE(")
    assert backfill < sql.index("ALTER COLUMN inicio SET NOT NULL")
    trecho = sql[backfill : sql.index("WHERE r.inicio IS NULL", backfill)]
    assert trecho.index("c.created_at") < trecho.index("r.created_at")
    assert "ALTER COLUMN inicio SET DEFAULT now()" in sql
    assert "CHECK (fim IS NULL OR fim >= inicio)" in sql


def test_um_periodo_aberto_por_tipo_e_turma_e_os_repetidos_fecham_antes() -> None:
    sql = _sem_comentarios(_upgrade_sql())
    indice = sql.index("CREATE UNIQUE INDEX IF NOT EXISTS ranks_um_periodo_aberto")
    assert "ON public.ranks (tipo_id, classe_id) WHERE fim IS NULL" in sql[indice:]
    fecha = sql.index("WITH repetidos AS (")
    assert fecha < indice
    # O fechamento dos repetidos congela o pódio deles também, e só depois que a view nova existe.
    assert sql.index("CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas") < fecha
    assert "INSERT INTO public.rank_podio_congelado" in sql[fecha:indice]


def test_a_view_filtra_por_data_so_nos_criterios_de_soma() -> None:
    view = _M16.VIEW
    janela_ts = "e.criado_em >= rj.inicio_utc AND (rj.fim_utc IS NULL OR e.criado_em < rj.fim_utc)"
    assert janela_ts in _cte(view, "eventos_por_rank")
    assert janela_ts in _cte(view, "ranqueada_por_rank")
    missoes = _cte(view, "missoes_por_rank")
    assert "COALESCE(ma.concluida_em, ma.updated_at) >= rj.inicio" in missoes
    assert "COALESCE(ma.concluida_em, ma.updated_at) < rj.fim" in missoes
    # criado_em é timestamp sem fuso gravado em UTC: a janela é convertida, não comparada crua.
    assert "r.inicio AT TIME ZONE 'UTC'::text AS inicio_utc" in view
    # A soma é por ranking (cada um tem a sua janela), não mais por turma.
    assert "LEFT JOIN eventos_por_rank epr ON epr.rank_id = r.id" in view
    assert "LEFT JOIN ranqueada_por_rank rqr ON rqr.rank_id = r.id" in view
    assert "LEFT JOIN missoes_por_rank mpr ON mpr.rank_id = r.id" in view
    # Os de estado continuam lendo classe_aluno, sem janela.
    for ramo in (
        """WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)""",
        """WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)""",
        """WHEN 'acertos'::text THEN COALESCE(ca."acertosPercentual", 0::numeric)""",
    ):
        assert ramo in view


def test_a_view_mantem_as_colunas_e_os_criterios_de_antes() -> None:
    """`CREATE OR REPLACE VIEW` exige as mesmas colunas, e o CASE tem de cobrir os seis critérios."""

    def colunas(sql: str) -> list[str]:
        final = sql[sql.rindex("\n SELECT o.rank_id") :]
        return re.findall(r"AS (\w+)|^\s+o\.(\w+),?$", final, flags=re.M)

    assert colunas(_M16.VIEW) == colunas(_M08._view_com_missoes())
    for criterio in ("percentual", "pontuacao", "tempo", "acertos", "ranqueada", "missoes"):
        assert f"WHEN '{criterio}'::text THEN" in _M16.VIEW
    # A regex que recorta o uuid do desafio não passa do teto de repetição do Postgres (255).
    assert all(int(n) <= 255 for n in re.findall(r"\{(\d+)\}", _M16.VIEW))


def test_podio_congelado_le_com_a_regra_da_view_e_nao_e_escrito_pelo_cliente() -> None:
    sql = _sem_comentarios(_upgrade_sql())
    assert "CREATE TABLE IF NOT EXISTS public.rank_podio_congelado" in sql
    assert "PRIMARY KEY (rank_id, aluno_id)" in sql
    assert "REFERENCES public.ranks(id) ON DELETE CASCADE" in sql
    assert "ALTER TABLE public.rank_podio_congelado ENABLE ROW LEVEL SECURITY" in sql
    politica = sql[sql.index("CREATE POLICY rank_podio_congelado_sel") :]
    politica = politica[: politica.index(";")]
    assert "FOR SELECT TO authenticated" in politica
    assert "classe_id IN (SELECT public.app_minhas_classes())" in politica
    assert "posicao <= public.app_rank_limite_visivel()" in politica
    assert "aluno_id = auth.uid()" in politica
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in politica
    assert "REVOKE ALL ON public.rank_podio_congelado FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON public.rank_podio_congelado TO authenticated" in sql
    assert not re.search(
        r"CREATE POLICY rank_podio_congelado_\w+ ON public\.rank_podio_congelado FOR (INSERT|UPDATE|DELETE)", sql
    )


def test_novo_periodo_e_definer_so_do_professor_e_trava_a_linha() -> None:
    corpo = _sem_comentarios(_funcao(_upgrade_sql(), "fn_rank_novo_periodo"))
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path = public, pg_temp" in corpo
    assert "IF auth.uid() IS NULL THEN" in corpo
    assert "app_classes_do_professor() AS minha(id) WHERE minha.id = v_rank.classe_id" in corpo
    assert "FOR UPDATE" in corpo
    # Ordem: trava -> posse -> nome -> já fechado? -> nome repetido -> congela -> fecha -> abre.
    ordem = [
        "FOR UPDATE",
        "app_classes_do_professor()",
        "char_length(v_periodo) > 40",
        "IF v_rank.fim IS NOT NULL THEN",
        "ERRCODE = '23505'",
        "INSERT INTO public.rank_podio_congelado",
        "UPDATE public.ranks SET fim = now() WHERE id = v_rank.id",
        "INSERT INTO public.ranks (tipo_id, classe_id, periodo, inicio, fim)",
    ]
    posicoes = [corpo.index(trecho) for trecho in ordem]
    assert posicoes == sorted(posicoes)
    # O pódio vem da view crua, só deste ranking.
    assert "FROM public.vw_rank_posicoes_por_classe_todas v\n   WHERE v.rank_id = v_rank.id" in corpo


def test_duplo_clique_devolve_o_periodo_ja_aberto() -> None:
    corpo = _sem_comentarios(_funcao(_upgrade_sql(), "fn_rank_novo_periodo"))
    ja_fechado = corpo[corpo.index("IF v_rank.fim IS NOT NULL THEN") :]
    ja_fechado = ja_fechado[: ja_fechado.index("ERRCODE = '55000'")]
    assert "r.fim IS NULL" in ja_fechado
    assert "r.inicio >= v_rank.fim" in ja_fechado
    assert "lower(btrim(COALESCE(r.periodo, ''))) = lower(v_periodo)" in ja_fechado
    assert "'ja_feito', true" in ja_fechado


def test_so_a_funcao_mexe_na_janela_e_o_fechado_nao_muda() -> None:
    sql = _upgrade_sql()
    guarda = _sem_comentarios(_funcao(sql, "fn_ranks_guarda"))
    assert "current_setting('app.rank_periodo', true)" in guarda
    assert "NEW.inicio := now();\n    NEW.fim := NULL;" in guarda
    assert "IF OLD.fim IS NOT NULL THEN" in guarda
    assert "NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fim IS DISTINCT FROM OLD.fim" in guarda
    assert "BEFORE INSERT OR UPDATE OR DELETE ON public.ranks" in sql
    corpo = _funcao(sql, "fn_rank_novo_periodo")
    liga = corpo.index("set_config('app.rank_periodo', 'on', true)")
    desliga = corpo.index("set_config('app.rank_periodo', '', true)")
    assert liga < corpo.index("UPDATE public.ranks SET fim = now()") < desliga


def test_permissoes_da_funcao() -> None:
    sql = _sem_comentarios(_upgrade_sql())
    assert "REVOKE ALL ON FUNCTION public.fn_rank_novo_periodo(bigint, text) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_rank_novo_periodo(bigint, text) TO authenticated" in sql


def test_mobile_le_so_o_periodo_aberto() -> None:
    info = _sem_comentarios(_M16.INFO)
    assert "CREATE OR REPLACE VIEW public.vw_ranks_info_por_classe" in info
    assert info.rstrip().endswith("WHERE r.fim IS NULL;")
    # Colunas novas só no fim: o CREATE OR REPLACE não aceita reordenar.
    assert info.index("rt.icone,") < info.index("r.periodo,") < info.index("r.inicio\n")


def test_downgrade_desfaz_na_ordem_e_restaura_as_views() -> None:
    sql = _sem_comentarios(_downgrade_sql())
    funcao = sql.index("DROP FUNCTION IF EXISTS public.fn_rank_novo_periodo(bigint, text)")
    tabela = sql.index("DROP TABLE IF EXISTS public.rank_podio_congelado")
    info = sql.index("CREATE VIEW public.vw_ranks_info_por_classe WITH (security_invoker = on) AS")
    view = sql.index("CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas")
    colunas = sql.index("DROP COLUMN IF EXISTS inicio")
    assert funcao < tabela < info < view < colunas
    assert "GRANT ALL ON public.vw_ranks_info_por_classe TO authenticated, service_role" in sql
    assert "missoes_concluidas AS" in sql[view:colunas]
    assert "rj.inicio_utc" not in sql[view:colunas]


def test_periodo_encerrado_nao_e_excluido_mas_a_cascata_da_turma_passa() -> None:
    guarda = _sem_comentarios(_funcao(_upgrade_sql(), "fn_ranks_guarda"))
    exclusao = guarda[guarda.index("IF TG_OP = 'DELETE' THEN") :]
    exclusao = exclusao[: exclusao.index("RETURN OLD;")]
    assert "OLD.fim IS NOT NULL" in exclusao
    assert "pg_trigger_depth() <= 1" in exclusao
    assert "current_setting('app.rank_periodo', true), '') <> 'on'" in exclusao
    assert "ERRCODE = '42501'" in exclusao
    # O ramo de DELETE vem antes do atalho da flag, que devolve NEW (nulo no DELETE).
    assert guarda.index("IF TG_OP = 'DELETE' THEN") < guarda.index("RETURN NEW;")
    # O histórico só cai pela cascata da turma ou do tipo, nunca por excluir o período aberto.
    sql = _sem_comentarios(_upgrade_sql())
    assert "rank_id bigint NOT NULL REFERENCES public.ranks(id) ON DELETE CASCADE" in sql
    assert "REFERENCES public.ranks" not in _M16.COLUNAS


def test_downgrade_tira_o_gatilho_que_bloqueia_a_exclusao() -> None:
    sql = _downgrade_sql()
    assert "DROP TRIGGER IF EXISTS trg_ranks_guarda ON public.ranks" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_ranks_guarda()" in sql

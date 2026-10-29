"""F0 (medir antes de mexer) — SQL offline da `20261029_02`: catálogo, resultado, amostra e disponibilidade.

O comportamento (o que a view responde com rodada velha, invariante falhando, métrica de modelo sem
promoção; o que o aluno enxerga e o que ele não escreve) é medido contra Postgres de verdade em
`test_e2e_catalogo_de_metricas.py`. Aqui fica o que a leitura do SQL garante sem banco.
"""

import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

TABELAS = ("metricas_catalogo", "metricas_invariante_resultado", "metricas_invariante_amostra")
LEGIVEIS = ("metricas_catalogo", "metricas_invariante_resultado")

# chave -> (publico, requer_validacao, invariantes): a tabela do plano, verbatim.
CATALOGO = {
    "aluno.progresso": ({"aluno", "professor"}, "nenhuma", ["I04", "I05"]),
    "aluno.tempo_ativo_semana": ({"aluno", "professor"}, "nenhuma", ["I01", "I02", "I03"]),
    "aluno.sequencia": ({"aluno"}, "nenhuma", ["I08"]),
    "aluno.conquistas": ({"aluno"}, "nenhuma", ["I13"]),
    "aluno.ranking": ({"aluno", "professor"}, "nenhuma", ["I08", "I09", "I10"]),
    "aluno.dominio": ({"aluno", "professor", "ia"}, "ml", ["I15"]),
    "aluno.nota_sugerida": ({"aluno", "professor"}, "llm", []),
    "aluno.sugestao_material": ({"aluno", "ia"}, "ml", ["I15"]),
    "prof.questao_problema": ({"professor"}, "nenhuma", ["I19"]),
    "prof.conteudo_trava": ({"professor"}, "nenhuma", ["I01", "I02", "I03"]),
    "prof.inatividade": ({"professor"}, "nenhuma", ["I01", "I17"]),
    "prof.estagnado": ({"professor"}, "nenhuma", ["I04", "I05"]),
    "prof.vencidas": ({"professor"}, "nenhuma", []),
    "prof.cobertura": ({"professor", "dev"}, "nenhuma", ["I15"]),
    "prof.sem_material": ({"professor"}, "nenhuma", []),
    "legado.tempo_uso": ({"professor"}, "nenhuma", ["I16"]),
    "legado.abandono": ({"professor"}, "nenhuma", ["I16"]),
    "dev.transporte": ({"dev"}, "nenhuma", []),  # R7: I20 é alerta (spec §5.1); a I18 mede a cobertura do motivo, que é o que o card mostra
    "dev.uso": ({"dev"}, "nenhuma", ["I17"]),
    "dev.gamificacao": ({"dev"}, "nenhuma", ["I08", "I09", "I13"]),
    "dev.ia": ({"dev"}, "nenhuma", ["I15"]),
}


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261029_01:20261029_02", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261029_02:20261029_01", sql=True)
    return output.getvalue().replace("%%", "%")


def _docstring() -> str:
    from tests.test_e2e_guilda_mantem_quem_saiu_da_turma import _modulo

    return _modulo("20261029_02_catalogo_de_metricas.py").__doc__ or ""


def _linhas_do_catalogo(sql: str) -> dict[str, tuple[set[str], str, list[str]]]:
    """Lê do INSERT do catálogo cada linha: (publico, requer_validacao, invariantes)."""
    achados: dict[str, tuple[set[str], str, list[str]]] = {}
    for m in re.finditer(
        r"\('(?P<chave>[a-z_]+\.[a-z_]+)',.*?'\{(?P<publico>[a-z,]+)\}',.*?"
        r"'(?P<requer>nenhuma|ml|llm)',\s*'\{(?P<inv>[I0-9,]*)\}'\)",
        sql,
        re.S,
    ):
        achados[m["chave"]] = (
            set(m["publico"].split(",")),
            m["requer"],
            [i for i in m["inv"].split(",") if i],
        )
    return achados


def test_as_tres_tabelas_com_rls_ligada():
    sql = _upgrade_sql()

    for tabela in TABELAS:
        assert f"CREATE TABLE IF NOT EXISTS public.{tabela}" in sql
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql


def test_catalogo_tem_as_colunas_e_checks_do_contrato():
    sql = _upgrade_sql()

    assert "chave text PRIMARY KEY" in sql
    assert "publico text[] NOT NULL" in sql
    assert "publico <@ ARRAY['aluno','professor','dev','ia']" in sql
    assert "formula_versao integer NOT NULL DEFAULT 1" in sql
    assert "n_minimo integer NOT NULL DEFAULT 5" in sql
    assert "requer_validacao text NOT NULL DEFAULT 'nenhuma'" in sql
    assert "requer_validacao IN ('nenhuma','ml','llm')" in sql
    assert "validacao_promovida boolean NOT NULL DEFAULT false" in sql
    assert "invariantes text[] NOT NULL DEFAULT '{}'" in sql
    # R1: ids com dois dígitos, I maiúsculo.
    assert "invariantes <@ ARRAY['I01'" in sql and "'I20']" in sql


def test_resultado_e_amostra_tem_o_contrato():
    sql = _upgrade_sql()

    assert "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY" in sql
    assert "rodado_em timestamptz NOT NULL DEFAULT now()" in sql
    assert "ok boolean NOT NULL" in sql
    assert "linhas bigint" in sql
    assert "ids text[]" in sql
    assert "ON public.metricas_invariante_resultado (invariante, rodado_em DESC)" in sql


def test_policies_so_de_leitura_para_authenticated():
    sql = _upgrade_sql()

    for tabela in LEGIVEIS:
        assert re.search(
            rf"CREATE POLICY {tabela}_sel ON public\.{tabela}\s+FOR SELECT TO authenticated\s+USING \(true\)",
            sql,
        ), tabela
    assert len(re.findall(r"CREATE POLICY", sql)) == 2
    for proibido in ("FOR INSERT", "FOR UPDATE", "FOR DELETE", "FOR ALL", "TO anon", "TO PUBLIC"):
        assert proibido not in sql


def test_amostra_nao_tem_policy_e_o_docstring_diz_service_role():
    sql = _upgrade_sql()

    assert "metricas_invariante_amostra" not in "".join(re.findall(r"CREATE POLICY[^;]+;", sql))
    assert not re.search(r"POLICY \w+ ON public\.metricas_invariante_amostra", sql)
    assert "só service_role" in _docstring()
    assert "só service_role" in sql  # também no COMMENT ON TABLE, para quem olha o banco


def test_nenhuma_tabela_aceita_escrita_de_cliente():
    sql = _upgrade_sql()

    for tabela in TABELAS:
        assert f"REVOKE ALL ON public.{tabela} FROM PUBLIC, anon, authenticated" in sql
    # só o que tem policy de leitura devolve o SELECT; a amostra (R2) não devolve nada
    assert "GRANT SELECT ON public.metricas_catalogo TO authenticated" in sql
    # R10: o resultado devolve SELECT por coluna, sem `erro` (texto de exceção não vai para o cliente)
    assert "GRANT SELECT (id, invariante, rodado_em, ok, linhas) ON public.metricas_invariante_resultado TO authenticated" in sql
    assert "GRANT SELECT ON public.metricas_invariante_resultado" not in sql
    assert "GRANT SELECT ON public.metricas_invariante_amostra" not in sql
    for linha in re.findall(r"^GRANT [^;]+;", sql, re.M):
        assert "INSERT" not in linha and "UPDATE" not in linha and "DELETE" not in linha
        assert "anon" not in linha


def test_view_nasce_security_invoker_e_so_authenticated_le():
    sql = _upgrade_sql()

    assert re.search(r"CREATE OR REPLACE VIEW public\.vw_metricas_disponibilidade\s+WITH \(security_invoker = on\)", sql)
    assert "REVOKE ALL ON public.vw_metricas_disponibilidade FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON public.vw_metricas_disponibilidade TO authenticated" in sql
    assert "GRANT SELECT ON public.vw_metricas_disponibilidade TO anon" not in sql


def test_view_tem_os_motivos_na_ordem_de_precedencia():
    sql = _upgrade_sql()
    corpo = sql[sql.index("CREATE OR REPLACE VIEW public.vw_metricas_disponibilidade") :]

    a = corpo.index("'aguardando_validacao'")
    b = corpo.index("'auditoria_atrasada'")
    c = corpo.index("'invariante_falhou:'")
    assert a < b < c
    assert "interval '26 hours'" in corpo
    assert "ORDER BY" in corpo and "string_agg" in corpo  # ids em ordem estável no motivo


def test_catalogo_semeia_as_21_chaves_idempotente():
    sql = _upgrade_sql()

    assert "ON CONFLICT (chave) DO UPDATE" in sql
    achados = _linhas_do_catalogo(sql)
    assert len(CATALOGO) == 21
    assert achados == CATALOGO


def test_ids_de_invariante_tem_dois_digitos():
    sql = _upgrade_sql()
    achados = _linhas_do_catalogo(sql)

    for _, _, invs in achados.values():
        for i in invs:
            assert re.fullmatch(r"I\d{2}", i), i


def test_downgrade_remove_tudo():
    sql = _downgrade_sql()

    assert "DROP VIEW IF EXISTS public.vw_metricas_disponibilidade" in sql
    for tabela in TABELAS:
        assert f"DROP TABLE IF EXISTS public.{tabela}" in sql

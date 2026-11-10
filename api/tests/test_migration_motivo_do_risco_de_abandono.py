"""`20261110_01`: o rótulo do que pesou no risco de abandono, sem score (estrutura do SQL).

Os valores da função e da coluna são medidos em Postgres em `test_e2e_motivo_do_risco_de_abandono.py`.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", VERSOES / arquivo)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _modulo("20261110_01_motivo_do_risco_de_abandono.py")
M10 = _modulo("20261101_10_nota_media_da_matricula.py")


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql) -> None:
        self.sql.append(str(sql))


def _sql(fn: str) -> list[str]:
    coletor, original = _Coletor(), M.op
    M.op = coletor
    try:
        getattr(M, fn)()
    finally:
        M.op = original
    return coletor.sql


def test_encadeia_na_cabeca_anterior() -> None:
    assert M.revision == "20261110_01"
    assert M.down_revision == "20261108_03"


def test_funcao_tem_a_assinatura_do_modelo_e_so_devolve_rotulo() -> None:
    assert "RETURNS text" in M.FUNCAO
    assert "IMMUTABLE" in M.FUNCAO
    assert M.FUNCAO.count("numeric,") + M.FUNCAO.count("numeric   ") >= 9
    for rotulo in ("entregas_perdidas", "uso_caiu", "entrega_atrasada", "sem_nota", "nota_baixa"):
        assert f"'{rotulo}'" in M.FUNCAO
    # Os coeficientes são os do modelo do core, copiados da 20261031_08.
    modelo = _modulo("20261031_08_abandono_pelo_modelo_do_core.py").MODELO
    for coef in ("0.251735", "0.027413", "1.688502", "0.239863", "0.002436", "0.019125", "0.008495"):
        assert coef in modelo
        assert coef in M.FUNCAO


def test_execute_so_para_quem_le_a_view() -> None:
    assert "FROM PUBLIC, anon" in M.FUNCAO
    assert "TO authenticated, service_role" in M.FUNCAO


def test_coluna_nova_entra_no_fim_e_nada_mais_muda() -> None:
    anterior, novo = M10.ENGAJAMENTO, M.ENGAJAMENTO
    corte = "AS risco_abandono_origem"
    i_ant, i_novo = anterior.index(corte) + len(corte), novo.index(corte) + len(corte)
    assert novo[:i_novo] == anterior[:i_ant]
    rabo = anterior[i_ant:]
    assert rabo.startswith("\n  FROM matriculas m\n  LEFT JOIN sessoes")
    assert novo.endswith(rabo)
    inserido = novo[i_novo : len(novo) - len(rabo)]
    assert inserido.startswith(",\n") and inserido.rstrip().endswith("END AS risco_abandono_motivo")


def test_motivo_usa_os_mesmos_argumentos_da_faixa() -> None:
    args = M._argumentos(M10.ENGAJAMENTO)
    coluna = M.ENGAJAMENTO[M.ENGAJAMENTO.index("AS risco_abandono_origem") :]
    assert coluna.count(args) == 2
    assert "public.trailup_motivo_risco_evasao(" in coluna
    assert "IN ('alto', 'atencao')" in coluna


def test_view_nao_expoe_score() -> None:
    coluna = M.ENGAJAMENTO[M.ENGAJAMENTO.index("AS risco_abandono_origem") :]
    # O score só aparece dentro da faixa; nenhuma coluna devolve o número.
    assert "AS risco_abandono_score" not in M.ENGAJAMENTO
    assert coluna.count("public.trailup_risco_evasao(") == 1
    assert "public.trailup_faixa_risco(public.trailup_risco_evasao(" in coluna


def test_downgrade_mantem_a_coluna_nula_e_apaga_a_funcao() -> None:
    volta = _sql("downgrade")
    assert "NULL::text AS risco_abandono_motivo" in volta[0]
    assert "trailup_motivo_risco_evasao(" not in volta[0]
    assert volta[1].startswith("DROP FUNCTION IF EXISTS public.trailup_motivo_risco_evasao(")


def test_upgrade_cria_a_funcao_antes_da_view() -> None:
    sobe = _sql("upgrade")
    assert "CREATE OR REPLACE FUNCTION public.trailup_motivo_risco_evasao" in sobe[0]
    assert "CREATE OR REPLACE VIEW public.vw_metricas_engajamento_aluno_classe" in sobe[1]


def test_sql_sem_bind_acidental() -> None:
    for bloco in (*_sql("upgrade"), *_sql("downgrade")):
        assert text(bloco).compile().params == {}

from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _sql(origem: str, destino: str, *, down: bool = False) -> str:
    output = StringIO()
    cfg = _offline_alembic_config(output)
    (migrations.command.downgrade if down else migrations.command.upgrade)(cfg, f"{origem}:{destino}", sql=True)
    return output.getvalue()


def test_moedas_so_depois_da_aprovacao_e_uma_vez() -> None:
    sql = _sql("20261017_06", "20261017_07")

    assert "a.metadata ->> 'moedas' ~ '^[0-9]+$'" in sql
    assert "IF v_moedas > 0 AND p_nota >= v_max * 0.6 THEN" in sql
    assert "'evento', 'atividade_aprovada', 'atividade:' || p_atividade_id::text" in sql
    # o predicado do índice parcial precisa ser repetido, senão o Postgres não casa o índice
    assert "ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING" in sql
    # o crédito vem depois de gravar a nota
    assert sql.index("SET pontuacao_obtida = p_nota") < sql.index("INSERT INTO public.moedas_ledger")


def test_posse_e_validacoes_da_versao_anterior_continuam() -> None:
    sql = _sql("20261017_06", "20261017_07")

    assert sql.index("app_classes_do_professor()") < sql.index("UPDATE public.atividade_aluno")
    assert "USING ERRCODE = '42501'" in sql
    assert "A nota vai de 0 a %" in sql
    assert "'nota_professor'" in sql
    assert "SECURITY DEFINER" in sql and "SET search_path = public, pg_temp" in sql
    assert "GRANT EXECUTE ON FUNCTION public.avaliar_entrega(bigint, uuid, numeric, text) TO authenticated" in sql


def test_downgrade_volta_a_funcao_sem_moedas() -> None:
    sql = _sql("20261017_07", "20261017_06", down=True)

    assert "CREATE OR REPLACE FUNCTION public.avaliar_entrega" in sql
    assert "moedas_ledger" not in sql

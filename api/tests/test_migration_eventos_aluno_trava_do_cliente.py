"""F1 (segurança) — SQL offline da `20261029_06`: o cliente não grava `criado_em` nem troca `referencia`.

`authenticated` tem INSERT/UPDATE em `eventos_aluno`, e a policy `eventos_aluno_posse_upd` só confere
`aluno_id = auth.uid()`. O gatilho de valor congela tipo, turma, quem concedeu, aluno e motivo, mas
não a data nem a referência. A data entra no fator de atraso, na janela do evento de turma e na
sequência de dias; a referência decide a dedup de conclusão. Aqui fica o que a leitura do SQL garante
sem banco; o efeito com o papel de verdade, e a ordem dos gatilhos, estão em
`test_e2e_eventos_aluno_trava_do_cliente.py`.
"""

import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

FUNCAO = "public.fn_eventos_aluno_trava_cliente()"
GATILHO = "trg_eventos_aluno_a_trava_cliente"


def _sql(intervalo: str, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue().replace("%%", "%")


def _upgrade() -> str:
    return _sql("20261029_05:20261029_06")


def _downgrade() -> str:
    return _sql("20261029_06:20261029_05", downgrade=True)


def _corpo_da_funcao(sql: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION {FUNCAO}")
    return sql[inicio : sql.index("$function$;", inicio)]


def test_cliente_e_decidido_por_current_user_e_nao_pelas_claims():
    """As claims continuam valendo dentro da RPC `SECURITY DEFINER`; o `current_user` lá é o dono."""
    corpo = _corpo_da_funcao(_upgrade())

    assert "current_user IN ('authenticated', 'anon')" in corpo
    assert "request.jwt" not in corpo
    assert "auth.uid()" not in corpo and "auth.jwt()" not in corpo
    assert "session_user" not in corpo


def test_funcao_e_invoker_com_search_path_vazio():
    """`SECURITY DEFINER` faria o `current_user` ser sempre o dono, e a trava nunca dispararia."""
    corpo = _corpo_da_funcao(_upgrade())
    cabecalho = corpo[: corpo.index("AS $function$")]

    assert "SECURITY INVOKER" in cabecalho
    assert "SECURITY DEFINER" not in cabecalho
    assert "SET search_path = ''" in cabecalho
    assert "RETURNS trigger" in cabecalho


def test_insert_grava_a_hora_do_banco_no_tipo_da_coluna():
    """`criado_em` é `timestamp without time zone` em UTC: o default `now()` numa sessão UTC."""
    corpo = _corpo_da_funcao(_upgrade())

    assert "IF TG_OP = 'INSERT' THEN" in corpo
    assert "NEW.criado_em := (now() AT TIME ZONE 'UTC');" in corpo


def test_update_do_cliente_e_recusado_com_42501():
    """Congelar colunas não basta: a dedup desempata por `(criado_em, id)` e o cliente controla o `id`.
    Nenhum cliente faz UPDATE na tabela, então o UPDATE do cliente é recusado inteiro."""
    corpo = _corpo_da_funcao(_upgrade())
    ramo_update = corpo[corpo.index("ELSE") :]

    assert "RAISE EXCEPTION" in ramo_update
    assert "ERRCODE = '42501'" in ramo_update
    assert "não altera evento depois de gravado" in ramo_update
    # O restauro silencioso da versão anterior ficou inalcançável e saiu.
    assert "OLD." not in corpo
    assert re.findall(r"NEW\.(\w+) :=", corpo) == ["criado_em", "id"]


def test_insert_do_cliente_tira_o_id_da_sequencia():
    """`id` à frente da sequência colidiria com o próximo INSERT de qualquer um."""
    corpo = _corpo_da_funcao(_upgrade())
    ramo_insert = corpo[corpo.index("IF TG_OP = 'INSERT' THEN") : corpo.index("ELSE")]

    assert "NEW.id := nextval(pg_get_serial_sequence('public.eventos_aluno', 'id'));" in ramo_insert


def test_gatilho_antes_de_insert_e_update_e_ordena_antes_do_de_valor():
    sql = _upgrade()

    assert re.search(
        rf"CREATE TRIGGER {GATILHO}\s+BEFORE INSERT OR UPDATE ON public\.eventos_aluno\s+"
        rf"FOR EACH ROW EXECUTE FUNCTION {re.escape(FUNCAO)};",
        sql,
    )
    # Gatilhos do mesmo evento disparam em ordem de nome: a trava precisa vir antes do de valor,
    # que calcula o atraso e a dedup sobre `criado_em`/`referencia`.
    assert GATILHO < "trg_eventos_aluno_valor_ins"
    assert GATILHO < "trg_eventos_aluno_valor_upd"


def test_nao_reescreve_o_gatilho_de_valor_nem_policies_nem_grants():
    sql = _upgrade()

    assert "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco" not in sql
    assert "POLICY" not in sql
    # O único GRANT é o USAGE na sequência que o `nextval()` da trava usa.
    # (o SQL offline acrescenta `;` ao fim de cada `op.execute`, daí o `rstrip`)
    assert [g.strip().rstrip(";") for g in re.findall(r"^[ \t]*(?:GRANT|REVOKE) .*$", sql, re.M)] == [
        "GRANT USAGE ON SEQUENCE public.eventos_aluno_id_seq TO authenticated"
    ]


def test_downgrade_nao_revoga_o_usage_que_ja_existia():
    assert not re.search(r"^\s*(GRANT|REVOKE) ", _downgrade(), re.M)


def test_downgrade_remove_gatilho_e_funcao():
    sql = _downgrade()

    assert f"DROP TRIGGER IF EXISTS {GATILHO} ON public.eventos_aluno;" in sql
    assert f"DROP FUNCTION IF EXISTS {FUNCAO};" in sql
    assert sql.index("DROP TRIGGER") < sql.index("DROP FUNCTION")

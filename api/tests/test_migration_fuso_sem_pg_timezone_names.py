"""Estrutura da `20261102_15` (fuso validado sem `pg_timezone_names`). O comportamento está no e2e."""

from __future__ import annotations

import hashlib
import re

from alembic.config import Config
from alembic.script import ScriptDirectory

from tests import _f5_banco as f5

M = f5.modulo("20261102_15_fuso_sem_pg_timezone_names.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))

PAREADAS = (
    (M.presenca_anterior, M.presenca_nova, M.CHECAGEM_PRESENCA_ANTIGA, M.CHECAGEM_PRESENCA_NOVA),
    (M.metricas_anterior, M.metricas_nova, M.CHECAGEM_ANTIGA, M.CHECAGEM_NOVA),
    (M.coorte_anterior, M.coorte_nova, M.CHECAGEM_ANTIGA, M.CHECAGEM_NOVA),
)


def _config() -> Config:
    raiz = f5.VERSOES.parent.parent
    config = Config(str(raiz / "alembic.ini"))
    config.set_main_option("script_location", str(raiz / "alembic"))
    return config


def test_encadeia_depois_da_20261102_14_e_cabeca_unica():
    assert M.revision == "20261102_15"
    assert M.down_revision == "20261102_14"
    assert len(ScriptDirectory.from_config(_config()).get_heads()) == 1


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro.
    assert "%" not in UP
    assert "%" not in DOWN


def test_upgrade_nao_le_mais_pg_timezone_names():
    assert "pg_timezone_names" not in UP
    assert UP.count("public.trailup_fuso_valido(p_timezone)") == 3
    # O downgrade volta às três checagens antigas.
    assert DOWN.count("pg_timezone_names") == 3


def test_cada_corpo_so_troca_a_checagem():
    # O resto de cada função tem de ser o da migration anterior, sem reescrita à mão.
    for anterior, nova, antes, depois in PAREADAS:
        velho, novo = anterior(), nova()
        assert novo.count(depois) == 1
        assert novo.replace(depois, antes) == velho
        assert velho in DOWN


def test_cada_funcao_mantem_a_propria_excecao():
    assert "RAISE EXCEPTION 'fuso_invalido';" in M.presenca_nova()
    for nova in (M.metricas_nova(), M.coorte_nova()):
        assert "RAISE EXCEPTION 'timezone_invalido' USING ERRCODE = '22023';" in nova


def test_presenca_volta_como_create_or_replace():
    # A 20260920_10 usa CREATE FUNCTION; refazê-la assim falharia com a função já existindo.
    assert "CREATE FUNCTION public.trailup_resumo_presenca(" not in UP + DOWN
    assert "CREATE OR REPLACE FUNCTION public.trailup_resumo_presenca(" in UP


def test_coorte_recorta_so_a_registrar():
    sql = M.coorte_nova()
    assert sql.count("CREATE OR REPLACE FUNCTION") == 1
    assert "estudo_coorte_remover" not in sql
    assert "GRANT EXECUTE ON FUNCTION public.estudo_coorte_registrar(bigint, text, text, text, date, date, date, text) TO authenticated" in sql


def test_validador_so_aceita_nome_de_zona():
    assert len(M.FUSOS_SEM_BARRA) == len(set(M.FUSOS_SEM_BARRA)) == 45
    forma = re.compile(M.FORMA_IANA)
    for nome in M.FUSOS_SEM_BARRA:
        assert "/" not in nome and forma.match(nome), nome
    for nome in ("America/Sao_Paulo", "Etc/GMT+3", "America/Port-au-Prince", "America/Argentina/Buenos_Aires"):
        assert forma.match(nome), nome
    # Offset e regra POSIX com `<>` ou `:` não têm forma de nome.
    for valor in ("-03", "-3", "+03:00", "<-03>3", "", " ", "America/Sao_Paulo/", "../etc"):
        assert not forma.match(valor), valor
    assert "EXCEPTION WHEN invalid_parameter_value THEN\n  RETURN false;" in M.VALIDADOR


def test_validador_e_do_authenticated_e_nao_do_anon():
    # `trailup_resumo_presenca` é SECURITY INVOKER: quem chama precisa de EXECUTE no validador.
    assert "REVOKE ALL ON FUNCTION public.trailup_fuso_valido(text) FROM PUBLIC, anon;" in UP
    assert "GRANT EXECUTE ON FUNCTION public.trailup_fuso_valido(text) TO authenticated;" in UP
    assert "SECURITY DEFINER" not in M.VALIDADOR


def test_guarda_vem_primeiro_e_confere_o_corpo_anterior():
    sqls = f5.sql_de(M)
    assert sqls[0].startswith("DO $guarda$")
    for anterior, _, _, _ in PAREADAS:
        sql = anterior()
        nome = re.search(r"FUNCTION public\.(\w+)\(", sql).group(1)
        md5 = hashlib.md5(M.corpo(sql, nome).encode("utf-8")).hexdigest()
        assert f"<> '{md5}'" in sqls[0], nome


def test_downgrade_restaura_antes_de_derrubar_o_validador():
    assert DOWN.index("DROP FUNCTION IF EXISTS public.trailup_fuso_valido(text)") > DOWN.rindex("$fn$;")

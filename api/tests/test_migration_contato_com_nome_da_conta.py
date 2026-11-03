"""`20261103_08`: o "Nome" do e-mail de contato é o nome cadastrado quando o app manda o e-mail.

Medido num Postgres descartável com a função de verdade: aluno que manda o e-mail sai com o nome de
`alunos`, professor com o de `professor`, nome digitado passa como está e conta sem nome fica com o
que veio.
"""

import importlib.util
import types
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261103_08_contato_com_nome_da_conta.py"


def _sql(fn: str) -> str:
    spec = importlib.util.spec_from_file_location("m_20261103_08", VERSOES / ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


def test_cadeia() -> None:
    texto = (VERSOES / ARQUIVO).read_text(encoding="utf-8")
    assert 'revision = "20261103_08"' in texto
    assert 'down_revision = "20261103_07"' in texto


def test_nome_com_arroba_ou_vazio_vira_o_nome_cadastrado() -> None:
    sql = _sql("upgrade")
    assert "IF v_nome = '' OR position('@' in v_nome) > 0 THEN" in sql
    assert "FROM public.alunos a WHERE a.id = v_aluno" in sql
    assert "FROM public.professor p WHERE p.id = v_aluno" in sql
    assert "v_corpo := 'Nome: ' || v_nome || v_nl" in sql
    assert "'Nome: ' || COALESCE(p_nome, '')" not in sql


def test_mantem_sessao_teto_e_permissoes() -> None:
    sql = _sql("upgrade")
    assert "RAISE EXCEPTION USING MESSAGE = 'sem sessao'" in sql
    assert "contato_envios_por_hora" in sql
    assert "REVOKE EXECUTE ON FUNCTION public.fn_enviar_contato(text, text, text, text) FROM PUBLIC, anon;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_enviar_contato(text, text, text, text) TO authenticated;" in sql


def test_downgrade_volta_ao_corpo_da_20261101_14() -> None:
    sql = _sql("downgrade")
    assert "'Nome: ' || COALESCE(p_nome, '')" in sql
    assert "v_nome" not in sql

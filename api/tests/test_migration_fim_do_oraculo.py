"""`20261021_28`: a #329 fecha removendo a função, não versionando-a.

A issue listava quatro caminhos; o escolhido foi fundir as etapas do cadastro. Então o papel
desta migration é pequeno e preciso: recolher do banco a função que ficou sem chamador. O que
estes testes protegem é a **assimetria do downgrade** — reverter não pode reabrir um oráculo não
autenticado em silêncio — e o fato de a dívida do portão ter chegado a zero por decisão, não por
esquecimento.
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config
from tests.test_rpc_chamada_tem_migracao import FORA_DO_ALEMBIC, _rpcs_chamadas

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261021_28_fim_do_oraculo_de_email.py"
_RAIZ = Path(__file__).resolve().parents[2]


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M28 = _modulo(_ARQUIVO)


def test_encadeia_depois_da_27() -> None:
    assert _M28.revision == "20261021_28"
    assert _M28.down_revision == "20261021_27"


def test_remove_so_a_funcao_do_oraculo() -> None:
    assert "DROP FUNCTION IF EXISTS public.fn_auth_email_exists(text);" in _M28.REMOVE
    # Nada mais é tocado: a `auth.users` e as funções de cadastro seguem onde estão.
    assert "auth.users" not in _M28.REMOVE
    assert _M28.REMOVE.count("DROP FUNCTION") == 1


def test_nenhum_cliente_chama_mais_a_funcao() -> None:
    """A condição que torna o DROP seguro. Se alguém reintroduzir a chamada, este teste cai antes
    de o cadastro quebrar com PGRST202 em produção."""
    assert "fn_auth_email_exists" not in _rpcs_chamadas()


def test_o_cadastro_em_uma_etapa_existe_e_iguala_as_mensagens() -> None:
    """O par desta migration é no frontend, e sem ele o DROP quebraria o cadastro. Aqui se checa
    que o módulo existe e que a invariante de segurança está escrita nele: conta já existente cai
    na MESMA mensagem de senha errada. O teste de comportamento é
    `frontend/src/lib/cadastroEmUmaEtapa.test.ts`."""
    lib = _RAIZ / "frontend" / "src" / "lib" / "cadastroEmUmaEtapa.ts"
    assert lib.exists(), "o cadastro em uma etapa é o que substitui a função removida"
    fonte = lib.read_text(encoding="utf-8")
    assert "ehContaJaExistente" in fonte
    assert "MENSAGEM_CREDENCIAL" in fonte
    # As duas condições no MESMO ramo: é isso que impede a enumeração de voltar pela tela.
    assert re.search(r"ehCredencialInvalida\(erro\)\s*\|\|\s*ehContaJaExistente\(erro\)", fonte)

    for pagina in ("CadastroAluno.tsx", "CadastroProfessor.tsx"):
        texto = (_RAIZ / "frontend" / "src" / "pages" / pagina).read_text(encoding="utf-8")
        assert 'supabase.rpc("fn_auth_email_exists"' not in texto, f"{pagina} ainda chama a RPC"
        assert "handleAcessar" in texto, f"{pagina} não tem o fluxo de uma etapa"


def test_a_divida_do_portao_chegou_a_zero() -> None:
    """Marco, e por decisão: a última entrada saiu porque a função deixou de existir."""
    assert FORA_DO_ALEMBIC == {}


def test_o_downgrade_recria_sem_devolver_o_acesso_anonimo() -> None:
    """A assimetria deliberada. Reverter o commit não pode reabrir um oráculo não autenticado:
    a função volta só para `authenticated`/`service_role`, e o REVOKE é explícito porque o
    `ALTER DEFAULT PRIVILEGES` do schema concede a `anon` em toda função nova."""
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_28:20261021_27", sql=True)
    sql = output.getvalue()
    assert "CREATE OR REPLACE FUNCTION public.fn_auth_email_exists(p_email text)" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_auth_email_exists(text) FROM PUBLIC, anon;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_auth_email_exists(text) TO authenticated, service_role;" in sql
    assert sql.index("REVOKE ALL ON FUNCTION") < sql.index("GRANT EXECUTE ON FUNCTION")
    # E em nenhum lugar o downgrade concede a anon.
    assert not re.search(r"GRANT[^;]+fn_auth_email_exists[^;]+anon", sql)

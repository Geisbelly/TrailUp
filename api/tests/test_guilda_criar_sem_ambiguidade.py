"""Guardas da `20260920_07` -- `guilda_criar` com uma assinatura so.

A ambiguidade foi medida no banco: as DUAS formas de chamar com 4 argumentos
(posicional e nomeada) falhavam com 42725 `is not unique`, e a nomeada e a que
o cliente usa.
"""

import importlib.util
import re
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
MIGRACAO = "20260920_07_guilda_criar_sem_ambiguidade.py"


def _carregar():
    spec = importlib.util.spec_from_file_location("migration_guilda_criar", VERSOES / MIGRACAO)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _stmts(direcao: str = "upgrade") -> list[str]:
    module = _carregar()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return executado


def _sql(direcao: str = "upgrade") -> str:
    return "\n".join(_stmts(direcao))


def _sem_comentarios(sql: str) -> str:
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def test_cadeia_de_revisao():
    module = _carregar()
    assert module.revision == "20260920_07"
    assert module.down_revision == "20260920_06"


def test_nenhum_literal_vira_bind_parameter():
    for direcao in ("upgrade", "downgrade"):
        assert re.findall(r"(?<![:\w\$]):([\w\$]+)", _sql(direcao)) == []


def test_derruba_a_curta_e_nao_a_longa():
    # A longa e o corpo de verdade; derrubar a errada apagaria a regra inteira.
    executavel = _sem_comentarios(_sql())
    assert "DROP FUNCTION IF EXISTS public.guilda_criar(bigint, text, text, text)" in executavel
    assert "DROP FUNCTION IF EXISTS public.guilda_criar(bigint, text, text, text, text, text, text)" not in executavel


def test_confere_que_a_curta_e_so_delegacao_antes_de_derrubar():
    # Se alguem tiver posto regra dentro dela, a migracao para em vez de apagar
    # calada -- mesma disciplina da `20260912_01` com o gatilho de valor.
    executavel = _sem_comentarios(_sql())
    assert "nao e mais uma delegacao simples" in executavel
    assert "p.pronargs = 4" in executavel


def test_a_ausencia_da_curta_nao_derruba_a_migracao():
    # Rodar duas vezes, ou rodar depois de alguem ja ter derrubado, nao pode
    # falhar: o `RETURN` sai da guarda quando nao ha o que conferir.
    executavel = _sem_comentarios(_sql())
    assert "IF v_corpo IS NULL THEN" in executavel
    assert "RETURN;" in executavel


def test_termina_exigindo_uma_assinatura_so():
    executavel = _sem_comentarios(_sql())
    assert "deveria ter uma assinatura so" in executavel


def test_a_longa_continua_fora_do_alcance_do_anon():
    executavel = _sem_comentarios(_sql())
    assert (
        "REVOKE ALL ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) "
        "FROM PUBLIC, anon" in executavel
    )


def test_o_downgrade_recria_a_delegacao_com_os_mesmos_valores():
    # `NULL, 'misto', NULL` sao exatamente os DEFAULTs da versao longa -- e por
    # isso que derrubar a curta nao muda comportamento nenhum.
    volta = re.sub(r"\s+", " ", _sem_comentarios(_sql("downgrade")))
    assert "SELECT public.guilda_criar(p_classe_id, p_nome, p_descricao, p_emblema, NULL, 'misto', NULL);" in volta
    assert "SET search_path TO 'public', 'pg_temp'" in _sql("downgrade")

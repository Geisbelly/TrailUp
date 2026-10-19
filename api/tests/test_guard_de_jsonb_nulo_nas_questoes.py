"""A guarda de jsonb nulo nas funcoes de questao.

`jsonb_typeof(NULL)` devolve NULL, e `NULL <> 'array'` tambem e NULL -- nao
TRUE. Uma guarda escrita como `IF jsonb_typeof(p_alts) <> 'array' THEN RETURN`
portanto NAO dispara para NULL, e a execucao cai no laco seguinte com
`jsonb_array_length(NULL)` como limite: 22004.

Era o que impedia o professor de salvar qualquer questao que nao fosse
multipla escolha ou verdadeiro/falso -- `normalizeQuestionPayload` manda
`alternativas: null` com `resposta` sempre preenchida nesse caso.

O que estes testes protegem:

1. **A guarda precisa do `IS NULL` explicito.** Comparar `jsonb_typeof` com
   string nunca pega NULL, por mais obvia que a intencao pareca.
2. **As duas funcoes.** `fn_questao_associacao_em_ordem` tem a mesma guarda,
   pelo mesmo motivo; ela nao estoura, mas devolve `{"termos": [],
   "definicoes": []}` no lugar do NULL que recebeu.
3. **O downgrade devolve as guardas furadas.** Reverter tem que devolver o
   defeito, senao o downgrade mente.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

INTERVALO = "20261019_02:20261019_10"

FUNCOES = ("fn_questao_gabarito_em_texto", "fn_questao_associacao_em_ordem")


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def test_substitui_as_duas_funcoes() -> None:
    sql = _render(INTERVALO)
    for fn in FUNCOES:
        assert f"CREATE OR REPLACE FUNCTION public.{fn}" in sql, f"{fn} ficaria como esta"


def test_a_guarda_passa_a_testar_null_explicitamente() -> None:
    sql = _render(INTERVALO)
    assert "IF v_resp = '' OR p_alts IS NULL OR jsonb_typeof(p_alts) <> 'array'" in sql
    assert "IF p_alts IS NULL OR jsonb_typeof(p_alts) <> 'object'" in sql


def test_nao_sobra_guarda_sem_o_is_null() -> None:
    """A forma antiga nao pode reaparecer em lugar nenhum do upgrade."""
    sql = _render(INTERVALO)
    assert "IF v_resp = '' OR jsonb_typeof(p_alts) <> 'array'" not in sql
    assert "IF jsonb_typeof(p_alts) <> 'object'" not in sql


def test_o_resto_do_corpo_nao_muda() -> None:
    """A correcao e a guarda. A resolucao do gabarito (por texto, por letra e
    por indice) tem de continuar igual, senao questao antiga muda de gabarito."""
    sql = _render(INTERVALO)
    assert "IF public.fn_texto_comparavel(p_alts ->> v_i) = v_norm THEN RETURN p_alts ->> v_i" in sql
    assert "IF v_norm = lower(chr(65 + v_i)) OR v_norm = v_i::text" in sql


def test_downgrade_devolve_as_guardas_furadas() -> None:
    sql = _render("20261019_10:20261019_02", downgrade=True)
    assert "IF v_resp = '' OR jsonb_typeof(p_alts) <> 'array'" in sql
    assert "IF p_alts IS NULL" not in sql

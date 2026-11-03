"""`20261103_03`, `_04` e `_05`: o gerador da diária mantém a assinatura `(date, uuid)` de `20261102_14`.

As três recriavam `fn_missao_diaria_gerar(p_dia date DEFAULT NULL)`. Como `CREATE OR REPLACE` com outra
lista de parâmetros cria uma sobrecarga em vez de substituir, o banco ficava com `(date)` e
`(date, uuid)`, e `fn_missao_diaria_gerar(<data>)` ficava ambígua. Foi a chamada da `_04` que
derrubou a subida da API em 03/11 (`AmbiguousFunction`). Ficava ambígua também a do pg_cron, e o
gatilho da troca de perfil seguia chamando o corpo antigo.

Medido num Postgres descartável: com o SQL de antes, a chamada da `_04` reproduz o erro de
produção; com o de agora, resta uma função só, que filtra por `p_aluno`.
"""

import importlib.util
import types
from pathlib import Path

import pytest

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

MIGRACOES = [
    "20261103_03_missoes_diarias_pt_br.py",
    "20261103_04_missoes_diarias_por_turma.py",
    "20261103_05_missao_diaria_pela_trilha.py",
]


def _sql(arquivo: str, fn: str) -> str:
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}", VERSOES / arquivo)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


@pytest.mark.parametrize("fn", ["upgrade", "downgrade"])
@pytest.mark.parametrize("arquivo", MIGRACOES)
def test_gerador_nunca_volta_a_assinatura_so_com_data(arquivo: str, fn: str) -> None:
    sql = _sql(arquivo, fn)
    criar = "CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar("
    assert sql.count(criar) == 1
    assert "fn_missao_diaria_gerar(p_dia date DEFAULT NULL)" not in sql
    assert "fn_missao_diaria_gerar(p_dia date DEFAULT NULL, p_aluno uuid DEFAULT NULL)" in sql
    # Uma (date) que tenha sobrado sai antes de recriar.
    assert sql.index("DROP FUNCTION IF EXISTS public.fn_missao_diaria_gerar(date);") < sql.index(criar)
    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date, uuid) FROM PUBLIC, anon, authenticated;" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date) FROM" not in sql


@pytest.mark.parametrize("arquivo", MIGRACOES)
def test_recorte_da_turma_filtra_pelo_aluno_da_troca_de_perfil(arquivo: str) -> None:
    sql = _sql(arquivo, "upgrade")
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar(") :]
    # O gatilho de `20261102_14` chama (NULL, aluno) e espera só as turmas dele.
    assert "AND (p_aluno IS NULL OR ca.aluno_id = p_aluno)" in corpo[: corpo.index("LOOP")]

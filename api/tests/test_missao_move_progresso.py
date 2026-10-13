"""#150: missão é uma `atividade` com `tipo = 'missao'` e tem de mover o progresso do tópico.

O percentual do tópico sai de `trailup_recalcular_topico_aluno`. Se um dia alguém
filtrar por `atividades.tipo` ali dentro, a missão passa a não contar — o aluno
cumpre tudo e a barra fica parada, exatamente o defeito que a 20260826_18 corrigiu.

Isto é um guarda ESTÁTICO sobre a definição vigente da função (a última migration
que a recria). Prova de comportamento com linhas de verdade exige banco; este
teste só impede a regressão mais provável.
"""

import re
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"
DEFINICAO = re.compile(r"CREATE OR REPLACE FUNCTION\s+(?:public\.)?trailup_recalcular_topico_aluno", re.IGNORECASE)


def _definicao_vigente() -> tuple[str, str]:
    """(nome do arquivo, corpo) da ÚLTIMA migration que recria a função."""
    candidatas = [p for p in sorted(VERSIONS.glob("2*.py")) if DEFINICAO.search(p.read_text(encoding="utf-8"))]
    assert candidatas, "nenhuma migration define trailup_recalcular_topico_aluno"
    ultima = candidatas[-1]
    texto = ultima.read_text(encoding="utf-8")
    inicio = DEFINICAO.search(texto).start()
    return ultima.name, texto[inicio:]


def test_atividades_entram_na_conta_sem_olhar_o_tipo() -> None:
    nome, corpo = _definicao_vigente()

    assert "FROM atividades a" in corpo, f"{nome}: a função não soma atividades"
    assert "atividade_aluno" in corpo, f"{nome}: a função não lê o progresso do aluno nas atividades"
    # Nenhum predicado sobre o tipo da atividade: 'missao' (ou qualquer tipo novo) conta igual a 'quiz'.
    assert not re.search(r"\ba\.tipo\b", corpo), f"{nome}: filtro por a.tipo exclui tipos novos da conta"
    assert not re.search(r"atividades\.tipo\b", corpo), f"{nome}: filtro por atividades.tipo exclui tipos novos da conta"


def test_atividade_concluida_conta_por_status_ou_percentual() -> None:
    _, corpo = _definicao_vigente()
    trecho = corpo[corpo.index("FROM atividades a") - 400 : corpo.index("FROM atividades a") + 400]

    assert "concl" in trecho
    assert "percentual_concluido" in trecho and ">= 100" in trecho

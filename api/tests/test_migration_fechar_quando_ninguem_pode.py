from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_13:20261021_14", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_14:20261021_13", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def test_fecha_por_quem_ainda_pode_responder() -> None:
    """A conta antiga era "pares sem resposta", e fechava o desafio na PRIMEIRA resposta de
    cada um — mesmo errada, mesmo com tentativa sobrando. Medido: a 2ª tentativa batia em
    `guilda_desafio_encerrado`, então ninguém nunca teve uma segunda tentativa em modo algum."""
    sql = _upgrade_sql()

    assert "r.questao_id IS NULL" in sql
    assert "OR (NOT r.correta AND COALESCE(r.tentativas, 0) < GREATEST(v_limite, 1))" in sql
    # O `NOT EXISTS` antigo tinha de sair da conta de `faltam`.
    assert "AND NOT EXISTS (\n       SELECT 1 FROM public.guilda_desafio_respostas r" not in sql


def test_o_limite_e_o_mesmo_que_recusa_a_tentativa() -> None:
    """Se a conta de quem pode responder usasse outro número, o desafio ficaria aberto
    esperando uma tentativa que a guarda recusa — ou fecharia com tentativa de sobra."""
    sql = _upgrade_sql()

    assert "guilda_desafio_sem_tentativas" in sql
    # Três usos do MESMO número, e é isso que importa: a guarda que recusa a tentativa a mais,
    # a conta de quem ainda pode responder, e o `tentativas_restantes` que a tela mostra.
    assert sql.count("GREATEST(v_limite, 1)") == 3


def test_acerto_fecha_o_par_na_hora() -> None:
    """Não faz sentido manter o desafio aberto por quem já acertou e tem tentativa sobrando —
    e o `NOT r.correta` é o que garante isso."""
    sql = _sem_comentarios(_upgrade_sql())

    assert "NOT r.correta" in sql


def test_o_join_substitui_o_not_exists() -> None:
    """A conta precisa LER a resposta (correta, tentativas), não só saber se ela existe."""
    sql = _upgrade_sql()

    assert "LEFT JOIN public.guilda_desafio_respostas r" in sql
    assert "ON r.desafio_id = p_desafio_id" in sql


def test_o_resto_do_responder_fica_intacto() -> None:
    """O corpo vem de `20261021_12`, que vem da fase 8: guarda por participação, limite de
    tentativa, acúmulo de tempo e a recusa em desafio encerrado continuam."""
    sql = _upgrade_sql()

    for peca in (
        "FROM public.desafio_participantes dp",
        "AND dp.estado = 'aceito'",
        "guilda_desafio_encerrado",
        "tentativas = public.guilda_desafio_respostas.tentativas + 1",
        "tempo_ms = COALESCE(public.guilda_desafio_respostas.tempo_ms, 0)",
        "v_fechou := public.fn_desafio_encerrar(p_desafio_id);",
    ):
        assert peca in sql, f"{peca} saiu do responder"


def test_downgrade_volta_a_conta_antiga() -> None:
    sql = _downgrade_sql()

    assert "AND NOT EXISTS (" in sql
    assert "OR (NOT r.correta AND" not in sql
    # E a guarda por participação da `_12` continua — este downgrade não desfaz o anterior.
    assert "FROM public.desafio_participantes dp\n        WHERE dp.desafio_id = d.id" in sql

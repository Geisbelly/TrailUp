from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_11:20261021_12", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_12:20261021_11", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def test_a_permissao_passa_a_ser_participacao() -> None:
    """Medido em produção: com `guilda_id` NULL (solo, dupla, turma — obrigatório por
    `guilda_desafios_guilda_do_formato`), a guarda por guilda recusava os três formatos, e
    eles podiam ser criados mas não respondidos."""
    sql = _upgrade_sql()
    codigo = _sem_comentarios(sql)

    assert "FROM public.desafio_participantes dp" in codigo
    assert "AND dp.estado = 'aceito'" in codigo
    assert "FROM public.guilda_membros gm" not in codigo, "a guarda por guilda tinha de sair"


def test_a_pergunta_e_a_mesma_do_placar() -> None:
    """`fn_arena_placar` conta e `fn_desafio_encerrar` paga por participante `aceito`. Se a
    permissão perguntasse outra coisa, quem responde e quem pontua divergiriam."""
    sql = _upgrade_sql()

    assert "dp.desafio_id = d.id" in sql
    assert "dp.aluno_id = auth.uid()" in sql


def test_o_resto_da_fase_8_fica_intacto() -> None:
    """O corpo é recortado do arquivo da fase 8: o limite de tentativa, o acúmulo de tempo e o
    fechamento automático têm de continuar lá."""
    sql = _upgrade_sql()

    for peca in (
        "guilda_desafio_sem_tentativas",
        "guilda_desafio_encerrado",
        "tentativas = public.guilda_desafio_respostas.tentativas + 1",
        "tempo_ms = COALESCE(public.guilda_desafio_respostas.tempo_ms, 0)",
        "v_fechou := public.fn_desafio_encerrar(p_desafio_id);",
        "'desafio_tentativas_dificil'",
    ):
        assert peca in sql, f"{peca} saiu do responder"


def test_a_assinatura_nao_muda() -> None:
    """Só a guarda muda; trocar a assinatura obrigaria o cliente a mudar junto."""
    sql = _upgrade_sql()

    assert "p_desafio_id uuid,\n  p_questao_id bigint,\n  p_resposta text,\n  p_tempo_ms integer DEFAULT NULL" in sql
    assert "DROP FUNCTION IF EXISTS public.guilda_desafio_responder(uuid, bigint, text);" in sql


def test_downgrade_devolve_a_guarda_por_guilda() -> None:
    sql = _downgrade_sql()
    codigo = _sem_comentarios(sql)

    assert "FROM public.guilda_membros gm" in codigo
    # `desafio_participantes dp` continua no corpo — é o laço que conta quem falta responder,
    # e ele usa `dp.desafio_id = p_desafio_id`. O que tem de sair é a GUARDA, que casa por
    # `dp.desafio_id = d.id`.
    assert "dp.desafio_id = d.id" not in codigo
    assert "FROM public.desafio_participantes dp\n    CROSS JOIN" in codigo

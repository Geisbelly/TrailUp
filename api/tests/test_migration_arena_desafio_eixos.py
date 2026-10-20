from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_12:20261021_13", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_13:20261021_12", sql=True)
    return output.getvalue().replace("%%", "%")


def test_devolve_os_eixos_e_o_preset() -> None:
    """A tela de jogo precisa de tempo e tentativas, e `fn_desafio_params_efetivos` não tem
    EXECUTE para `authenticated` (fase 7) — só outra função pode traduzir o preset."""
    sql = _upgrade_sql()

    assert "'dificuldade', d.dificuldade" in sql
    assert "'consequencia', d.consequencia" in sql
    assert "'params', public.fn_desafio_params_efetivos(d.dificuldade)" in sql


def test_o_gabarito_continua_escondido_ate_haver_resposta() -> None:
    """Sem isto a tela entregaria o gabarito junto com a questão."""
    sql = _upgrade_sql()

    assert "CASE WHEN r.questao_id IS NULL THEN NULL" in sql
    assert "ELSE q.resposta_correta END" in sql


def test_continua_exigindo_participante_aceito() -> None:
    """A mesma pergunta que `20261021_12` pôs na permissão de responder: leitura e escrita
    concordam sobre quem está no desafio."""
    sql = _upgrade_sql()

    assert "me.estado = 'aceito'" in sql
    assert "ON me.desafio_id = d.id AND me.aluno_id = auth.uid()" in sql


def test_nada_sai_do_retorno() -> None:
    """Só acrescenta chaves: quem já lia `questoes` continua lendo igual."""
    sql = _upgrade_sql()

    for chave in ("'id', d.id", "'formato', d.formato", "'modo', d.modo", "'status', d.status",
                  "'meu_estado', me.estado", "'minha_equipe', me.equipe", "'questoes'",
                  "'minha_resposta', r.resposta", "'tempo_ms', r.tempo_ms"):
        assert chave in sql, f"{chave} saiu do retorno"


def test_downgrade_tira_so_as_chaves_novas() -> None:
    sql = _downgrade_sql()

    assert "'params', public.fn_desafio_params_efetivos" not in sql
    assert "'dificuldade', d.dificuldade" not in sql
    # E o resto continua de pé.
    assert "CASE WHEN r.questao_id IS NULL THEN NULL" in sql
    assert "me.estado = 'aceito'" in sql

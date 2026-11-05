"""`20261105_21`: o XP de concluir conteúdo do professor sai do banco (#45).

O comportamento (paga na transição, não repete a cada visita, não duplica o evento da API, não derruba o
progresso) foi exercitado num Postgres real (PGlite): ver o PR. Aqui fica o que dá para travar sem banco.
"""

from io import StringIO

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _sql(sentido: str) -> str:
    output = StringIO()
    if sentido == "upgrade":
        migrations.command.upgrade(_offline_alembic_config(output), "20261105_20:20261105_21", sql=True)
    else:
        migrations.command.downgrade(_offline_alembic_config(output), "20261105_21:20261105_20", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_20() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_21").down_revision == "20261105_20"


def test_so_paga_na_transicao_e_nao_a_cada_visita() -> None:
    sql = _sql("upgrade")
    # O app regrava `concluido` a cada visita: sem olhar o OLD, quem concluiu antes receberia o XP depois.
    assert "TG_OP = 'UPDATE' AND position('concl' IN lower(COALESCE(OLD.status::text, ''))) > 0" in sql
    assert "AFTER INSERT OR UPDATE OF status ON public.conteudo_aluno" in sql
    assert "WHEN (NEW.status::text = 'concluido')" in sql


def test_grava_o_mesmo_evento_da_api_com_a_mesma_referencia_e_sem_repetir() -> None:
    sql = _sql("upgrade")
    assert "v_ref := 'conteudo:' || NEW.conteudo_id::text" in sql
    assert "e.tipo = 'conteudo_concluido' AND e.referencia = v_ref" in sql
    assert "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia)" in sql
    # O valor é decidido pelo banco: o gatilho não escreve `valor`.
    assert "valor" not in sql[sql.index("INSERT INTO public.eventos_aluno") : sql.index("EXCEPTION WHEN OTHERS")]


def test_nunca_derruba_a_gravacao_do_progresso_e_nao_e_chamavel_de_fora() -> None:
    sql = _sql("upgrade")
    assert "SECURITY DEFINER" in sql
    assert "EXCEPTION WHEN OTHERS THEN" in sql and "RAISE WARNING" in sql
    assert "REVOKE ALL ON FUNCTION public.trg_conteudo_aluno_xp() FROM PUBLIC, anon, authenticated" in sql


def test_o_downgrade_tira_o_gatilho_antes_da_funcao() -> None:
    sql = _sql("downgrade")
    assert sql.index("DROP TRIGGER IF EXISTS trg_conteudo_aluno_xp") < sql.index("DROP FUNCTION IF EXISTS public.trg_conteudo_aluno_xp()")

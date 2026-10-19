from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _sql(origem: str, destino: str, *, down: bool = False) -> str:
    output = StringIO()
    cfg = _offline_alembic_config(output)
    (migrations.command.downgrade if down else migrations.command.upgrade)(cfg, f"{origem}:{destino}", sql=True)
    return output.getvalue()


def _sobe() -> str:
    return _sql("20261017_08", "20261017_09")


def test_escopo_evento_aceito_sem_perfil_alvo_e_metrica_nova() -> None:
    sql = _sobe()

    assert "ARRAY['comum'::text, 'perfil'::text, 'evento'::text]" in sql
    assert "escopo = ANY (ARRAY['comum'::text, 'evento'::text]) AND perfil_alvo IS NULL" in sql
    # os 7 perfis continuam o único valor possível de perfil_alvo
    assert "'socializer'::text" in sql and "'mastermind'::text" in sql
    assert "'atividades_rapidas', 'evento_medalha'" in sql


def test_colunas_das_medalhas_e_guarda_do_evento() -> None:
    sql = _sobe()

    assert "ADD COLUMN IF NOT EXISTS conquista_participacao_id bigint REFERENCES public.conquistas(id) ON DELETE SET NULL" in sql
    assert "ADD COLUMN IF NOT EXISTS conquista_destaque_id bigint REFERENCES public.conquistas(id) ON DELETE SET NULL" in sql
    guarda = sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_eventos_classe_guarda") :]
    assert "NEW.conquista_participacao_id IS DISTINCT FROM OLD.conquista_participacao_id" in guarda
    assert "NEW.conquista_destaque_id IS DISTINCT FROM OLD.conquista_destaque_id" in guarda
    assert guarda.index("conquista_destaque_id IS DISTINCT") < guarda.index("app.evento_transicao")


def test_apuracao_entrega_medalha_sem_duplicar_e_sem_pontos() -> None:
    sql = _sobe()
    apurar = sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar") :]

    assert apurar.count("INSERT INTO public.conquistas_aluno") == 2
    assert apurar.count("NOT EXISTS (SELECT 1 FROM public.conquistas_aluno x") == 2
    assert "WHERE r.evento_id = p_evento_id AND r.participou" in apurar
    assert "WHERE r.evento_id = p_evento_id AND r.destaque" in apurar
    assert "'evento', 'evento_participacao', 'evento'" in apurar
    assert "'evento', 'evento_destaque', 'evento'" in apurar
    assert apurar.count("0, v_evento.classe_id, v_evento.criado_por") == 2  # pontos_recompensa = 0
    assert "jsonb_build_object('metrica', 'evento_medalha'" in apurar
    # a conquista só é criada uma vez por evento
    assert "v_evento.medalha_participacao AND v_conq_part IS NULL" in apurar
    assert "v_evento.medalha_destaque AND v_conq_dest IS NULL" in apurar
    # a apuração anterior (resultado e moedas) continua
    assert "INSERT INTO public.eventos_classe_resultado" in apurar and "INSERT INTO public.moedas_ledger" in apurar


def test_funcoes_do_professor_ignoram_medalhas_de_evento() -> None:
    sql = _sobe()

    assert "WHERE classe_id = p_classe_id AND escopo <> 'evento'" in sql
    assert "WHERE c.classe_id = p_classe_id AND c.escopo <> 'evento'" in sql
    # o professor continua sem poder criar escopo 'evento'
    assert "IF p_escopo NOT IN ('comum', 'perfil') THEN" in sql
    assert " NOT IN (SELECT" not in sql


def test_downgrade_restaura_e_apaga_as_medalhas_de_evento() -> None:
    sql = _sql("20261017_09", "20261017_08", down=True)

    assert "DELETE FROM public.conquistas WHERE escopo = 'evento'" in sql
    assert sql.index("DELETE FROM public.conquistas WHERE escopo = 'evento'") < sql.index("ARRAY['comum'::text, 'perfil'::text])")
    assert "DROP COLUMN IF EXISTS conquista_participacao_id" in sql
    assert "evento_medalha" not in sql.split("DELETE FROM public.conquistas")[0].split("fn_conquista_metrica_suportada")[-1]

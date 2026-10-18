from io import StringIO
from unittest.mock import AsyncMock

import pytest

from app.db import migrations
from app.services import personalizacao_jobs as jobs
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261011_01:20261011_02", sql=True)
    return output.getvalue()


def _funcao(sql: str) -> str:
    return sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_enqueue_student_enrollment_job") : sql.index("CREATE TRIGGER")]


def test_trigger_after_insert_em_classe_aluno() -> None:
    sql = _upgrade_sql()

    assert "RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER" in sql
    assert "SET search_path = public, pg_temp" in sql
    assert "CREATE TRIGGER trg_classe_aluno_enrollment_job" in sql
    assert "AFTER INSERT ON public.classe_aluno" in sql
    assert "FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_student_enrollment_job()" in sql
    # Só o gatilho chama a função; ninguém a executa direto.
    assert "REVOKE ALL ON FUNCTION public.fn_enqueue_student_enrollment_job() FROM PUBLIC, anon, authenticated" in sql
    assert "UPDATE alembic_version SET version_num='20261011_02'" in sql


def test_mesmo_job_que_a_api_cria_para_o_console() -> None:
    corpo = _funcao(_upgrade_sql())

    # Job: kind, status, dono, contadores e payload no formato de enqueue_personalizacao_job.
    assert "'student_enrollment', 'pending', NEW.classe_id, NEW.aluno_id" in corpo
    assert "CASE WHEN cardinality(v_topicos) = 1 THEN v_topicos[1] END" in corpo
    assert "CASE WHEN cardinality(v_conteudos) = 1 THEN v_conteudos[1] END" in corpo
    for chave in ("'reason'", "'topico_ids'", "'conteudo_ids'", "'target_profile_map'"):
        assert chave in corpo
    assert "'{}'::jsonb," in corpo  # media_snapshot
    assert "SET total_targets = alvos.total" in corpo
    # Chave do mapa = _target_profile_map_key.
    assert "t.aluno_id::text || ':' || t.topico_id || ':' || coalesce(t.conteudo_id, 0)" in corpo
    assert jobs._target_profile_map_key(aluno_id="a", topico_id=1, conteudo_id=None) == "a:1:0"
    # Alvos: aluno dono, perfil dominante, não é template.
    assert "SELECT v_job_id, NEW.aluno_id, alvo.topico_id, alvo.conteudo_id, v_perfil," in corpo
    assert "false, 'pending', 0, now(), now()" in corpo
    # Perfil dominante: mesma ordem de listar_alunos_classe_com_perfil_dominante.
    assert "ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC" in corpo
    assert "THEN 'mastermind'" in corpo and "WHEN v_perfil = 'socialiser' THEN 'socializer'" in corpo


def test_escopo_deduplicacao_e_falha() -> None:
    corpo = _funcao(_upgrade_sql())

    # Turma sem tópico não enfileira; tópicos sem conteúdo viram alvo (tópico, NULL).
    assert "IF cardinality(v_topicos) = 0 THEN" in corpo
    assert "SELECT t, NULL::bigint" in corpo
    # Mesma janela da API (list_open_jobs_by_payload): pending ou processing do mesmo aluno e turma.
    assert "j.status IN ('pending', 'processing')" in corpo
    assert "j.aluno_id = NEW.aluno_id" in corpo
    assert "pg_advisory_xact_lock(hashtext('student_enrollment:'" in corpo
    # A matrícula vale mesmo se enfileirar falhar.
    assert "EXCEPTION WHEN OTHERS THEN" in corpo
    assert "RAISE WARNING" in corpo


def test_downgrade() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261011_02:20261011_01", sql=True)
    rendered = output.getvalue()
    assert rendered.index("DROP TRIGGER IF EXISTS trg_classe_aluno_enrollment_job") < rendered.index(
        "DROP FUNCTION IF EXISTS public.fn_enqueue_student_enrollment_job()"
    )


@pytest.mark.asyncio
async def test_worker_aceita_o_job_no_formato_do_trigger(monkeypatch) -> None:
    """O worker processa o job que o trigger grava: alvo com dono, perfil na
    própria linha, payload com reason/trigger_source do banco (que ele não lê)."""
    aluno = "b49f2e21-a6f9-4c8d-9533-5a32bb219754"
    job = {
        "id": "00000000-0000-0000-0000-000000000001",
        "kind": "student_enrollment",
        "status": "processing",
        "classe_id": 54,
        "aluno_id": aluno,
        "topico_id": None,
        "conteudo_id": None,
        "trigger_source": "db_classe_aluno_trigger",
        "payload": {
            "reason": "matricula_aluno_db",
            "topico_ids": [131, 133],
            "conteudo_ids": [192, 193],
            "target_profile_map": {f"{aluno}:131:192": "achiever", f"{aluno}:133:193": "achiever"},
        },
        "media_snapshot": {},
    }
    target = {
        "id": 1,
        "aluno_id": aluno,
        "topico_id": 131,
        "conteudo_id": 192,
        "brainhex_profile_key": "achiever",
        "is_profile_template": False,
        "status": "pending",
        "attempts": 0,
        "personalizacao_id": None,
    }
    derivar = AsyncMock(return_value=777)
    monkeypatch.setattr(jobs, "derivar_personalizacao_do_base", derivar)
    record = {"id": 777, "status": "pronto", "aluno_id": aluno, "classe_id": 54}
    monkeypatch.setattr(jobs.ConteudoPersonalizadoRepository, "buscar_por_id", AsyncMock(return_value=record))
    monkeypatch.setattr(jobs, "_seed_progress", AsyncMock())

    class Sessao:
        async def commit(self) -> None:
            pass

    resultado = await jobs._process_media_render_target(app=object(), session=Sessao(), job=job, target=target)

    assert resultado == {"record": record}
    assert derivar.await_args.kwargs == {
        "session": derivar.await_args.kwargs["session"],
        "aluno_id": aluno,
        "classe_id": 54,
        "topico_id": 131,
        "conteudo_id": 192,
        "brainhex_profile_key": "achiever",
    }

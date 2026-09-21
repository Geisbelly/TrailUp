"""Validate progress/time migrations against live schema; ALWAYS roll back test data."""
import argparse
import importlib.util
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-migrations', action='store_true')
    parser.add_argument('--aluno', required=True)
    parser.add_argument('--topico', type=int, required=True)
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn:
        tx = conn.begin()
        try:
            if args.with_migrations:
                for filename in ['20260920_08_activity_answer_completion.py', '20260920_09_study_time_sources.py']:
                    spec = importlib.util.spec_from_file_location('study_migration', Path(__file__).resolve().parents[1] / 'alembic/versions' / filename)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    conn.execute(text(module.SQL))
            params = {'uid': args.aluno, 'topic': args.topico}
            pct = conn.execute(text('SELECT percentual_concluido FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic'), params).scalar_one()
            assert pct == 100, f'Expected real answered topic at 100, got {pct}'
            print('PASS: all persisted answers recover topic completion')

            activity = conn.execute(text('SELECT min(id) FROM atividades WHERE topico_id=:topic'), params).scalar_one()
            params['activity'] = activity
            nested = conn.begin_nested()
            conn.execute(text("INSERT INTO questoes(atividade_id,enunciado,tipo) VALUES(:activity,'Temporary unanswered test question','quiz')"), params)
            conn.execute(text('SELECT public.trailup_recalcular_atividade_respostas(CAST(:uid AS uuid),:activity)'), params)
            pct = conn.execute(text('SELECT percentual_concluido FROM atividade_aluno WHERE aluno_id=CAST(:uid AS uuid) AND atividade_id=:activity'), params).scalar_one()
            assert pct == 50, pct
            conn.execute(text('UPDATE questao_aluno SET resposta=resposta WHERE aluno_id=CAST(:uid AS uuid) AND atividade_id=:activity'), params)
            assert conn.execute(text('SELECT percentual_concluido FROM atividade_aluno WHERE aluno_id=CAST(:uid AS uuid) AND atividade_id=:activity'), params).scalar_one() == 50
            nested.rollback()
            print('PASS: one answered question out of two = 50; repeat answers do not complete the quiz')

            nested = conn.begin_nested()
            profile = conn.execute(text('SELECT perfil_ativo FROM alunos WHERE id=CAST(:uid AS uuid)'), params).scalar_one()
            shared = conn.execute(text("SELECT id,classe_id FROM conteudo_personalizado WHERE topico_id=:topic AND aluno_id IS NULL AND brainhex_profile_key='seeker' LIMIT 1"),params).mappings().one()
            conn.execute(text("INSERT INTO personalizacao_percurso(aluno_id,personalizacao_id,classe_id,topico_id,item_keys) VALUES(CAST(:uid AS uuid),:pid,:classe,:topic,'[\"audit:pending1\",\"audit:pending2\"]'::jsonb) ON CONFLICT(aluno_id,personalizacao_id) DO UPDATE SET item_keys=EXCLUDED.item_keys"),{**params,'pid':shared['id'],'classe':shared['classe_id']})
            conn.execute(text("UPDATE alunos SET perfil_ativo='seeker' WHERE id=CAST(:uid AS uuid)"),params)
            assert conn.execute(text('SELECT percentual_concluido FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic'),params).scalar_one()==0
            conn.execute(text('UPDATE alunos SET perfil_ativo=:profile WHERE id=CAST(:uid AS uuid)'),{**params,'profile':profile})
            assert conn.execute(text('SELECT percentual_concluido FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic'),params).scalar_one()==100
            nested.rollback()
            print('PASS: profile change recalculates the selected journey immediately')

            before = Decimal(str(conn.execute(text('SELECT tempo_gasto_min FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic'), params).scalar_one()))
            conn.execute(text("SELECT set_config('request.jwt.claim.sub',:uid,true)"), params)
            conn.execute(text('SET LOCAL ROLE authenticated'))
            params['interval'] = str(uuid4())
            rpc = text('SELECT public.trailup_registrar_intervalo_estudo(CAST(:interval AS uuid),CAST(:uid AS uuid),:topic,NULL,:activity,1)')
            conn.execute(rpc, params)
            conn.execute(rpc, params)
            after = Decimal(str(conn.execute(text('SELECT tempo_gasto_min FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic'), params).scalar_one()))
            assert abs(after-before-1) < Decimal('0.0001'), (before, after)
            print('PASS: duplicate delivery of 60 seconds adds exactly one minute')
            batch = conn.execute(text('SELECT id FROM telemetria_lotes WHERE aluno_id=CAST(:uid AS uuid) LIMIT 1'),params).scalar_one()
            duplicate = conn.execute(text('''INSERT INTO telemetria_lotes
              SELECT (jsonb_populate_record(NULL::telemetria_lotes,
                to_jsonb(l)||jsonb_build_object('id',gen_random_uuid()))).*
              FROM telemetria_lotes l WHERE l.id=:batch
              ON CONFLICT(sessao_id,captured_at,flush_reason) DO NOTHING RETURNING id'''),{'batch':batch}).scalar_one_or_none()
            assert duplicate is None
            conn.execute(text('''INSERT INTO telemetria_time_metric_entries(
              lote_id,sessao_id,aluno_id,classe_id,topico_id,scope,entry_key,dwell_sec,active_sec,idle_sec,captured_at)
              SELECT lote_id,sessao_id,aluno_id,classe_id,topico_id,scope,entry_key,dwell_sec,active_sec,idle_sec,captured_at
              FROM telemetria_time_metric_entries WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic AND scope='topic' LIMIT 1
              ON CONFLICT(lote_id,scope,entry_key) DO NOTHING'''),params)
            print('PASS: authenticated fallback can find/retry its batch and metrics without duplicates')
            nested = conn.begin_nested()
            try:
                conn.execute(rpc, {**params, 'uid': '00000000-0000-0000-0000-000000000001', 'interval': str(uuid4())})
            except DBAPIError as exc:
                assert getattr(exc.orig,'sqlstate',None)=='42501'
            else:
                raise AssertionError('Other-student time was accepted')
            finally:
                nested.rollback()
            print('PASS: cannot record time for another student')
            conn.execute(text('RESET ROLE'))
            # Replaying the telemetry time projection must retain the direct minute.
            definition = conn.execute(text("SELECT pg_get_functiondef('public.trailup_tempo_after_telemetria()'::regprocedure)")).scalar_one()
            assert definition.count('tempo_direto_min + public.trailup_tempo_telemetria_min') == 3
            total = conn.execute(text("SELECT tempo_direto_min + public.trailup_tempo_telemetria_min(aluno_id,'topic',topico_id,NULL,NULL) FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic"), params).scalar_one()
            assert abs(total-after)<Decimal('0.0001')
            print('PASS: independent time sources reconcile without overwriting direct study time')
            conn.execute(text('''INSERT INTO telemetria_time_metric_entries(
              lote_id,sessao_id,aluno_id,classe_id,topico_id,scope,entry_key,dwell_sec,active_sec,idle_sec,captured_at)
              SELECT lote_id,sessao_id,aluno_id,classe_id,topico_id,scope,:key,60,60,0,now()
              FROM telemetria_time_metric_entries WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic AND scope='topic' LIMIT 1'''),{**params,'key':'audit:'+str(uuid4())})
            with_telemetry = Decimal(str(conn.execute(text('SELECT tempo_gasto_min FROM topico_aluno WHERE aluno_id=CAST(:uid AS uuid) AND topico_id=:topic'),params).scalar_one()))
            assert abs(with_telemetry-after-1)<Decimal('0.0001'),(after,with_telemetry)
            print('PASS: late telemetry adds one minute and preserves the earlier direct interval')
        finally:
            tx.rollback()
            print('rolled_back: true')


if __name__ == '__main__':
    main()

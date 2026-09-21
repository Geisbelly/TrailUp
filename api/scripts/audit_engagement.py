"""Audit engagement evidence and RLS without retaining test writes."""
import argparse
import importlib.util
from pathlib import Path
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--aluno', required=True)
    parser.add_argument('--topico', type=int, required=True)
    parser.add_argument('--with-migration', action='store_true')
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn:
        tx = conn.begin()
        try:
            if args.with_migration:
                spec = importlib.util.spec_from_file_location('presence_migration', Path(__file__).resolve().parents[1] / 'alembic/versions/20260920_10_study_presence.py')
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                conn.execute(text(module.SQL))
            params = {'uid': args.aluno, 'topic': args.topico}
            print('migration:', conn.execute(text('SELECT version_num FROM alembic_version')).scalar_one())
            for row in conn.execute(text('SELECT tipo,count(*),max(criado_em) AS last_event FROM eventos_aluno WHERE aluno_id=CAST(:uid AS uuid) GROUP BY tipo ORDER BY last_event DESC'),params).mappings():
                print('event_summary:',dict(row))
            for row in conn.execute(text("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('questao_aluno','personalizacao_item_progresso','topico_aluno','conteudo_aluno','atividade_aluno') AND data_type LIKE 'timestamp%' ORDER BY table_name,column_name")).mappings():
                print('evidence_column:',dict(row))
            conn.execute(text("SELECT set_config('request.jwt.claim.sub',:uid,true)"), params)
            conn.execute(text('SET LOCAL ROLE authenticated'))
            event_count = conn.execute(text('SELECT count(*) FROM eventos_aluno WHERE aluno_id=CAST(:uid AS uuid)'),params).scalar_one()
            print('own_events_readable:',event_count)
            presence = conn.execute(text("SELECT trailup_resumo_presenca('America/Sao_Paulo')")).scalar_one()
            assert len(presence['semana_diaria']) == 7
            assert presence['dias_ativos'] == sum(1 for value in presence['semana_diaria'] if value > 0)
            print('presence:', presence)
            last_answer = conn.execute(text('SELECT max(criado_em) FROM questao_aluno WHERE aluno_id=CAST(:uid AS uuid)'),params).scalar_one()
            assert datetime.fromisoformat(presence['ultimo_registro']) >= last_answer
            assert conn.execute(text('SELECT count(*) FROM eventos_aluno WHERE aluno_id=CAST(:uid AS uuid)'),params).scalar_one() == event_count
            print('PASS: saved answers contribute to presence even without reward events')
            conn.execute(text("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)"))
            empty = conn.execute(text("SELECT trailup_resumo_presenca('America/Sao_Paulo')")).scalar_one()
            assert empty['dias_ativos'] == 0 and empty['ultimo_registro'] is None
            print('PASS: presence cannot expose another student records')
            conn.execute(text("SELECT set_config('request.jwt.claim.sub',:uid,true)"),params)
            conn.execute(text("INSERT INTO eventos_aluno(aluno_id,tipo,referencia,valor) VALUES(CAST(:uid AS uuid),'topico_iniciado','topico:'||CAST(:topic AS text),0)"),params)
            print('PASS: authenticated student can register study event')
            nested = conn.begin_nested()
            try:
                conn.execute(text('SET LOCAL ROLE anon'))
                conn.execute(text("SELECT trailup_resumo_presenca('America/Sao_Paulo')"))
            except DBAPIError as exc:
                assert getattr(exc.orig,'sqlstate',None) == '42501'
                print('PASS: anonymous cannot read presence')
            else:
                raise AssertionError('Anonymous access accepted')
            finally:
                nested.rollback()
        finally:
            tx.rollback()
            print('rolled_back: true')


if __name__ == '__main__':
    main()

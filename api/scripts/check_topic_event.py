"""Reproduce the authenticated topic event inside an always-rolled-back transaction."""
import argparse
import json
import importlib
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
                from pathlib import Path
                spec = importlib.util.spec_from_file_location('event_migration', Path(__file__).resolve().parents[1] / 'alembic/versions/20260920_07_achievement_trigger_permissions.py')
                migration = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(migration)
                conn.execute(text(migration.SQL))
            claims = json.dumps({'sub': args.aluno, 'role': 'authenticated'})
            conn.execute(text("SELECT set_config('request.jwt.claims', :claims, true)"), {'claims': claims})
            conn.execute(text("SELECT set_config('request.jwt.claim.sub', :uid, true)"), {'uid': args.aluno})
            conn.execute(text('SET LOCAL ROLE authenticated'))
            print('authenticated_uid_matches:', conn.execute(text('SELECT auth.uid()=CAST(:uid AS uuid)'), {'uid': args.aluno}).scalar())
            row = conn.execute(text("INSERT INTO public.eventos_aluno(aluno_id, tipo, referencia, valor) VALUES (CAST(:uid AS uuid), 'topico_iniciado', :ref, 0) RETURNING tipo, classe_id"), {'uid': args.aluno, 'ref': f'topico:{args.topico}'}).mappings().one()
            print('event:', dict(row))
            for event_type, target in [('conquista_desbloqueada', args.aluno), ('topico_iniciado', '00000000-0000-0000-0000-000000000001')]:
                nested = conn.begin_nested()
                try:
                    conn.execute(text("INSERT INTO public.eventos_aluno(aluno_id, tipo, referencia, valor) VALUES (CAST(:uid AS uuid), :tipo, :ref, 99999)"), {'uid': target, 'tipo': event_type, 'ref': f'topico:{args.topico}'})
                except DBAPIError as exc:
                    assert getattr(exc.orig, 'sqlstate', None) == '42501', str(exc.orig)
                    print('forbidden_write_blocked:', event_type)
                else:
                    raise AssertionError('Unauthorized event was accepted')
                finally:
                    nested.rollback()
        except DBAPIError as exc:
            print('database_error:', str(exc.orig))
        finally:
            tx.rollback()
            print('rolled_back: true')


if __name__ == '__main__':
    main()

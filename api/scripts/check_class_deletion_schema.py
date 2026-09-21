"""Read-only inspection of class/enrollment deletion constraints and triggers."""
import argparse

from sqlalchemy import create_engine, text

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--functions', nargs='*')
    parser.add_argument('--tables', nargs='*')
    parser.add_argument('--policies', nargs='*')
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn:
        if args.policies is not None:
            for table in args.policies:
                for row in conn.execute(text("SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename=:table"), {'table': table}).mappings():
                    print(dict(row))
            return
        if args.tables is not None:
            for table in args.tables:
                print('TABLE', table)
                for row in conn.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c' AND conrelid=to_regclass(:table)"), {'table': 'public.' + table}).scalars():
                    print(row)
                for row in conn.execute(text("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=:table ORDER BY ordinal_position"), {'table': table}).mappings():
                    print(dict(row))
                for row in conn.execute(text("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid=to_regclass(:table)"), {'table': 'public.' + table}).scalars():
                    print(row)
            return
        if args.functions is not None:
            for name in args.functions:
                for definition in conn.execute(text('SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname=:name'), {'name': name}).scalars():
                    print(definition)
            return
        print('Revision:', conn.execute(text('SELECT version_num FROM alembic_version')).scalar())
        for row in conn.execute(text("""
            SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent,
                   conname, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
            ORDER BY parent, child
        """)).mappings():
            print(dict(row))
        for row in conn.execute(text("""
            SELECT t.tgrelid::regclass::text AS relation, t.tgname,
                   pg_get_triggerdef(t.oid) AS trigger, pg_get_functiondef(t.tgfoid) AS function
            FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (
              'public.classe'::regclass, 'public.classe_aluno'::regclass,
              'public.topicos'::regclass, 'public.conteudos'::regclass)
            ORDER BY relation, t.tgname
        """)).mappings():
            print(dict(row))
        for row in conn.execute(text("""
            SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
            WHERE schemaname='public' AND tablename IN ('classe', 'classe_aluno')
        """)).mappings():
            print(dict(row))


if __name__ == '__main__':
    main()

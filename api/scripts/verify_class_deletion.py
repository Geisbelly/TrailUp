"""Exercise deletion on synthetic classes only; ALWAYS roll back all DB writes."""
import argparse
import importlib.util
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-migration', action='store_true')
    args = parser.parse_args()
    s = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(s.alembic_database_url or s.database_url))
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            conn.execute(text("SET LOCAL statement_timeout='20s'"))
            if args.with_migration:
                path = Path(__file__).resolve().parents[1] / 'alembic/versions/20260920_06_class_deletion_atomic.py'
                spec = importlib.util.spec_from_file_location('deletion_migration', path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                conn.execute(text(module.SQL))
            owner = conn.execute(text('SELECT id FROM public.professor ORDER BY id LIMIT 1')).scalar_one()
            student = conn.execute(text('SELECT id FROM public.alunos WHERE id<>:owner ORDER BY id LIMIT 1'), {'owner': owner}).scalar_one()
            # Explicit IDs avoid the production sequences; never target real classes.
            base = 1_000_000_000 + (uuid4().int % 500_000_000)
            params = {'owner': owner, 'student': student, 'id': base, 'other': base + 1}
            for table in ('classe', 'topicos', 'conteudos', 'classe_aluno', 'bag_itens', 'conteudo_personalizado', 'personalizacao_item_progresso', 'materiais_gerados', 'atividades', 'questoes', 'cards_personalizados', 'fontes_personalizacao'):
                assert not conn.execute(text(f'SELECT EXISTS(SELECT 1 FROM public.{table} WHERE id IN (:id,:other))'), params).scalar()
            for key in ('id', 'other'):
                fixture = {**params, 'fixture': params[key]}
                conn.execute(text("INSERT INTO public.classe(id,professor_id,descricao) OVERRIDING SYSTEM VALUE VALUES (:fixture,:owner,'__rollback_delete_test__')"), fixture)
                conn.execute(text("INSERT INTO public.topicos(id,classe_id,nome) VALUES (:fixture,:fixture,'__rollback_delete_test__')"), fixture)
                conn.execute(text("INSERT INTO public.conteudos(id,topico_id,titulo,tipo,conteudo) VALUES (:fixture,:fixture,'__rollback_delete_test__','texto','Teste')"), fixture)
                conn.execute(text('INSERT INTO public.classe_aluno(id,classe_id,aluno_id) OVERRIDING SYSTEM VALUE VALUES (:fixture,:fixture,:student)'), fixture)
                conn.execute(text("INSERT INTO public.conteudo_personalizado(id,classe_id,topico_id,conteudo_id,ciclo_id) OVERRIDING SYSTEM VALUE VALUES (:fixture,:fixture,:fixture,:fixture,'rollback-test')"), fixture)
                conn.execute(text("INSERT INTO public.personalizacao_item_progresso(id,personalizacao_id,aluno_id,classe_id,topico_id,item_key,item_kind,item_title) OVERRIDING SYSTEM VALUE VALUES (:fixture,:fixture,:student,:fixture,:fixture,'test-item','content','Teste')"), fixture)
                conn.execute(text("INSERT INTO public.materiais_gerados(id,aluno_id,conteudo_id,tipo) OVERRIDING SYSTEM VALUE VALUES (:fixture,:student,:fixture,'markdown')"), fixture)
                conn.execute(text("INSERT INTO public.atividades(id,topico_id,titulo,tipo) VALUES (:fixture,:fixture,'Teste','quiz')"), fixture)
                conn.execute(text("INSERT INTO public.questoes(id,atividade_id,enunciado) VALUES (:fixture,:fixture,'Teste?')"), fixture)
                conn.execute(text('INSERT INTO public.atividade_conteudos(atividade_id,conteudo_id) VALUES (:fixture,:fixture)'), fixture)
                conn.execute(text("INSERT INTO public.cards_personalizados(id,classe_id,topico_id,conteudo_id,ciclo_id,titulo,descricao) OVERRIDING SYSTEM VALUE VALUES (:fixture,:fixture,:fixture,:fixture,'rollback-test','Teste','Teste')"), fixture)
                conn.execute(text("INSERT INTO public.fontes_personalizacao(id,classe_id,topico_id,conteudo_id,tipo) OVERRIDING SYSTEM VALUE VALUES (:fixture,:fixture,:fixture,:fixture,'texto')"), fixture)
            guild = conn.execute(text("INSERT INTO public.guildas(classe_id,nome,criado_por) VALUES (:id,'Teste rollback',:student) RETURNING id"), params).scalar_one()
            conn.execute(text("INSERT INTO public.guilda_evento_snapshot(evento_id,classe_id,guilda_id,aluno_id,aluno_nome,posicao) VALUES ('test',:id,:guild,:student,'Teste',1)"), {**params, 'guild': guild})
            conn.execute(text("INSERT INTO public.bag_itens(id,aluno_id,classe_id,topico_id,conteudo_id,tipo,titulo,conteudo) OVERRIDING SYSTEM VALUE VALUES (:id,:student,:id,:id,:id,'resumo','__rollback_delete_test__','Teste')"), params)
            conn.execute(text("SELECT set_config('request.jwt.claim.sub', :owner, true), set_config('request.jwt.claims', json_build_object('sub', CAST(:owner AS text), 'role', 'authenticated')::text, true)"), {'owner': str(owner)})
            conn.execute(text('SET LOCAL ROLE authenticated'))
            removed = conn.execute(text('DELETE FROM public.classe_aluno WHERE classe_id=:id AND aluno_id=:student RETURNING aluno_id'), params).all()
            assert len(removed) == 1
            conn.execute(text('RESET ROLE'))
            residual = conn.execute(text('SELECT count(*) FROM public.topico_aluno WHERE aluno_id=:student AND topico_id=:id'), params).scalar_one()
            print('Enrollment removed; residual topic aggregates:', residual)
            if args.with_migration:
                assert residual == 0
                assert conn.execute(text('SELECT count(*) FROM public.personalizacao_item_progresso WHERE classe_id=:id'), params).scalar_one() == 0
                assert conn.execute(text('SELECT count(*) FROM public.materiais_gerados WHERE conteudo_id=:id'), params).scalar_one() == 0
                assert conn.execute(text('SELECT count(*) FROM public.conteudo_personalizado WHERE classe_id=:id'), params).scalar_one() == 1
                assert conn.execute(text('SELECT count(*) FROM public.cards_personalizados WHERE classe_id=:id'), params).scalar_one() == 1
                # Unauthorized callers cannot delete another teacher's class.
                with conn.begin_nested() as guard:
                    conn.execute(text("SELECT set_config('request.jwt.claim.sub', :student, true)"), {'student': str(student)})
                    conn.execute(text('SET LOCAL ROLE authenticated'))
                    try:
                        conn.execute(text('SELECT public.excluir_classe(:id)'), params)
                    except DBAPIError as exc:
                        assert exc.orig.sqlstate == '42501'
                        guard.rollback()
                    else:
                        raise AssertionError('Unauthorized deletion was accepted')
                # Force a late FK error: every earlier deletion/update must roll back.
                probe_schema = 'deletion_probe_' + uuid4().hex
                conn.execute(text(f'CREATE SCHEMA {probe_schema}'))
                conn.execute(text(f'CREATE TABLE {probe_schema}.blocker (classe_id bigint REFERENCES public.classe(id))'))
                conn.execute(text(f'INSERT INTO {probe_schema}.blocker VALUES (:id)'), params)
                with conn.begin_nested() as guard:
                    conn.execute(text('SET LOCAL ROLE authenticated'))
                    try:
                        conn.execute(text('SELECT public.excluir_classe(:id)'), params)
                    except DBAPIError as exc:
                        assert exc.orig.sqlstate == '23503'
                        guard.rollback()
                    else:
                        raise AssertionError('Expected blocker did not abort deletion')
                assert conn.execute(text('SELECT classe_id FROM public.bag_itens WHERE id=:id'), params).scalar_one() == base
                assert conn.execute(text('SELECT count(*) FROM public.conteudo_personalizado WHERE classe_id=:id'), params).scalar_one() == 1
                conn.execute(text(f'DROP TABLE {probe_schema}.blocker'))
                conn.execute(text('SET LOCAL ROLE authenticated'))
                assert conn.execute(text('SELECT public.excluir_classe(:id)'), params).scalar_one() is True
                conn.execute(text('RESET ROLE'))
                assert conn.execute(text('SELECT count(*) FROM public.classe WHERE id=:id'), params).scalar_one() == 0
                assert conn.execute(text('SELECT count(*) FROM public.classe_aluno WHERE classe_id=:other AND aluno_id=:student'), params).scalar_one() == 1
                assert conn.execute(text('SELECT count(*) FROM public.topico_aluno WHERE topico_id=:other AND aluno_id=:student'), params).scalar_one() == 1
                bag = conn.execute(text('SELECT classe_id,topico_id,conteudo_id FROM public.bag_itens WHERE id=:id'), params).one()
                assert tuple(bag) == (None, None, None)
                print('PASS: atomic class deletion including late-error rollback, ownership guard, shared material preserved on unenrollment, other class intact, saved bag preserved')
        except DBAPIError as exc:
            # No connection URL, SQL parameters, or real user identifiers in output.
            print('Database error:', exc.orig.sqlstate, exc.orig.diag.message_primary)
            print('Context:', exc.orig.diag.context)
            raise SystemExit(1) from None
        finally:
            transaction.rollback()
            engine.dispose()
            print('ROLLBACK: no class or enrollment was permanently removed; test fixtures discarded.')


if __name__ == '__main__':
    main()

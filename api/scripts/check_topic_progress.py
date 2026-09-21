"""Read-only diagnosis of personalized completion; no content or credentials printed."""
import argparse
import json

from sqlalchemy import create_engine, text

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--aluno', required=True)
    parser.add_argument('--classe', required=True, type=int)
    parser.add_argument('--verify-manifest', action='store_true', help='Validate manifest/RLS inside a rolled-back savepoint')
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn:
        params = {'aluno': args.aluno, 'classe': args.classe}
        print('enrollment:', [dict(row) for row in conn.execute(text('''
            SELECT "porcentagemConcluida", "isComplete" FROM classe_aluno
            WHERE aluno_id=CAST(:aluno AS uuid) AND classe_id=:classe
        '''), params).mappings()])
        print('owns_class:', conn.execute(text('SELECT EXISTS(SELECT 1 FROM classe WHERE id=:classe AND professor_id=CAST(:aluno AS uuid))'), params).scalar())
        print('manifest_count:', conn.execute(text('SELECT count(*) FROM personalizacao_percurso WHERE aluno_id=CAST(:aluno AS uuid) AND classe_id=:classe'), params).scalar())
        print('active_profile:', conn.execute(text('SELECT perfil_ativo FROM alunos WHERE id=CAST(:aluno AS uuid)'), {'aluno': args.aluno}).scalar())
        for row in conn.execute(text('''
            SELECT c.topico_id, 'conteudo' AS kind, c.id, ca.status::text, ca.percentual_concluido
            FROM conteudos c JOIN topicos t ON t.id=c.topico_id
            LEFT JOIN conteudo_aluno ca ON ca.conteudo_id=c.id AND ca.aluno_id=CAST(:aluno AS uuid)
            WHERE t.classe_id=:classe
            UNION ALL
            SELECT a.topico_id, 'atividade', a.id, aa.status::text, aa.percentual_concluido
            FROM atividades a JOIN topicos t ON t.id=a.topico_id
            LEFT JOIN atividade_aluno aa ON aa.atividade_id=a.id AND aa.aluno_id=CAST(:aluno AS uuid)
            WHERE t.classe_id=:classe
            ORDER BY topico_id, kind, id
        '''), params).mappings():
            if row['percentual_concluido'] != 100 and row['status'] != 'concluido':
                print('pending_teacher_item:', dict(row))
        for row in conn.execute(text('''
            SELECT pip.topico_id, cp.brainhex_profile_key,
              cp.aluno_id=pip.aluno_id AS own_record,
              count(*) AS registered, count(*) FILTER(WHERE pip.percentual_concluido>=100) AS completed
            FROM personalizacao_item_progresso pip
            JOIN conteudo_personalizado cp ON cp.id=pip.personalizacao_id
            WHERE pip.aluno_id=CAST(:aluno AS uuid) AND pip.classe_id=:classe
            GROUP BY pip.topico_id, cp.brainhex_profile_key, (cp.aluno_id=pip.aluno_id)
            ORDER BY pip.topico_id
        '''), {'aluno': args.aluno, 'classe': args.classe}).mappings():
            print(json.dumps(dict(row), default=str))
        rows = conn.execute(text("""
            SELECT cp.id, cp.topico_id, cp.brainhex_profile_key, cp.status,
                   cp.plano, cp.materiais,
                   (SELECT jsonb_agg(jsonb_build_object('key', pip.item_key, 'status', pip.status,
                       'pct', pip.percentual_concluido)) FROM personalizacao_item_progresso pip
                    WHERE pip.personalizacao_id=cp.id AND pip.aluno_id=cp.aluno_id) AS progress
            FROM conteudo_personalizado cp JOIN alunos al ON al.id=cp.aluno_id
            WHERE cp.aluno_id=CAST(:aluno AS uuid) AND cp.classe_id=:classe
              AND cp.brainhex_profile_key=al.perfil_ativo
            ORDER BY cp.id DESC LIMIT 8
        """), {'aluno': args.aluno, 'classe': args.classe}).mappings()
        for row in rows:
            data = dict(row)
            progress = data.pop('progress') or []
            data['progress_count'] = len(progress)
            data['completed_count'] = sum(1 for item in progress if item['pct'] >= 100)
            plan = data.pop('plano') or {}
            media = data.pop('materiais') or {}
            data['plan_shape'] = {key: len(value) if isinstance(value, list) else type(value).__name__ for key, value in plan.items()}
            data['media_shape'] = {key: list(value) if isinstance(value, dict) else type(value).__name__ for key, value in media.items()}
            for key, value in plan.items():
                if isinstance(value, list):
                    data[key + '_shape'] = [list(item) if isinstance(item, dict) else type(item).__name__ for item in value[:3]]
            print(json.dumps(data, ensure_ascii=False))
        for row in conn.execute(text('''
            SELECT t.id, t.depende, t.next, ta.status, ta.percentual_concluido
            FROM topicos t LEFT JOIN topico_aluno ta ON ta.topico_id=t.id
              AND ta.aluno_id=CAST(:aluno AS uuid)
            WHERE t.classe_id=:classe ORDER BY t.ordem
        '''), {'aluno': args.aluno, 'classe': args.classe}).mappings():
            print(json.dumps(dict(row), default=str))
        print('migration:', conn.execute(text('SELECT version_num FROM alembic_version')).scalar())
        for row in conn.execute(text('''
            SELECT * FROM public.trailup_progresso_percurso(CAST(:aluno AS uuid), :classe)
            ORDER BY topico_id
        '''), {'aluno': args.aluno, 'classe': args.classe}).mappings():
            print('journey:', dict(row))
        if args.verify_manifest:
            print('stored_enrollment:', conn.execute(text('SELECT count(*) FROM classe_aluno WHERE aluno_id=CAST(:aluno AS uuid) AND classe_id=:classe'), {'aluno': args.aluno, 'classe': args.classe}).scalar())
            candidate = conn.execute(text('''
                SELECT pip.topico_id, pip.personalizacao_id, pip.item_key
                FROM personalizacao_item_progresso pip
                JOIN conteudo_personalizado cp ON cp.id=pip.personalizacao_id
                JOIN alunos al ON al.id=pip.aluno_id
                WHERE pip.aluno_id=CAST(:aluno AS uuid) AND pip.classe_id=:classe
                  AND cp.aluno_id IS NULL AND cp.brainhex_profile_key=al.perfil_ativo
                  AND pip.percentual_concluido>=100 AND left(pip.item_key,6)<>'slide:'
                ORDER BY pip.id LIMIT 1
            '''), {'aluno': args.aluno, 'classe': args.classe}).mappings().one()
            savepoint = conn.begin_nested()
            try:
                conn.execute(text("SELECT set_config('request.jwt.claim.sub', :aluno, true)"), {'aluno': args.aluno})
                conn.execute(text("SELECT set_config('request.jwt.claims', :claims, true)"), {'claims': json.dumps({'sub': args.aluno, 'role': 'authenticated'})})
                conn.execute(text('SET LOCAL ROLE authenticated'))
                print('policy checks:', dict(conn.execute(text('''SELECT
                  auth.uid()=CAST(:aluno AS uuid) AS identity_ok,
                  EXISTS(SELECT 1 FROM classe_aluno WHERE aluno_id=auth.uid() AND classe_id=:classe) AS enrolled,
                  :classe IN (SELECT public.app_classes_do_aluno()) AS enrolled_helper,
                  :classe IN (SELECT public.app_classes_do_professor()) AS owns_class,
                  EXISTS(SELECT 1 FROM conteudo_personalizado WHERE id=:record) AS material_visible
                '''), {'aluno': args.aluno, 'classe': args.classe, 'record': candidate['personalizacao_id']}).mappings().one()))
                conn.execute(text('''
                    INSERT INTO personalizacao_percurso (aluno_id, personalizacao_id, classe_id, topico_id, item_keys)
                    VALUES (CAST(:aluno AS uuid), :record, :classe, :topico, CAST(:keys AS jsonb))
                    ON CONFLICT (aluno_id,personalizacao_id) DO UPDATE SET item_keys=EXCLUDED.item_keys, updated_at=now()
                '''), {'aluno': args.aluno, 'record': candidate['personalizacao_id'], 'classe': args.classe,
                      'topico': candidate['topico_id'], 'keys': json.dumps([candidate['item_key'], 'verification:unvisited'])})
                value = conn.execute(text('''SELECT total, feitos FROM trailup_progresso_percurso(
                    CAST(:aluno AS uuid), :classe) WHERE topico_id=:topico'''),
                    {'aluno': args.aluno, 'classe': args.classe, 'topico': candidate['topico_id']}).one()
                assert tuple(value) == (2, 1), tuple(value)
                print('manifest verification: RLS accepted own shared material; 1 of 2; rollback')
            finally:
                savepoint.rollback()


if __name__ == '__main__':
    main()

"""Inspect persisted material shapes without exposing contents or signed URLs."""
import argparse
import json

from sqlalchemy import create_engine, text

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--classe', type=int, required=True)
    parser.add_argument('--profile', default='mastermind')
    parser.add_argument('--json-for-normalizer', action='store_true')
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn:
        rows = [dict(row) for row in conn.execute(text('''
            SELECT id, aluno_id, classe_id, topico_id, conteudo_id, brainhex_profile_key,
                status, materiais, plano, formatos_gerados, formato_prioritario, updated_at, gerado_em
            FROM conteudo_personalizado WHERE classe_id=:classe AND brainhex_profile_key=:profile
            ORDER BY updated_at DESC LIMIT 80
        '''), {'classe': args.classe, 'profile': args.profile}).mappings()]
        if args.json_for_normalizer:
            print(json.dumps(rows, default=str))
            return
        for row in conn.execute(text('''
            SELECT brainhex_profile_key, aluno_id IS NULL AS shared, count(*) AS total
            FROM conteudo_personalizado WHERE classe_id=:classe
            GROUP BY brainhex_profile_key, aluno_id IS NULL
        '''), {'classe': args.classe}).mappings():
            print('profile:', dict(row))
        for row in conn.execute(text('''
            SELECT t.id AS topico_id, count(DISTINCT a.id) AS activities, count(DISTINCT q.id) AS questions
            FROM topicos t LEFT JOIN atividades a ON a.topico_id=t.id
            LEFT JOIN questoes q ON q.atividade_id=a.id
            WHERE t.classe_id=:classe GROUP BY t.id ORDER BY t.id
        '''), {'classe': args.classe}).mappings():
            print('teacher:', dict(row))
        for row in conn.execute(text('''
            SELECT mg.tipo, count(*) AS total, count(mg.personalizacao_id) AS linked
            FROM materiais_gerados mg JOIN conteudos c ON c.id=mg.conteudo_id
            JOIN topicos t ON t.id=c.topico_id WHERE t.classe_id=:classe GROUP BY mg.tipo
        '''), {'classe': args.classe}).mappings():
            print('generated:', dict(row))
        for row in rows:
            summary = {key: row[key] for key in ('id', 'topico_id', 'conteudo_id', 'status')}
            summary['shared'] = row['aluno_id'] is None
            summary['media'] = {}
            for kind, media in (row['materiais'] or {}).items():
                if not isinstance(media, dict):
                    continue
                payload = media.get('payload')
                summary['media'][kind] = {
                    'url': bool(media.get('arquivo_url')), 'path': bool(media.get('storage_path')),
                    'parts': len(media.get('partes') or []),
                    'payload_keys': list(payload) if isinstance(payload, dict) else type(payload).__name__,
                    'metadata': {key: (media.get('metadata') or {}).get(key) for key in ('status', 'quality_gate_rejected', 'engine_variant')},
                }
            print(json.dumps(summary, default=str))


if __name__ == '__main__':
    main()

"""Read-only checks of teacher slide references; no tokens or full URLs logged."""
import argparse
import json
from urllib.parse import urlparse, unquote, quote
import httpx
from sqlalchemy import create_engine, text
from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--classe', type=int, required=True)
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn, httpx.Client(timeout=15, follow_redirects=True) as client:
        rows = conn.execute(text('SELECT c.id, c.topico_id, c.tipo, c.conteudo, c.metadata FROM conteudos c JOIN topicos t ON t.id=c.topico_id WHERE t.classe_id=:classe ORDER BY c.id'), {'classe': args.classe}).mappings()
        for row in rows:
            metadata = row['metadata'] or {}
            refs = [f.get('path') or f.get('url') for f in metadata.get('files', []) if isinstance(f, dict)]
            if isinstance(row['conteudo'], str):
                refs.append(row['conteudo'])
            for ref in dict.fromkeys(r for r in refs if isinstance(r, str)):
                parsed = urlparse(ref)
                path = unquote(parsed.path) if parsed.scheme else ref
                if not path.lower().endswith(('.pptx', '.ppt', '.ppsx', '.pdf', '.html')):
                    continue
                for prefix in ('/storage/v1/object/public/conteudos/', '/storage/v1/object/sign/conteudos/', 'conteudos/'):
                    if path.startswith(prefix):
                        path = path[len(prefix):]
                        break
                stored = conn.execute(text("SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='conteudos' AND name=:path)"), {'path': path}).scalar()
                result = {'content': row['id'], 'topic': row['topico_id'], 'type': row['tipo'], 'file': path.rsplit('/', 1)[-1], 'object_exists': stored}
                matches = conn.execute(text("SELECT bucket_id FROM storage.objects WHERE right(name,length(:name))=:name"), {'name': path.rsplit('/', 1)[-1]}).scalars().all()
                result['matching_buckets'] = matches
                url = ref if parsed.scheme else settings.supabase_url.rstrip('/') + '/storage/v1/object/public/conteudos/' + quote(path, safe='/')
                try:
                    with client.stream('GET', url, headers={'Range': 'bytes=0-15'}) as response:
                        result.update(status=response.status_code, content_type=response.headers.get('content-type'))
                except httpx.HTTPError as error:
                    result['error'] = type(error).__name__
                for label, gateway_path in [('gateway', path), ('gateway_bucket', 'conteudos/' + path)]:
                    gateway = settings.supabase_url.rstrip('/') + '/functions/v1/storage-redirect?path=' + quote(gateway_path, safe='/')
                    try:
                        with client.stream('GET', gateway, headers={'Range': 'bytes=0-15'}) as response:
                            result[label] = {'status': response.status_code, 'type': response.headers.get('content-type')}
                    except httpx.HTTPError as error:
                        result[label] = {'error': type(error).__name__}
                print(json.dumps(result))


if __name__ == '__main__':
    main()

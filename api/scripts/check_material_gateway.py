"""Read-only checks of persisted material links; never prints signed URLs or keys."""
import argparse
from collections import Counter
from urllib.parse import urlparse, quote

import httpx
from sqlalchemy import create_engine, text

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def material_refs(value, prefix="materiais"):
    if isinstance(value, dict):
        url = value.get("arquivo_url") or value.get("url")
        path = value.get("storage_path")
        if isinstance(url, str) or isinstance(path, str):
            yield prefix, url, path
        for key, child in value.items():
            if isinstance(child, (dict, list)):
                yield from material_refs(child, f"{prefix}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from material_refs(child, f"{prefix}[{index}]")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--classe", type=int, required=True)
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--record", type=int)
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, topico_id, conteudo_id, brainhex_profile_key, status, materiais FROM conteudo_personalizado WHERE classe_id=:classe AND (CAST(:record AS bigint) IS NULL OR id=:record) ORDER BY updated_at DESC LIMIT 100"), {"classe": args.classe, "record": args.record}).mappings().all()
    engine.dispose()
    print("Records by profile/status:", dict(Counter((r["brainhex_profile_key"], r["status"]) for r in rows)))
    checked = set()
    with httpx.Client(timeout=25, follow_redirects=True) as client:
        for row in rows:
            for label, url, path in material_refs(row["materiais"]):
                if len(checked) >= args.limit:
                    return
                if not url or url in checked:
                    continue
                checked.add(url)
                candidates = [("stored", url)]
                if path and settings.supabase_url:
                    gateway = settings.supabase_url.rstrip("/") + "/functions/v1/storage-redirect?path=" + quote(path, safe="/")
                    if gateway != url:
                        candidates.append(("gateway", gateway))
                for source, candidate in candidates:
                    try:
                        with client.stream("GET", candidate, headers={"Range": "bytes=0-255"}) as response:
                            print({"record": row["id"], "topic": row["topico_id"], "content": row["conteudo_id"], "field": label, "source": source, "status": response.status_code, "redirects": [r.status_code for r in response.history], "destination_host": urlparse(str(response.url)).hostname, "content_type": response.headers.get("content-type")})
                    except httpx.HTTPError as error:
                        print({"record": row["id"], "field": label, "source": source, "error_type": type(error).__name__})


if __name__ == "__main__":
    main()

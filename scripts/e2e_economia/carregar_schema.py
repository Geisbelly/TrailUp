"""Recria num Postgres LOCAL o schema public de produção, sem dado de aluno.

Uso:
    python carregar_schema.py <dsn-local> <ddl.json> [<seed.json>]

`ddl.json` é a saída de `catalogo_ddl.sql` (lista de {"o","k","q"}); `seed.json`
é opcional, no mesmo formato, com INSERTs de tabelas de catálogo (app_config,
loja_itens, eventos_pontuacao...). O schema tem dependência circular (função
que lê tabela, view que lê view), então aplica em rodadas até não progredir.

Recusa DSN hospedado: isto CRIA objetos e carimba o alembic_version.
"""

import json
import sys

import psycopg

PRE = [
    "create extension if not exists vector schema public",
    "create extension if not exists pg_net",
    "create extension if not exists http schema extensions",
    "create extension if not exists pg_cron",
    "do $$ begin if not exists (select 1 from pg_publication where pubname='supabase_realtime')"
    " then create publication supabase_realtime; end if; end $$",
]

# A imagem supabase/postgres traz auth.uid() lendo só o GUC legado e não traz
# auth.jwt(), que policies de produção usam. Precisa de superusuário.
AUTH_JWT = """
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role, postgres;
"""

EVENT_TRIGGERS_DO_SUPABASE = ("pgrst_", "issue_", "graphql")


def main() -> None:
    dsn, ddl = sys.argv[1], sys.argv[2]
    if any(h in dsn for h in ("supabase.co", "supabase.com", "pooler.")):
        raise SystemExit("recusado: use um banco local descartável")
    stm = json.load(open(ddl))
    if len(sys.argv) > 3:
        stm += json.load(open(sys.argv[3]))
    stm = [r for r in stm if not (r["o"] == 95 and any(x in r["q"] for x in EVENT_TRIGGERS_DO_SUPABASE))]
    alembic = [r for r in stm if r["k"] == "alembic_version" and r["o"] == 30]

    with psycopg.connect(dsn, autocommit=True) as c:
        for q in PRE:
            try:
                c.execute(q)
            except Exception as e:  # extensão ausente na imagem não impede o resto
                print("pre:", e)
        try:
            c.execute(AUTH_JWT)
        except Exception as e:
            print("auth.jwt() precisa de superusuário (rode como supabase_admin):", e)
        c.execute("set check_function_bodies = off")
        pendentes = sorted(stm, key=lambda r: r["o"])
        falhas = []
        for rodada in range(8):
            falhas = []
            for r in pendentes:
                try:
                    c.execute(r["q"])
                except Exception as e:
                    falhas.append((r, str(e).splitlines()[0]))
            print(f"rodada {rodada}: ok={len(pendentes) - len(falhas)} falha={len(falhas)}")
            if not falhas or len(falhas) == len(pendentes):
                break
            pendentes = [f[0] for f in falhas]
        for r, e in falhas:
            print("FALHA", r["o"], r["k"], e[:200])
        if alembic:
            print("lembre de carimbar: INSERT INTO alembic_version VALUES ('<revisão de produção>')")


if __name__ == "__main__":
    main()

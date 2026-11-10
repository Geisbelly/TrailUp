"""Gera `tests/fixtures/arena_prod_<data>.sql`: a arena de produção, para o e2e rodar o fluxo inteiro.

O esqueleto (`schema_prod_esqueleto_20261024.sql`) tem as tabelas com PK, UNIQUE e FK, mas nenhuma
função, CHECK ou gatilho. A arena é quase toda função (`arena_*`, `fn_desafio_encerrar`, Elo,
limite diário), e nunca foi usada em produção (0 desafios em 10/11). Este retrato traz, **lidos do
catálogo de produção**:

- o fecho das funções que as portas da arena e do desafio cooperativo chamam, com o corpo de
  produção (`pg_get_functiondef`) e o mesmo GRANT de EXECUTE;
- os CHECK das tabelas da arena e as tabelas que o esqueleto não tem;
- o gatilho que dá valor aos eventos de pontuação, e as linhas `desafio_%` de `eventos_pontuacao`
  (configuração de pontos, não dado de aluno).

Só leitura: uma transação `READ ONLY` na porta 5432, nada de `SET` de sessão (ver o incidente de
02/11 no pooler). Uso, a partir de `api/`:

    .venv/bin/python scripts/gerar_fixture_arena_de_producao.py
"""

from __future__ import annotations

import datetime as dt
import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import dotenv_values

API = Path(__file__).resolve().parents[1]
ESQUELETO = API / "tests" / "fixtures" / "schema_prod_esqueleto_20261024.sql"

RAIZES = (
    "arena_convite_responder", "arena_desafio", "arena_desafio_criar", "arena_encerrar",
    "arena_listar", "arena_professor_resumo", "arena_responder", "desafio_responder",
    "guilda_desafio_criar", "guilda_desafio_responder",
    "fn_questao_confere", "fn_questao_corrigida_por_ia",
    "trg_eventos_aluno_valor_do_banco",
)
# O chat da guilda decifra com a chave do Vault, que o banco local não tem: fica fora do retrato.
FORA = re.compile(r"^(chat_|vault_)")
TABELAS = (
    "guildas", "guilda_membros", "guilda_desafios", "guilda_desafio_questoes",
    "guilda_desafio_respostas", "desafio_participantes", "ranqueada_elo", "ranqueada_elo_partida",
    "social_relacionamentos", "evento_inscricoes", "eventos_aluno", "eventos_pontuacao",
    "questao_gabarito",
)
GATILHOS = ("trg_eventos_aluno_valor_ins", "trg_eventos_aluno_valor_upd")


def _dsn() -> str:
    # Num worktree o `.env` fica no checkout principal: `TRAILUP_ENV` aponta para ele.
    url = dotenv_values(os.environ.get("TRAILUP_ENV", API / ".env"))["DATABASE_URL"]
    return url.replace(":6543", ":5432").replace("postgresql+asyncpg", "postgresql")


def main() -> int:
    esqueleto = ESQUELETO.read_text(encoding="utf-8")
    no_esqueleto = set(re.findall(r'CREATE TABLE public\."?([a-z_0-9]+)', esqueleto))
    saida: list[str] = [
        f"-- Arena de produção, lida do catálogo em {dt.date.today().isoformat()} por",
        "-- scripts/gerar_fixture_arena_de_producao.py. Só estrutura e configuração de pontos; nenhum dado de aluno.",
        "-- Vai por cima de schema_prod_esqueleto_20261024.sql.",
        "SET check_function_bodies = off;",
        "CREATE EXTENSION IF NOT EXISTS unaccent;",
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
    ]
    with psycopg.connect(_dsn()) as c:
        c.execute("BEGIN READ ONLY")
        funcoes = {
            nome: (oid, corpo, acl)
            for oid, nome, corpo, acl in c.execute(
                """
                SELECT p.oid, p.proname, pg_get_functiondef(p.oid), p.proacl::text
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.prokind = 'f'
                   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
                """
            ).fetchall()
        }
        tabelas_prod = {r[0] for r in c.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        ).fetchall()}

        # O fecho das funções.
        vistas: set[str] = set()
        fila = list(RAIZES)
        while fila:
            nome = fila.pop()
            if nome in vistas or nome not in funcoes or FORA.match(nome):
                continue
            vistas.add(nome)
            corpo = funcoes[nome][1]
            for chamada in set(re.findall(r"\b(?:public\.)?([a-z_][a-z_0-9]*)\s*\(", corpo)):
                if chamada in funcoes and chamada not in vistas:
                    fila.append(chamada)
        # As tabelas que essas funções tocam, além das da arena.
        tocadas = set(TABELAS)
        for nome in vistas:
            corpo = funcoes[nome][1]
            for t in re.findall(r"\b(?:FROM|JOIN|INTO|UPDATE|public\.)\s*(?:public\.)?([a-z_][a-z_0-9]*)", corpo, re.I):
                if t in tabelas_prod:
                    tocadas.add(t)

        # Tabelas que o esqueleto não tem são criadas; as que ele tem ganham as colunas de depois
        # de 24/10 (enum vira text, como no esqueleto).
        for tabela in sorted(tocadas):
            colunas = c.execute(
                """
                SELECT a.attname,
                       CASE WHEN t.typtype = 'e' THEN 'text' ELSE format_type(a.atttypid, a.atttypmod) END,
                       a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attidentity
                  FROM pg_attribute a
                  JOIN pg_type t ON t.oid = a.atttypid
                  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                 WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
                 ORDER BY a.attnum
                """,
                (f"public.{tabela}",),
            ).fetchall()
            if tabela in no_esqueleto:
                for nome, tipo, _nn, padrao, identidade in colunas:
                    # NOT NULL fica de fora: linha antiga do esqueleto não tem valor para a coluna nova.
                    extra = "" if identidade or not padrao else f" DEFAULT {padrao}"
                    saida.append(f'ALTER TABLE public."{tabela}" ADD COLUMN IF NOT EXISTS "{nome}" {tipo}{extra};')
                continue
            linhas = []
            for nome, tipo, not_null, padrao, identidade in colunas:
                partes = [f'  "{nome}" {tipo}']
                if identidade:
                    partes.append("GENERATED BY DEFAULT AS IDENTITY")
                elif padrao:
                    partes.append(f"DEFAULT {padrao}")
                if not_null:
                    partes.append("NOT NULL")
                linhas.append(" ".join(partes))
            saida.append(f'CREATE TABLE IF NOT EXISTS public."{tabela}" (\n' + ",\n".join(linhas) + "\n);")
            for (definicao,) in c.execute(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = %s::regclass AND contype IN ('p','u')",
                (f"public.{tabela}",),
            ).fetchall():
                saida.append(f"ALTER TABLE public.{tabela} ADD {definicao};")

        # CHECK das tabelas da arena: o esqueleto não tem nenhum.
        for tabela, nome, definicao in c.execute(
            """
            SELECT c.relname, con.conname, pg_get_constraintdef(con.oid)
              FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
             WHERE c.relnamespace = 'public'::regnamespace AND con.contype = 'c' AND c.relname = ANY(%s)
             ORDER BY 1, 2
            """,
            (list(TABELAS),),
        ).fetchall():
            saida.append(
                f"ALTER TABLE public.{tabela} DROP CONSTRAINT IF EXISTS {nome};\n"
                f"ALTER TABLE public.{tabela} ADD CONSTRAINT {nome} {definicao};"
            )

        # Índices únicos parciais (o ON CONFLICT das funções depende deles).
        for (definicao,) in c.execute(
            """
            SELECT pg_get_indexdef(i.indexrelid)
              FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
             WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY(%s)
               AND i.indisunique AND NOT i.indisprimary AND i.indpred IS NOT NULL
            """,
            (list(TABELAS),),
        ).fetchall():
            saida.append(definicao.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS") + ";")

        saida.append("")
        for nome in sorted(vistas):
            oid, corpo, acl = funcoes[nome]
            assinatura = c.execute("SELECT %s::regprocedure::text", (oid,)).fetchone()[0]
            saida.append(corpo.rstrip() + ";")
            saida.append(f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC;")
            for papel in ("anon", "authenticated", "service_role"):
                if acl and re.search(rf"\b{papel}=X", acl):
                    saida.append(f"GRANT EXECUTE ON FUNCTION {assinatura} TO {papel};")
            saida.append("")

        for (definicao,) in c.execute(
            "SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = ANY(%s) AND NOT tgisinternal",
            (list(GATILHOS),),
        ).fetchall():
            saida.append(definicao + ";")

        # A linha inteira: o CHECK de `pontos` depende das outras colunas (a aposta é negativa).
        for (linha,) in c.execute(
            "SELECT to_jsonb(e)::text FROM public.eventos_pontuacao e WHERE tipo LIKE 'desafio%%' ORDER BY tipo"
        ).fetchall():
            saida.append(
                "INSERT INTO public.eventos_pontuacao SELECT * FROM jsonb_populate_record(NULL::public.eventos_pontuacao, "
                + psycopg.sql.Literal(linha).as_string(c)
                + ") ON CONFLICT DO NOTHING;"
            )
        c.execute("ROLLBACK")

    destino = API / "tests" / "fixtures" / f"arena_prod_{dt.date.today():%Y%m%d}.sql"
    # Há corpo de produção salvo com CRLF; o repo é LF (`.gitattributes`), e o teste de estrutura
    # compara este arquivo com a migration byte a byte.
    destino.write_text(("\n".join(saida) + "\n").replace("\r\n", "\n"), encoding="utf-8")
    print(f"{destino.relative_to(API)}: {len(vistas)} funções")
    return 0


if __name__ == "__main__":
    sys.exit(main())

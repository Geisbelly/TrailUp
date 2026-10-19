# E2E da economia contra banco real

`api/tests/test_e2e_economia_banco.py` exercita a economia inteira (config do
professor, ganho, compra, uso na trilha, estorno, extrato, RLS, auditoria,
consistência e exclusão da turma) num Postgres de verdade, entrando como o
PostgREST entraria (`SET ROLE authenticated` + `request.jwt.claims`). Sem
`TRAILUP_E2E_DATABASE_URL` o módulo é pulado, então o CI não muda.

**Nunca aponte para produção.** O fixture cria e apaga turmas e usuários, e os
scripts recusam DSN hospedado.

## Por que não `alembic upgrade head` num banco vazio

O banco é anterior ao Alembic e tem schema fora do git
(`docs/architecture/schema-nao-versionado.md`): a cadeia não reproduz produção
a partir do zero. O caminho é recriar o schema de produção pelo catálogo e
migrar por cima dele.

## Passo a passo

1. Banco descartável com os papéis do Supabase:

   ```sh
   docker run -d --name trailup-e2e-db -p 55432:5432 \
     -e POSTGRES_PASSWORD=e2elocal supabase/postgres:17.6.1.178
   ```

2. Rode `catalogo_ddl.sql` **somente leitura** no banco de origem (SQL editor
   ou MCP do Supabase) e salve as linhas como JSON (`ddl.json`). Para os
   catálogos, um JSON no mesmo formato com `INSERT ... SELECT * FROM
   json_populate_recordset(...)` de `app_config`, `loja_itens`, `rank_tipo`,
   `perfil`, `modoOperacao`, `materia` e `eventos_pontuacao`. Guarde fora do
   repositório.

3. Carregue e carimbe a revisão de produção:

   ```sh
   python carregar_schema.py postgresql://postgres:e2elocal@localhost:55432/postgres ddl.json seed.json
   # auth.jwt() precisa de superusuário: se reclamar, rode o bloco AUTH_JWT
   # como supabase_admin (docker exec ... psql -U supabase_admin).
   # a revisão em que o banco de origem está (SELECT version_num FROM alembic_version).
   # O banco do Lab está em 20261017_10; a cadeia do espelho sobe dali passando
   # por 20261018_01 ... 20261019_13 até a economia.
   psql ... -c "INSERT INTO alembic_version VALUES ('20261017_10')"
   ```

4. Migre com `alembic_local.py` (ver abaixo) e rode o teste:

   ```sh
   cd api
   export ALEMBIC_DATABASE_URL=postgresql://postgres:e2elocal@localhost:55432/postgres
   export DATABASE_URL=postgresql+asyncpg://postgres:e2elocal@localhost:55432/postgres
   export SUPABASE_JWT_SECRET=local ADMIN_PANEL_PASSWORD=local
   PYTHONPATH=. python ../scripts/e2e_economia/alembic_local.py upgrade head
   TRAILUP_E2E_DATABASE_URL=$ALEMBIC_DATABASE_URL python -m pytest tests/test_e2e_economia_banco.py
   ```

5. `docker rm -f trailup-e2e-db` no fim.

## `alembic_local.py` e o rollback silencioso

`trava_de_migracao` (env.py) executa `pg_advisory_lock` na conexão antes de
`context.begin_transaction()`. No SQLAlchemy 2 esse `execute` abre a transação
da conexão (autobegin); o Alembic então não abre a dele, ninguém dá COMMIT, e
o fechamento da conexão desfaz tudo. O log diz "Running upgrade ..." e o
`alembic_version` não muda — tanto no `alembic upgrade` manual quanto na
subida da API com `DATABASE_MIGRATIONS_ON_STARTUP=true` (medido localmente).
`alembic_local.py` só faz COMMIT logo depois do lock (o lock é de sessão, então
segue valendo). A correção de verdade fica para um PR próprio, porque ligar a
migração na subida muda o deploy de produção.

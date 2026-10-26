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
   # a revisão de produção (SELECT version_num FROM alembic_version; hoje
   # 20261017_10). O upgrade passa pelas pilhas A e B antes da economia.
   psql ... -c "INSERT INTO alembic_version VALUES ('20261017_10')"
   ```

4. Migre com o executor oficial e rode o teste:

   ```sh
   cd api
   export ALEMBIC_DATABASE_URL=postgresql://postgres:e2elocal@localhost:55432/postgres
   export DATABASE_URL=postgresql+asyncpg://postgres:e2elocal@localhost:55432/postgres
   export SUPABASE_JWT_SECRET=local ADMIN_PANEL_PASSWORD=local
   python -m alembic upgrade head
   TRAILUP_E2E_DATABASE_URL=$ALEMBIC_DATABASE_URL python -m pytest tests/test_e2e_economia_banco.py
   ```

5. `docker rm -f trailup-e2e-db` no fim.

## Histórico do rollback silencioso — corrigido no #545

`trava_de_migracao` (env.py) executava `pg_advisory_lock` na conexão antes de
`context.begin_transaction()`. No SQLAlchemy 2 esse `execute` abre a transação
da conexão (autobegin); o Alembic então não abre a dele, ninguém dá COMMIT, e
o fechamento da conexão desfaz tudo. O log diz "Running upgrade ..." e o
`alembic_version` não muda — tanto no `alembic upgrade` manual quanto na
subida da API com `DATABASE_MIGRATIONS_ON_STARTUP=true` (medido localmente).
O PR #545 corrigiu o executor oficial: encerra a transação do SELECT antes de
entregar a conexão ao Alembic; o lock de sessão sobrevive ao COMMIT. Esta
documentação ficou desatualizada depois da correção. `alembic_local.py` agora é
apenas um alias legado, sem monkeypatch ou COMMIT adicional.

O teste `api/tests/test_migrations_postgres.py` usa o `env.py` real em PostgreSQL
Docker descartável. Confere persistência após reconexão, rollback de DDL/dados e
revisão em falha, e dois processos concorrentes bloqueados na mesma trava.
Execute com `TRAILUP_TEST_DOCKER=1 python -m pytest tests/test_migrations_postgres.py`
dentro de `api/`. Ele cria seu próprio banco local; não aceita DSN externo. Usa
revisões sintéticas para isolar o executor, sem alegar validação de toda a cadeia
ou do schema de produção.

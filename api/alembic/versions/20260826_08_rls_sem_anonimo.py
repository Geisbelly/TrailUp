"""RLS: tira o acesso anonimo de todas as policies do schema public

Uma varredura encontrou 26 tabelas com policy `USING (true)` concedida ao role
`public` — que inclui `anon`. Como `anon` e `authenticated` tem GRANT de
SELECT/INSERT/UPDATE/DELETE nas 84 tabelas, RLS era a UNICA barreira, e nessas
26 nao havia barreira nenhuma.

Verificado ao vivo, como `anon`, **sem login algum**: 5 linhas de `alunos` (nome
e e-mail), 372 de `eventos_aluno`, 26 de `professor_aluno`, o gabarito em
`questoes`. A chave anon viaja no bundle do app e esta commitada no
`api/.env.example` — ela e publica de fato.

Esta migracao troca o role das policies de `public` para `authenticated`,
**preservando `USING`/`WITH CHECK`**. Nao e a correcao completa: um aluno logado
continua enxergando dado de outro onde o predicado for `true`. E o passo largo
que nao quebra nada, porque nenhum fluxo do app escreve ou le deslogado — o
console do professor e o app do aluno operam autenticados.

O que FALTA depois disto (predicado de posse por tabela) e trabalho de desenho
tabela a tabela: o console do professor escreve direto no Supabase
(`materia`, `classe`, `topicos`, `conteudos`, `atividades`, `questoes`,
`ranks`), entao "so o professor dono escreve" precisa da cadeia de posse via
`classe`, e errar essa cadeia derruba o console inteiro.

`ALTER POLICY ... TO` troca so o role — nao reescreve a expressao, entao nao ha
risco de eu alterar semantica sem querer.

Revision ID: 20260826_08
Revises: 20260826_07
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_08"
down_revision = "20260826_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
          r record;
          n integer := 0;
        BEGIN
          FOR r IN
            SELECT schemaname, tablename, policyname
              FROM pg_policies
             WHERE schemaname = 'public'
               -- `{public}` exatamente: uma policy ja concedida a roles
               -- especificos (ex.: `{authenticated}` ou `{service_role}`) nao
               -- deve ser tocada, para nao remover um acesso intencional.
               AND roles::text = '{public}'
          LOOP
            -- `quote_ident` e concatenacao em vez de `format()`: o marcador de
            -- parametro do format e duplicado quando o Alembic renderiza o
            -- script offline (`--sql`), e o script gerado sairia invalido.
            -- Assim executa igual online e offline.
            EXECUTE 'ALTER POLICY ' || quote_ident(r.policyname)
                 || ' ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename)
                 || ' TO authenticated';
            n := n + 1;
          END LOOP;
          RAISE NOTICE 'RLS: % policies migradas de public para authenticated', n;
        END $$
        """
    )


def downgrade() -> None:
    # NAO reabre para `public`: seria recriar o vazamento. Um downgrade que
    # restaura um buraco de seguranca e pior que um downgrade incompleto — se
    # for mesmo preciso reverter, faca-o tabela a tabela, conscientemente.
    op.execute(
        """
        DO $$
        BEGIN
          RAISE NOTICE
            'Downgrade nao reabre as policies para o role public de proposito: '
            'isso restauraria o acesso anonimo a alunos, eventos_aluno e questoes. '
            'Reverta manualmente a tabela especifica, se for mesmo necessario.';
        END $$
        """
    )

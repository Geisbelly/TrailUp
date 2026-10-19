"""Funcao SECURITY DEFINER entregava nota de aluno a quem nem colega e

`SECURITY DEFINER` roda com os privilegios do dono, entao as policies das
tabelas base NAO se aplicam -- e o mesmo bypass que o CLAUDE.md descreve para
view sem `security_invoker`, so que por funcao. Com `GRANT EXECUTE` para
`authenticated`, a funcao vira endpoint `/rest/v1/rpc/<nome>` e qualquer
sessao chama passando o id que quiser.

Varrendo `pg_proc`: 13 funcoes `SECURITY DEFINER`, chamaveis por
`authenticated`, que recebem um uuid e nunca olham `auth.uid()`. A maioria e
helper chamado de dentro de outra funcao (a checagem mora no chamador) --
`registrar_presenca_da_turma`, por exemplo, so delega para
`registrar_credito_da_turma`, que confere sessao e posse da turma.

Tres nao tinham checagem nenhuma e nenhum chamador que a fizesse.

## Medido, nao deduzido

Como um aluno SEM relacao com a turma, em transacao revertida:

    o atacante esta na turma?              nao
    SELECT direto na nota (RLS barra?)     0 linhas      <- a RLS funciona
    fn_nota_90_10(vitima, prova)           87.00         <- a nota, vazada
    social_sao_colegas(atacante, vitima)   false         <- nem colega e

A RLS barra a leitura direta e a funcao entrega o mesmo dado.

## O que esta migracao faz

**Revoga** `EXECUTE` de `anon` e `authenticated` em tres funcoes que nenhum
cliente chama (conferido: so aparecem em `types.ts`, que e gerado do schema),
que nao sao usadas em policy nem em view, e cujos chamadores internos sao
todos `SECURITY DEFINER` -- continuam rodando como `postgres` e nao perdem
acesso:

  - `fn_nota_90_10(uuid, bigint)`      -- nota de qualquer aluno
  - `fn_trilha_by_classe(uuid, bigint)` -- trilha e status de qualquer aluno.
    Esta, alem de exposta, esta QUEBRADA: referencia `public.v_trilha_topicos`,
    que nao existe, entao toda chamada volta 42P01. Revogar nao tira
    funcionalidade de ninguem.
  - `social_sao_colegas(uuid, uuid)`   -- diz se dois alunos quaisquer
    dividem turma

**Acrescenta a checagem** em `social_presenca_aluno(uuid)`, que NAO pode ser
revogada: o mobile a chama (`socialChatPresenca`, em
`services/social/socialService.ts`). O predicado e `app_pode_ver_aluno`, que ja
e o da casa -- eu mesmo, meus alunos se eu for professor, ou meus colegas de
turma. Nao quebra o chat porque toda amizade e intra-turma: `social_enviar_convite`
exige `social_sao_colegas` antes de criar o vinculo.

Conferido com a versao nova: colega online devolve `online: true` (o app segue
funcionando), estranho online devolve `online: false, visivel: false`, e o
cliente le `Boolean(data?.online)` -- o campo extra e inocuo.

Revision ID: 20261019_12
Revises: 20261019_11
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261019_12"
down_revision = "20261019_11"
branch_labels = None
depends_on = None


# Por que cada uma perde o EXECUTE. Os REVOKE abaixo sao literais; esta
# tupla fica como registro da decisao, nao como fonte do SQL.
SEM_CLIENTE = (
    ("fn_nota_90_10", "uuid, bigint"),          # nota de qualquer aluno
    ("fn_trilha_by_classe", "uuid, bigint"),    # trilha e status; alem disso, quebrada
    ("social_sao_colegas", "uuid, uuid"),       # dois alunos quaisquer dividem turma?
    ("guilda_e_colega", "uuid, bigint"),        # aluno X esta na turma Y?
    ("fn_arena_placar", "uuid"),                # ids e acertos de todo participante
    ("fn_arena_equipes", "uuid"),               # idem, agregado por equipe
)

PRESENCA_COM_GUARDA = """
CREATE OR REPLACE FUNCTION public.social_presenca_aluno(p_aluno_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT CASE
    WHEN NOT public.app_pode_ver_aluno(p_aluno_id)
      THEN jsonb_build_object('aluno_id', p_aluno_id, 'online', false, 'visivel', false)
    ELSE jsonb_build_object('aluno_id', p_aluno_id, 'online', EXISTS (
           SELECT 1 FROM public.aluno_sessoes_app s
            WHERE s.aluno_id = p_aluno_id
              AND s.encerrada_em IS NULL
              AND s.atualizado_em > now() - interval '3 minutes'))
  END;
$function$
"""

PRESENCA_SEM_GUARDA = """
CREATE OR REPLACE FUNCTION public.social_presenca_aluno(p_aluno_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT jsonb_build_object('aluno_id', p_aluno_id, 'online', EXISTS (
           SELECT 1 FROM public.aluno_sessoes_app s
            WHERE s.aluno_id = p_aluno_id
              AND s.encerrada_em IS NULL
              AND s.atualizado_em > now() - interval '3 minutes'));
$function$
"""


TURMA_COM_GUARDA = """
CREATE OR REPLACE FUNCTION public.social_presenca_turma(p_classe_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT CASE
    WHEN p_classe_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.app_minhas_classes() AS m(id) WHERE m.id = p_classe_id)
      THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('aluno_id', ca.aluno_id, 'online', EXISTS (
               SELECT 1 FROM public.aluno_sessoes_app s
                WHERE s.aluno_id = ca.aluno_id
                  AND s.encerrada_em IS NULL
                  AND s.atualizado_em > now() - interval '3 minutes')))
        FROM public.classe_aluno ca WHERE ca.classe_id = p_classe_id), '[]'::jsonb)
  END;
$function$
"""

TURMA_SEM_GUARDA = """
CREATE OR REPLACE FUNCTION public.social_presenca_turma(p_classe_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object('aluno_id', ca.aluno_id, 'online', EXISTS (
             SELECT 1 FROM public.aluno_sessoes_app s
              WHERE s.aluno_id = ca.aluno_id
                AND s.encerrada_em IS NULL
                AND s.atualizado_em > now() - interval '3 minutes')))
      FROM public.classe_aluno ca WHERE ca.classe_id = p_classe_id), '[]'::jsonb);
$function$
"""


def upgrade() -> None:
    # Literal, nao gerado em laco: `test_definer_exposto_sem_sessao.py` le o
    # TEXTO das migracoes para saber quem termina exposto. REVOKE montado com
    # f-string fica invisivel para ele -- e para quem der grep.
    op.execute("REVOKE ALL ON FUNCTION public.fn_nota_90_10(uuid, bigint) FROM PUBLIC, anon, authenticated")
    op.execute("REVOKE ALL ON FUNCTION public.fn_trilha_by_classe(uuid, bigint) FROM PUBLIC, anon, authenticated")
    op.execute("REVOKE ALL ON FUNCTION public.social_sao_colegas(uuid, uuid) FROM PUBLIC, anon, authenticated")
    op.execute("REVOKE ALL ON FUNCTION public.guilda_e_colega(uuid, bigint) FROM PUBLIC, anon, authenticated")
    op.execute("REVOKE ALL ON FUNCTION public.fn_arena_placar(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("REVOKE ALL ON FUNCTION public.fn_arena_equipes(uuid) FROM PUBLIC, anon, authenticated")
    op.execute(PRESENCA_COM_GUARDA)
    op.execute(TURMA_COM_GUARDA)


def downgrade() -> None:
    # Devolve o acesso e a funcao sem guarda. Reverter traz o vazamento de
    # volta -- e a unica forma honesta de desfazer.
    op.execute("GRANT EXECUTE ON FUNCTION public.fn_nota_90_10(uuid, bigint) TO authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION public.fn_trilha_by_classe(uuid, bigint) TO authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION public.social_sao_colegas(uuid, uuid) TO authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION public.guilda_e_colega(uuid, bigint) TO authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION public.fn_arena_placar(uuid) TO authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION public.fn_arena_equipes(uuid) TO authenticated")
    op.execute(PRESENCA_SEM_GUARDA)
    op.execute(TURMA_SEM_GUARDA)

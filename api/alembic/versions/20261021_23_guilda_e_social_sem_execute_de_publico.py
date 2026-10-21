"""Guildas e social: tirar de `PUBLIC` o EXECUTE que a cadeia nunca tirou (20 assinaturas)

Esta é a correção que a fase 1 devia ter sido desde o começo. As `20261021_21` e `_22` nasceram
para "trazer guildas para o Alembic"; medindo, descobriu-se que **as funções já vinham da
cadeia** (via `docs/mobile/sql/`, que o portão não lia). O que realmente falta num banco
construído do zero não é código — é **privilégio**.

## O buraco, medido na produção em 2026-10-20

1. O `ALTER DEFAULT PRIVILEGES` do schema `public` concede EXECUTE a `anon`, `authenticated` e
   `service_role` em **toda função nova**. Isso é schema não versionado
   (`docs/architecture/schema-nao-versionado.md`): não está no Alembic e não se vê lendo
   migration.
2. Num Postgres comum — Docker local, qualquer ambiente novo — o padrão da *linguagem* concede
   EXECUTE a `PUBLIC`, que é todo mundo.
3. **Nenhum `.sql` de `docs/mobile/sql/` revoga EXECUTE de função.** Os `REVOKE` que existem lá
   são sobre TABELAS (`REVOKE ALL ON public.guildas FROM anon, authenticated`), o que é outra
   coisa: tabela fechada + função `SECURITY DEFINER` aberta ao anônimo é justamente o desenho em
   que a função é a única porta — e ela estava destrancada.
4. Na produção o `anon` **está** revogado nestas 20. Não pela cadeia: na mão. A prova é
   `social_par`, a única função dos dois domínios que ainda carrega `=X/postgres` (PUBLIC) —
   ninguém passou por ela.

Resultado: o enunciado do portão ("um banco novo nasce sem guilda nenhuma") estava errado, e o
que sobra no lugar dele é o item 1 — **na produção, agora, qualquer função nova nesses domínios
sem REVOKE explícito nasce executável pelo anônimo**, quase sempre `SECURITY DEFINER`. Isso é
pior que a falta, porque funciona e ninguém percebe.

> **Correção de escopo (revisão de 21/10).** A primeira versão deste docstring dizia que "um
> banco novo nascia com as funções abertas ao anônimo". Esse cenário **não é alcançável hoje**:
> medido, a cadeia cria 83 tabelas e **não cria o schema base** — nada de `alunos`, `classe`,
> `classe_aluno`, `perfil`, `aluno_perfil`, `questoes`, `atividades`, `conteudos`, `topicos`,
> `professor`, `notificacoes`. A primeira revisão da cadeia (`20260405_01`) é de tabelas de
> checkpoint do LangGraph, e `docs/architecture/schema-nao-versionado.md` já concluiu que o
> caminho para um banco construível é um baseline de `pg_dump --schema-only` + `alembic stamp`.
> Esta migration continua valendo pelo item 1, que não depende daquele cenário; e o teste de
> cobertura em `test_migration_guilda_social_grants.py` é o que impede a reabertura, derivando
> o domínio da própria cadeia em vez de uma lista fixa.

## O que entra aqui

As 20 assinaturas dos domínios `guilda*`/`social*` que não têm `REVOKE` em nenhum ponto da
cadeia. Para cada uma: `REVOKE ALL ... FROM PUBLIC, anon` e o `GRANT` que a produção tem hoje
(`authenticated, service_role`) — espelho do estado real, medido função por função em
`pg_proc.proacl`, não suposto.

Não entram as 18 que já têm `REVOKE` na cadeia (`20261018_04`, `20261021_09`, `_17`, `_19`,
`_21`, `_22`), nem `social_notificar_evento`, revogada pela `20261002_02` — que faz o REVOKE
com a assinatura interpolada a partir de uma lista, e por isso não aparece em busca por
`ON FUNCTION public.social_notificar_evento(`.

### Duas exceções deliberadas

- **`social_par(uuid, uuid)` fica como está**, com PUBLIC. Ela é `IMMUTABLE`, **não** é
  `SECURITY DEFINER`, e o corpo é `SELECT LEAST(p_one,p_two), GREATEST(p_one,p_two)` — não toca
  tabela nenhuma, então EXECUTE para o anônimo não entrega dado. Mexer nela seria mudança de
  comportamento sem ganho, e ela é útil onde está: é o marcador de que o REVOKE da produção foi
  manual e seletivo.
- **`guilda_e_colega` e `social_sao_colegas` não estão aqui** porque a `20261018_04` já as
  fechou — inclusive para `authenticated`, de propósito. Não as reabra.

## Por que sem `DO`/`EXCEPTION`

A `20261002_02` envolveu o REVOKE num bloco que engole `undefined_function`, para não travar o
deploy por causa de função ausente. Aqui é o contrário de propósito: as 20 são criadas por
revisões **anteriores** desta mesma cadeia, então ausência não é ambiente exótico, é sinal de
que uma assinatura mudou sem este arquivo saber. Falhar alto é o comportamento certo — REVOKE
que some em silêncio deixa a função aberta e verde.

## Downgrade

Não reconcede. Mesma decisão da `20261002_02`: reabrir função `SECURITY DEFINER` ao anônimo não
é "voltar ao estado anterior", é criar um problema. Quem precisar reverter concede à mão,
sabendo o que está fazendo.

Revision ID: 20261021_23
Revises: 20261021_22
Create Date: 2026-10-20
"""

from alembic import op

revision = "20261021_23"
down_revision = "20261021_22"
branch_labels = None
depends_on = None


# As 20 assinaturas, LITERAIS de propósito.
#
# A primeira versão deste arquivo montava os `REVOKE` num laço sobre uma tupla de assinaturas.
# Funcionava e era mais curto — e caiu no mesmo ponto cego que esta leva de migrations acabou de
# fechar no portão: quem varre o texto das migrations para saber quem termina exposto não vê
# comando nenhum, porque o literal só existe em tempo de execução. O teste de cobertura
# (`test_nenhuma_funcao_do_dominio_fica_sem_revoke`) pegou isso na hora.
#
# Assinatura exata de `pg_get_function_identity_arguments` e papéis espelhados de `pg_proc.proacl`
# na produção, 2026-10-20. Não editar sem medir de novo.
PRIVILEGIOS = """
REVOKE ALL ON FUNCTION public.guilda_bloqueio_ativo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_bloqueio_ativo(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guilda_cancelar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_cancelar_convite(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guilda_classe_atual(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_classe_atual(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guilda_congelar_composicao(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_congelar_composicao(text, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_criar(bigint, text, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guilda_janela_aberta(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_janela_aberta(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guilda_listar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_listar(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_aceitar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_aceitar_convite(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_bloquear(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_bloquear(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_chat_enviar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_chat_enviar(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_chat_listar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_chat_listar(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_desbloquear(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_desbloquear(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_desfazer_amizade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_desfazer_amizade(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_enviar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_enviar_convite(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_listar_pessoas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_listar_pessoas() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_listar_pessoas(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_listar_pessoas(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_perfil_publico(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_perfil_publico(uuid, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_presenca_aluno(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_presenca_aluno(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_presenca_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_presenca_turma(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.social_recusar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_recusar_convite(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(PRIVILEGIOS)


def downgrade() -> None:
    # Ver o docstring: reconceder a PUBLIC seria reabrir o buraco.
    pass

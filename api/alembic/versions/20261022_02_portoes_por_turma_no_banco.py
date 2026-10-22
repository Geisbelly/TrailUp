"""Os portões de Social e Ranking passam a ser decididos no banco, por turma

## O defeito

O aluno "Aluno Demo" tinha, medido em produção, **2 conteúdos concluídos e 1 tópico
concluído** — os dois portões deviam estar abertos. A tela mostrava os dois com cadeado, e o
modal dizia "Conclua o primeiro bloco de conteúdo para liberar" para quem já tinha concluído.

A conta era do cliente: `PortoesContext` fazia DUAS consultas de contagem
(`conteudo_aluno` e `topico_aluno`) e, por decisão explícita no código, mapeava **qualquer erro
para zero** — "erro de rede não pode abrir portão". O efeito é que toda indisponibilidade
transitória do PostgREST tranca Social e Ranking, e o aluno recebe uma instrução falsa sobre o
que fazer para destravar.

Confirmado que não era RLS nem dado: com `SET LOCAL ROLE authenticated` e o `sub` do aluno, as
duas contagens voltam 2 e 1.

## Por que no banco

É a regra de fronteira do projeto: decidir se uma aba abre não tem modelo de linguagem no meio,
é encanamento. Além disso, duas contagens no cliente são duas chances de errar — e a regra
(`>= 1 conteúdo` para social, `>= 1 tópico` para rank) ficava escrita só no TypeScript, onde
nenhuma outra tela ou relatório conseguia reusá-la.

## Por turma, e não por aluno

`conteudo_aluno` e `topico_aluno` **não têm `classe_id`** — a turma vem por
`conteudo → tópico → classe` e `tópico → classe`. Por isso a conta antiga era necessariamente
global: um conteúdo concluído em qualquer turma abria a aba em todas.

A view devolve **uma linha por (aluno, turma)**, com a base em `classe_aluno`: toda matrícula
tem linha, inclusive a com zero progresso. Aluno que entra numa turma nova começa com os
portões fechados ali, que é o que a cerimônia de desbloqueio pressupõe.

## Decisões que não são óbvias

**`security_invoker = on`** — sem isso a view rodaria como `postgres` e ignoraria a RLS das
tabelas base, virando um oráculo do progresso de qualquer aluno. Com o invoker, cada um lê
exatamente as próprias linhas, que é o que as policies de `conteudo_aluno`/`topico_aluno` já
garantem.

**Sem GRANT para `anon`** — não há nada aqui que faça sentido antes do login.

**`WHERE m.aluno_id = auth.uid()`, e isso não é redundante com a RLS.** A base é
`classe_aluno`, e a policy de lá deixa o aluno ver os COLEGAS de turma de propósito (o ranking
depende disso). Medido: sem este filtro, a view devolvia 4 linhas para um aluno com 3 turmas —
uma delas de outro aluno. Os números vinham zerados, porque a RLS de `conteudo_aluno` e
`topico_aluno` barra o progresso alheio, mas uma linha de colega marcada "fechado" é informação
errada esperando para virar bug. É o mesmo recorte de `vw_rank_posicoes_por_classe`, que filtra
por `auth.uid()` em cima da agregação crua.

Consequência: lida por `service_role` (sem JWT) a view volta vazia. Ela é da tela do aluno; não
há caminho de servidor que precise dela, e se um dia houver, a conta tem de receber o
`aluno_id` explicitamente em vez de confiar no papel.

**O predicado repete o do cliente, inclusive o `OR`**: `status = 'concluido'` **ou**
`percentual_concluido >= 100`. Os dois existem porque o status é escrito pelo trigger de
progresso e o percentual por outro caminho; exigir os dois perderia linha legítima. O rótulo do
enum é `concluido` **sem acento** — conferido em `pg_enum`, e os outros dois (`não iniciado`,
`em andamento`) têm acento, então escrever "concluído" aqui compilaria e nunca casaria.

## O que esta migration NÃO faz

Não muda a regra: continua `>= 1`. Trocar o limiar é decisão de produto, e fica para quando
houver dado de uso — mover a regra para o banco é justamente o que torna essa troca uma
migration em vez de um deploy de app.

## Downgrade

Remove a view. Nada é perdido: ela é derivada, não guarda estado.

Revision ID: 20261022_02
Revises: 20261022_01
Create Date: 2026-10-22
"""

from alembic import op

revision = "20261022_02"
down_revision = "20261022_01"
branch_labels = None
depends_on = None


VIEW = """
CREATE OR REPLACE VIEW public.vw_portoes_do_aluno
WITH (security_invoker = on) AS
WITH conteudos_ok AS (
    SELECT ca.aluno_id, t.classe_id, count(*) AS total
      FROM public.conteudo_aluno ca
      JOIN public.conteudos c ON c.id = ca.conteudo_id
      JOIN public.topicos t ON t.id = c.topico_id
     WHERE ca.status = 'concluido'::public.status_atividade
        OR ca.percentual_concluido >= 100
     GROUP BY ca.aluno_id, t.classe_id
), topicos_ok AS (
    SELECT ta.aluno_id, t.classe_id, count(*) AS total
      FROM public.topico_aluno ta
      JOIN public.topicos t ON t.id = ta.topico_id
     WHERE ta.status = 'concluido'::public.status_atividade
        OR ta.percentual_concluido >= 100
     GROUP BY ta.aluno_id, t.classe_id
)
SELECT
    m.aluno_id,
    m.classe_id,
    COALESCE(c.total, 0) AS conteudos_concluidos,
    COALESCE(tp.total, 0) AS topicos_concluidos,
    COALESCE(c.total, 0) >= 1 AS social_liberado,
    COALESCE(tp.total, 0) >= 1 AS rank_liberado
  FROM public.classe_aluno m
  LEFT JOIN conteudos_ok c
         ON c.aluno_id = m.aluno_id AND c.classe_id = m.classe_id
  LEFT JOIN topicos_ok tp
         ON tp.aluno_id = m.aluno_id AND tp.classe_id = m.classe_id
 WHERE m.aluno_id = auth.uid();
"""

PRIVILEGIOS = """
REVOKE ALL ON public.vw_portoes_do_aluno FROM PUBLIC, anon;
GRANT SELECT ON public.vw_portoes_do_aluno TO authenticated, service_role;
"""


def upgrade() -> None:
    op.execute(VIEW)
    op.execute(PRIVILEGIOS)


def downgrade() -> None:
    # A view e' derivada: remover nao perde dado nenhum. O cliente volta a contar sozinho,
    # com o defeito que esta migration descreve.
    op.execute("DROP VIEW IF EXISTS public.vw_portoes_do_aluno;")

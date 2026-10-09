"""RLS: quem esta na classe volta a ler o tema do mapa

`classe_mapa_tema` tinha RLS ligado e **nenhuma policy** -- verificado ao vivo
no banco de producao: a linha da classe 56 existe (`world_name` =
"Fronteira Cinetica"), `anon` e `authenticated` tem GRANT de SELECT, e ainda
assim

    aluno matriculado na classe 56 -> 0 linhas
    professor dono da classe 56    -> 0 linhas

So o `service_role` da API lia. E a mesma falha de
`personalizacao_job_targets` (`20260922_01`), com um agravante: aqui o lado
que perde e o **aluno**, e ele perde em silencio.

`TrilhaContext.tsx` le a tabela direto do aparelho para montar o mapa
(`world_name`, `palette`, `countries`...) e ainda assina Realtime nela. Com RLS
fechada, o `maybeSingle()` devolve `null`, o erro cai num `console.warn` e a
trilha desenha o tema padrao -- o tema que o `class_theme_sync`
(`fn_enqueue_classe_mapa_tema_job`) acabou de gerar nunca chega na tela, e o
Realtime nunca dispara. Nada quebra visivelmente, e e por isso que passou.

A posse e direta (`classe_id` e coluna da propria tabela), e os dois lados que
precisam ler sao exatamente professor-dono e aluno-matriculado: e o que
`app_minhas_classes()` ja devolve (uniao de `app_classes_do_professor()` com
`app_classes_do_aluno()`), e usar o helper evita recursao de RLS por
`classe_aluno`, como manda o CLAUDE.md.

Somente SELECT. Quem **escreve** o tema e o worker da API pelo
`service_role`, que nao passa por RLS; cliente nenhum deve gravar aqui. Os
GRANTs de INSERT/UPDATE/DELETE que `anon`/`authenticated` carregam seguem
barrados pela ausencia de policy de escrita.

Conferido ao vivo com a policy criada dentro de uma transacao revertida:

    aluno matriculado (classe 56)   -> 1
    professor dono (classe 56)      -> 1
    autenticado de fora da classe   -> 0
    anonimo                         -> 0

Revision ID: 20261003_03
Revises: 20261003_02
Create Date: 2026-10-06
"""

from alembic import op

revision = "20261003_03"
down_revision = "20261003_02"
branch_labels = None
depends_on = None

POLICY = "classe_mapa_tema_minhas_classes_sel"


def upgrade() -> None:
    op.execute("GRANT SELECT ON public.classe_mapa_tema TO authenticated")
    op.execute(f"DROP POLICY IF EXISTS {POLICY} ON public.classe_mapa_tema")
    op.execute(
        f"""
        CREATE POLICY {POLICY} ON public.classe_mapa_tema
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_minhas_classes()))
        """
    )


def downgrade() -> None:
    op.execute(f"DROP POLICY IF EXISTS {POLICY} ON public.classe_mapa_tema")

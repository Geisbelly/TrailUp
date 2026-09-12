"""Base por perfil deixa de depender de aluno matriculado

Turma sem aluno nao gerava nada: `_build_targets` tira todo alvo de
`classe_aluno`, entao a lista vinha vazia, o job nascia com zero target e
fechava `completed` sem erro -- o pior tipo de falha, porque parece sucesso.
Medido na turma 54, que tem 5 topicos, 2 conteudos e 0 matriculados.

A camada base por perfil que o CLAUDE.md descreve ja existia no codigo, so nao
tinha onde morar: ela era simulada elegendo um aluno representante e marcando
`is_profile_template`, e o proprio worker ja tratava essa linha como nao sendo
material de aluno (pula `_seed_progress`). O `aluno_id` dela ja era vestigial --
servia de cabide porque a coluna era NOT NULL. Esta migration tira o cabide.

A linha de corte e entre ARTEFATO e COMPORTAMENTO. Artefato pode ser da classe;
comportamento e de gente e continua exigindo dono.

## O ponto que mais pode morder

Indice unico trata NULL como distinto. As uniques atuais sao todas ancoradas em
`aluno_id`, entao duas bases identicas passariam pelas duas -- cada NULL e
unico -- e a base duplicaria EM SILENCIO, aparecendo so depois como material
repetido no console. Por isso as uniques por aluno passam a excluir a base
(`aluno_id IS NOT NULL`) e a base ganha as suas, chaveadas em `classe_id`.

O mesmo vale para `uq_job_target_legado`: sem o par para a base, o dedup de
target para de funcionar justamente onde nao ha aluno para diferenciar.

Revision ID: 20260827_04
Revises: 20260827_03
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260827_04"
down_revision = "20260827_03"
branch_labels = None
depends_on = None

ARTEFATOS = (
    "conteudo_personalizado",
    "personalizacao_job_targets",
    "materiais_gerados",
    "cards_personalizados",
)


def upgrade() -> None:
    for tabela in ARTEFATOS:
        op.execute(f"ALTER TABLE {tabela} ALTER COLUMN aluno_id DROP NOT NULL")

    # Uniques por aluno passam a governar SO a camada por aluno.
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_conteudo_perfil")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_conteudo_perfil
          ON conteudo_personalizado (aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL
        """
    )
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
          ON conteudo_personalizado (aluno_id, topico_id, brainhex_profile_key)
          WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL AND conteudo_id IS NULL
        """
    )

    # Uniques da base: mesma forma, chaveadas em classe_id no lugar do aluno.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_base_topico_conteudo_perfil
          ON conteudo_personalizado (classe_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_base_topico_perfil_sem_conteudo
          ON conteudo_personalizado (classe_id, topico_id, brainhex_profile_key)
          WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NULL
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_job_target_legado")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_job_target_legado
          ON personalizacao_job_targets (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE media_kind IS NULL AND aluno_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_job_target_base
          ON personalizacao_job_targets (job_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE media_kind IS NULL AND aluno_id IS NULL
        """
    )

    # A policy exigia conteudo_id, mas material de nivel topico grava
    # conteudo_id nulo (o microservice escreve `conteudo_id ?? null`), entao o
    # professor ja nao enxergava essas linhas. A base por topico torna isso
    # comum, entao o caminho por personalizacao_id entra como alternativa.
    op.execute("DROP POLICY IF EXISTS professor_all_materiais_gerados ON materiais_gerados")
    op.execute(
        """
        CREATE POLICY professor_all_materiais_gerados ON materiais_gerados
          FOR ALL TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM conteudo_personalizado cp
              WHERE cp.id = materiais_gerados.personalizacao_id
                AND cp.classe_id IN (SELECT public.app_classes_do_professor())
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM conteudo_personalizado cp
              WHERE cp.id = materiais_gerados.personalizacao_id
                AND cp.classe_id IN (SELECT public.app_classes_do_professor())
            )
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS professor_all_materiais_gerados ON materiais_gerados")
    op.execute(
        """
        CREATE POLICY professor_all_materiais_gerados ON materiais_gerados
          FOR ALL TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
          )
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_job_target_base")
    op.execute("DROP INDEX IF EXISTS uq_job_target_legado")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_job_target_legado
          ON personalizacao_job_targets (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE media_kind IS NULL
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_base_topico_perfil_sem_conteudo")
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_base_topico_conteudo_perfil")
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
          ON conteudo_personalizado (aluno_id, topico_id, brainhex_profile_key)
          WHERE topico_id IS NOT NULL AND conteudo_id IS NULL
        """
    )
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_conteudo_perfil")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_conteudo_perfil
          ON conteudo_personalizado (aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE topico_id IS NOT NULL AND conteudo_id IS NOT NULL
        """
    )

    # DROP NOT NULL nao e revertido: linhas base (aluno_id NULL) podem existir e
    # o ALTER falharia. Apagar material do professor para reverter schema seria
    # pior que a divergencia.

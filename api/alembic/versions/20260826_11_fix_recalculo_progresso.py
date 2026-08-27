"""corrige `trailup_recalcular_topico_aluno`: enum em COALESCE e rotulo sem acento

Sintoma: inserir qualquer linha em `conteudos` numa turma com aluno matriculado
falhava com

    invalid input value for enum status_atividade: ""

ou seja, o professor nao conseguia adicionar conteudo — a operacao central do
produto. A suspeita inicial recaiu sobre `trg_conteudos_after_insert`, mas ele
esta correto; o erro vem de uma CASCATA:

    INSERT conteudos
      -> trg_conteudos_after_insert  (insere em conteudo_aluno)
        -> trailup_progresso_after_item
          -> trailup_recalcular_topico_aluno   <-- aqui

Sao dois defeitos independentes, ambos vindos de `20260826_02`:

1. **`coalesce(ca.status, '')` sobre coluna ENUM.** `conteudo_aluno.status` e
   `atividade_aluno.status` sao `status_atividade`, entao o Postgres resolve o
   COALESCE para o tipo do enum e tenta coagir `''` a ele. Enquanto o LEFT JOIN
   acha linha, o segundo argumento nunca e avaliado e o bug fica dormindo; no
   instante em que um conteudo do topico ainda nao tem `conteudo_aluno` para
   aquele aluno — exatamente o que acontece ao criar conteudo novo — o COALESCE
   avalia `''::status_atividade` e a transacao inteira aborta. `::text` antes do
   COALESCE resolve: a comparacao ja era textual (`position('concl' in ...)`).

2. **`'nao iniciado'` sem acento.** Os rotulos reais do enum sao
   `não iniciado | em andamento | concluido`. Todo topico com progresso zero —
   o caso mais comum — falhava ao gravar. `v_status` passa a ser declarado com o
   tipo do enum, para um rotulo errado estourar na atribuicao (linha obvia) em
   vez de dentro do INSERT.

O projeto ja teve mojibake commitado (ver CLAUDE.md), e este arquivo carrega uma
string acentuada dentro de SQL dentro de Python. A migracao verifica o rotulo
ANTES de recriar a funcao: se o arquivo chegar com a codificacao errada, ela
falha alto aqui, em vez de gravar uma funcao que so quebra em producao.

`trailup_recalcular_classe_aluno` foi conferida e nao tem nenhum dos dois
problemas.

Revision ID: 20260826_11
Revises: 20260826_10
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_11"
down_revision = "20260826_10"
branch_labels = None
depends_on = None

ROTULO_NAO_INICIADO = "não iniciado"


def upgrade() -> None:
    # Guarda de codificacao: falhar aqui e barato; gravar a funcao com o rotulo
    # corrompido custaria outra caçada em producao.
    op.execute(
        f"""
        DO $$
        BEGIN
          PERFORM '{ROTULO_NAO_INICIADO}'::status_atividade;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION
            'Rotulo do enum status_atividade nao confere. O arquivo da migracao '
            'provavelmente chegou com codificacao errada (ver CLAUDE.md: UTF-8 sem BOM).';
        END $$
        """
    )

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.trailup_recalcular_topico_aluno(
          p_aluno uuid, p_topico bigint
        )
        RETURNS void
        LANGUAGE plpgsql
        AS $fn$
        DECLARE
          v_total    integer := 0;
          v_feitos   integer := 0;
          v_pct      numeric := 0;
          -- Tipado com o enum: um rotulo invalido estoura na atribuicao, e nao
          -- la embaixo no INSERT, onde a mensagem nao diz de onde veio.
          v_status   status_atividade;
        BEGIN
          IF p_aluno IS NULL OR p_topico IS NULL THEN
            RETURN;
          END IF;

          -- Conteudo do professor.
          -- `::text` ANTES do COALESCE: `ca.status` e do tipo `status_atividade`,
          -- e sem o cast o Postgres resolve o COALESCE para o enum e tenta
          -- coagir '' a ele — erro em tempo de execucao assim que aparece um
          -- conteudo sem linha correspondente em `conteudo_aluno`.
          SELECT COUNT(*),
                 COUNT(*) FILTER (
                   WHERE position('concl' in lower(coalesce(ca.status::text, ''))) > 0
                      OR coalesce(ca.percentual_concluido, 0) >= 100
                 )
            INTO v_total, v_feitos
          FROM conteudos c
          LEFT JOIN conteudo_aluno ca
                 ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
          WHERE c.topico_id = p_topico;

          -- Atividades do professor (mesmo motivo do cast).
          SELECT v_total + COUNT(*),
                 v_feitos + COUNT(*) FILTER (
                   WHERE position('concl' in lower(coalesce(aa.status::text, ''))) > 0
                      OR coalesce(aa.percentual_concluido, 0) >= 100
                 )
            INTO v_total, v_feitos
          FROM atividades a
          LEFT JOIN atividade_aluno aa
                 ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
          WHERE a.topico_id = p_topico;

          -- Material personalizado. Chave que comeca com `slide:` fica FORA: sao
          -- interacoes dentro da apresentacao (quiz, checklist), nao etapas do
          -- percurso -- inclui-las faria o progresso depender de quantos quizzes
          -- o deck gerou.
          --
          -- Sem LIKE de proposito: sa.text() duplica o caractere por-cento pro
          -- paramstyle do driver, e sem parametros na execucao ele chega
          -- duplicado ao Postgres -- o padrao passaria a casar um por-cento
          -- literal e o filtro morreria em silencio. left() e position() nao tem
          -- esse problema.
          --
          -- Aqui `pip.status` e `text` de verdade, entao o COALESCE com '' esta
          -- correto e fica como estava.
          SELECT v_total + COUNT(*),
                 v_feitos + COUNT(*) FILTER (
                   WHERE position('concl' in lower(coalesce(pip.status, ''))) > 0
                      OR coalesce(pip.percentual_concluido, 0) >= 100
                 )
            INTO v_total, v_feitos
          FROM personalizacao_item_progresso pip
          WHERE pip.aluno_id = p_aluno
            AND pip.topico_id = p_topico
            AND left(coalesce(pip.item_key, ''), 6) <> 'slide:';

          IF v_total > 0 THEN
            v_pct := round((v_feitos::numeric / v_total::numeric) * 100, 2);
          ELSE
            v_pct := 0;
          END IF;

          v_pct := GREATEST(0, LEAST(100, v_pct));

          IF v_pct >= 100 THEN
            v_status := 'concluido';
          ELSIF v_pct > 0 THEN
            v_status := 'em andamento';
          ELSE
            -- COM acento: os rotulos do enum sao
            -- `não iniciado | em andamento | concluido`. Sem ele, todo topico
            -- com progresso zero (o caso mais comum) falhava ao gravar.
            v_status := '{ROTULO_NAO_INICIADO}';
          END IF;

          -- Nao toca em tempo_gasto_min: e contador incremental do app, nao
          -- valor derivavel destas tabelas.
          INSERT INTO topico_aluno (aluno_id, topico_id, percentual_concluido, status, updated_at)
          VALUES (p_aluno, p_topico, v_pct, v_status, now())
          ON CONFLICT (aluno_id, topico_id) DO UPDATE
            SET percentual_concluido = EXCLUDED.percentual_concluido,
                status = EXCLUDED.status,
                updated_at = now();
        END;
        $fn$
        """
    )


def downgrade() -> None:
    # A versao anterior NAO e restaurada: ela nao computava progresso, apenas
    # abortava a transacao de quem a chamasse. Recolocar isso seria reintroduzir
    # a quebra do console do professor.
    op.execute(
        """
        DO $$
        BEGIN
          RAISE NOTICE
            'Downgrade nao restaura a versao anterior de trailup_recalcular_topico_aluno: '
            'ela quebrava a insercao de conteudo. A funcao corrigida permanece.';
        END $$
        """
    )

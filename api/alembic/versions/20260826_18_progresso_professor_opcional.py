"""conteudo do professor sai do denominador do progresso: e opcional, vale bonus

Fecha a issue #41.

O topico 128 mostrava **94,12%** com **0 de 1** conteudo do professor concluido.
O numero nao era arredondamento nem bug de exibicao: 16 itens personalizados
concluidos sobre 17 itens no denominador da exatamente 94,1176%. O unico item
faltando era o do professor, e ele sozinho segurava o topico longe dos 100%
enquanto o aluno ja tinha feito todo o percurso dele.

Decisao de produto (registrada na issue): **o conteudo do professor e opcional
e vale bonus**. O percurso do aluno e o material personalizado; o que o
professor cadastrou e complemento, nao etapa obrigatoria. Entao ele sai do
denominador.

O que NAO muda: o conteudo do professor continua sendo contado e concluido
normalmente em `conteudo_aluno` / `atividade_aluno`. So deixou de decidir o
percentual. O bonus em si (XP, conquista) e feature separada e ainda nao esta
implementado — ver a issue de acompanhamento.

Ressalva que motiva metade do codigo: quando o material personalizado ainda nao
foi gerado, `personalizacao_item_progresso` nao tem linha nenhuma e o
denominador seria zero. O aluno que concluiu tudo o que existe veria 0%. Nesse
caso o conteudo do professor volta a ser o percurso — e o unico que ha.

A funcao e reescrita por inteiro, e nao remendada, porque a mudanca e
estrutural: os tres SELECTs deixam de acumular no mesmo par de contadores. Para
nao apagar em silencio o trabalho de outra sessao, o upgrade **confere antes**
que o corpo vivo ainda e o esperado e aborta se nao for.

Revision ID: 20260826_18
Revises: 20260826_17
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260826_18"
down_revision = "20260826_17"
branch_labels = None
depends_on = None

ROTULO_NAO_INICIADO = "não iniciado"

# Trechos que so existem na versao que esta sendo substituida. Se algum sumir, o
# corpo mudou por fora e reescrever seria clobber.
#
# Sao procurados em `pg_proc.prosrc`, que e o CORPO da funcao — nao inclui o
# cabecalho, entao nada de procurar pelo nome dela aqui.
MARCAS_ESPERADAS = (
    "INTO v_total, v_feitos",
    "FROM personalizacao_item_progresso pip",
    "FROM conteudos c",
)


def _guardas() -> None:
    # Falhar aqui e barato; gravar a funcao com o rotulo corrompido custaria
    # outra caçada em producao.
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


FUNCAO = f"""
CREATE OR REPLACE FUNCTION public.trailup_recalcular_topico_aluno(
  p_aluno uuid, p_topico bigint
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  -- O percurso: e ele que define o percentual.
  v_percurso_total  integer := 0;
  v_percurso_feitos integer := 0;
  -- O opcional do professor: contado, mas fora do denominador.
  v_bonus_total     integer := 0;
  v_bonus_feitos    integer := 0;
  v_pct             numeric := 0;
  -- Tipado com o enum: um rotulo invalido estoura na atribuicao, e nao la
  -- embaixo no INSERT, onde a mensagem nao diz de onde veio.
  v_status          status_atividade;
BEGIN
  IF p_aluno IS NULL OR p_topico IS NULL THEN
    RETURN;
  END IF;

  -- Conteudo do professor -> bonus.
  -- `::text` ANTES do COALESCE: `ca.status` e do tipo `status_atividade`, e sem
  -- o cast o Postgres resolve o COALESCE para o enum e tenta coagir '' a ele —
  -- erro em tempo de execucao assim que aparece um conteudo sem linha
  -- correspondente em `conteudo_aluno`.
  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE position('concl' in lower(coalesce(ca.status::text, ''))) > 0
              OR coalesce(ca.percentual_concluido, 0) >= 100
         )
    INTO v_bonus_total, v_bonus_feitos
  FROM conteudos c
  LEFT JOIN conteudo_aluno ca
         ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
  WHERE c.topico_id = p_topico;

  -- Atividades do professor -> tambem bonus (mesmo motivo do cast).
  SELECT v_bonus_total + COUNT(*),
         v_bonus_feitos + COUNT(*) FILTER (
           WHERE position('concl' in lower(coalesce(aa.status::text, ''))) > 0
              OR coalesce(aa.percentual_concluido, 0) >= 100
         )
    INTO v_bonus_total, v_bonus_feitos
  FROM atividades a
  LEFT JOIN atividade_aluno aa
         ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
  WHERE a.topico_id = p_topico;

  -- Material personalizado: ESTE e o percurso do aluno.
  --
  -- Chave que comeca com `slide:` fica FORA: sao interacoes dentro da
  -- apresentacao (quiz, checklist), nao etapas do percurso — inclui-las faria o
  -- progresso depender de quantos quizzes o deck gerou.
  --
  -- Sem LIKE de proposito: sa.text() duplica o caractere por-cento pro
  -- paramstyle do driver, e sem parametros na execucao ele chega duplicado ao
  -- Postgres — o padrao passaria a casar um por-cento literal e o filtro
  -- morreria em silencio. left() e position() nao tem esse problema.
  --
  -- Aqui `pip.status` e `text` de verdade, entao o COALESCE com '' esta correto.
  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE position('concl' in lower(coalesce(pip.status, ''))) > 0
              OR coalesce(pip.percentual_concluido, 0) >= 100
         )
    INTO v_percurso_total, v_percurso_feitos
  FROM personalizacao_item_progresso pip
  WHERE pip.aluno_id = p_aluno
    AND pip.topico_id = p_topico
    AND left(coalesce(pip.item_key, ''), 6) <> 'slide:';

  IF v_percurso_total = 0 THEN
    -- Material personalizado ainda nao gerado para este topico. Sem esta
    -- excecao o denominador seria zero e o aluno que concluiu tudo o que existe
    -- veria 0%. Aqui o conteudo do professor e o percurso, porque e o unico que
    -- ha.
    v_percurso_total  := v_bonus_total;
    v_percurso_feitos := v_bonus_feitos;
  END IF;

  IF v_percurso_total > 0 THEN
    v_pct := round((v_percurso_feitos::numeric / v_percurso_total::numeric) * 100, 2);
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
    -- `não iniciado | em andamento | concluido`. Sem ele, todo topico com
    -- progresso zero (o caso mais comum) falhava ao gravar.
    v_status := '{ROTULO_NAO_INICIADO}';
  END IF;

  -- Nao toca em tempo_gasto_min: e contador incremental do app, nao valor
  -- derivavel destas tabelas.
  INSERT INTO topico_aluno (aluno_id, topico_id, percentual_concluido, status, updated_at)
  VALUES (p_aluno, p_topico, v_pct, v_status, now())
  ON CONFLICT (aluno_id, topico_id) DO UPDATE
    SET percentual_concluido = EXCLUDED.percentual_concluido,
        status = EXCLUDED.status,
        updated_at = now();
END;
$fn$
"""


def upgrade() -> None:
    _guardas()

    marcas = "', '".join(MARCAS_ESPERADAS)
    op.execute(
        f"""
        DO $do$
        DECLARE
          v_src  text;
          v_marca text;
        BEGIN
          SELECT p.prosrc INTO v_src
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'trailup_recalcular_topico_aluno';

          IF v_src IS NULL THEN
            RAISE EXCEPTION 'trailup_recalcular_topico_aluno nao encontrada';
          END IF;

          IF position('v_percurso_total' in v_src) > 0 THEN
            RETURN;  -- ja aplicada
          END IF;

          FOREACH v_marca IN ARRAY ARRAY['{marcas}'] LOOP
            IF position(v_marca in v_src) = 0 THEN
              -- `USING MESSAGE` em vez do placeholder do RAISE: sa.text()
              -- duplica o caractere por-cento para o paramstyle do driver, e a
              -- mensagem chegaria quebrada justamente quando mais importa.
              RAISE EXCEPTION USING MESSAGE =
                'O corpo de trailup_recalcular_topico_aluno nao e o esperado '
                '(faltou: ' || v_marca || '). Alguem mudou a funcao por fora; '
                'reescreve-la aqui apagaria esse trabalho. Reveja a migracao '
                'antes de aplicar.';
            END IF;
          END LOOP;
        END $do$
        """
    )

    op.execute(FUNCAO)

    # Recalcula o que ja esta gravado: sem isto o percentual antigo fica no
    # banco ate o aluno tocar no topico de novo, e o 94,12% continuaria na tela.
    op.execute(
        """
        DO $do$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT DISTINCT aluno_id, topico_id FROM topico_aluno
                    WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL LOOP
            PERFORM public.trailup_recalcular_topico_aluno(r.aluno_id, r.topico_id);
          END LOOP;
        END $do$
        """
    )

    # O percentual da classe e a media dos topicos, entao ele tambem mudou.
    op.execute(
        """
        DO $do$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT DISTINCT aluno_id, classe_id FROM classe_aluno
                    WHERE aluno_id IS NOT NULL AND classe_id IS NOT NULL LOOP
            PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
          END LOOP;
        END $do$
        """
    )


def downgrade() -> None:
    _guardas()
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
          v_status   status_atividade;
        BEGIN
          IF p_aluno IS NULL OR p_topico IS NULL THEN
            RETURN;
          END IF;

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
            v_status := '{ROTULO_NAO_INICIADO}';
          END IF;

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

"""o tempo da classe passa a ser derivado, como o percentual ja era

`classe_aluno."tempoGastoMin"` era um fossil. Medido em producao, classe 32:

| fonte                                             | valor      |
|---------------------------------------------------|------------|
| soma de `topico_aluno.tempo_gasto_min`            | 2,17 min   |
| `classe_aluno."tempoGastoMin"`                    | 0,39 min   |

E e' o 0,39 que alimenta o rank "Tempo de Estudo", porque a view le essa coluna.
5,6 vezes de diferenca entre o rank e o que a trilha e o perfil mostram.

**Nada escrevia essa coluna.** Nem mobile, nem API, nem frontend, nem funcao do
banco: procurei os quatro. `trailup_recalcular_classe_aluno` recalculava so'
`porcentagemConcluida` e `isComplete`. O 0,39 foi gravado uma vez, por codigo que
nao existe mais, e congelou ali.

E' a mesma familia dos quatro gravadores de `topico_aluno` que a `20260826_18`
removeu -- o `CLAUDE.md` ja diz que `tempo_gasto_min` em `topico_aluno`,
`conteudo_aluno` e `atividade_aluno` e' derivado por gatilho e que nenhum cliente
escreve. Faltou dizer o nivel de cima: `classe_aluno` tinha as duas colunas no
mesmo lugar, uma derivada e a outra a mao, e so' a derivada estava certa.

Agora as duas saem da mesma funcao, no mesmo momento. **Soma**, nao media: o
percentual da classe e' a media dos topicos (cada topico vale o mesmo), mas o
tempo e' quanto o aluno passou estudando -- isso se acumula.

Segue o padrao de descoberta de coluna da funcao original: `classe_aluno` existe
em dois dialetos neste projeto (camelCase e minusculo), e gravar na coluna errada
falharia so' no outro ambiente.

Revision ID: 20260910_03
Revises: 20260910_02
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_03"
down_revision = "20260910_02"
branch_labels = None
depends_on = None


FUNCAO = """
CREATE OR REPLACE FUNCTION public.trailup_recalcular_classe_aluno(
  p_aluno uuid,
  p_classe bigint
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_pct       numeric := 0;
  v_tempo     numeric := 0;
  v_col_pct   text;
  v_col_done  text;
  v_col_tempo text;
  v_sql       text;
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN
    RETURN;
  END IF;

  -- Media dos topicos da classe, usando o percentual que a funcao de topico
  -- acabou de derivar. Cada topico vale o mesmo, entao media.
  SELECT COALESCE(round(AVG(GREATEST(0, LEAST(100, COALESCE(ta.percentual_concluido, 0)))), 2), 0)
    INTO v_pct
  FROM topicos t
  LEFT JOIN topico_aluno ta
         ON ta.topico_id = t.id AND ta.aluno_id = p_aluno
  WHERE t.classe_id = p_classe;

  -- Tempo e' SOMA: quanto o aluno passou estudando a classe se acumula pelos
  -- topicos. `topico_aluno.tempo_gasto_min` ja e' derivado da telemetria por
  -- gatilho, entao esta e' a mesma fonte que a trilha e o perfil leem.
  SELECT COALESCE(round(SUM(GREATEST(0, COALESCE(ta.tempo_gasto_min, 0)))::numeric, 2), 0)
    INTO v_tempo
  FROM topicos t
  LEFT JOIN topico_aluno ta
         ON ta.topico_id = t.id AND ta.aluno_id = p_aluno
  WHERE t.classe_id = p_classe;

  -- `classe_aluno` existe em dois dialetos neste projeto. Descobrir qual esta
  -- presente evita gravar na coluna errada (ou falhar) no outro ambiente.
  SELECT column_name INTO v_col_pct
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classe_aluno'
    AND column_name IN ('porcentagemConcluida', 'porcentagemconcluida')
  LIMIT 1;

  IF v_col_pct IS NULL THEN
    RETURN;
  END IF;

  SELECT column_name INTO v_col_done
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classe_aluno'
    AND column_name IN ('isComplete', 'iscomplete')
  LIMIT 1;

  SELECT column_name INTO v_col_tempo
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classe_aluno'
    AND column_name IN ('tempoGastoMin', 'tempogastomin')
  LIMIT 1;

  -- quote_ident em vez de format com placeholder de identificador: aquele
  -- caractere por-cento sofre o mesmo escape do driver e quebraria a citacao.
  -- quote_ident faz a mesma protecao sem por-cento nenhum.
  v_sql := 'UPDATE classe_aluno SET ' || quote_ident(v_col_pct) || ' = $1';
  IF v_col_done IS NOT NULL THEN
    v_sql := v_sql || ', ' || quote_ident(v_col_done) || ' = ($1 >= 100)';
  END IF;
  IF v_col_tempo IS NOT NULL THEN
    v_sql := v_sql || ', ' || quote_ident(v_col_tempo) || ' = $4';
  END IF;
  v_sql := v_sql || ' WHERE aluno_id = $2 AND classe_id = $3';

  EXECUTE v_sql USING v_pct, p_aluno, p_classe, v_tempo;
END;
$fn$;
"""


# O fossil nao se corrige sozinho: a funcao so' roda quando ha progresso novo.
BACKFILL = """
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT ca.aluno_id, ca.classe_id
      FROM public.classe_aluno ca
  LOOP
    PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
  END LOOP;
END $$;
"""


# Falha aqui se a coluna continuar divergindo da soma dos topicos.
CONFERE = """
DO $$
DECLARE
  v_col_tempo text;
  v_fora      bigint;
BEGIN
  SELECT column_name INTO v_col_tempo
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classe_aluno'
    AND column_name IN ('tempoGastoMin', 'tempogastomin')
  LIMIT 1;

  IF v_col_tempo IS NULL THEN
    RETURN;  -- dialeto sem a coluna: nada a conferir
  END IF;

  EXECUTE
    'SELECT count(*) FROM public.classe_aluno ca WHERE round(COALESCE(ca.'
    || quote_ident(v_col_tempo)
    || ', 0)::numeric, 2) IS DISTINCT FROM ('
    || '  SELECT COALESCE(round(SUM(GREATEST(0, COALESCE(ta.tempo_gasto_min, 0)))::numeric, 2), 0)'
    || '    FROM public.topicos t'
    || '    LEFT JOIN public.topico_aluno ta'
    || '           ON ta.topico_id = t.id AND ta.aluno_id = ca.aluno_id'
    || '   WHERE t.classe_id = ca.classe_id)'
  INTO v_fora;

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'classe_aluno com tempo divergente da soma dos topicos: ' || v_fora::text;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute(BACKFILL)
    op.execute(CONFERE)


def downgrade() -> None:
    # Volta a funcao a nao tocar no tempo. O valor recalculado fica: o anterior
    # era fossil e nao ha para onde retorna-lo.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_recalcular_classe_aluno(
          p_aluno uuid,
          p_classe bigint
        )
        RETURNS void
        LANGUAGE plpgsql
        SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_pct       numeric := 0;
          v_col_pct   text;
          v_col_done  text;
          v_sql       text;
        BEGIN
          IF p_aluno IS NULL OR p_classe IS NULL THEN
            RETURN;
          END IF;

          SELECT COALESCE(round(AVG(GREATEST(0, LEAST(100, COALESCE(ta.percentual_concluido, 0)))), 2), 0)
            INTO v_pct
          FROM topicos t
          LEFT JOIN topico_aluno ta
                 ON ta.topico_id = t.id AND ta.aluno_id = p_aluno
          WHERE t.classe_id = p_classe;

          SELECT column_name INTO v_col_pct
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'classe_aluno'
            AND column_name IN ('porcentagemConcluida', 'porcentagemconcluida')
          LIMIT 1;

          IF v_col_pct IS NULL THEN
            RETURN;
          END IF;

          SELECT column_name INTO v_col_done
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'classe_aluno'
            AND column_name IN ('isComplete', 'iscomplete')
          LIMIT 1;

          v_sql := 'UPDATE classe_aluno SET ' || quote_ident(v_col_pct) || ' = $1';
          IF v_col_done IS NOT NULL THEN
            v_sql := v_sql || ', ' || quote_ident(v_col_done) || ' = ($1 >= 100)';
          END IF;
          v_sql := v_sql || ' WHERE aluno_id = $2 AND classe_id = $3';

          EXECUTE v_sql USING v_pct, p_aluno, p_classe;
        END;
        $fn$;
        """
    )

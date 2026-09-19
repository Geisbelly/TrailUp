"""o tempo da classe deixa de desandar: telemetria tambem recalcula

Lacuna da propria `20260910_03`. Ela tornou `classe_aluno."tempoGastoMin"`
derivado -- soma de `topico_aluno.tempo_gasto_min` -- e o backfill fez a coluna
bater com a soma no momento em que rodou. Dias depois:

| | valor |
|---|---|
| `classe_aluno."tempoGastoMin"` (classe 32) | 2,90 |
| soma de `topico_aluno.tempo_gasto_min`     | 2,26 |
| deriva                                     | **0,64 min** |

**Por que.** `trailup_recalcular_classe_aluno` e' chamada por um caminho so':
`trailup_progresso_after_item`, cujos gatilhos vivem em `conteudo_aluno`,
`atividade_aluno` e `personalizacao_item_progresso` -- todos de **progresso**.
Quem escreve o tempo e' outro gatilho, `trailup_tempo_after_telemetria` sobre
`telemetria_time_metric_entries`, e ele **nao** chamava a recalculacao. Tempo
muda por telemetria sem progresso mudar, e a coluna ficava parada no ultimo
valor de quando o progresso mudou.

A `20260910_03` consertou o retrato e deixou a deriva voltar no dia seguinte.
Corrigir o valor sem fechar o laco que o mantem e' meio conserto.

**Por que a coluna estava MAIOR que a soma.** Porque
`trailup_tempo_after_telemetria` **recomputa** `tempo_gasto_min` de
`trailup_tempo_telemetria_min`, em vez de incrementar -- se a agregacao da
telemetria muda (lote podado, escopo reclassificado), o tempo do topico pode
cair. A coluna da classe, congelada num valor antigo, sobra.

**A correcao reusa a mesma funcao**, em vez de somar o tempo num segundo lugar.
Duas contas para a mesma coisa e' exatamente o defeito que esta sequencia toda
vem desfazendo (`porcentagemConcluida` local vs banco, `progresso` do rank,
`formatMinutes` em tres versoes). Ela tambem recalcula percentual e `isComplete`
no caminho -- trabalho a mais, idempotente, e garante que as duas colunas nunca
discordem sobre a fonte.

**So o escopo `topic` entra.** `trailup_recalcular_classe_aluno` soma
`topico_aluno`, e essa tabela e' atualizada apenas pelo ramo `scope = 'topic'`.
Lote que traz so' `content` ou `activity` nao muda o total da classe, e chamar a
recalculacao ali seria custo sem efeito. O gatilho e' STATEMENT-level com tabela
de transicao, entao a chamada e' feita por conjunto, uma vez por (aluno, classe)
distinto -- nao por linha de telemetria.

Fecha tambem o `search_path` de `trailup_tempo_after_telemetria`, que esta sendo
reescrita aqui de todo jeito. Ela referencia `topico_aluno`, `conteudo_aluno` e
`atividade_aluno` **sem prefixo** `public.`, entao sem fixar o parametro quem
chama decide onde esses nomes sao resolvidos. Ela e' `SECURITY DEFINER` e esta
na lista do linter, o que tornaria isso escalada de privilegio -- atenuada
apenas por ela retornar `trigger`, e o Postgres recusar funcao de gatilho
chamada fora do contexto de gatilho. Fixar custa uma linha.

O `CREATE OR REPLACE` da substituicao **repete `SECURITY DEFINER`** de
proposito: omitir volta a funcao para `INVOKER`, e ela roda como o aluno num
gatilho que escreve `topico_aluno` de outros escopos -- quebraria a gravacao de
tempo em silencio.

Revision ID: 20260910_09
Revises: 20260910_08
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_09"
down_revision = "20260910_08"
branch_labels = None
depends_on = None


# Substituicao no corpo, nao recolagem: sao 1286 bytes escritos a mao, e
# reproduzi-los de memoria e' como se introduz defeito. O ancoradouro e' o
# `RETURN NULL` final, que aparece uma vez so'.
ANCORA = "          RETURN NULL;"

CHAMADA = """          -- O tempo da classe sai da MESMA funcao que o percentual, e ela so' era
          -- chamada pelo gatilho de PROGRESSO. Tempo muda por telemetria sem
          -- progresso mudar, entao `classe_aluno."tempoGastoMin"` desandava --
          -- 0,64 min de deriva medidos dias depois da 20260910_03.
          --
          -- Por conjunto, e nao por linha: o gatilho e' STATEMENT-level com
          -- tabela de transicao, entao isto roda uma vez por (aluno, classe)
          -- distinto do lote. E so' `topic`, porque e' o unico escopo que
          -- atualiza `topico_aluno` -- que e' o que a funcao soma.
          PERFORM public.trailup_recalcular_classe_aluno(alvo.aluno_id, alvo.classe_id)
            FROM (
              SELECT DISTINCT n.aluno_id, t.classe_id
                FROM novas n
                JOIN public.topicos t ON t.id = n.topico_id
               WHERE n.scope = 'topic'
                 AND n.aluno_id IS NOT NULL
                 AND t.classe_id IS NOT NULL
            ) alvo;

          RETURN NULL;"""


GATILHO = f"""
DO $$
DECLARE
  v_src  text;
  v_novo text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'trailup_tempo_after_telemetria';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'trailup_tempo_after_telemetria nao encontrada';
  END IF;

  IF position('trailup_recalcular_classe_aluno' in v_src) > 0 THEN
    RETURN;  -- ja aplicado
  END IF;

  v_novo := replace(v_src, '{ANCORA}', $ins${CHAMADA}$ins$);

  IF v_novo = v_src THEN
    RAISE EXCEPTION
      'Nao encontrei o RETURN NULL em trailup_tempo_after_telemetria';
  END IF;

  EXECUTE
    'CREATE OR REPLACE FUNCTION public.trailup_tempo_after_telemetria() '
    || 'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER '
    || 'SET search_path TO ''public'', ''pg_temp'' AS $fn$' || v_novo || '$fn$';
END $$;
"""


# A deriva que ja existe nao se corrige sozinha: a funcao roda no proximo lote,
# e ate la a coluna segue errada.
BACKFILL = """
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT aluno_id, classe_id FROM public.classe_aluno LOOP
    PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
  END LOOP;
END $$;
"""


CONFERE = """
DO $$
DECLARE
  v_fora   bigint;
  v_chama  boolean;
  v_config text;
BEGIN
  -- O laco esta fechado?
  SELECT (position('trailup_recalcular_classe_aluno' in p.prosrc) > 0)
    INTO v_chama
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'trailup_tempo_after_telemetria';

  IF v_chama IS NOT TRUE THEN
    RAISE EXCEPTION
      'trailup_tempo_after_telemetria nao chama a recalculacao: o tempo volta a desandar';
  END IF;

  SELECT array_to_string(p.proconfig, ', ') INTO v_config
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'trailup_tempo_after_telemetria';

  IF v_config IS NULL OR position('search_path' in v_config) = 0 THEN
    RAISE EXCEPTION 'trailup_tempo_after_telemetria ficou sem search_path fixo';
  END IF;

  -- E o gatilho continua no lugar. Um CREATE OR REPLACE nao o derruba, mas se
  -- alguem trocar a assinatura da funcao ele cai sem aviso.
  SELECT count(*) INTO v_fora
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname = 'trailup_tempo_after_telemetria';

  IF v_fora < 1 THEN
    RAISE EXCEPTION 'o gatilho de tempo por telemetria desapareceu';
  END IF;

  -- Nenhuma matricula com a coluna divergindo da soma dos topicos.
  SELECT count(*) INTO v_fora
    FROM public.classe_aluno ca
   WHERE round(COALESCE(ca."tempoGastoMin", 0)::numeric, 2) IS DISTINCT FROM (
           SELECT COALESCE(round(SUM(GREATEST(0, COALESCE(ta.tempo_gasto_min, 0)))::numeric, 2), 0)
             FROM public.topicos t
             LEFT JOIN public.topico_aluno ta
                    ON ta.topico_id = t.id AND ta.aluno_id = ca.aluno_id
            WHERE t.classe_id = ca.classe_id);

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'classe_aluno com tempo divergente da soma dos topicos: ' || v_fora::text;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(GATILHO)
    op.execute(BACKFILL)
    op.execute(CONFERE)


def downgrade() -> None:
    # Tira a chamada e devolve o `search_path` mutavel. O valor recalculado fica:
    # ele esta correto, e voltar a um numero errado nao e' reversao, e' regressao.
    op.execute(
        f"""
        DO $$
        DECLARE
          v_src  text;
          v_novo text;
        BEGIN
          SELECT p.prosrc INTO v_src
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'trailup_tempo_after_telemetria';

          v_novo := replace(v_src, $ins${CHAMADA}$ins$, '{ANCORA}');

          EXECUTE
            'CREATE OR REPLACE FUNCTION public.trailup_tempo_after_telemetria() '
            || 'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$'
            || v_novo || '$fn$';
        END $$;
        """
    )

"""Invariantes diárias das métricas (I01…I20), o executor e o `pg_cron` que alimenta a disponibilidade

F0 da spec de métricas ("medir antes de mexer"). A `20261029_02` criou o catálogo, o resultado, a
amostra e `vw_metricas_disponibilidade`; esta põe quem escreve no resultado.

## As invariantes

Cada uma é uma função `public.fn_inv_iNN() RETURNS TABLE (id text)` que devolve **as linhas que
violam** a regra (zero linhas = passou). Não é SQL guardado em tabela e executado como texto: é
código versionado aqui, revisado como qualquer migration. I01–I15 são o SQL do apêndice A da spec
(`docs/superpowers/specs/2026-10-28-metricas-ponta-a-ponta-design.md`), com nomes qualificados e
`id::text`; I16–I20 são as novas da spec (§5.1):

- I16: por `(aluno_id, classe_id)` de `vw_metricas_engajamento_aluno_classe`, `tempo_total_uso_seg`
  dividido pela soma direta de `tempo_sessao_seg` em `vw_metricas_sessoes_aluno_dia` tem de dar 1,00
  (arredondado a duas casas). Soma direta zero só passa se o tempo da view também for zero.
- I17: sessão aberta (`ended_at IS NULL`) cujo lote mais recente já é terminal (`session_end`,
  `app_background`, `screen_blur`).
- I18: lote pela via direta sem `fallback_motivo` (build antigo do app; ver `20261029_01`).
- I19: resposta (`questao_aluno`) cuja questão não existe, ou cuja atividade da questão não existe.
- I20: uma linha `cobertura` quando, nos últimos 7 dias, lotes analisados ÷ recebidos < 0,95.
  Sem lote na semana não há o que medir: nenhuma linha.
- I11: a allowlist é só `vw_rank_posicoes_por_classe` (a view sem invoker que o cliente lê de
  propósito; ver CLAUDE.md, "View sem security_invoker ignora RLS").

## Por que plpgsql, e o `#variable_conflict`

Várias invariantes dependem de objetos que **não estão no Alembic** (`trailup_progresso_percurso`,
as `vw_metricas_*`; ver `docs/architecture/schema-nao-versionado.md`). Função `LANGUAGE sql` tem o
corpo validado no `CREATE` e derrubaria esta migration num banco novo (CI, Docker local). Em plpgsql
o corpo só é resolvido quando roda: o objeto ausente vira **erro daquela invariante**, registrado
pelo executor, e as outras seguem. É o caso que a revisão pede para provar.

O parâmetro de saída `id` de `RETURNS TABLE (id text)` é uma variável plpgsql e colidiria com toda
coluna `id` das consultas. Toda coluna vem qualificada pelo alias e o corpo começa com
`#variable_conflict use_column`, para que um `id` solto, se escapar, seja a coluna.

## O executor

`public.fn_auditoria_metricas_rodar() RETURNS jsonb` roda I01…I20 em ordem, cada uma numa
subtransação (`BEGIN … EXCEPTION WHEN OTHERS`):

- conta as linhas e grava `metricas_invariante_resultado` com `ok = (linhas = 0)`;
- se houve violação, grava até 20 ids (ordem textual, estável entre rodadas) em
  `metricas_invariante_amostra`;
- se a invariante estourou, grava `ok = false`, `linhas = NULL` e `erro = SQLSTATE || ': ' ||
  left(SQLERRM, 200)`, e segue para a próxima. `erro` não entra no GRANT por coluna de
  `authenticated` na `20261029_02` (só `service_role`/`postgres` o leem), e mesmo assim nunca vai DETAIL, HINT, contexto nem id de aluno. Ids
  só vão para a amostra, que é só `service_role`.
- no fim apaga resultado e amostra com mais de 30 dias.

Devolve `{"rodadas": 20, "falharam": [...], "erros": [...]}` (ids `I01`…`I20`). Todas as linhas de
uma rodada levam o mesmo `rodado_em` (`now()` da transação).

O nome da função é montado pelo próprio laço (`'fn_inv_i' || lpad(n, 2, '0')`, com `%I`) — não vem
de tabela nem de parâmetro, então não há SQL de fora entrando no `EXECUTE`.

## Quem pode chamar

As 21 funções são `SECURITY DEFINER` com `SET search_path = ''` (nomes `public.`/`pg_catalog.`),
porque leem dado de todos os alunos e escrevem no resultado. `REVOKE ALL ... FROM PUBLIC, anon,
authenticated` em todas e nenhum `GRANT EXECUTE`: o Supabase concede EXECUTE por padrão a toda
função nova de `public`, e o REVOKE é o que tira. Quem roda é o `pg_cron` (como `postgres`) e o dev
como `service_role`.

## `pg_cron`

Job `trailup_auditoria_metricas`, `30 6 * * *` (UTC) = 03:30 de São Paulo. Mesmo molde da
`20261025_04`: só se a extensão `pg_cron` existir, reagendando por nome (aplicar de novo não duplica
o job). Sem `pg_cron` (banco local, CI) a migration passa e nada é agendado; a disponibilidade fica
`auditoria_atrasada`, que é o certo para auditoria que não roda.

O downgrade desagenda **antes** de dropar as funções: não fica janela em que o cron chama função que
já não existe.
"""

from alembic import op

revision = "20261029_03"
down_revision = "20261029_02"
branch_labels = None
depends_on = None

JOB = "trailup_auditoria_metricas"
CRON = "30 6 * * *"  # 03:30 America/Sao_Paulo; o pg_cron do Supabase roda em UTC

# Corpo de cada invariante: um SELECT que devolve uma coluna text com o id de cada linha que viola.
# Sem `:` seguido de letra (o SQL passa por `text()`); `%` só dentro de LIKE.
INVARIANTES: dict[str, str] = {
    # I01 idempotência da telemetria
    "01": """
    SELECT concat_ws(':', e.lote_id::text, e.scope, e.entry_key)
      FROM public.telemetria_time_metric_entries e
     GROUP BY e.lote_id, e.scope, e.entry_key
    HAVING count(*) > 1""",
    # I02 coerência interna do intervalo
    "02": """
    SELECT e.id::text
      FROM public.telemetria_time_metric_entries e
     WHERE e.active_sec < 0 OR e.idle_sec < 0 OR e.active_sec > e.dwell_sec + 0.5
        OR abs(e.active_sec + e.idle_sec - e.dwell_sec) > 1""",
    # I03 escopo aninhado: content <= topic no mesmo lote
    "03": """
    SELECT e.lote_id::text
      FROM public.telemetria_time_metric_entries e
     GROUP BY e.lote_id
    HAVING sum(e.active_sec) FILTER (WHERE e.scope = 'content')
         > sum(e.active_sec) FILTER (WHERE e.scope = 'topic') + 1""",
    # I04 status x percentual do tópico
    "04": """
    SELECT ta.id::text
      FROM public.topico_aluno ta
     WHERE (ta.percentual_concluido >= 100) <> (ta.status::text = 'concluido')
        OR (ta.percentual_concluido = 0 AND ta.status::text <> 'não iniciado')""",
    # I05 percentual gravado = regra de trailup_recalcular_topico_aluno
    "05": """
    SELECT ta.id::text
      FROM public.topico_aluno ta
     CROSS JOIN LATERAL (
       SELECT (SELECT count(*) FROM public.conteudos c WHERE c.topico_id = ta.topico_id)
            + (SELECT count(*) FROM public.atividades a WHERE a.topico_id = ta.topico_id) AS pt,
              (SELECT count(*)
                 FROM public.conteudos c
                 JOIN public.conteudo_aluno x ON x.conteudo_id = c.id AND x.aluno_id = ta.aluno_id
                WHERE c.topico_id = ta.topico_id
                  AND (x.status::text LIKE 'concl%' OR coalesce(x.percentual_concluido, 0) >= 100))
            + (SELECT count(*)
                 FROM public.atividades a
                 JOIN public.atividade_aluno x ON x.atividade_id = a.id AND x.aluno_id = ta.aluno_id
                WHERE a.topico_id = ta.topico_id
                  AND (x.status::text LIKE 'concl%' OR coalesce(x.percentual_concluido, 0) >= 100)) AS pf,
              (SELECT coalesce(sum(p.total), 0)
                 FROM public.trailup_progresso_percurso(
                        ta.aluno_id, (SELECT t.classe_id FROM public.topicos t WHERE t.id = ta.topico_id)) p
                WHERE p.topico_id = ta.topico_id) AS qt,
              (SELECT coalesce(sum(p.feitos), 0)
                 FROM public.trailup_progresso_percurso(
                        ta.aluno_id, (SELECT t.classe_id FROM public.topicos t WHERE t.id = ta.topico_id)) p
                WHERE p.topico_id = ta.topico_id) AS qf
     ) k
     WHERE ta.percentual_concluido <> CASE WHEN k.qt > 0 THEN round(100.0 * k.qf / k.qt, 2)
                                           WHEN k.pt > 0 THEN round(100.0 * k.pf / k.pt, 2)
                                           ELSE 0 END""",
    # I06 tempo com fórmula única. Na F4 passa a comparar com o tempo ativo (D-1)
    "06": """
    SELECT ta.id::text
      FROM public.topico_aluno ta
     WHERE abs(coalesce(ta.tempo_gasto_min, 0)
               - (ta.tempo_direto_min
                  + public.trailup_tempo_sessao_min(ta.aluno_id, 'topic', ta.topico_id, NULL, NULL))) > 0.01""",
    # I07 tempo da matrícula = soma dos tópicos
    "07": """
    SELECT ca.id::text
      FROM public.classe_aluno ca
     WHERE abs(coalesce(ca."tempoGastoMin", 0)
               - (SELECT coalesce(sum(greatest(0, ta.tempo_gasto_min)), 0)
                    FROM public.topico_aluno ta
                    JOIN public.topicos t ON t.id = ta.topico_id
                   WHERE t.classe_id = ca.classe_id AND ta.aluno_id = ca.aluno_id)) > 0.01""",
    # I08 FK de eventos_aluno respeitada
    "08": """
    SELECT e.id::text
      FROM public.eventos_aluno e
     WHERE e.classe_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.classe c WHERE c.id = e.classe_id)""",
    # I09 ponto sem turma atribuível
    "09": """
    SELECT e.id::text
      FROM public.eventos_aluno e
     WHERE coalesce(e.valor, 0) > 0 AND e.classe_id IS NULL
       AND e.referencia NOT LIKE 'classe:%'
       AND split_part(e.referencia, ':', 1) NOT IN ('topico', 'conteudo', 'atividade')""",
    # I10 o cliente consegue ler o ranking
    "10": """
    SELECT 'fn_app_config_int'::text
     WHERE NOT has_function_privilege('authenticated', 'public.fn_app_config_int(text,integer)', 'EXECUTE')""",
    # I11 view sem invoker com GRANT de cliente, fora da allowlist
    "11": """
    SELECT c.relname::text
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
       AND NOT coalesce(c.reloptions @> '{security_invoker=on}', false)
       AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))
       AND c.relname NOT IN ('vw_rank_posicoes_por_classe')""",
    # I12 progresso personalizado na faixa
    "12": """
    SELECT p.id::text
      FROM public.personalizacao_item_progresso p
     WHERE p.percentual_concluido NOT BETWEEN 0 AND 100""",
    # I13 conquista pontuada sem registro
    "13": """
    SELECT e.id::text
      FROM public.eventos_aluno e
     WHERE e.tipo = 'conquista_desbloqueada'
       AND NOT EXISTS (SELECT 1 FROM public.conquistas_aluno c
                        WHERE c.aluno_id = e.aluno_id
                          AND c.conquista_id::text = split_part(e.referencia, ':', 2))""",
    # I14 aluno matriculado sem vetor BrainHex completo
    "14": """
    SELECT DISTINCT ca.aluno_id::text
      FROM public.classe_aluno ca
     WHERE (SELECT count(*) FROM public.aluno_perfil ap WHERE ap.aluno_id = ca.aluno_id) <> 7""",
    # I15 lote com mais de 1 h sem análise nem erro
    "15": """
    SELECT l.id::text
      FROM public.telemetria_lotes l
     WHERE l.analysis_ciclo_id IS NULL AND l.analysis_error IS NULL
       AND l.created_at < now() - interval '1 hour'""",
    # I16 tempo de uso da view de engajamento / soma direta das sessões = 1,00 (D1 do juiz)
    "16": """
    SELECT concat_ws(':', e.aluno_id::text, e.classe_id::text)
      FROM public.vw_metricas_engajamento_aluno_classe e
      LEFT JOIN (SELECT s.aluno_id, s.classe_id, sum(s.tempo_sessao_seg)::numeric AS soma
                   FROM public.vw_metricas_sessoes_aluno_dia s
                  GROUP BY s.aluno_id, s.classe_id) d
        ON d.aluno_id = e.aluno_id AND d.classe_id = e.classe_id
     WHERE CASE WHEN coalesce(d.soma, 0) = 0 THEN coalesce(e.tempo_total_uso_seg, 0) <> 0
                ELSE round(coalesce(e.tempo_total_uso_seg, 0)::numeric / d.soma, 2) <> 1 END""",
    # I17 sessão cujo último lote é terminal tem ended_at
    "17": """
    SELECT s.id::text
      FROM public.telemetria_sessoes s
     WHERE s.ended_at IS NULL
       AND (SELECT l.flush_reason
              FROM public.telemetria_lotes l
             WHERE l.sessao_id = s.id
             ORDER BY l.captured_at DESC, l.created_at DESC
             LIMIT 1) IN ('session_end', 'app_background', 'screen_blur')""",
    # I18 lote gravado pela via direta tem fallback_motivo
    "18": """
    SELECT l.id::text
      FROM public.telemetria_lotes l
     WHERE l.via = 'direta' AND l.fallback_motivo IS NULL""",
    # I19 resposta não aponta para questão nem atividade inexistente
    "19": """
    SELECT qa.id::text
      FROM public.questao_aluno qa
      LEFT JOIN public.questoes q ON q.id = qa.questao_id
     WHERE q.id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.atividades a WHERE a.id = q.atividade_id)""",
    # I20 lotes analisados / recebidos >= 0,95 na semana (alerta; sem lote, nada a medir)
    "20": """
    SELECT 'cobertura'::text
      FROM public.telemetria_lotes l
     WHERE l.created_at >= now() - interval '7 days'
    HAVING count(*) > 0
       AND count(l.analysis_ciclo_id)::numeric / count(*) < 0.95""",
}

assert sorted(INVARIANTES) == [f"{n:02d}" for n in range(1, 21)]


def _funcao_invariante(nn: str, corpo: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.fn_inv_i{nn}()
  RETURNS TABLE (id text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY{corpo};
END
$function$;

REVOKE ALL ON FUNCTION public.fn_inv_i{nn}() FROM PUBLIC, anon, authenticated;
"""


FUNCOES_INVARIANTES = "".join(_funcao_invariante(nn, corpo) for nn, corpo in sorted(INVARIANTES.items()))

EXECUTOR = """
CREATE OR REPLACE FUNCTION public.fn_auditoria_metricas_rodar()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  v_n integer;
  v_inv text;
  v_fn text;
  v_linhas bigint;
  v_ids text[];
  v_agora timestamptz := now();
  v_rodadas integer := 0;
  v_falharam text[] := ARRAY[]::text[];
  v_erros text[] := ARRAY[]::text[];
BEGIN
  FOR v_n IN 1..20 LOOP
    v_inv := 'I' || lpad(v_n::text, 2, '0');
    v_fn := 'fn_inv_i' || lpad(v_n::text, 2, '0');
    v_rodadas := v_rodadas + 1;

    -- Subtransação por invariante: a que estourar (função dependente ausente, tipo errado) desfaz
    -- só o que ela fez, fica registrada com erro e a rodada continua.
    BEGIN
      EXECUTE format(
        'WITH v AS MATERIALIZED (SELECT f.id FROM public.%I() AS f) '
        'SELECT (SELECT count(*) FROM v), ARRAY(SELECT v.id FROM v ORDER BY v.id LIMIT 20)',
        v_fn)
        INTO v_linhas, v_ids;

      INSERT INTO public.metricas_invariante_resultado (invariante, rodado_em, ok, linhas)
      VALUES (v_inv, v_agora, v_linhas = 0, v_linhas);

      IF v_linhas > 0 THEN
        INSERT INTO public.metricas_invariante_amostra (invariante, rodado_em, ids)
        VALUES (v_inv, v_agora, v_ids);
        v_falharam := array_append(v_falharam, v_inv);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- `erro` é legível por qualquer authenticated: só o código e a mensagem curta, nunca DETAIL,
      -- HINT, contexto ou valor de linha. Ids vão só para a amostra (service_role).
      INSERT INTO public.metricas_invariante_resultado (invariante, rodado_em, ok, linhas, erro)
      VALUES (v_inv, v_agora, false, NULL, SQLSTATE || ': ' || left(SQLERRM, 200));
      v_erros := array_append(v_erros, v_inv);
    END;
  END LOOP;

  DELETE FROM public.metricas_invariante_resultado
   WHERE rodado_em < now() - interval '30 days';
  DELETE FROM public.metricas_invariante_amostra
   WHERE rodado_em < now() - interval '30 days';

  RETURN jsonb_build_object('rodadas', v_rodadas, 'falharam', to_jsonb(v_falharam), 'erros', to_jsonb(v_erros));
END
$function$;

REVOKE ALL ON FUNCTION public.fn_auditoria_metricas_rodar() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_auditoria_metricas_rodar() IS
  'Roda as invariantes I01 a I20 (fn_inv_i01 a fn_inv_i20), cada uma numa subtransação; grava metricas_invariante_resultado e até 20 ids na amostra; apaga o que tem mais de 30 dias. pg_cron diário 03h30 BRT.';
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.fn_auditoria_metricas_rodar()');
  END IF;
END $$
"""

CRON_FORA = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
  END IF;
END $$
"""

DROP_FUNCOES = "DROP FUNCTION IF EXISTS public.fn_auditoria_metricas_rodar();\n" + "".join(
    f"DROP FUNCTION IF EXISTS public.fn_inv_i{nn}();\n" for nn in sorted(INVARIANTES)
)


def upgrade() -> None:
    op.execute(FUNCOES_INVARIANTES)
    op.execute(EXECUTOR)
    op.execute(CRON_SQL)


def downgrade() -> None:
    op.execute(CRON_FORA)
    op.execute(DROP_FUNCOES)

"""F4a: tempo de estudo é o tempo ativo, com um dono só, e a matrícula acompanha

## Medido em produção (só leitura, 30/10)

Três gravadores de `tempo_gasto_min`, com duas contas diferentes, e valia o último que gravasse:

| Gravador | Onde estava | Conta | Recalculava a matrícula? |
|---|---|---|---|
| `trailup_sync_tempo_da_telemetria` (`trg_tme_sync_tempo_{ins,upd,del}`) | fora do Alembic, ligado | `trailup_tempo_telemetria_min` (soma de `active_sec` / 60) | não |
| `trailup_registrar_sessao_estudo` (`StudyClock`) | `20260921_01` | `tempo_direto_min + trailup_tempo_sessao_min` | sim |
| `trailup_registrar_intervalo_estudo` (builds antigos) | `20260921_01` | `tempo_direto_min + p_tempo_min + trailup_tempo_sessao_min` | sim |

A `20260921_01` diz que desligou o gatilho da telemetria; em produção ele estava ligado (drift não
versionado). Por isso a I07 acusava: a matrícula 98 tinha 12,25 min e a soma dos tópicos dava 1,07 min,
porque o gatilho atualizava o tópico e não recalculava a matrícula.

Tempo de tópico do aluno de QA, somado em produção:

| Fonte | Minutos |
|---|---|
| tempo ativo (`active_sec`, escopo `topic`), a escolha D-1 | 7,68 |
| tempo com o material aberto (`dwell_sec`, escopo `topic`) | 35,63 |
| sessões do cronômetro (`estudo_sessoes`, escopo `topic`) | 68,40 |
| `topico_aluno.tempo_gasto_min` exibido (12 linhas, 4 com tempo) | 45,04, dos quais 17,90 de `tempo_direto_min` |

## A decisão (D-1) e o que ela custa

Tempo de estudo é **tempo ativo**. O tempo de tópico do aluno de QA cai de 45,04 para 7,68 min, cerca de
6 vezes; o cronômetro mediria 68,40. Isto **reverte** a `20260921_01`, que tinha passado o tempo para as
sessões do cronômetro porque `active_sec` descarta leitura sem toque (ociosidade depois de 15 s). A spec
manda uma fonte por fato (D-1 e D-5). Sessões e presença não somem: `estudo_sessoes` continua gravada, e
`trailup_tempo_presenca_min` (soma de `dwell_sec`) fica pronta para a F5 exibir com rótulo próprio.

## O que muda

- `trailup_sync_tempo_da_telemetria` passa a ser versionada e é a dona de `tempo_gasto_min`. Grava a
  mesma conta de produção nas três tabelas, mas **só onde o valor muda** (cada linha de
  `conteudo_aluno`/`atividade_aluno` atualizada dispara o gatilho de progresso por linha
  `trailup_progresso_after_item`, que recalcula tópico e matrícula), e depois recalcula a **matrícula**
  de cada par cujo tempo de tópico mudou (`UPDATE ... RETURNING`). O tópico não é recalculado
  explicitamente: percentual e status não dependem de tempo, e o que o tempo do tópico muda é só a soma da
  matrícula. Assim um lote não recalcula tópico e turma três vezes, no caminho mais quente do app.
- `trailup_progresso_after_item` (o gatilho por linha de `conteudo_aluno` e `atividade_aluno`, da
  `20260826_02`) ganha `search_path = public, pg_temp`. Ele usa nomes sem schema (`conteudos`,
  `atividades`, `topicos`) e herdava o `search_path` de quem escreve; disparado de dentro de uma função
  com `search_path = ''` (este gatilho e as RPCs), falhava com `relation "conteudos" does not exist`, e
  todo lote com métrica de conteúdo ou atividade abortaria. Só o atributo muda, não o corpo; o downgrade
  não o desfaz (a função fica correta em qualquer contexto).
- Só toca chaves cujo **aluno e tópico ainda existem**. Na cascata de uma exclusão (turma, tópico ou aluno),
  o gatilho de DELETE atualizaria `conteudo_aluno` e o gatilho por linha faria upsert em `topico_aluno`
  referenciando o que está sendo apagado, e a exclusão falharia por FK.
- Os três gatilhos são recriados como estão em produção (por instrução, tabela de transição `afetadas`:
  `NEW TABLE` em INSERT e UPDATE, `OLD TABLE` em DELETE), e entra um quarto, `trg_tme_sync_tempo_upd_old`
  (`OLD TABLE` em UPDATE, mesma função): um UPDATE que troca a chave de uma métrica recalcula também a
  chave antiga.
- As duas RPCs do cronômetro mantêm assinatura, validações e GRANTs, e continuam gravando `estudo_sessoes`
  e `estudo_intervalos` (presença e sessões). Quando gravam `tempo_gasto_min`, usam a conta ativa. A de
  intervalo continua somando `tempo_direto_min`, como livro-caixa, mas a coluna não entra mais na conta.
  A de sessão, depois do recálculo do tópico (que cria a linha com tempo 0 quando ela não existe),
  alinha o tempo do tópico à conta ativa (é o único lugar em que ela grava o tópico): assim a linha
  nasce certa mesmo quando o lote chegou antes.
- `search_path = ''` com nomes qualificados nas quatro funções.
- I06 (`fn_inv_i06`) passa a medir `tempo_gasto_min` contra a conta ativa.
- Retroativo: recalcula `tempo_gasto_min` de todas as linhas das três tabelas (a conta uma vez por linha)
  e todas as matrículas.

## Downgrade

Restaura as RPCs com o corpo da `20260921_01` (recortado do módulo), a função do gatilho ao corpo de
produção (o mesmo `UPDATE`, sem recálculo, `search_path` `public, pg_temp`), a I06 da F0 (recortada da
`20261029_03`), derruba `trailup_tempo_presenca_min` e o `trg_tme_sync_tempo_upd_old`. Os outros três
gatilhos ficam, como estavam em produção.
**Não desfaz o retroativo**: os números antigos não voltam (a próxima sessão do cronômetro volta a
gravar a conta das sessões).

Revision ID: 20261030_01
Revises: 20261029_09
Create Date: 2026-10-30
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261030_01"
down_revision = "20261029_09"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# A função como está em produção (`pg_get_functiondef`, lida só para leitura em 30/10). É o estado de
# partida do e2e e o alvo do downgrade.
SYNC_PRODUCAO = """
CREATE OR REPLACE FUNCTION public.trailup_sync_tempo_da_telemetria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.conteudo_aluno ca
     SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
           ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL)
   WHERE (ca.aluno_id, ca.conteudo_id) IN (
           SELECT DISTINCT t.aluno_id, t.conteudo_id
             FROM afetadas t
            WHERE t.conteudo_id IS NOT NULL AND t.aluno_id IS NOT NULL);

  UPDATE public.atividade_aluno aa
     SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
           aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id)
   WHERE (aa.aluno_id, aa.atividade_id) IN (
           SELECT DISTINCT t.aluno_id, t.atividade_id
             FROM afetadas t
            WHERE t.atividade_id IS NOT NULL AND t.aluno_id IS NOT NULL);

  UPDATE public.topico_aluno ta
     SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
           ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)
   WHERE (ta.aluno_id, ta.topico_id) IN (
           SELECT DISTINCT t.aluno_id, t.topico_id
             FROM afetadas t
            WHERE t.topico_id IS NOT NULL AND t.aluno_id IS NOT NULL);

  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.trailup_sync_tempo_da_telemetria() FROM PUBLIC, anon, authenticated;
"""

SYNC = """
CREATE OR REPLACE FUNCTION public.trailup_sync_tempo_da_telemetria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE r record;
BEGIN
  -- Só chaves cujo aluno e tópico ainda existem: na cascata de uma exclusão (turma, tópico, aluno) o
  -- UPDATE de conteudo_aluno/atividade_aluno dispara o gatilho de progresso por linha, que faz upsert em
  -- topico_aluno e falharia ao referenciar o que está sendo apagado.
  -- Só grava onde o valor muda: cada linha atualizada dispara aquele gatilho de novo.
  UPDATE public.conteudo_aluno ca
     SET tempo_gasto_min = x.tempo
    FROM (SELECT k.aluno_id, k.conteudo_id,
                 public.trailup_tempo_telemetria_min(k.aluno_id, 'content', NULL, k.conteudo_id, NULL) AS tempo
            FROM (SELECT DISTINCT t.aluno_id, t.conteudo_id
                    FROM afetadas t
                   WHERE t.conteudo_id IS NOT NULL AND t.aluno_id IS NOT NULL
                     AND EXISTS (SELECT 1 FROM public.alunos al WHERE al.id = t.aluno_id)
                     AND (t.topico_id IS NULL
                          OR EXISTS (SELECT 1 FROM public.topicos tp WHERE tp.id = t.topico_id))) k) x
   WHERE ca.aluno_id = x.aluno_id AND ca.conteudo_id = x.conteudo_id
     AND ca.tempo_gasto_min IS DISTINCT FROM x.tempo;

  UPDATE public.atividade_aluno aa
     SET tempo_gasto_min = x.tempo
    FROM (SELECT k.aluno_id, k.atividade_id,
                 public.trailup_tempo_telemetria_min(k.aluno_id, 'activity', NULL, NULL, k.atividade_id) AS tempo
            FROM (SELECT DISTINCT t.aluno_id, t.atividade_id
                    FROM afetadas t
                   WHERE t.atividade_id IS NOT NULL AND t.aluno_id IS NOT NULL
                     AND EXISTS (SELECT 1 FROM public.alunos al WHERE al.id = t.aluno_id)
                     AND (t.topico_id IS NULL
                          OR EXISTS (SELECT 1 FROM public.topicos tp WHERE tp.id = t.topico_id))) k) x
   WHERE aa.aluno_id = x.aluno_id AND aa.atividade_id = x.atividade_id
     AND aa.tempo_gasto_min IS DISTINCT FROM x.tempo;

  -- O tópico não tem gatilho de progresso, e percentual e status não dependem de tempo: o que muda com o
  -- tempo do tópico é só o tempo da matrícula, então só ela é recalculada, e só onde o tópico mudou.
  FOR r IN
    WITH mudou AS (
      UPDATE public.topico_aluno ta
         SET tempo_gasto_min = x.tempo
        FROM (SELECT k.aluno_id, k.topico_id,
                     public.trailup_tempo_telemetria_min(k.aluno_id, 'topic', k.topico_id, NULL, NULL) AS tempo
                FROM (SELECT DISTINCT t.aluno_id, t.topico_id
                        FROM afetadas t
                       WHERE t.topico_id IS NOT NULL AND t.aluno_id IS NOT NULL
                         AND EXISTS (SELECT 1 FROM public.alunos al WHERE al.id = t.aluno_id)
                         AND EXISTS (SELECT 1 FROM public.topicos tp WHERE tp.id = t.topico_id)) k) x
       WHERE ta.aluno_id = x.aluno_id AND ta.topico_id = x.topico_id
         AND ta.tempo_gasto_min IS DISTINCT FROM x.tempo
      RETURNING ta.aluno_id, ta.topico_id
    )
    SELECT DISTINCT m.aluno_id, tp.classe_id
      FROM mudou m
      JOIN public.topicos tp ON tp.id = m.topico_id
     WHERE tp.classe_id IS NOT NULL
  LOOP
    PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
  END LOOP;

  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.trailup_sync_tempo_da_telemetria() FROM PUBLIC, anon, authenticated;
"""

# Os três como estão em produção (`pg_get_triggerdef`), com o nome da função qualificado, mais o
# `_upd_old`.
GATILHOS = (
    "DROP TRIGGER IF EXISTS trg_tme_sync_tempo_ins ON public.telemetria_time_metric_entries",
    "DROP TRIGGER IF EXISTS trg_tme_sync_tempo_upd ON public.telemetria_time_metric_entries",
    "DROP TRIGGER IF EXISTS trg_tme_sync_tempo_del ON public.telemetria_time_metric_entries",
    "CREATE TRIGGER trg_tme_sync_tempo_ins AFTER INSERT ON public.telemetria_time_metric_entries"
    " REFERENCING NEW TABLE AS afetadas FOR EACH STATEMENT"
    " EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria()",
    "CREATE TRIGGER trg_tme_sync_tempo_upd AFTER UPDATE ON public.telemetria_time_metric_entries"
    " REFERENCING NEW TABLE AS afetadas FOR EACH STATEMENT"
    " EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria()",
    # Fora de produção: um UPDATE que troca a chave (aluno, tópico, conteúdo, atividade) também precisa
    # recalcular a chave antiga. Mesma função, a tabela de transição antiga com o mesmo nome.
    "DROP TRIGGER IF EXISTS trg_tme_sync_tempo_upd_old ON public.telemetria_time_metric_entries",
    "CREATE TRIGGER trg_tme_sync_tempo_upd_old AFTER UPDATE ON public.telemetria_time_metric_entries"
    " REFERENCING OLD TABLE AS afetadas FOR EACH STATEMENT"
    " EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria()",
    "CREATE TRIGGER trg_tme_sync_tempo_del AFTER DELETE ON public.telemetria_time_metric_entries"
    " REFERENCING OLD TABLE AS afetadas FOR EACH STATEMENT"
    " EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria()",
)

# Corpo da `20260921_01`; só as expressões de tempo e o `search_path` mudam (mais o alinhamento do tópico).
RPC_SESSAO = """
CREATE OR REPLACE FUNCTION public.trailup_registrar_sessao_estudo(
  p_sessao uuid, p_aluno uuid, p_scope text,
  p_topico bigint, p_conteudo bigint, p_atividade bigint,
  p_aberto_em timestamptz, p_fechado_em timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $fn$
DECLARE v_classe bigint; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_aluno IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'aluno_invalido' USING ERRCODE = '42501';
  END IF;
  IF p_scope NOT IN ('topic', 'content', 'activity') THEN
    RAISE EXCEPTION 'escopo_invalido';
  END IF;
  IF p_sessao IS NULL OR p_aberto_em IS NULL OR p_fechado_em IS NULL
     OR p_fechado_em < p_aberto_em
     OR p_fechado_em - p_aberto_em > interval '1440 minutes' THEN
    RAISE EXCEPTION 'sessao_invalida';
  END IF;
  IF p_scope = 'content' AND p_conteudo IS NULL THEN
    RAISE EXCEPTION 'conteudo_obrigatorio';
  END IF;
  IF p_scope = 'activity' AND p_atividade IS NULL THEN
    RAISE EXCEPTION 'atividade_obrigatoria';
  END IF;

  SELECT t.classe_id INTO v_classe FROM public.topicos t
    JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id AND ca.aluno_id = p_aluno
   WHERE t.id = p_topico;
  IF v_classe IS NULL THEN
    RAISE EXCEPTION 'matricula_invalida' USING ERRCODE = '42501';
  END IF;

  IF p_conteudo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conteudos WHERE id = p_conteudo AND topico_id = p_topico
  ) THEN RAISE EXCEPTION 'conteudo_invalido'; END IF;
  IF p_atividade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.atividades WHERE id = p_atividade AND topico_id = p_topico
  ) THEN RAISE EXCEPTION 'atividade_invalida'; END IF;

  INSERT INTO public.estudo_sessoes(
    id, aluno_id, classe_id, scope, topico_id, conteudo_id, atividade_id,
    aberto_em, fechado_em
  ) VALUES (
    p_sessao, p_aluno, v_classe, p_scope, p_topico, p_conteudo, p_atividade,
    p_aberto_em, p_fechado_em
  ) ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN; END IF;

  -- O tópico é alinhado depois do recálculo, que pode criar a linha; aqui só conteúdo e atividade.
  IF p_scope = 'content' THEN
    UPDATE public.conteudo_aluno
       SET tempo_gasto_min = public.trailup_tempo_telemetria_min(p_aluno, 'content', NULL, p_conteudo, NULL),
           updated_at = now()
     WHERE aluno_id = p_aluno AND conteudo_id = p_conteudo;
  ELSIF p_scope = 'activity' THEN
    UPDATE public.atividade_aluno
       SET tempo_gasto_min = public.trailup_tempo_telemetria_min(p_aluno, 'activity', NULL, NULL, p_atividade),
           updated_at = now()
     WHERE aluno_id = p_aluno AND atividade_id = p_atividade;
  END IF;

  PERFORM public.trailup_recalcular_topico_aluno(p_aluno, p_topico);
  -- O recálculo cria a linha do tópico com tempo 0 quando ela não existe; o lote pode ter chegado antes.
  UPDATE public.topico_aluno ta
     SET tempo_gasto_min = x.tempo, updated_at = now()
    FROM (SELECT public.trailup_tempo_telemetria_min(p_aluno, 'topic', p_topico, NULL, NULL) AS tempo) x
   WHERE ta.aluno_id = p_aluno AND ta.topico_id = p_topico
     AND ta.tempo_gasto_min IS DISTINCT FROM x.tempo;
  PERFORM public.trailup_recalcular_classe_aluno(p_aluno, v_classe);
END;
$fn$;
REVOKE ALL ON FUNCTION public.trailup_registrar_sessao_estudo(
  uuid,uuid,text,bigint,bigint,bigint,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_registrar_sessao_estudo(
  uuid,uuid,text,bigint,bigint,bigint,timestamptz,timestamptz) TO authenticated;
"""

RPC_INTERVALO = """
CREATE OR REPLACE FUNCTION public.trailup_registrar_intervalo_estudo(
  p_intervalo uuid, p_aluno uuid, p_topico bigint, p_conteudo bigint,
  p_atividade bigint, p_tempo_min numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $fn$
DECLARE v_classe bigint; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_aluno IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'aluno_invalido' USING ERRCODE = '42501';
  END IF;
  SELECT t.classe_id INTO v_classe FROM public.topicos t
    JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id AND ca.aluno_id = p_aluno
   WHERE t.id = p_topico;
  IF v_classe IS NULL THEN RAISE EXCEPTION 'matricula_invalida' USING ERRCODE = '42501'; END IF;
  IF p_intervalo IS NULL OR p_tempo_min IS NULL OR p_tempo_min <= 0 OR p_tempo_min > 1440 THEN
    RAISE EXCEPTION 'intervalo_invalido';
  END IF;
  IF p_conteudo IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.conteudos WHERE id = p_conteudo AND topico_id = p_topico
  ) THEN RAISE EXCEPTION 'conteudo_invalido'; END IF;
  IF p_atividade IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.atividades WHERE id = p_atividade AND topico_id = p_topico
  ) THEN RAISE EXCEPTION 'atividade_invalida'; END IF;

  INSERT INTO public.estudo_intervalos(id, aluno_id, classe_id, topico_id, tempo_min)
    VALUES (p_intervalo, p_aluno, v_classe, p_topico, p_tempo_min)
    ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN; END IF;

  -- `tempo_direto_min` segue como livro-caixa; `tempo_gasto_min` é a conta ativa.
  INSERT INTO public.topico_aluno(aluno_id, topico_id, tempo_direto_min, tempo_gasto_min)
    VALUES (p_aluno, p_topico, p_tempo_min,
            public.trailup_tempo_telemetria_min(p_aluno, 'topic', p_topico, NULL, NULL))
    ON CONFLICT (aluno_id, topico_id) DO UPDATE SET
      tempo_direto_min = topico_aluno.tempo_direto_min + p_tempo_min,
      tempo_gasto_min = public.trailup_tempo_telemetria_min(p_aluno, 'topic', p_topico, NULL, NULL),
      ultima_visualizacao = now();
  IF p_conteudo IS NOT NULL THEN
    INSERT INTO public.conteudo_aluno(aluno_id, conteudo_id, tempo_direto_min, tempo_gasto_min)
      VALUES (p_aluno, p_conteudo, p_tempo_min,
              public.trailup_tempo_telemetria_min(p_aluno, 'content', NULL, p_conteudo, NULL))
      ON CONFLICT (aluno_id, conteudo_id) DO UPDATE SET
        tempo_direto_min = conteudo_aluno.tempo_direto_min + p_tempo_min,
        tempo_gasto_min = public.trailup_tempo_telemetria_min(p_aluno, 'content', NULL, p_conteudo, NULL),
        ultima_visualizacao = now();
  END IF;
  IF p_atividade IS NOT NULL THEN
    INSERT INTO public.atividade_aluno(aluno_id, atividade_id, tempo_direto_min, tempo_gasto_min)
      VALUES (p_aluno, p_atividade, p_tempo_min,
              public.trailup_tempo_telemetria_min(p_aluno, 'activity', NULL, NULL, p_atividade))
      ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET
        tempo_direto_min = atividade_aluno.tempo_direto_min + p_tempo_min,
        tempo_gasto_min = public.trailup_tempo_telemetria_min(p_aluno, 'activity', NULL, NULL, p_atividade),
        ultima_visualizacao = now();
  END IF;
  PERFORM public.trailup_recalcular_topico_aluno(p_aluno, p_topico);
  PERFORM public.trailup_recalcular_classe_aluno(p_aluno, v_classe);
END; $fn$;
REVOKE ALL ON FUNCTION public.trailup_registrar_intervalo_estudo(
  uuid,uuid,bigint,bigint,bigint,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_registrar_intervalo_estudo(
  uuid,uuid,bigint,bigint,bigint,numeric) TO authenticated;
"""

# Tempo com o material aberto: a métrica de presença que a F5 exibe. Nada lê dela nesta fase.
PRESENCA = """
CREATE OR REPLACE FUNCTION public.trailup_tempo_presenca_min(
  p_aluno uuid, p_scope text,
  p_topico bigint, p_conteudo bigint, p_atividade bigint
)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = '' AS $fn$
  SELECT COALESCE(round(sum(e.dwell_sec)::numeric / 60.0, 2), 0)
    FROM public.telemetria_time_metric_entries e
   WHERE e.aluno_id = p_aluno
     AND e.scope = p_scope
     AND (p_topico IS NULL OR e.topico_id = p_topico)
     AND (p_conteudo IS NULL OR e.conteudo_id = p_conteudo)
     AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
$fn$;
REVOKE ALL ON FUNCTION public.trailup_tempo_presenca_min(uuid,text,bigint,bigint,bigint) FROM PUBLIC, anon;
"""

DROP_PRESENCA = "DROP FUNCTION IF EXISTS public.trailup_tempo_presenca_min(uuid,text,bigint,bigint,bigint);"

# Só o atributo: o corpo é o da `20260826_02`, e chamá-la de uma função com `search_path = ''` falhava.
PROGRESSO_SEARCH_PATH = "ALTER FUNCTION public.trailup_progresso_after_item() SET search_path = public, pg_temp;"

DROP_UPD_OLD = "DROP TRIGGER IF EXISTS trg_tme_sync_tempo_upd_old ON public.telemetria_time_metric_entries;"

CORPO_I06 = """
    SELECT ta.id::text
      FROM public.topico_aluno ta
     WHERE abs(coalesce(ta.tempo_gasto_min, 0)
               - public.trailup_tempo_telemetria_min(ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)) > 0.01"""

RETROATIVO = (
    """
UPDATE public.topico_aluno ta
   SET tempo_gasto_min = x.tempo, updated_at = now()
  FROM (SELECT y.aluno_id, y.topico_id,
               public.trailup_tempo_telemetria_min(y.aluno_id, 'topic', y.topico_id, NULL, NULL) AS tempo
          FROM public.topico_aluno y) x
 WHERE ta.aluno_id = x.aluno_id AND ta.topico_id = x.topico_id
   AND ta.tempo_gasto_min IS DISTINCT FROM x.tempo;
""",
    """
UPDATE public.conteudo_aluno ca
   SET tempo_gasto_min = x.tempo, updated_at = now()
  FROM (SELECT y.aluno_id, y.conteudo_id,
               public.trailup_tempo_telemetria_min(y.aluno_id, 'content', NULL, y.conteudo_id, NULL) AS tempo
          FROM public.conteudo_aluno y) x
 WHERE ca.aluno_id = x.aluno_id AND ca.conteudo_id = x.conteudo_id
   AND ca.tempo_gasto_min IS DISTINCT FROM x.tempo;
""",
    """
UPDATE public.atividade_aluno aa
   SET tempo_gasto_min = x.tempo, updated_at = now()
  FROM (SELECT y.aluno_id, y.atividade_id,
               public.trailup_tempo_telemetria_min(y.aluno_id, 'activity', NULL, NULL, y.atividade_id) AS tempo
          FROM public.atividade_aluno y) x
 WHERE aa.aluno_id = x.aluno_id AND aa.atividade_id = x.atividade_id
   AND aa.tempo_gasto_min IS DISTINCT FROM x.tempo;
""",
    """
DO $retro$
DECLARE r record;
BEGIN
  FOR r IN SELECT ca.aluno_id, ca.classe_id FROM public.classe_aluno ca LOOP
    PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
  END LOOP;
END;
$retro$;
""",
)

RELOAD = "NOTIFY pgrst, 'reload schema';"


def _i06(corpo: str) -> str:
    return _load("20261029_03_invariantes_das_metricas.py")._funcao_invariante("06", corpo)


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql) -> None:
        self.sql.append(str(sql))


def rpcs_anteriores() -> list[str]:
    """As duas RPCs da `20260921_01`, recortadas do `upgrade()` dela (a de sessão vira OR REPLACE)."""
    mod = _load("20260921_01_sessoes_estudo_abertura_fechamento.py")
    coletor = _Coletor()
    mod.op = coletor
    mod.upgrade()
    sessao = "CREATE FUNCTION public.trailup_registrar_sessao_estudo("
    intervalo = "CREATE OR REPLACE FUNCTION public.trailup_registrar_intervalo_estudo("
    escolhidos = [s for s in coletor.sql if sessao in s or intervalo in s]
    assert len(escolhidos) == 2, "a 20260921_01 mudou de forma: recorte das RPCs falhou"
    return [s.replace(sessao, "CREATE OR REPLACE FUNCTION public.trailup_registrar_sessao_estudo(") for s in escolhidos]


def upgrade() -> None:
    op.execute(PROGRESSO_SEARCH_PATH)
    op.execute(PRESENCA)
    op.execute(SYNC)
    for sql in GATILHOS:
        op.execute(sql)
    op.execute(RPC_SESSAO)
    op.execute(RPC_INTERVALO)
    op.execute(_i06(CORPO_I06))
    for sql in RETROATIVO:
        op.execute(sql)
    op.execute(RELOAD)


def downgrade() -> None:
    for sql in rpcs_anteriores():
        op.execute(sql)
    op.execute(SYNC_PRODUCAO)
    op.execute(_i06(_load("20261029_03_invariantes_das_metricas.py").INVARIANTES["06"]))
    op.execute(DROP_PRESENCA)
    op.execute(DROP_UPD_OLD)
    op.execute(RELOAD)

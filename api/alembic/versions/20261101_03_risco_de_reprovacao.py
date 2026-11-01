"""Sinal de risco de reprovação por aluno, só para o professor da turma (#135)

## O que é

`professor_risco_reprovacao_turma(p_classe_id)` devolve, para cada aluno matriculado, se ele está
sinalizado e **quais fatores dispararam**, cada um com o fato que o sustenta. Calculado no banco, sem
API: é leitura e regra, não modelo de linguagem (regra de fronteira do CLAUDE.md).

Não é o "risco de abandono" da F5 (`risco_abandono_faixa`, modelo de evasão do core): aquele estima
quem vai **sumir**; este junta os sinais de quem pode **reprovar** ficando. Os dois convivem.

## Fatores

| fator | dispara quando | fonte |
|---|---|---|
| `queda_de_atividade` | eventos de uso do app nos últimos 7 dias ≤ (1 − queda) × média semanal das 3 semanas anteriores, com média ≥ mínima | `eventos_aluno` sem os creditados (`fn_evento_creditado`) |
| `acertos_baixos` | % de acerto na última tentativa de cada questão, nos últimos 30 dias, abaixo do mínimo, com respostas ≥ mínimo | `questao_aluno` (D-5: fonte única das respostas) |
| `faltas` | presença nas aulas das últimas 4 semanas abaixo do mínimo, com aulas ≥ mínimo | `eventos_aluno` `presenca_aula`; aula = data distinta com presença dada na turma (`classe:<id>:<data>`) |
| `prazos_perdidos` | atividades com prazo vencido nos últimos 30 dias e não feitas ≥ limiar | `fn_prazo_efetivo` + conclusão, como a `20261031_08` |
| `estado_negativo_recorrente` | 3 dos últimos 5 registros com o mesmo estado negativo | `aluno_mental_state_history`, a mesma regra de `memoria_aluno` |

Sinalizado = fatores disparados ≥ `risco_reprovacao_min_fatores`.

## Limiares

Em `app_config`, com `publico = false` (não é parâmetro de UI, e saber o corte ajuda a contorná-lo).
`ON CONFLICT DO NOTHING`: valor já ajustado pelo time não é sobrescrito. **A calibragem depende dos
dados do piloto**: os padrões abaixo são ponto de partida, não medição. A recorrência (3 de 5) não é
configurável aqui de propósito: é a mesma do grafo de IA, e as duas não podem divergir.

## Quem lê

`SECURITY DEFINER` com conferência de posse: só o professor da turma (`app_classes_do_professor()`).
Aluno, colega, outro professor ou anônimo recebem `42501`. Sem GRANT para `anon`. Não escreve nada:
`topico_aluno` e `percentual_concluido` ficam intocados.

Revision ID: 20261101_03
Revises: 20261101_02
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_03"
down_revision = "20261101_02"
branch_labels = None
depends_on = None

LIMIARES = (
    ("risco_reprovacao_min_fatores", "2", "Fatores disparados para sinalizar o aluno no risco de reprovação."),
    ("risco_reprovacao_queda_pct", "50", "Queda (%) de eventos na semana, contra a média das 3 anteriores."),
    ("risco_reprovacao_queda_base_min", "3", "Média semanal mínima nas 3 semanas anteriores para medir queda."),
    ("risco_reprovacao_acertos_min_pct", "50", "Acerto (%) abaixo do qual dispara, nos últimos 30 dias."),
    ("risco_reprovacao_acertos_min_respostas", "5", "Respostas mínimas nos últimos 30 dias para medir acerto."),
    ("risco_reprovacao_presenca_min_pct", "50", "Presença (%) abaixo da qual dispara, nas últimas 4 semanas."),
    ("risco_reprovacao_presenca_min_aulas", "2", "Aulas mínimas nas últimas 4 semanas para medir presença."),
    ("risco_reprovacao_prazos_perdidos", "2", "Prazos perdidos nos últimos 30 dias para disparar."),
)

CONFIG = "INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES\n" + ",\n".join(
    f"  ('{chave}', '{valor}', '{descricao} Calibrar com os dados do piloto (#135).', false)"
    for chave, valor, descricao in LIMIARES
) + "\nON CONFLICT (chave) DO NOTHING;\n"

FUNCAO = r"""
CREATE OR REPLACE FUNCTION public.professor_risco_reprovacao_turma(p_classe_id bigint)
RETURNS TABLE (aluno_id uuid, sinalizado boolean, fatores_disparados integer, fatores jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
#variable_conflict use_column
DECLARE
  v_min_fatores    integer;
  v_queda_pct      numeric;
  v_queda_base     numeric;
  v_acerto_min     numeric;
  v_acerto_resp    integer;
  v_presenca_min   numeric;
  v_presenca_aulas integer;
  v_prazos         integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_min_fatores'), 2),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_queda_pct'), 50),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_queda_base_min'), 3),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_acertos_min_pct'), 50),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_acertos_min_respostas'), 5),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_presenca_min_pct'), 50),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_presenca_min_aulas'), 2),
    COALESCE(max(c.valor::numeric) FILTER (WHERE c.chave = 'risco_reprovacao_prazos_perdidos'), 2)
  INTO v_min_fatores, v_queda_pct, v_queda_base, v_acerto_min, v_acerto_resp, v_presenca_min,
       v_presenca_aulas, v_prazos
  FROM public.app_config c
  WHERE c.chave LIKE 'risco_reprovacao_%';

  RETURN QUERY
  WITH matriculas AS (
    SELECT ca.aluno_id FROM public.classe_aluno ca WHERE ca.classe_id = p_classe_id
  ), uso AS (
    -- `criado_em` é timestamp sem fuso gravado em UTC; `localtimestamp` é o mesmo relógio.
    SELECT m.aluno_id,
           count(ea.id) FILTER (WHERE ea.criado_em >= localtimestamp - interval '7 days') AS semana,
           count(ea.id) FILTER (WHERE ea.criado_em >= localtimestamp - interval '28 days'
                                  AND ea.criado_em < localtimestamp - interval '7 days') / 3.0 AS media_anterior
      FROM matriculas m
      LEFT JOIN public.eventos_aluno ea
        ON ea.aluno_id = m.aluno_id AND ea.classe_id = p_classe_id AND NOT public.fn_evento_creditado(ea.tipo)
     GROUP BY m.aluno_id
  ), respostas AS (
    SELECT DISTINCT ON (qa.aluno_id, qa.questao_id) qa.aluno_id, qa.correta
      FROM public.questao_aluno qa
      JOIN public.atividades a ON a.id = qa.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND qa.correta IS NOT NULL
       AND qa.criado_em >= now() - interval '30 days'
       AND qa.aluno_id IN (SELECT m.aluno_id FROM matriculas m)
     ORDER BY qa.aluno_id, qa.questao_id, qa.tentativa DESC, qa.criado_em DESC
  ), acertos AS (
    SELECT r.aluno_id, count(*) AS respondidas, 100.0 * avg(CASE WHEN r.correta THEN 1 ELSE 0 END) AS pct
      FROM respostas r
     GROUP BY r.aluno_id
  ), presencas AS (
    SELECT ea.aluno_id, split_part(ea.referencia, ':', 3) AS dia
      FROM public.eventos_aluno ea
     WHERE ea.tipo = 'presenca_aula'
       AND split_part(ea.referencia, ':', 1) = 'classe'
       AND split_part(ea.referencia, ':', 2) = p_classe_id::text
       AND ea.criado_em >= localtimestamp - interval '28 days'
  ), aulas AS (
    SELECT count(DISTINCT p.dia) AS total FROM presencas p
  ), presenca AS (
    SELECT m.aluno_id, count(DISTINCT p.dia) AS presentes
      FROM matriculas m
      LEFT JOIN presencas p ON p.aluno_id = m.aluno_id
     GROUP BY m.aluno_id
  ), prazos AS (
    -- Mesma conta de entrega da `20261031_08` (prazo efetivo e conclusão), nos últimos 30 dias.
    SELECT m.aluno_id, count(*) AS perdidos
      FROM matriculas m
      JOIN public.topicos t ON t.classe_id = p_classe_id
      JOIN public.atividades a ON a.topico_id = t.id
      CROSS JOIN LATERAL (SELECT public.fn_prazo_efetivo(m.aluno_id, a.id) AS prazo) pz
     WHERE pz.prazo IS NOT NULL
       AND pz.prazo < now()
       AND pz.prazo >= now() - interval '30 days'
       AND NOT EXISTS (SELECT 1 FROM public.atividade_aluno aa
                        WHERE aa.aluno_id = m.aluno_id AND aa.atividade_id = a.id AND aa.status::text = 'concluido')
       AND NOT EXISTS (SELECT 1 FROM public.eventos_aluno ea
                        WHERE ea.aluno_id = m.aluno_id AND ea.tipo = 'atividade_concluida'
                          AND ea.referencia = 'atividade:' || a.id::text)
     GROUP BY m.aluno_id
  ), estados AS (
    SELECT h.aluno_id, h.kind,
           row_number() OVER (PARTITION BY h.aluno_id ORDER BY h.created_at DESC, h.id DESC) AS pos
      FROM public.aluno_mental_state_history h
     WHERE h.aluno_id IN (SELECT m.aluno_id FROM matriculas m)
  ), recorrencia AS (
    -- 3 dos últimos 5 com o mesmo estado negativo: a mesma regra de `memoria_aluno`.
    SELECT DISTINCT ON (e.aluno_id) e.aluno_id, e.kind, count(*) AS vezes
      FROM estados e
     WHERE e.pos <= 5 AND e.kind IN ('frustrated', 'anxious', 'overwhelmed', 'tired')
     GROUP BY e.aluno_id, e.kind
    HAVING count(*) >= 3
     ORDER BY e.aluno_id, count(*) DESC, e.kind
  ), fatores AS (
    SELECT m.aluno_id,
           array_remove(ARRAY[
             CASE WHEN u.media_anterior >= v_queda_base
                   AND u.semana <= u.media_anterior * (1 - v_queda_pct / 100.0)
               THEN jsonb_build_object(
                 'fator', 'queda_de_atividade',
                 'texto', format('%s eventos nos últimos 7 dias, contra média de %s por semana nas 3 anteriores',
                                 u.semana, round(u.media_anterior, 1)),
                 'valor', u.semana, 'referencia', round(u.media_anterior, 1))
             END,
             CASE WHEN ac.respondidas >= v_acerto_resp AND ac.pct < v_acerto_min
               THEN jsonb_build_object(
                 'fator', 'acertos_baixos',
                 'texto', format('%s%% de acerto em %s questões nos últimos 30 dias', round(ac.pct), ac.respondidas),
                 'valor', round(ac.pct, 1), 'referencia', v_acerto_min)
             END,
             CASE WHEN au.total >= v_presenca_aulas AND 100.0 * pr.presentes / au.total < v_presenca_min
               THEN jsonb_build_object(
                 'fator', 'faltas',
                 'texto', format('Presente em %s de %s aulas nas últimas 4 semanas', pr.presentes, au.total),
                 'valor', pr.presentes, 'referencia', au.total)
             END,
             CASE WHEN COALESCE(pz.perdidos, 0) >= v_prazos
               THEN jsonb_build_object(
                 'fator', 'prazos_perdidos',
                 'texto', format('%s atividades com prazo vencido nos últimos 30 dias sem entrega', pz.perdidos),
                 'valor', pz.perdidos, 'referencia', v_prazos)
             END,
             CASE WHEN rc.aluno_id IS NOT NULL
               THEN jsonb_build_object(
                 'fator', 'estado_negativo_recorrente',
                 'texto', format('Mesmo estado difícil em %s dos últimos 5 ciclos de estudo', rc.vezes),
                 'valor', rc.vezes, 'referencia', 5, 'estado', rc.kind)
             END
           ], NULL) AS lista
      FROM matriculas m
      CROSS JOIN aulas au
      LEFT JOIN uso u ON u.aluno_id = m.aluno_id
      LEFT JOIN acertos ac ON ac.aluno_id = m.aluno_id
      LEFT JOIN presenca pr ON pr.aluno_id = m.aluno_id
      LEFT JOIN prazos pz ON pz.aluno_id = m.aluno_id
      LEFT JOIN recorrencia rc ON rc.aluno_id = m.aluno_id
  )
  SELECT f.aluno_id,
         COALESCE(cardinality(f.lista), 0) >= v_min_fatores,
         COALESCE(cardinality(f.lista), 0),
         COALESCE(to_jsonb(f.lista), '[]'::jsonb)
    FROM fatores f
   ORDER BY COALESCE(cardinality(f.lista), 0) DESC, f.aluno_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.professor_risco_reprovacao_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_risco_reprovacao_turma(bigint) TO authenticated, service_role;
"""


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(FUNCAO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.professor_risco_reprovacao_turma(bigint)")
    op.execute("DELETE FROM public.app_config WHERE chave LIKE 'risco_reprovacao_%'")
    op.execute("NOTIFY pgrst, 'reload schema'")

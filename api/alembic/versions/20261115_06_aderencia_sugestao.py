"""Aderência à ordem aconselhada: o aluno começou pelo formato sugerido, e o que veio depois

O motor de sugestão (`app/services/sugestao_material.py`) grava em `personalizacao_sugestao` a ordem
aconselhada de formatos por aluno × tópico × conteúdo, e o log guarda cada decisão. Ninguém media se
o aluno seguiu (`docs/analises/2026-11-15-metricas-de-uso-mercado-e-literatura.md`, P5; spec da
sugestão, §6.4).

## O que entra

`metricas_aderencia_sugestao(classe_ids[], inicio, fim)`, **só para dev** (`app_e_dev()`), e a chave
`dev.aderencia_sugestao` no catálogo. Leitura pura: nenhuma tabela nova.

## Definições

- **População:** matriculados nas turmas pedidas **com consentimento de pesquisa vigente**
  (`vw_alunos_pesquisa_elegiveis`), como os outros agregados analíticos (`20261104_04`).
- **Sugestão vigente:** linha de `personalizacao_sugestao` de um tópico das turmas, com `ordem` não
  vazia e `atualizado_em` antes do fim da janela. O recomendado é o `formato` do primeiro item de
  `ordem`.
- **Decisão:** o primeiro material personalizado aberto (escopo `material`, `item_key` com
  `:personalization:`, `dwell_sec > 0`) **depois** de `atualizado_em` e dentro da janela, no mesmo
  tópico e, quando a sugestão é de um conteúdo, no mesmo conteúdo. `seguiu` = o formato desse
  material é o recomendado. Sugestão sem material aberto depois fica em `sem_decisao`.
- **Formato do material:** `material_tipo` é o tipo do bloco no app, não o formato do motor. O mapa
  é o de `bagFormatForBlockType` (`mobile/src/services/bag/bagModel.ts`) mais `cards`:
  `markdown`/`texto` → markdown, `apresentacao`/`apresentacao-slides`/`embed` → apresentacao,
  `pdf`/`documento` → pdf, `audio` e `cards` iguais. Qualquer outro tipo vira `outro` e conta como
  não seguiu.
- **Desfecho:** acerto na 1ª tentativa (`questao_aluno.tentativa = 1`) nas atividades do tópico,
  respondidas depois da decisão e dentro da janela, com intervalo de Wilson a 95%. A unidade é
  aluno × tópico: com mais de uma sugestão no tópico, vale a decisão que veio primeiro, para a
  mesma resposta não entrar nos dois grupos.

## Anonimização

Só agregado, nenhum `aluno_id` sai. Grupo com menos alunos que `n_minimo` (da chave, padrão 5) volta
com os números nulos e `amostra_insuficiente = true`.

## Limites (também no JSON)

Observacional: quem segue a sugestão pode ser quem já ia melhor. O número diz se vale testar, não
que a sugestão funciona. E uma apresentação exportada em PDF chega com `material_tipo = 'pdf'`: o
aluno que abriu a apresentação sugerida nesse caso conta como não seguiu.

Sem `%` no SQL (o SQL offline do Alembic o dobra).

## Downgrade

Derruba a função e remove a chave.

Revision ID: 20261115_06
Revises: 20261115_05
Create Date: 2026-11-15
"""

from alembic import op

revision = "20261115_06"
down_revision = "20261115_05"
branch_labels = None
depends_on = None


CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('dev.aderencia_sugestao', 'Aderência à ordem aconselhada',
   'Se o aluno abriu primeiro o formato que o motor de sugestão pôs em primeiro, e o acerto na primeira tentativa no tópico depois disso, para quem seguiu e para quem não seguiu.',
   '{dev}', 'percentual com intervalo de confiança de 95 por cento', 'janela de datas pedida (padrão: 90 dias)',
   'personalizacao_sugestao, telemetria_time_metric_entries (escopo material), questao_aluno',
   'menos alunos com decisão, ou com resposta, que o mínimo', 'nenhuma', '{}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;
"""


RPC = r"""
CREATE OR REPLACE FUNCTION public.metricas_aderencia_sugestao(
  p_classe_ids bigint[],
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_tz constant text := 'America/Sao_Paulo';
  v_inicio date;
  v_fim date;
  v_n_min integer;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_e_dev() THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;
  IF p_classe_ids IS NULL OR cardinality(p_classe_ids) = 0
     OR EXISTS (SELECT 1 FROM unnest(p_classe_ids) AS u(id) WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'turmas_invalidas' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_classe_ids) > 20 THEN
    RAISE EXCEPTION 'turmas_demais' USING ERRCODE = '22023';
  END IF;

  v_fim := COALESCE(p_fim, (now() AT TIME ZONE v_tz)::date);
  v_inicio := COALESCE(p_inicio, v_fim - 89);
  IF v_inicio > v_fim OR v_fim - v_inicio > 365 THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(n_minimo), 5) INTO v_n_min
    FROM public.metricas_catalogo
   WHERE chave = 'dev.aderencia_sugestao';

  WITH
  lim AS (
    SELECT v_inicio::timestamp AT TIME ZONE v_tz AS ini,
           (v_fim + 1)::timestamp AT TIME ZONE v_tz AS fim
  ),
  turmas AS (
    SELECT DISTINCT u.id FROM unnest(p_classe_ids) AS u(id)
  ),
  matriculas AS (
    SELECT DISTINCT ca.classe_id, ca.aluno_id
      FROM public.classe_aluno ca
      JOIN turmas t ON t.id = ca.classe_id
     WHERE ca.aluno_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.vw_alunos_pesquisa_elegiveis el WHERE el.aluno_id = ca.aluno_id)
  ),
  sugestoes AS (
    SELECT s.id, s.aluno_id, s.topico_id, s.conteudo_id, s.atualizado_em,
           lower(NULLIF(btrim(s.ordem -> 0 ->> 'formato'), '')) AS recomendado
      FROM public.personalizacao_sugestao s
      JOIN public.topicos tp ON tp.id = s.topico_id
      JOIN matriculas m ON m.classe_id = tp.classe_id AND m.aluno_id = s.aluno_id
      CROSS JOIN lim
     WHERE jsonb_typeof(s.ordem) = 'array'
       AND s.atualizado_em < lim.fim
  ),
  -- O primeiro material personalizado aberto depois da sugestão, no tópico (e no conteúdo, se houver).
  decisoes AS (
    SELECT s.id, s.aluno_id, s.topico_id, s.recomendado, pm.formato, pm.captured_at AS decidido_em
      FROM sugestoes s
      CROSS JOIN lim
      JOIN LATERAL (
        SELECT CASE
                 WHEN e.material_tipo IN ('markdown', 'texto') THEN 'markdown'
                 WHEN e.material_tipo IN ('apresentacao', 'apresentacao-slides', 'embed') THEN 'apresentacao'
                 WHEN e.material_tipo IN ('pdf', 'documento') THEN 'pdf'
                 WHEN e.material_tipo IN ('audio', 'cards') THEN e.material_tipo
                 ELSE 'outro'
               END AS formato,
               e.captured_at
          FROM public.telemetria_time_metric_entries e
         WHERE e.aluno_id = s.aluno_id
           AND e.topico_id = s.topico_id
           AND e.scope = 'material'
           AND e.item_key ~ '[:]personalization[:]'  -- sem porcento nem dois-pontos colado: ver os testes
           AND e.material_tipo IS NOT NULL
           AND e.dwell_sec > 0
           AND e.captured_at >= GREATEST(s.atualizado_em, lim.ini)
           AND e.captured_at < lim.fim
           AND (s.conteudo_id IS NULL
                OR COALESCE(e.conteudo_id, substring(e.item_key FROM '^content[:]([0-9]+)')::bigint) = s.conteudo_id)
         ORDER BY e.captured_at, e.id
         LIMIT 1
      ) pm ON true
     WHERE s.recomendado IS NOT NULL
  ),
  aderencia AS (
    SELECT count(*) AS decididas,
           count(*) FILTER (WHERE formato = recomendado) AS seguiram,
           count(DISTINCT aluno_id) AS alunos
      FROM decisoes
  ),
  por_formato AS (
    SELECT recomendado AS formato,
           count(*) AS decididas,
           count(*) FILTER (WHERE formato = recomendado) AS seguiram,
           count(DISTINCT aluno_id) AS alunos
      FROM decisoes
     GROUP BY recomendado
  ),
  -- Aluno × tópico: vale a primeira decisão do tópico.
  par AS (
    SELECT DISTINCT ON (aluno_id, topico_id) aluno_id, topico_id, (formato = recomendado) AS seguiu, decidido_em
      FROM decisoes
     ORDER BY aluno_id, topico_id, decidido_em, id
  ),
  respostas AS (
    SELECT p.aluno_id, p.topico_id, p.seguiu, count(*) AS n, count(*) FILTER (WHERE qa.correta) AS acertos
      FROM par p
      JOIN public.atividades a ON a.topico_id = p.topico_id
      JOIN public.questao_aluno qa ON qa.atividade_id = a.id AND qa.aluno_id = p.aluno_id
      CROSS JOIN lim
     WHERE qa.tentativa = 1
       AND qa.correta IS NOT NULL
       AND qa.criado_em >= p.decidido_em
       AND qa.criado_em < lim.fim
     GROUP BY p.aluno_id, p.topico_id, p.seguiu
  ),
  grupos AS (
    SELECT g.seguiu,
           count(DISTINCT r.aluno_id) AS alunos,
           count(r.topico_id) AS pares,
           COALESCE(sum(r.n), 0) AS n,
           COALESCE(sum(r.acertos), 0) AS acertos
      FROM (VALUES (true), (false)) AS g(seguiu)
      LEFT JOIN respostas r ON r.seguiu = g.seguiu
     GROUP BY g.seguiu
  ),
  -- Intervalo de Wilson, z = 1,96, para cada contagem que sai.
  proporcoes AS (
    SELECT 'geral' AS rotulo, NULL::text AS formato, ad.alunos, ad.decididas AS n, ad.seguiram AS k FROM aderencia ad
    UNION ALL
    SELECT 'formato', pf.formato, pf.alunos, pf.decididas, pf.seguiram FROM por_formato pf
    UNION ALL
    SELECT CASE WHEN gr.seguiu THEN 'seguiu' ELSE 'nao_seguiu' END, NULL, gr.alunos, gr.n, gr.acertos FROM grupos gr
  ),
  ic AS (
    SELECT p.*,
           p.alunos < v_n_min OR p.n = 0 AS suprimido,
           CASE WHEN p.n > 0 THEN round(100.0 * p.k / p.n, 2) END AS pct,
           CASE WHEN p.n > 0 THEN jsonb_build_array(
             round(100 * GREATEST(w.centro - w.meia, 0), 2),
             round(100 * LEAST(w.centro + w.meia, 1), 2)) END AS ic95
      FROM proporcoes p
      LEFT JOIN LATERAL (
        SELECT (p.k::numeric / p.n + 1.9208 / p.n) / (1 + 3.8416 / p.n) AS centro,
               1.96 * sqrt((p.k::numeric / p.n) * (1 - p.k::numeric / p.n) / p.n
                           + 0.9604 / (p.n::numeric * p.n)) / (1 + 3.8416 / p.n) AS meia
         WHERE p.n > 0
      ) w ON true
  )
  SELECT jsonb_build_object(
    'janela', jsonb_build_object('inicio', v_inicio, 'fim', v_fim, 'timezone', v_tz),
    'n_minimo', v_n_min,
    'populacao', jsonb_build_object(
      'alunos', (SELECT count(DISTINCT aluno_id) FROM matriculas),
      'sugestoes_vigentes', (SELECT count(*) FROM sugestoes WHERE recomendado IS NOT NULL),
      'sem_decisao', (SELECT count(*) FROM sugestoes WHERE recomendado IS NOT NULL)
                     - (SELECT count(*) FROM decisoes)
    ),
    'aderencia', (
      SELECT jsonb_build_object(
               'alunos', i.alunos,
               'amostra_insuficiente', i.suprimido,
               'decididas', CASE WHEN NOT i.suprimido THEN i.n END,
               'seguiram', CASE WHEN NOT i.suprimido THEN i.k END,
               'seguiu_pct', CASE WHEN NOT i.suprimido THEN i.pct END,
               'ic95_pct', CASE WHEN NOT i.suprimido THEN i.ic95 END)
        FROM ic i WHERE i.rotulo = 'geral'
    ),
    'por_formato_recomendado', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'formato', i.formato,
                 'alunos', i.alunos,
                 'amostra_insuficiente', i.suprimido,
                 'decididas', CASE WHEN NOT i.suprimido THEN i.n END,
                 'seguiram', CASE WHEN NOT i.suprimido THEN i.k END,
                 'seguiu_pct', CASE WHEN NOT i.suprimido THEN i.pct END,
                 'ic95_pct', CASE WHEN NOT i.suprimido THEN i.ic95 END)
               ORDER BY i.formato)
        FROM ic i WHERE i.rotulo = 'formato'
    ), '[]'::jsonb),
    'desfecho', (
      SELECT jsonb_object_agg(
               i.rotulo,
               jsonb_build_object(
                 'alunos', i.alunos,
                 'amostra_insuficiente', i.suprimido,
                 'topicos', CASE WHEN NOT i.suprimido THEN gr.pares END,
                 'respostas', CASE WHEN NOT i.suprimido THEN i.n END,
                 'acerto_primeira_tentativa_pct', CASE WHEN NOT i.suprimido THEN i.pct END,
                 'ic95_pct', CASE WHEN NOT i.suprimido THEN i.ic95 END))
        FROM ic i
        JOIN grupos gr ON (CASE WHEN gr.seguiu THEN 'seguiu' ELSE 'nao_seguiu' END) = i.rotulo
    ),
    'diferenca_pp', (
      SELECT CASE WHEN NOT s.suprimido AND NOT ns.suprimido THEN s.pct - ns.pct END
        FROM ic s, ic ns WHERE s.rotulo = 'seguiu' AND ns.rotulo = 'nao_seguiu'
    ),
    'definicoes', jsonb_build_object(
      'populacao', 'matriculados nas turmas com consentimento de pesquisa vigente (vw_alunos_pesquisa_elegiveis)',
      'recomendado', 'formato do primeiro item de ordem na sugestao vigente (atualizado_em antes do fim da janela)',
      'decisao', 'primeiro material personalizado aberto depois de atualizado_em, no topico e no conteudo da sugestao',
      'formato_do_material', 'material_tipo traduzido: markdown/texto, apresentacao/apresentacao-slides/embed, pdf/documento, audio, cards; o resto e outro',
      'desfecho', 'acerto na 1a tentativa nas atividades do topico, depois da decisao; por aluno x topico, vale a primeira decisao; ic95 de Wilson'
    ),
    'limitacoes', jsonb_build_array(
      'observacional: quem segue a sugestao pode ser quem ja ia melhor; o numero diz se vale testar, nao que a sugestao funciona',
      'apresentacao exportada em PDF chega como pdf: quem abriu a apresentacao sugerida nesse caso conta como nao seguiu',
      'so a sugestao vigente entra: revisada, a decisao passa a contar a partir da revisao',
      'lotes com o mesmo captured_at desempatam pela ordem de gravacao',
      'as respostas de um aluno nao sao independentes; o IC trata cada resposta como independente e sai estreito demais',
      'grupo com menos alunos que n_minimo volta nulo'
    )
  )
  INTO v_resultado;

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.metricas_aderencia_sugestao(bigint[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_aderencia_sugestao(bigint[], date, date) TO authenticated;
"""


DOWNGRADE = """
DROP FUNCTION IF EXISTS public.metricas_aderencia_sugestao(bigint[], date, date);
DELETE FROM public.metricas_catalogo WHERE chave = 'dev.aderencia_sugestao';
"""


def upgrade() -> None:
    op.execute(CATALOGO)
    op.execute(RPC)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")

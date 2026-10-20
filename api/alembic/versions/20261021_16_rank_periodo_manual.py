"""Fase 5 do plano: o professor abre um período novo do ranking, e o antigo vira histórico

Decisão da Geisbelly (2026-10-20): a rotação é **manual**. O professor clica em "Novo período".
Até aqui `ranks.periodo` era só um rótulo: a view somava desde sempre. Esta revisão:

1. Dá janela ao ranking: `inicio` (obrigatório, default `now()`) e `fim` (NULL = período atual).
   Backfill: `inicio` = criação da turma (senão a do ranking), para que as posições de hoje não
   mudem. Se houver dois rankings abertos do mesmo tipo na mesma turma, o mais novo fica aberto e os
   outros são encerrados com o pódio congelado. Na produção (2026-10-20) há um ranking só (id 14).
2. Um índice único parcial: no máximo um ranking ABERTO por tipo + turma.
3. A view `vw_rank_posicoes_por_classe_todas` passa a filtrar pela data do evento dentro de
   `[inicio, fim)` nos critérios de SOMA (pontuacao, ranqueada, missoes). Os critérios de ESTADO
   (percentual, tempo, acertos) leem `classe_aluno` como antes: são o progresso atual, e não há
   série histórica para recortar.
   `eventos_aluno.criado_em` é `timestamp` SEM fuso, gravado por `now()` numa sessão em UTC (a
   produção roda com TimeZone = UTC). Por isso a janela é comparada como `inicio AT TIME ZONE 'UTC'`.
4. `rank_podio_congelado`: a classificação final do período encerrado, gravada uma vez. Leitura com
   a mesma regra de `vw_rank_posicoes_por_classe` (membro da turma; aluno vê até o limite visível e
   a própria linha; professor vê tudo). Escrita só pela função.
5. `fn_rank_novo_periodo(rank_id, periodo)`: SECURITY DEFINER, só o professor da turma. Trava a
   linha (`FOR UPDATE`), congela o pódio, fecha (`fim = now()`) e cria o ranking seguinte com o
   mesmo tipo e turma, o período novo e `inicio = now()`. Um segundo clique com o mesmo nome espera
   a trava, encontra o período já aberto e devolve esse mesmo resultado (`ja_feito = true`).
6. Um gatilho em `ranks`: o cliente não escreve `inicio` nem `fim`, e um ranking encerrado não muda
   mais nem pode ser excluído (decisão da Geisbelly, 2026-10-20). Só a função liga
   `app.rank_periodo`, que também serve de porta de manutenção (`SET LOCAL`). A exclusão em cascata
   (a turma ou o tipo apagados) passa: o histórico vai junto com a turma. Excluir o período ABERTO
   continua permitido, porque não leva o histórico: o pódio congelado aponta para as linhas
   fechadas, não para a aberta, e não há FK entre os períodos.
7. `vw_ranks_info_por_classe` (que o mobile lê) passa a listar só o período aberto e ganha
   `periodo`/`inicio` no fim (o `CREATE OR REPLACE` aceita colunas no final).

Depende de `20261021_15` (PR #567), só pela ordem da cadeia. O conteúdo não se cruza.

Revision ID: 20261021_16
Revises: 20261021_15
Create Date: 2026-10-20
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_16"
down_revision = "20261021_15"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


COLUNAS = r"""
ALTER TABLE public.ranks ADD COLUMN IF NOT EXISTS inicio timestamptz;
ALTER TABLE public.ranks ADD COLUMN IF NOT EXISTS fim timestamptz;

-- Backfill que não mexe nas posições de hoje: o período corrente começa com a turma.
UPDATE public.ranks r
   SET inicio = COALESCE(
         (SELECT c.created_at FROM public.classe c WHERE c.id = r.classe_id),
         r.created_at,
         now()
       )
 WHERE r.inicio IS NULL;

ALTER TABLE public.ranks ALTER COLUMN inicio SET DEFAULT now();
ALTER TABLE public.ranks ALTER COLUMN inicio SET NOT NULL;

ALTER TABLE public.ranks DROP CONSTRAINT IF EXISTS ranks_janela;
ALTER TABLE public.ranks ADD CONSTRAINT ranks_janela CHECK (fim IS NULL OR fim >= inicio);
"""


PODIO = r"""
CREATE TABLE IF NOT EXISTS public.rank_podio_congelado (
  rank_id bigint NOT NULL REFERENCES public.ranks(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  aluno_id uuid NOT NULL,
  posicao integer NOT NULL,
  nome_aluno text,
  pontuacao numeric NOT NULL DEFAULT 0,
  percentual_do_lider numeric,
  medalha text,
  congelado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rank_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS rank_podio_congelado_classe_idx
  ON public.rank_podio_congelado (classe_id, rank_id, posicao);

ALTER TABLE public.rank_podio_congelado ENABLE ROW LEVEL SECURITY;

-- A mesma regra de `vw_rank_posicoes_por_classe`: o corte do aluno vale também no histórico.
DROP POLICY IF EXISTS rank_podio_congelado_sel ON public.rank_podio_congelado;
CREATE POLICY rank_podio_congelado_sel ON public.rank_podio_congelado FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_minhas_classes())
    AND (
      posicao <= public.app_rank_limite_visivel()
      OR aluno_id = auth.uid()
      OR classe_id IN (SELECT public.app_classes_do_professor())
    )
  );

REVOKE ALL ON public.rank_podio_congelado FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rank_podio_congelado TO authenticated;
"""


# Encerra os rankings abertos repetidos (mesmo tipo + turma) antes do índice único: o mais novo
# fica, os outros viram histórico com o pódio congelado. Roda DEPOIS da view nova (o pódio vem dela).
DUPLICADOS = r"""
WITH repetidos AS (
  SELECT r.id,
         row_number() OVER (PARTITION BY r.tipo_id, r.classe_id ORDER BY r.created_at DESC NULLS LAST, r.id DESC) AS ordem
    FROM public.ranks r
   WHERE r.fim IS NULL AND r.classe_id IS NOT NULL
), congelados AS (
  INSERT INTO public.rank_podio_congelado
    (rank_id, classe_id, aluno_id, posicao, nome_aluno, pontuacao, percentual_do_lider, medalha)
  SELECT v.rank_id, v.classe_id, v.id_aluno, v.posicao, v.nome_aluno, v.pontuacao, v.percentual_do_lider, v.medalha
    FROM public.vw_rank_posicoes_por_classe_todas v
    JOIN repetidos rp ON rp.id = v.rank_id AND rp.ordem > 1
  ON CONFLICT DO NOTHING
  RETURNING rank_id
)
UPDATE public.ranks r
   SET fim = GREATEST(now(), r.inicio)
  FROM repetidos rp
 WHERE rp.id = r.id AND rp.ordem > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ranks_um_periodo_aberto
  ON public.ranks (tipo_id, classe_id) WHERE fim IS NULL;
"""


VIEW = r"""
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
            e.classe_id AS classe_id_gravada,
            e.tipo,
            e.criado_em,
            COALESCE(e.valor, 0::numeric) AS valor,
            TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) AS referencia_bruta,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM e.referencia), ''::text) IS NULL THEN NULL::bigint
                    WHEN TRIM(BOTH FROM e.referencia) ~ '^\d+$'::text THEN TRIM(BOTH FROM e.referencia)::bigint
                    WHEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2) ~ '^\d+$'::text THEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2)::bigint
                    ELSE NULL::bigint
                END AS referencia_id
           FROM eventos_aluno e
        ), eventos_resolvidos AS (
         -- O mesmo recorte de turma de antes, só que linha a linha: a soma agora é por ranking,
         -- porque cada ranking tem a sua janela.
         SELECT e.aluno_id,
            COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) AS classe_id,
            e.criado_em,
            e.valor
           FROM referencias_normalizadas e
             LEFT JOIN topicos t ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'topico'::text) AND t.id = e.referencia_id
             LEFT JOIN conteudos c ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conteudo'::text) AND c.id = e.referencia_id
             LEFT JOIN topicos t_c ON t_c.id = c.topico_id
             LEFT JOIN atividades atv ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade'::text) AND atv.id = e.referencia_id
             LEFT JOIN topicos t_a ON t_a.id = atv.topico_id
             LEFT JOIN classe cl ON starts_with(lower(e.referencia_bruta), 'classe:'::text) AND cl.id = e.referencia_id
          WHERE COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) IS NOT NULL
        ), ranks_janela AS (
         -- `criado_em` é timestamp sem fuso gravado em UTC; `inicio`/`fim` são timestamptz.
         SELECT r.id AS rank_id,
            r.classe_id,
            r.inicio,
            r.fim,
            r.inicio AT TIME ZONE 'UTC'::text AS inicio_utc,
            r.fim AT TIME ZONE 'UTC'::text AS fim_utc
           FROM ranks r
        ), eventos_por_rank AS (
         SELECT rj.rank_id,
            e.aluno_id,
            sum(e.valor) AS pontuacao
           FROM ranks_janela rj
             JOIN eventos_resolvidos e ON e.classe_id = rj.classe_id
          WHERE e.criado_em >= rj.inicio_utc AND (rj.fim_utc IS NULL OR e.criado_em < rj.fim_utc)
          GROUP BY rj.rank_id, e.aluno_id
        ), ranqueada_por_rank AS (
         -- `d.id::text` e nao `...::uuid`: o recorte por regexp pode nao formar um uuid valido.
         SELECT rj.rank_id,
            e.aluno_id,
            sum(COALESCE(e.valor, 0::numeric)) AS pontuacao
           FROM ranks_janela rj
             JOIN eventos_aluno e ON e.classe_id = rj.classe_id
             JOIN guilda_desafios d ON d.id::text = NULLIF(substring(TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) from 'desafio:([0-9a-fA-F-]{36})$'), ''::text)
          WHERE d.consequencia = 'ranqueada'::text
            AND e.criado_em >= rj.inicio_utc AND (rj.fim_utc IS NULL OR e.criado_em < rj.fim_utc)
          GROUP BY rj.rank_id, e.aluno_id
        ), missoes_por_rank AS (
         -- Rank de constância: missões cumpridas no período. `concluida_em` é timestamptz.
         SELECT rj.rank_id,
            ma.aluno_id,
            count(*)::numeric AS pontuacao
           FROM ranks_janela rj
             JOIN missoes m ON m.classe_id = rj.classe_id
             JOIN missao_aluno ma ON ma.missao_id = m.id
          WHERE ma.status = 'concluida'::text
            AND COALESCE(ma.concluida_em, ma.updated_at) >= rj.inicio
            AND (rj.fim IS NULL OR COALESCE(ma.concluida_em, ma.updated_at) < rj.fim)
          GROUP BY rj.rank_id, ma.aluno_id
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epr.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    WHEN 'acertos'::text THEN COALESCE(ca."acertosPercentual", 0::numeric)
                    WHEN 'ranqueada'::text THEN COALESCE(rqr.pontuacao, 0::numeric)
                    WHEN 'missoes'::text THEN COALESCE(mpr.pontuacao, 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_rank epr ON epr.rank_id = r.id AND epr.aluno_id = ca.aluno_id
             LEFT JOIN ranqueada_por_rank rqr ON rqr.rank_id = r.id AND rqr.aluno_id = ca.aluno_id
             LEFT JOIN missoes_por_rank mpr ON mpr.rank_id = r.id AND mpr.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric) * 100::numeric, 2) AS percentual_do_lider,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


INFO = r"""
CREATE OR REPLACE VIEW public.vw_ranks_info_por_classe AS
 SELECT r.id AS rank_id,
    r.classe_id,
    rt.nome AS nome_rank,
    rt.descricao,
    rt.criterio,
    rt.icone,
    r.periodo,
    r.inicio
   FROM ranks r
     JOIN rank_tipo rt ON rt.id = r.tipo_id
  WHERE r.fim IS NULL;
"""

INFO_ANTERIOR = r"""
-- Colunas não saem por CREATE OR REPLACE: volta por DROP + CREATE, com a opção e os GRANTs de hoje.
DROP VIEW IF EXISTS public.vw_ranks_info_por_classe;
CREATE VIEW public.vw_ranks_info_por_classe WITH (security_invoker = on) AS
 SELECT r.id AS rank_id,
    r.classe_id,
    rt.nome AS nome_rank,
    rt.descricao,
    rt.criterio,
    rt.icone
   FROM ranks r
     JOIN rank_tipo rt ON rt.id = r.tipo_id;

REVOKE ALL ON public.vw_ranks_info_por_classe FROM PUBLIC, anon;
GRANT ALL ON public.vw_ranks_info_por_classe TO authenticated, service_role;
"""


GUARDA = r"""
CREATE OR REPLACE FUNCTION public.fn_ranks_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Período encerrado é histórico. `pg_trigger_depth() > 1` = exclusão em cascata (a turma ou o
    -- tipo foram apagados): essa passa, senão ninguém conseguiria excluir uma turma com histórico.
    IF OLD.fim IS NOT NULL
       AND pg_trigger_depth() <= 1
       AND COALESCE(current_setting('app.rank_periodo', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Período encerrado é histórico e não pode ser excluído.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF COALESCE(current_setting('app.rank_periodo', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ranking criado pelo console nasce aberto, agora.
    NEW.inicio := now();
    NEW.fim := NULL;
    RETURN NEW;
  END IF;

  IF OLD.fim IS NOT NULL THEN
    RAISE EXCEPTION 'Este período já foi encerrado: o ranking virou histórico.' USING ERRCODE = '42501';
  END IF;
  IF NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fim IS DISTINCT FROM OLD.fim THEN
    RAISE EXCEPTION 'O período só muda pelo botão Novo período.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_ranks_guarda ON public.ranks;
CREATE TRIGGER trg_ranks_guarda
  BEFORE INSERT OR UPDATE OR DELETE ON public.ranks
  FOR EACH ROW EXECUTE FUNCTION public.fn_ranks_guarda();
"""


NOVO_PERIODO = r"""
CREATE OR REPLACE FUNCTION public.fn_rank_novo_periodo(p_rank_id bigint, p_periodo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rank public.ranks%ROWTYPE;
  v_novo public.ranks%ROWTYPE;
  v_periodo text := btrim(COALESCE(p_periodo, ''));
  v_congelados integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Ranking não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  -- A trava serializa o duplo clique: o segundo espera aqui e relê a linha já encerrada.
  SELECT * INTO v_rank FROM public.ranks WHERE id = p_rank_id FOR UPDATE;
  IF NOT FOUND OR v_rank.classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_rank.classe_id
  ) THEN
    RAISE EXCEPTION 'Ranking não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_periodo) < 1 OR char_length(v_periodo) > 40 THEN
    RAISE EXCEPTION 'O nome do período vai de 1 a 40 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF v_rank.fim IS NOT NULL THEN
    SELECT * INTO v_novo
      FROM public.ranks r
     WHERE r.tipo_id = v_rank.tipo_id
       AND r.classe_id = v_rank.classe_id
       AND r.fim IS NULL
       AND r.inicio >= v_rank.fim
       AND lower(btrim(COALESCE(r.periodo, ''))) = lower(v_periodo);
    IF FOUND THEN
      RETURN jsonb_build_object(
        'rank_id', v_novo.id, 'encerrado_id', v_rank.id, 'periodo', v_novo.periodo,
        'inicio', v_novo.inicio, 'congelados', 0, 'ja_feito', true
      );
    END IF;
    RAISE EXCEPTION 'Este período já foi encerrado: o ranking virou histórico.' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ranks r
     WHERE r.tipo_id = v_rank.tipo_id
       AND r.classe_id = v_rank.classe_id
       AND lower(btrim(COALESCE(r.periodo, ''))) = lower(v_periodo)
  ) THEN
    RAISE EXCEPTION 'Esta turma já teve um período "%" neste ranking.', v_periodo USING ERRCODE = '23505';
  END IF;

  -- O pódio é lido ANTES de fechar: é a classificação final do período, como estava.
  INSERT INTO public.rank_podio_congelado
    (rank_id, classe_id, aluno_id, posicao, nome_aluno, pontuacao, percentual_do_lider, medalha)
  SELECT v.rank_id, v.classe_id, v.id_aluno, v.posicao, v.nome_aluno, v.pontuacao, v.percentual_do_lider, v.medalha
    FROM public.vw_rank_posicoes_por_classe_todas v
   WHERE v.rank_id = v_rank.id
  ON CONFLICT (rank_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_congelados = ROW_COUNT;

  PERFORM set_config('app.rank_periodo', 'on', true);
  UPDATE public.ranks SET fim = now() WHERE id = v_rank.id;
  INSERT INTO public.ranks (tipo_id, classe_id, periodo, inicio, fim)
  VALUES (v_rank.tipo_id, v_rank.classe_id, v_periodo, now(), NULL)
  RETURNING * INTO v_novo;
  PERFORM set_config('app.rank_periodo', '', true);

  RETURN jsonb_build_object(
    'rank_id', v_novo.id, 'encerrado_id', v_rank.id, 'periodo', v_novo.periodo,
    'inicio', v_novo.inicio, 'congelados', v_congelados, 'ja_feito', false
  );
END
$function$;

REVOKE ALL ON FUNCTION public.fn_rank_novo_periodo(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rank_novo_periodo(bigint, text) TO authenticated;
"""


DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.fn_rank_novo_periodo(bigint, text);
DROP TRIGGER IF EXISTS trg_ranks_guarda ON public.ranks;
DROP FUNCTION IF EXISTS public.fn_ranks_guarda();
DROP TABLE IF EXISTS public.rank_podio_congelado;
DROP INDEX IF EXISTS public.ranks_um_periodo_aberto;
"""

COLUNAS_FORA = r"""
ALTER TABLE public.ranks DROP CONSTRAINT IF EXISTS ranks_janela;
ALTER TABLE public.ranks DROP COLUMN IF EXISTS fim;
ALTER TABLE public.ranks DROP COLUMN IF EXISTS inicio;
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(PODIO)
    op.execute(VIEW)
    op.execute(DUPLICADOS)
    op.execute(INFO)
    op.execute(GUARDA)
    op.execute(NOVO_PERIODO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
    # As views leem as colunas; voltam antes de elas saírem. Os períodos encerrados continuam como
    # linhas soltas em `ranks` (somando desde sempre), como era antes desta revisão.
    op.execute(INFO_ANTERIOR)
    op.execute(_load("20261021_08_telas_eixos_e_missoes.py")._view_com_missoes())
    op.execute(COLUNAS_FORA)
    op.execute("NOTIFY pgrst, 'reload schema'")

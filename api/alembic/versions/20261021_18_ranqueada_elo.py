"""Ranqueada com Elo: um rating por aluno e turma, ao lado dos pontos

Decisão da Geisbelly (2026-10-20): **Elo**, não escada acumulada. O spec de eventos/missões/ranks
já dizia como, se chegasse a hora: "o caminho é uma tabela de rating ao lado, não trocar a métrica
de `ranks`". Então os pontos da ranqueada (`desafio_vencido`, `desafio_derrota`, o piso) continuam
como estão, e o Elo é uma medida a mais, com o seu próprio tipo de ranking.

## Onde liga

`fn_desafio_encerrar` é o fechamento **compartilhado**: `arena_encerrar` delega para ela, o
`guilda_desafio_responder` a chama quando a última resposta entra, e a varredura de abandonados
também. Ligar o Elo nela vale para os dois caminhos de resposta, sem decidir entre eles (decisão 1
do plano, que continua aberta). A função é a da `20261021_11`, recortada daquele arquivo como a
própria `_11` faz com a `_09`; o teste confere que esse corpo é o de produção (md5 de `prosrc`).
O bloco da `_09` traz junto `arena_encerrar`, sem mudança (md5 de produção também conferido).

O Elo só se move quando há partida de verdade:

- `consequencia = 'ranqueada'` (treino e evento não mexem);
- **não cooperativo**: existe equipe 2. Desafio sem adversário não tem contra quem medir;
- resultado `vitoria` ou `empate` (`sem_adversario` não é partida).

Medido na produção (2026-10-20): `guilda_desafios` tem 0 linhas, e os formatos que o app cria
hoje (`guilda_desafio_criar`: solo, dupla, guilda, turma) são todos cooperativos. Quem tem equipe
2 é a arena (`arena_desafio_criar`, duelo e guilda contra guilda), que está sem chamador (decisão 2
do plano). Ou seja: **o Elo fica pronto, mas só se move quando houver um caminho competitivo**.

## A conta

Padrão do Elo, com equipes:

- rating da equipe = **média** do rating dos seus jogadores (quem foi aceito e respondeu, o mesmo
  conjunto que recebe os eventos do desafio);
- esperado da equipe 1: `E1 = 1 / (1 + 10^((R2 - R1) / 400))`, e `E2 = 1 - E1`;
- resultado: vitória 1, empate 0,5, derrota 0;
- cada jogador: `delta = round(K * (S - E))`, com o K **dele**: 40 nas 10 primeiras partidas
  (provisório), 32 depois;
- rating inicial 1000.

Os quatro números são chaves privadas em `app_config` (`elo_inicial`, `elo_k`, `elo_k_provisorio`,
`elo_partidas_provisorias`), com esses padrões. A escolha é minha e está no PR para confirmar.

## As tabelas

- `ranqueada_elo (classe_id, aluno_id)`: o rating atual e a contagem de partidas, por turma. Por
  turma porque o spec proíbe ladder global (isolamento por turma da RLS).
- `ranqueada_elo_partida (desafio_id, aluno_id)`: antes, depois, delta, K e resultado de cada
  jogador em cada desafio. A chave primária é a idempotência: o mesmo desafio não move o rating
  duas vezes, mesmo que `fn_desafio_encerrar` já não voltasse cedo para desafio encerrado.

As duas com RLS ligada e **nenhuma policy**, como o resto do domínio `guilda_*`: quem lê é a view
do rank. A escrita é só `fn_elo_aplicar`, que não tem EXECUTE para cliente nenhum.

## O ranking

`rank_tipo` ganha `Elo` (`criterio = 'elo'`), e o `CASE` de `vw_rank_posicoes_por_classe_todas`
ganha o ramo: o rating do aluno na turma, ou o inicial para quem ainda não jogou. É critério de
ESTADO, como `percentual`: o rating é o de agora, e um período novo guarda o pódio, mas não
reinicia o Elo. Console e mobile tratam o critério novo no mesmo PR (regra do spec).

Depende de `20261021_17` (PR #569), só pela ordem da cadeia: #567 → #568 → #569 → este.

Revision ID: 20261021_18
Revises: 20261021_17
Create Date: 2026-10-20
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_18"
down_revision = "20261021_17"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261021_18")
    return texto.replace(antigo, novo, 1)


TABELAS = r"""
CREATE TABLE IF NOT EXISTS public.ranqueada_elo (
  classe_id     bigint      NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  aluno_id      uuid        NOT NULL,
  rating        integer     NOT NULL,
  partidas      integer     NOT NULL DEFAULT 0 CHECK (partidas >= 0),
  vitorias      integer     NOT NULL DEFAULT 0 CHECK (vitorias >= 0),
  empates       integer     NOT NULL DEFAULT 0 CHECK (empates >= 0),
  derrotas      integer     NOT NULL DEFAULT 0 CHECK (derrotas >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classe_id, aluno_id)
);

CREATE TABLE IF NOT EXISTS public.ranqueada_elo_partida (
  desafio_id    uuid        NOT NULL REFERENCES public.guilda_desafios(id) ON DELETE CASCADE,
  aluno_id      uuid        NOT NULL,
  classe_id     bigint      NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  equipe        smallint    NOT NULL CHECK (equipe IN (1, 2)),
  resultado     text        NOT NULL CHECK (resultado IN ('vitoria', 'empate', 'derrota')),
  rating_antes  integer     NOT NULL,
  k             smallint    NOT NULL,
  delta         integer     NOT NULL,
  rating_depois integer     NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (desafio_id, aluno_id),
  CHECK (rating_depois = rating_antes + delta)
);
CREATE INDEX IF NOT EXISTS ranqueada_elo_partida_aluno ON public.ranqueada_elo_partida (classe_id, aluno_id, criado_em);

ALTER TABLE public.ranqueada_elo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranqueada_elo_partida ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ranqueada_elo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ranqueada_elo_partida FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('elo_inicial', '1000', 'Rating Elo de quem ainda não jogou ranqueada na turma.', false),
  ('elo_k', '32', 'Fator K do Elo depois das partidas provisórias.', false),
  ('elo_k_provisorio', '40', 'Fator K do Elo nas primeiras partidas do aluno na turma.', false),
  ('elo_partidas_provisorias', '10', 'Quantas partidas usam o K provisório.', false)
ON CONFLICT (chave) DO NOTHING;
"""


APLICAR = r"""
CREATE OR REPLACE FUNCTION public.fn_elo_aplicar(p_desafio_id uuid, p_classe_id bigint, p_vencedor smallint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- Sem auth.uid() de propósito, como `fn_desafio_encerrar`: a varredura chama sem sessão. Por
  -- isso nenhum cliente tem EXECUTE.
  v_inicial  integer := public.fn_app_config_int('elo_inicial', 1000);
  v_k        integer := public.fn_app_config_int('elo_k', 32);
  v_kp       integer := public.fn_app_config_int('elo_k_provisorio', 40);
  v_np       integer := public.fn_app_config_int('elo_partidas_provisorias', 10);
  v_r1       numeric;
  v_r2       numeric;
  v_e1       numeric;
  v_s1       numeric;
  v_n        integer := 0;
  v_ids      uuid[];
  v_equipes  smallint[];
BEGIN
  -- Já aplicado para este desafio: nada a fazer.
  IF EXISTS (SELECT 1 FROM public.ranqueada_elo_partida WHERE desafio_id = p_desafio_id) THEN
    RETURN 0;
  END IF;

  -- Quem joga: aceito e respondeu, nas duas equipes. É o mesmo corte dos eventos do desafio.
  SELECT array_agg(pl.aluno_id ORDER BY pl.aluno_id), array_agg(pl.equipe ORDER BY pl.aluno_id)
    INTO v_ids, v_equipes
    FROM public.fn_arena_placar(p_desafio_id) pl
   WHERE pl.estado = 'aceito' AND pl.respondidas > 0 AND pl.equipe IN (1, 2);

  IF v_ids IS NULL OR NOT (1::smallint = ANY (v_equipes)) OR NOT (2::smallint = ANY (v_equipes)) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ranqueada_elo (classe_id, aluno_id, rating)
  SELECT p_classe_id, j.aluno_id, v_inicial FROM unnest(v_ids, v_equipes) AS j(aluno_id, equipe)
  ON CONFLICT (classe_id, aluno_id) DO NOTHING;

  -- Trava em ordem fixa: dois desafios com jogadores em comum fechando juntos não se cruzam.
  PERFORM 1 FROM public.ranqueada_elo e
    JOIN unnest(v_ids, v_equipes) AS j(aluno_id, equipe) ON j.aluno_id = e.aluno_id
   WHERE e.classe_id = p_classe_id
   ORDER BY e.aluno_id
     FOR UPDATE OF e;

  SELECT avg(e.rating) FILTER (WHERE j.equipe = 1), avg(e.rating) FILTER (WHERE j.equipe = 2)
    INTO v_r1, v_r2
    FROM unnest(v_ids, v_equipes) AS j(aluno_id, equipe)
    JOIN public.ranqueada_elo e ON e.classe_id = p_classe_id AND e.aluno_id = j.aluno_id;

  v_e1 := 1 / (1 + power(10::numeric, (v_r2 - v_r1) / 400));
  v_s1 := CASE WHEN p_vencedor IS NULL THEN 0.5 WHEN p_vencedor = 1 THEN 1 ELSE 0 END;

  WITH conta AS (
    SELECT j.aluno_id, j.equipe, e.rating,
           CASE WHEN e.partidas < v_np THEN v_kp ELSE v_k END AS k,
           CASE WHEN j.equipe = 1 THEN v_s1 ELSE 1 - v_s1 END AS s,
           CASE WHEN j.equipe = 1 THEN v_e1 ELSE 1 - v_e1 END AS esperado
      FROM unnest(v_ids, v_equipes) AS j(aluno_id, equipe)
      JOIN public.ranqueada_elo e ON e.classe_id = p_classe_id AND e.aluno_id = j.aluno_id
  ), gravada AS (
    INSERT INTO public.ranqueada_elo_partida
      (desafio_id, aluno_id, classe_id, equipe, resultado, rating_antes, k, delta, rating_depois)
    SELECT p_desafio_id, c.aluno_id, p_classe_id, c.equipe,
           CASE WHEN c.s = 1 THEN 'vitoria' WHEN c.s = 0 THEN 'derrota' ELSE 'empate' END,
           c.rating, c.k,
           round(c.k * (c.s - c.esperado))::integer,
           c.rating + round(c.k * (c.s - c.esperado))::integer
      FROM conta c
    ON CONFLICT (desafio_id, aluno_id) DO NOTHING
    RETURNING aluno_id, resultado, rating_depois
  )
  UPDATE public.ranqueada_elo e
     SET rating = g.rating_depois,
         partidas = e.partidas + 1,
         vitorias = e.vitorias + (g.resultado = 'vitoria')::integer,
         empates = e.empates + (g.resultado = 'empate')::integer,
         derrotas = e.derrotas + (g.resultado = 'derrota')::integer,
         atualizado_em = now()
    FROM gravada g
   WHERE e.classe_id = p_classe_id AND e.aluno_id = g.aluno_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_elo_aplicar(uuid, bigint, smallint) FROM PUBLIC, anon, authenticated;
"""


def encerrar_anterior() -> str:
    """`fn_desafio_encerrar` como a `20261021_11` a deixa (é a de produção, ver o teste)."""
    m11 = _load("20261021_11_formato_do_desafio.py")
    return m11._encerrar(m11.COOPERATIVO_NOVO)


def encerrar_com_elo() -> str:
    sql = encerrar_anterior()
    sql = _troca(sql, "  v_pagos    integer;\n", "  v_pagos    integer;\n  v_elo      integer := 0;\n", "DECLARE")
    sql = _troca(
        sql,
        "  RETURN jsonb_build_object(\n    'status', 'encerrado', 'novo', true,",
        """  -- Elo (decisão de 2026-10-20). Só ranqueada com adversário de verdade: cooperativo não tem
  -- contra quem medir, e `sem_adversario` não é partida.
  IF v_d.consequencia = 'ranqueada' AND NOT v_cooperativo AND v_resultado IN ('vitoria', 'empate') THEN
    v_elo := public.fn_elo_aplicar(p_desafio_id, v_d.classe_id, v_vencedor);
  END IF;

  RETURN jsonb_build_object(
    'status', 'encerrado', 'novo', true,""",
        "RETURN do encerramento",
    )
    sql = _troca(
        sql, "    'eventos', v_pagos,\n", "    'eventos', v_pagos,\n    'elo_atualizados', v_elo,\n", "jsonb de retorno"
    )
    return sql


def view_anterior() -> str:
    return _load("20261021_16_rank_periodo_manual.py").VIEW


def view_com_elo() -> str:
    sql = view_anterior()
    sql = _troca(
        sql,
        "        ), base AS (\n",
        """        ), elo_config AS (
         -- Quem ainda não jogou aparece com o rating inicial, não com zero.
         SELECT public.fn_app_config_int('elo_inicial', 1000)::numeric AS inicial
        ), base AS (
""",
        "CTE base",
    )
    sql = _troca(
        sql,
        "                    WHEN 'missoes'::text THEN COALESCE(mpr.pontuacao, 0::numeric)\n",
        "                    WHEN 'missoes'::text THEN COALESCE(mpr.pontuacao, 0::numeric)\n"
        "                    WHEN 'elo'::text THEN COALESCE(elo.rating::numeric, ecfg.inicial)\n",
        "CASE do critério",
    )
    sql = _troca(
        sql,
        "             LEFT JOIN missoes_por_rank mpr ON mpr.rank_id = r.id AND mpr.aluno_id = ca.aluno_id\n",
        "             LEFT JOIN missoes_por_rank mpr ON mpr.rank_id = r.id AND mpr.aluno_id = ca.aluno_id\n"
        "             LEFT JOIN ranqueada_elo elo ON elo.classe_id = r.classe_id AND elo.aluno_id = ca.aluno_id\n"
        "             CROSS JOIN elo_config ecfg\n",
        "joins da base",
    )
    return sql


# `rank_tipo` não é escrita pelo cliente (`20260826_09`): o tipo novo nasce aqui, como o `ranqueada`
# nasceu na `20261021_06`.
RANK_TIPO = r"""
INSERT INTO public.rank_tipo (nome, descricao, criterio)
SELECT 'Elo', 'Rating Elo dos desafios ranqueados contra adversário: ganhar de quem está acima vale mais. Começa em 1000.', 'elo'
 WHERE NOT EXISTS (SELECT 1 FROM public.rank_tipo WHERE criterio = 'elo');
"""


DOWNGRADE_SQL = r"""
-- A guarda de `ranks` (20261021_16) não deixa excluir período encerrado; a porta de manutenção
-- dela é este flag, só nesta transação.
SELECT set_config('app.rank_periodo', 'on', true);
DELETE FROM public.ranks WHERE tipo_id IN (SELECT id FROM public.rank_tipo WHERE criterio = 'elo');
SELECT set_config('app.rank_periodo', '', true);
DELETE FROM public.rank_tipo WHERE criterio = 'elo';
DROP FUNCTION IF EXISTS public.fn_elo_aplicar(uuid, bigint, smallint);
DROP TABLE IF EXISTS public.ranqueada_elo_partida;
DROP TABLE IF EXISTS public.ranqueada_elo;
DELETE FROM public.app_config WHERE chave IN ('elo_inicial', 'elo_k', 'elo_k_provisorio', 'elo_partidas_provisorias');
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(APLICAR)
    op.execute(encerrar_com_elo())
    op.execute(view_com_elo())
    op.execute(RANK_TIPO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # A view e o fechamento voltam antes: os dois leem o que sai depois.
    op.execute(view_anterior())
    op.execute(encerrar_anterior())
    op.execute(DOWNGRADE_SQL)
    op.execute("NOTIFY pgrst, 'reload schema'")

"""Painel técnico: gatilho de paridade entre a via em guilda e a individual (#154, fase 5: D7)

O aceite da #154 pede que as duas vias "rendam o mesmo para esforço equivalente". A fase 1
(`20261105_13`) corrigiu a missão de guilda; sem medida, a paridade continuava sendo só uma promessa.
Este é o quinto gatilho do `painel_tecnico`, ao lado dos quatro do §11.

## A medida

Na janela do painel (`p_horas`), para cada aluno × turma com atividade concluída:

- **XP**: a soma de `eventos_aluno.valor` **sem `fora_do_xp`** (a definição de XP do CLAUDE.md: duelo
  fica de fora), com recompensa de missão e tudo, que é onde a guilda rendia mais;
- **esforço**: as atividades concluídas (`atividade_concluida`);
- **em guilda**: foi membro de uma guilda da turma em algum momento da janela (`guilda_membros`, com as
  datas de entrada e saída).

A comparação é o XP por atividade de cada grupo, somado (soma do XP ÷ soma das atividades). A turma do
evento sai de `classe_id` ou, se vier nulo, de `fn_eventos_aluno_resolve_classe_id`, como na apuração.

## O estado

- `sem_dado`: algum dos grupos tem menos de `paridade_guilda_minimo` alunos (padrão 5). Pouca gente não
  é evidência de nada, e o painel não chama lacuna de "ok".
- `alerta`: a razão guilda ÷ individual passa de `1 + limiar` ou fica abaixo de `1 / (1 + limiar)`, com
  `paridade_guilda_limiar_pct` (padrão 25).
- `ok`: dentro da faixa. O detalhe traz os dois números e quantos alunos cada um teve.

O console (`painelTecnico.ts`) e o aviso diário ao dono (`20261102_23`) já leem a lista de gatilhos de
forma genérica: o novo aparece nos dois sem mudar nada lá. Agregado, sem `aluno_id`.

O texto da função é o da `20261103_14`, com três trocas que falham alto se o trecho mudou.

Revision ID: 20261105_23
Revises: 20261105_22
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_23"
down_revision = "20261105_22"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

CONFIG = """
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('paridade_guilda_limiar_pct', '25',
   'Painel tecnico (#154): diferenca maxima, em %, do XP por atividade entre quem esta em guilda e quem nao esta.', false),
  ('paridade_guilda_minimo', '5',
   'Painel tecnico (#154): minimo de alunos com atividade em cada grupo para comparar.', false)
ON CONFLICT (chave) DO NOTHING;
"""

DECLARE_ANTES = "  v_g_custo jsonb;\nBEGIN\n"
DECLARE_DEPOIS = """  v_g_custo jsonb;
  v_g_paridade jsonb;
  v_par_guilda numeric;
  v_par_solo numeric;
  v_par_n_guilda integer;
  v_par_n_solo integer;
  v_par_limiar numeric;
  v_par_minimo integer;
  v_par_razao numeric;
BEGIN
"""

CONTA_ANTES = "  RETURN jsonb_build_object(\n    'gerado_em', v_fim,\n"
CONTA_DEPOIS = """  -- ---------------------------------------------------------------- gatilho 5: paridade guilda x individual (#154)
  v_par_limiar := public.fn_app_config_int('paridade_guilda_limiar_pct', 25) / 100.0;
  v_par_minimo := GREATEST(public.fn_app_config_int('paridade_guilda_minimo', 5), 1);
  WITH ev AS (
    SELECT e.aluno_id,
           COALESCE(e.classe_id, public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia)) AS classe_id,
           e.tipo, e.valor, e.fora_do_xp
      FROM public.eventos_aluno e
     WHERE e.aluno_id IS NOT NULL
       AND (e.criado_em AT TIME ZONE 'UTC') >= v_inicio
       AND (e.criado_em AT TIME ZONE 'UTC') < v_fim
  ),
  por_aluno AS (
    SELECT ev.aluno_id, ev.classe_id,
           COALESCE(sum(ev.valor) FILTER (WHERE NOT ev.fora_do_xp), 0) AS xp,
           count(*) FILTER (WHERE ev.tipo = 'atividade_concluida') AS atividades
      FROM ev
     WHERE ev.classe_id IS NOT NULL
     GROUP BY ev.aluno_id, ev.classe_id
    HAVING count(*) FILTER (WHERE ev.tipo = 'atividade_concluida') > 0
  ),
  grupo AS (
    SELECT p.*, EXISTS (
             SELECT 1 FROM public.guilda_membros gm
              WHERE gm.aluno_id = p.aluno_id AND gm.classe_id = p.classe_id
                AND COALESCE(gm.joined_at, '-infinity'::timestamptz) < v_fim
                AND COALESCE(gm.left_at, 'infinity'::timestamptz) > v_inicio
           ) AS em_guilda
      FROM por_aluno p
  )
  SELECT sum(xp) FILTER (WHERE em_guilda) / NULLIF(sum(atividades) FILTER (WHERE em_guilda), 0),
         sum(xp) FILTER (WHERE NOT em_guilda) / NULLIF(sum(atividades) FILTER (WHERE NOT em_guilda), 0),
         count(*) FILTER (WHERE em_guilda)::integer,
         count(*) FILTER (WHERE NOT em_guilda)::integer
    INTO v_par_guilda, v_par_solo, v_par_n_guilda, v_par_n_solo
    FROM grupo;
  v_par_razao := CASE WHEN v_par_solo > 0 THEN v_par_guilda / v_par_solo END;

  v_g_paridade := CASE
    WHEN COALESCE(v_par_n_guilda, 0) < v_par_minimo OR COALESCE(v_par_n_solo, 0) < v_par_minimo OR v_par_razao IS NULL THEN jsonb_build_object(
      'estado', 'sem_dado',
      'detalhe', format('Poucos alunos com atividade para comparar: %s em guilda e %s fora (mínimo %s em cada).',
                        COALESCE(v_par_n_guilda, 0), COALESCE(v_par_n_solo, 0), v_par_minimo))
    WHEN v_par_razao > 1 + v_par_limiar OR v_par_razao < 1 / (1 + v_par_limiar) THEN jsonb_build_object(
      'estado', 'alerta',
      'detalhe', format('XP por atividade: %s em guilda contra %s fora (%s e %s alunos). A diferença passa de %s%%.',
                        round(v_par_guilda, 1), round(v_par_solo, 1), v_par_n_guilda, v_par_n_solo, round(v_par_limiar * 100)))
    ELSE jsonb_build_object(
      'estado', 'ok',
      'detalhe', format('XP por atividade: %s em guilda e %s fora (%s e %s alunos).',
                        round(v_par_guilda, 1), round(v_par_solo, 1), v_par_n_guilda, v_par_n_solo))
  END;

  RETURN jsonb_build_object(
    'gerado_em', v_fim,
"""

LISTA_ANTES = "      v_g_lat || jsonb_build_object('id', 'latencia_slo', 'titulo', 'Latência acima do SLO')),\n"
LISTA_DEPOIS = (
    "      v_g_lat || jsonb_build_object('id', 'latencia_slo', 'titulo', 'Latência acima do SLO'),\n"
    "      v_g_paridade || jsonb_build_object('id', 'paridade_guilda', 'titulo', 'Paridade entre guilda e individual')),\n"
)


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_21", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def painel_anterior() -> str:
    """`painel_tecnico` como a `20261103_14` a deixou (o custo em tokens)."""
    return _load("20261103_14_custo_por_geracao.py").painel_sql()


def painel_novo() -> str:
    texto = painel_anterior()
    for antigo, novo in ((DECLARE_ANTES, DECLARE_DEPOIS), (CONTA_ANTES, CONTA_DEPOIS), (LISTA_ANTES, LISTA_DEPOIS)):
        if texto.count(antigo) != 1:
            raise RuntimeError("painel_tecnico mudou de forma; revise a 20261105_23")
        texto = texto.replace(antigo, novo)
    return texto


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(painel_novo())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(painel_anterior())
    op.execute("DELETE FROM public.app_config WHERE chave IN ('paridade_guilda_limiar_pct', 'paridade_guilda_minimo');")
    op.execute("NOTIFY pgrst, 'reload schema'")

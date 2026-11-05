"""Missão de guilda: o alvo vale por membro (#154, D6)

A `20261021_15` faz a guilda cumprir a missão pela **soma** do progresso dos membros, contra o
**mesmo alvo** da missão individual, e paga o prêmio inteiro a cada membro ativo. Numa guilda de 5,
cada um faz em média 1/5 do esforço para o mesmo prêmio de quem cumpre sozinho. Isso fere dois
aceites da #154 ("caminho individual equivalente" e "as duas vias rendem o mesmo para esforço
equivalente") e torna a guilda obrigatória na prática, contra a #153.

## O que muda

- `missoes.alvo_por_membro` (boolean, NOT NULL). As missões que já existem ficam `false` e não
  mudam: uma guilda no meio de uma missão não vê o alvo multiplicar de repente. As novas nascem
  `true` (padrão da coluna).
- `fn_missao_guilda_avaliar`: com `alvo_por_membro`, o alvo é o alvo da missão vezes o número de
  membros ativos da guilda **no momento da avaliação** (no mínimo 1). Assim, cada membro faz, em
  média, o mesmo esforço da missão individual para o mesmo prêmio.
- Missão `escopo <> 'guilda'` ignora a coluna.

O resto do avaliador é o da `_15`, trecho a trecho: a troca de texto falha alto se ele mudou.

## Membros ativos no momento da avaliação

É quem recebe o prêmio (a `_15` já paga só os ativos), então o alvo e o prêmio contam as mesmas
pessoas. Quem sai da guilda tira a sua parte do alvo, e a contribuição dele no período em que foi
membro continua na soma, como na `_15`.

Desenho: `docs/superpowers/specs/2026-11-05-batalhas-em-evento-design.md` (D6).

Revision ID: 20261105_13
Revises: 20261105_12
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_13"
down_revision = "20261105_12"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

COLUNA = """
ALTER TABLE public.missoes ADD COLUMN IF NOT EXISTS alvo_por_membro boolean NOT NULL DEFAULT false;
ALTER TABLE public.missoes ALTER COLUMN alvo_por_membro SET DEFAULT true;
COMMENT ON COLUMN public.missoes.alvo_por_membro IS
  'So para escopo guilda: o alvo do criterio vale por membro ativo (alvo x membros). '
  'Missoes anteriores a 20261105_13 ficam false. Ver #154 (D6).';
"""

TROCAS = (
    (
        "  SELECT id, classe_id, escopo, criterio, recompensa_tipo\n    INTO v_m\n",
        "  SELECT id, classe_id, escopo, criterio, recompensa_tipo, alvo_por_membro\n    INTO v_m\n",
    ),
    (
        "  v_mudou    integer;\nBEGIN\n",
        "  v_mudou    integer;\n  v_membros  integer;\nBEGIN\n",
    ),
    (
        "    0);\n  v_soma := public.fn_missao_guilda_progresso(p_missao, p_guilda);\n",
        """    0);
  -- Alvo por membro (20261105_13, #154 D6): cada membro faz, em media, o esforco da missao
  -- individual. Conta quem e' membro ativo agora, que e' quem recebe o premio abaixo.
  IF v_m.alvo_por_membro THEN
    SELECT count(*) INTO v_membros
      FROM public.guilda_membros gm
     WHERE gm.guilda_id = p_guilda
       AND gm.classe_id = v_m.classe_id
       AND gm.left_at IS NULL;
    v_alvo := v_alvo * GREATEST(v_membros, 1);
  END IF;
  v_soma := public.fn_missao_guilda_progresso(p_missao, p_guilda);
""",
    ),
)


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_13", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def avaliar_anterior() -> str:
    return _load("20261021_15_missao_de_guilda_soma_os_membros.py").AVALIAR


def avaliar_novo() -> str:
    texto = avaliar_anterior()
    for antigo, novo in TROCAS:
        if texto.count(antigo) != 1:
            raise RuntimeError("fn_missao_guilda_avaliar mudou de forma desde a 20261021_15; revise a 20261105_13")
        texto = texto.replace(antigo, novo)
    return texto


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(avaliar_novo())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(avaliar_anterior())
    op.execute("ALTER TABLE public.missoes DROP COLUMN IF EXISTS alvo_por_membro;")
    op.execute("NOTIFY pgrst, 'reload schema'")

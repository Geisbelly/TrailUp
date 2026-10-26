"""Formato de `ranks.periodo` e `percentual_do_lider` sem ruído em rank pequeno ou de Elo (#155)

## `ranks.periodo`: rótulo do período, com formato definido

Até aqui o banco aceitava qualquer texto, e só a RPC `fn_rank_novo_periodo` (`20261021_16`) e o
console (`rankings.ts`, `PERIODO_MAX = 40`) validavam. O console grava `ranks` direto
(`RanksSection.tsx`), então o formato dependia de cada cliente se comportar. Agora o formato é este:

- **O que é:** o NOME do período, mostrado ao aluno e ao professor. A janela que conta pontos é
  `inicio`/`fim`, e o rótulo não entra na conta.
- **Forma:** texto de 1 a 40 caracteres, sem espaço nas pontas. O banco tira esses espaços.
- **Sugestão:** `AAAA.S` (ano.semestre, ex.: `2026.2`), que é o que o console propõe em
  `periodoSugerido`. Não é obrigatória: "Bimestre 1" e "Maratona de outubro" são válidos, e os
  testes do console já os aceitam.
- **Unicidade:** um nome por tipo + turma, sem diferenciar maiúsculas. Isso continua como estava
  na RPC e no console.
- **Legado:** `NULL` e qualquer valor que já esteja gravado continuam como estão.

Quem garante é o gatilho `trg_ranks_periodo_formato`, e não um CHECK. Ele valida só no INSERT e no
UPDATE que MUDA o rótulo. Um CHECK, mesmo `NOT VALID`, seria reavaliado em qualquer UPDATE da
linha, e o `UPDATE ranks SET fim = now()` de `fn_rank_novo_periodo` falharia ao encerrar um
período legado com rótulo fora do formato. Os valores atuais foram conferidos pelas migrations e
pelo esqueleto, sem consultar produção: nenhuma migration grava `periodo`, a não ser a RPC (já
1 a 40, com `btrim`). A mensagem é a mesma da RPC.

O gatilho roda também com `app.rank_periodo = 'on'`, porque a RPC já manda o rótulo no formato.

## `percentual_do_lider` (o "progresso" da #155)

Era `pontuacao / MAX(pontuacao) OVER (PARTITION BY rank_id) * 100`, para qualquer rank. Com
poucos alunos o primeiro marca sempre 100% e o segundo pode aparecer com 12%, e no Elo a conta não
diz nada (1000 contra 1016 dá 98%). Passa a ser `NULL` quando:

- o critério é `elo`;
- o rank tem menos de `rank_progresso_min_participantes` alunos (chave privada em `app_config`,
  padrão 8, o mesmo `MIN_PARTICIPANTES_PARA_BARRA` do resultado do evento no console);
- o maior valor é 0 ou negativo (a ranqueada aceita negativo).

No resto continua igual, limitado a 0 a 100. A coluna e o tipo não mudam, e a
`vw_rank_posicoes_por_classe` e o corte do #134 seguem por cima da `_todas`. O pódio congelado de
`fn_rank_novo_periodo` copia o valor como vier: `NULL` em rank pequeno.

## Downgrade

Volta a view da `20261021_18`, derruba o gatilho e a função e tira o comentário e a chave. Os
rótulos já normalizados ficam como estão.

Revision ID: 20261025_02
Revises: 20261025_01
Create Date: 2026-10-25
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261025_02"
down_revision = "20261025_01"
branch_labels = None
depends_on = None

MIN_PARTICIPANTES = 8


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261025_02")
    return texto.replace(antigo, novo, 1)


PERIODO = r"""
CREATE OR REPLACE FUNCTION public.fn_ranks_periodo_formato()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  -- Só valida rótulo novo ou trocado: linha legada não é reavaliada a cada UPDATE (encerrar um
  -- período mexe em `fim` e não pode falhar pelo nome antigo).
  IF TG_OP = 'UPDATE' AND NEW.periodo IS NOT DISTINCT FROM OLD.periodo THEN
    RETURN NEW;
  END IF;
  NEW.periodo := btrim(NEW.periodo);
  IF NEW.periodo IS NULL OR char_length(NEW.periodo) < 1 OR char_length(NEW.periodo) > 40 THEN
    RAISE EXCEPTION 'O nome do período vai de 1 a 40 caracteres.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_ranks_periodo_formato ON public.ranks;
CREATE TRIGGER trg_ranks_periodo_formato
  BEFORE INSERT OR UPDATE OF periodo ON public.ranks
  FOR EACH ROW EXECUTE FUNCTION public.fn_ranks_periodo_formato();

COMMENT ON COLUMN public.ranks.periodo IS
  'Nome do período (#155): 1 a 40 caracteres, sem espaço nas pontas; sugestão AAAA.S (ex.: 2026.2). '
  'Único por tipo + turma sem diferenciar maiúsculas. Só rótulo: a janela é inicio/fim. '
  'NULL só em linha legada.';
"""

PERIODO_FORA = r"""
DROP TRIGGER IF EXISTS trg_ranks_periodo_formato ON public.ranks;
DROP FUNCTION IF EXISTS public.fn_ranks_periodo_formato();
COMMENT ON COLUMN public.ranks.periodo IS NULL;
"""

CONFIG = f"""
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('rank_progresso_min_participantes', '{MIN_PARTICIPANTES}',
   'Abaixo disto o rank não mostra percentual do líder (#155).', false)
ON CONFLICT (chave) DO NOTHING;
"""

CONFIG_FORA = "DELETE FROM public.app_config WHERE chave = 'rank_progresso_min_participantes';"


def view_anterior() -> str:
    """`vw_rank_posicoes_por_classe_todas` como a `20261021_18` a deixa (a última que a redefine)."""
    return _load("20261021_18_ranqueada_elo.py").view_com_elo()


PERCENTUAL_ANTIGO = (
    "    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)"
    " * 100::numeric, 2) AS percentual_do_lider,\n"
)

PERCENTUAL_NOVO = """\
        -- #155: sem percentual onde ele engana (Elo, rank pequeno, líder sem ponto).
        CASE
            WHEN o.criterio = 'elo'::text THEN NULL::numeric
            WHEN count(*) OVER (PARTITION BY o.rank_id) < pcfg.min_participantes THEN NULL::numeric
            WHEN max(o.pontuacao) OVER (PARTITION BY o.rank_id) <= 0::numeric THEN NULL::numeric
            ELSE LEAST(GREATEST(round(o.pontuacao / max(o.pontuacao) OVER (PARTITION BY o.rank_id) * 100::numeric, 2), 0::numeric), 100::numeric)
        END AS percentual_do_lider,
"""


def view_nova() -> str:
    sql = view_anterior()
    sql = _troca(
        sql,
        "        ), base AS (\n",
        """        ), progresso_config AS (
         SELECT public.fn_app_config_int('rank_progresso_min_participantes', 8) AS min_participantes
        ), base AS (
""",
        "CTE base",
    )
    sql = _troca(
        sql,
        "            b.pontuacao,\n            dense_rank()",
        "            b.pontuacao,\n            b.criterio,\n            dense_rank()",
        "CTE ordenado",
    )
    sql = _troca(sql, PERCENTUAL_ANTIGO, PERCENTUAL_NOVO, "percentual_do_lider")
    sql = _troca(
        sql,
        "   FROM ordenado o\n     JOIN alunos a ON a.id = o.aluno_id;",
        "   FROM ordenado o\n     JOIN alunos a ON a.id = o.aluno_id\n     CROSS JOIN progresso_config pcfg;",
        "FROM final",
    )
    return sql


RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(PERIODO)
    op.execute(CONFIG)
    op.execute(view_nova())
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(view_anterior())
    op.execute(CONFIG_FORA)
    op.execute(PERIODO_FORA)
    op.execute(RELOAD)

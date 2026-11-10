"""O que pesou no risco de abandono do modelo de evasão, para o console sugerir o que fazer

## Por quê

O console mostra o risco de cada aluno junto com uma sugestão do que o professor pode fazer. A
sugestão sai do sinal que pesou. Quando quem decide a faixa é o modelo de evasão do core
(`risco_abandono_origem = 'modelo'`, `20261031_08`), o console só sabia "risco alto de abandono",
sem saber o motivo: a view expõe a faixa e nunca o score (core: LGPD #195).

## O que entra

`trailup_motivo_risco_evasao`: função pura (`IMMUTABLE`), com a **mesma assinatura** de
`trailup_risco_evasao`. Ela devolve o **rótulo** da entrada que mais subiu o logit do modelo em
relação a uma referência neutra. A conta é coeficiente × desvio, a explicação local usual de uma
regressão logística. O modelo do core não muda.

| rótulo | contribuição (em unidades de logit) | referência neutra |
|---|---|---|
| `entregas_perdidas` | (0,251735 + 0,027413) × perdidas + 1,688502 × (1 − taxa de entrega) | tudo entregue |
| `uso_caiu` | −0,239863 × (ln(1+semana) − ln(1+média das 4 anteriores)) + 0,002436 × razão | semana igual à média do próprio aluno |
| `entrega_atrasada` | 0,019125 × atraso médio (dias, só o positivo) | entrega no prazo |
| `sem_nota` / `nota_baixa` | 0,008495 × (50 − nota) | nota 5,0 (o mínimo do console) |

O rótulo só sai quando a contribuição passa de 0,1. A maior vence, e o empate segue a ordem da
tabela. A semana do curso fica de fora porque não há o que o professor faça sobre ela. As semanas
sem acesso também, porque o coeficiente é praticamente zero.

`vw_metricas_engajamento_aluno_classe.risco_abandono_motivo`: o rótulo, preenchido só quando a
faixa veio do **modelo** e é `alto` ou `atencao`. Na origem `inatividade` o próprio fato (dias sem
estudar) já é o motivo, e o console o mostra. A coluna entra no fim da view; nenhuma muda. A view
continua sem score e sem contribuição: só o rótulo (#195).

## Como

`CREATE OR REPLACE` da view a partir do texto da `20261101_10`, com o padrão de trocas conferidas:
os argumentos do modelo são lidos do próprio corpo, então a coluna nova não tem como divergir da
faixa. Se o corpo mudar, a migration falha em vez de gravar pela metade.

## Downgrade

Uma view não perde coluna por `CREATE OR REPLACE`, e as views de turma dependem desta. Por isso o
downgrade volta ao corpo da `_10` com `NULL::text AS risco_abandono_motivo` e apaga a função.

Revision ID: 20261110_01
Revises: 20261108_03
Create Date: 2026-11-10
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261110_01"
down_revision = "20261108_03"
branch_labels = None
depends_on = None

ASSINATURA = "numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric"

# Piso da contribuição (logit) para nomear um motivo. Abaixo dele, nenhuma entrada se destaca.
PISO = "0.1"

FUNCAO = f"""
CREATE OR REPLACE FUNCTION public.trailup_motivo_risco_evasao(
  p_cliques_semana        numeric,
  p_cliques_4semanas      numeric,
  p_semanas_sem_acesso    numeric,   -- coeficiente ~zero no modelo: não vira motivo
  p_semana_do_curso       numeric,   -- não há o que o professor faça: não vira motivo
  p_nota_media            numeric,   -- 0-100; -1 sem nota
  p_entregas_feitas       numeric,
  p_entregas_perdidas     numeric,
  p_taxa_entrega          numeric,
  p_atraso_medio          numeric
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  -- Contribuição de cada entrada ao logit de `trailup_risco_evasao` contra uma referência neutra
  -- (coeficiente x desvio). Os coeficientes são os do modelo, copiados de lá.
  SELECT v.motivo
    FROM (VALUES
      ('entregas_perdidas',
       (0.251735 + 0.027413) * greatest(p_entregas_perdidas, 0)
         + 1.688502 * greatest(1 - p_taxa_entrega, 0),
       1),
      ('uso_caiu',
       (-0.239863) * (ln(1 + greatest(p_cliques_semana, 0)) - ln(1 + greatest(p_cliques_4semanas, 0) / 4.0))
         + 0.002436 * ((p_cliques_semana - p_cliques_4semanas / 4.0) / (p_cliques_4semanas / 4.0 + 1)),
       2),
      ('entrega_atrasada', 0.019125 * greatest(p_atraso_medio, 0), 3),
      (CASE WHEN p_nota_media < 0 THEN 'sem_nota' ELSE 'nota_baixa' END,
       0.008495 * greatest(50 - p_nota_media, 0),
       4)
    ) AS v(motivo, peso, ordem)
   WHERE v.peso >= {PISO}
   ORDER BY v.peso DESC, v.ordem
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.trailup_motivo_risco_evasao({ASSINATURA}) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_motivo_risco_evasao({ASSINATURA}) TO authenticated, service_role;
"""


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}_para_11_10", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def engajamento_anterior() -> str:
    return _modulo("20261101_10_nota_media_da_matricula.py").ENGAJAMENTO


def _um(texto: str, trecho: str) -> int:
    if texto.count(trecho) != 1:
        raise RuntimeError(f"trecho esperado uma vez na view da 20261101_10: {trecho[:60]!r}")
    return texto.index(trecho)


INICIO_ARGS = "ELSE public.trailup_faixa_risco(public.trailup_risco_evasao(\n"
FIM_ARGS = "\n         ))\n       END AS risco_abandono_faixa,"
CONDICAO_INATIVIDADE = (
    "WHEN NOT COALESCE(av.tem_avaliavel, false)\n"
    "              OR (COALESCE(cl.semana, 0) = 0 AND NOT COALESCE(pe.tem_pendencia, false)) THEN 'inatividade'"
)
ORIGEM = "            ELSE 'modelo' END AS risco_abandono_origem\n"


def _argumentos(corpo: str) -> str:
    """Os nove argumentos que a view passa ao modelo, como estão no corpo."""
    inicio = _um(corpo, INICIO_ARGS) + len(INICIO_ARGS)
    fim = _um(corpo, FIM_ARGS)
    return corpo[inicio:fim]


def _com_coluna(corpo: str, coluna: str) -> str:
    _um(corpo, ORIGEM)
    return corpo.replace(ORIGEM, ORIGEM.rstrip("\n") + ",\n" + coluna + "\n")


def engajamento_novo() -> str:
    corpo = engajamento_anterior()
    args = _argumentos(corpo)
    # A mesma condição que manda para a inatividade, sem o THEN: fora dela, a faixa é do modelo.
    _um(corpo, CONDICAO_INATIVIDADE)
    coluna = (
        "       -- O que pesou na faixa do modelo (20261110_01): só o rótulo, nunca o score (#195).\n"
        "       -- Só quando a faixa é do modelo e não é normal; na inatividade, os dias são o motivo.\n"
        "       CASE WHEN a.ultima_atividade_em IS NULL THEN NULL\n"
        "            WHEN NOT COALESCE(av.tem_avaliavel, false)\n"
        "              OR (COALESCE(cl.semana, 0) = 0 AND NOT COALESCE(pe.tem_pendencia, false)) THEN NULL\n"
        "            WHEN public.trailup_faixa_risco(public.trailup_risco_evasao(\n"
        f"{args}\n"
        "                 )) IN ('alto', 'atencao') THEN public.trailup_motivo_risco_evasao(\n"
        f"{args}\n"
        "                 )\n"
        "       END AS risco_abandono_motivo"
    )
    return _com_coluna(corpo, coluna)


def engajamento_de_volta() -> str:
    return _com_coluna(engajamento_anterior(), "       NULL::text AS risco_abandono_motivo")


ENGAJAMENTO = engajamento_novo()


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute(ENGAJAMENTO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(engajamento_de_volta())
    op.execute(f"DROP FUNCTION IF EXISTS public.trailup_motivo_risco_evasao({ASSINATURA})")
    op.execute("NOTIFY pgrst, 'reload schema'")

"""Painel técnico: custo por artefato em tokens, não mais pelo proxy de execuções (#21)

A `20261102_22` media o gatilho "custo por artefato sem ganho equivalente" por execuções por alvo,
porque o banco não gravava o uso do modelo. Agora grava.

## De onde vem o uso

O microservice soma os tokens de cada chamada ao modelo durante a geração (Gemini e OpenAI, mais o
que o BrainHexPDF gastou no deck) e devolve isso na resposta de `/api/personalizar`, com sucesso ou
falha. A API grava em `personalizacao_job_targets.uso_modelo`, **somando** a cada tentativa:
reprocessar é pagar de novo, e é isso que o gatilho quer ver.

Formato (o mesmo dos dois serviços, `usoDoModelo.ts`):
`{chamadas, tokens_entrada, tokens_saida, caracteres, tentativas, por_modelo: {<modelo>: {...}}}`.
`caracteres` é o texto mandado à voz da OpenAI, que cobra por caractere e não devolve tokens.

Fica de fora o enriquecimento do conteúdo (feito pela API uma vez por job e reaproveitado entre os
alvos): ele não é custo de um artefato.

## O gatilho

Tokens (entrada + saída) por alvo finalizado com uso gravado, na janela × a anterior. Alerta quando
sobe mais de 30 % sem a taxa de conclusão subir, a mesma regra de antes. Enquanto alguma janela
tiver menos de 5 alvos com uso gravado (os anteriores a esta mudança vêm sem), vale o proxy antigo,
e o detalhe diz qual dos dois está valendo. A resposta ganha `custo`: tokens por alvo, alvos
medidos e o total por modelo na janela.

`fn_personalizacao_uso_somar` é pura e não tem GRANT para cliente: quem grava é a API, como
`service_role`.

Revision ID: 20261103_14
Revises: 20261103_13
Create Date: 2026-11-03
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_14"
down_revision = "20261103_13"
branch_labels = None
depends_on = None


def _modulo(nome_arquivo: str):
    caminho = Path(__file__).with_name(nome_arquivo)
    spec = importlib.util.spec_from_file_location(f"_m_{caminho.stem}", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


SOMAR = """
ALTER TABLE public.personalizacao_job_targets ADD COLUMN IF NOT EXISTS uso_modelo jsonb;

COMMENT ON COLUMN public.personalizacao_job_targets.uso_modelo IS
  'Tokens gastos pelo modelo para gerar este alvo, somados entre tentativas (20261103_14). NULL: alvo anterior à medição ou geração que não chamou o microservice.';

-- Soma dois usos campo a campo e modelo a modelo. Valor que não é número conta como zero: o uso vem de
-- outro serviço, e um campo estranho não pode impedir a gravação.
CREATE OR REPLACE FUNCTION public.fn_personalizacao_uso_somar(p_a jsonb, p_b jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  WITH campos(c) AS (VALUES ('chamadas'), ('tokens_entrada'), ('tokens_saida'), ('caracteres')),
  num AS (
    SELECT CASE WHEN jsonb_typeof(v) = 'number' AND (v #>> '{}')::numeric > 0
                THEN round((v #>> '{}')::numeric) ELSE 0 END AS n, origem, c
      FROM campos,
           LATERAL (VALUES ('a', p_a -> c), ('b', p_b -> c)) AS x(origem, v)
  ),
  modelos AS (
    SELECT m.key AS modelo, m.value AS gasto
      FROM jsonb_each(CASE WHEN jsonb_typeof(p_a -> 'por_modelo') = 'object' THEN p_a -> 'por_modelo' ELSE '{}'::jsonb END) m
    UNION ALL
    SELECT m.key, m.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(p_b -> 'por_modelo') = 'object' THEN p_b -> 'por_modelo' ELSE '{}'::jsonb END) m
  ),
  por_modelo AS (
    SELECT modelo, c, sum(CASE WHEN jsonb_typeof(gasto -> c) = 'number' AND (gasto ->> c)::numeric > 0
                               THEN round((gasto ->> c)::numeric) ELSE 0 END) AS n
      FROM modelos, campos
     WHERE jsonb_typeof(gasto) = 'object'
     GROUP BY modelo, c
  )
  SELECT (SELECT jsonb_object_agg(c, total) FROM (SELECT c, sum(n) AS total FROM num GROUP BY c) t)
         || jsonb_build_object(
              'tentativas',
              COALESCE(CASE WHEN jsonb_typeof(p_a -> 'tentativas') = 'number' THEN (p_a ->> 'tentativas')::integer END,
                       CASE WHEN p_a IS NULL THEN 0 ELSE 1 END) + 1,
              'por_modelo',
              COALESCE((SELECT jsonb_object_agg(modelo, g)
                          FROM (SELECT modelo, jsonb_object_agg(c, n) AS g FROM por_modelo GROUP BY modelo) pm),
                       '{}'::jsonb));
$fn$;

REVOKE ALL ON FUNCTION public.fn_personalizacao_uso_somar(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
"""


DECLARE_ANTES = "  v_concl_antes numeric;\n"
DECLARE_DEPOIS = DECLARE_ANTES + """  v_tok_agora numeric;
  v_tok_antes numeric;
  v_medidos_agora integer;
  v_medidos_antes integer;
  v_custo jsonb;
"""

PROXY_FIM = "   WHERE t.created_at >= v_anterior AND t.created_at < v_fim AND t.status IN ('completed', 'failed');\n"
TOKENS = PROXY_FIM + """
  -- custo em tokens (20261103_14): só os alvos com uso gravado; os anteriores à medição vêm sem
  SELECT round(avg(u.tokens) FILTER (WHERE u.created_at >= v_inicio)),
         round(avg(u.tokens) FILTER (WHERE u.created_at < v_inicio)),
         count(*) FILTER (WHERE u.created_at >= v_inicio)::integer,
         count(*) FILTER (WHERE u.created_at < v_inicio)::integer
    INTO v_tok_agora, v_tok_antes, v_medidos_agora, v_medidos_antes
    FROM (SELECT t.created_at,
                 COALESCE((t.uso_modelo ->> 'tokens_entrada')::numeric, 0)
                   + COALESCE((t.uso_modelo ->> 'tokens_saida')::numeric, 0) AS tokens
            FROM public.personalizacao_job_targets t
           WHERE t.created_at >= v_anterior AND t.created_at < v_fim AND t.status IN ('completed', 'failed')
             AND t.uso_modelo IS NOT NULL) u;

  SELECT jsonb_build_object(
           'tokens_por_alvo', v_tok_agora,
           'tokens_por_alvo_anterior', v_tok_antes,
           'alvos_medidos', COALESCE(v_medidos_agora, 0),
           'alvos_medidos_anterior', COALESCE(v_medidos_antes, 0),
           'por_modelo', COALESCE((
             SELECT jsonb_object_agg(modelo, jsonb_build_object(
                      'chamadas', chamadas, 'tokens_entrada', entrada, 'tokens_saida', saida, 'caracteres', caracteres))
               FROM (SELECT m.key AS modelo,
                            sum(COALESCE((m.value ->> 'chamadas')::numeric, 0)) AS chamadas,
                            sum(COALESCE((m.value ->> 'tokens_entrada')::numeric, 0)) AS entrada,
                            sum(COALESCE((m.value ->> 'tokens_saida')::numeric, 0)) AS saida,
                            sum(COALESCE((m.value ->> 'caracteres')::numeric, 0)) AS caracteres
                       FROM public.personalizacao_job_targets t,
                            LATERAL jsonb_each(COALESCE(t.uso_modelo -> 'por_modelo', '{}'::jsonb)) m
                      WHERE t.created_at >= v_inicio AND t.created_at < v_fim AND t.uso_modelo IS NOT NULL
                      GROUP BY m.key) x), '{}'::jsonb))
    INTO v_custo;
"""

GATILHO_INICIO = "  -- ---------------------------------------------------------------- gatilho 4: custo por artefato (proxy)\n"
GATILHO_FIM = "  RETURN jsonb_build_object(\n"


def gatilho_em_tokens(minimo: int, crescimento: str) -> str:
    return f"""  -- ---------------------------------------------------------------- gatilho 4: custo por artefato
  -- Em tokens quando as duas janelas têm alvos medidos; senão, o proxy de execuções por alvo (20261102_22).
  IF COALESCE(v_medidos_agora, 0) >= {minimo} AND COALESCE(v_medidos_antes, 0) >= {minimo}
     AND v_tok_agora IS NOT NULL AND v_tok_antes IS NOT NULL THEN
    v_g_custo := CASE
      WHEN v_tok_agora > v_tok_antes * {crescimento}
        AND COALESCE(v_concl_agora, 0) <= COALESCE(v_concl_antes, 0) THEN jsonb_build_object(
        'estado', 'alerta',
        'detalhe', format('Tokens por alvo subiram de %s para %s sem a taxa de conclusão subir.', v_tok_antes, v_tok_agora))
      ELSE jsonb_build_object(
        'estado', 'ok',
        'detalhe', format('Tokens por alvo: %s (janela anterior: %s), em %s alvos medidos.', v_tok_agora, v_tok_antes, v_medidos_agora))
    END;
  ELSE
    v_g_custo := CASE
      WHEN COALESCE(v_alvos_agora, 0) < {minimo} OR COALESCE(v_alvos_antes, 0) < {minimo}
        OR v_custo_antes IS NULL OR v_custo_agora IS NULL THEN jsonb_build_object(
        'estado', 'sem_dado',
        'detalhe', 'Poucos alvos finalizados para comparar com a janela anterior.')
      WHEN v_custo_agora > v_custo_antes * {crescimento}
        AND COALESCE(v_concl_agora, 0) <= COALESCE(v_concl_antes, 0) THEN jsonb_build_object(
        'estado', 'alerta',
        'detalhe', format('Execuções por alvo subiram de %s para %s sem a taxa de conclusão subir. Proxy: ainda há poucos alvos com tokens gravados.', v_custo_antes, v_custo_agora))
      ELSE jsonb_build_object(
        'estado', 'ok',
        'detalhe', format('Execuções por alvo: %s (janela anterior: %s). Proxy: ainda há poucos alvos com tokens gravados.', v_custo_agora, v_custo_antes))
    END;
  END IF;

"""


RETORNO_ANTES = "    'invariantes', v_invariantes,\n"
RETORNO_DEPOIS = "    'custo', v_custo,\n" + RETORNO_ANTES


def painel_sql() -> str:
    original = _modulo("20261102_22_painel_tecnico.py")
    sql = original.FUNCAO
    for antes, depois in (
        (DECLARE_ANTES, DECLARE_DEPOIS),
        (PROXY_FIM, TOKENS),
        (RETORNO_ANTES, RETORNO_DEPOIS),
    ):
        if sql.count(antes) != 1:
            raise RuntimeError(f"trecho de painel_tecnico nao encontrado exatamente uma vez: {antes!r}")
        sql = sql.replace(antes, depois)
    inicio = sql.index(GATILHO_INICIO)
    fim = sql.index(GATILHO_FIM, inicio)
    return sql[:inicio] + gatilho_em_tokens(original.MINIMO_DE_ALVOS, original.CRESCIMENTO_CUSTO) + sql[fim:]


def upgrade() -> None:
    op.execute(SOMAR)
    op.execute(painel_sql())


def downgrade() -> None:
    op.execute(_modulo("20261102_22_painel_tecnico.py").FUNCAO)
    op.execute("DROP FUNCTION IF EXISTS public.fn_personalizacao_uso_somar(jsonb, jsonb)")
    op.execute("ALTER TABLE public.personalizacao_job_targets DROP COLUMN IF EXISTS uso_modelo")

"""Missões da IA: registrar contagens e motivos dos descartes, sem guardar o texto

Na primeira geração real (#857), a tabela guardava só `quantidade` e `gerados`.
Não dava para distinguir uma resposta curta do modelo de itens descartados pelo
banco. Esta migração registra, por tentativa, as contagens e o motivo agregado
de cada descarte. O texto das propostas não é copiado para o diagnóstico.

A função antiga de duas entradas continua disponível para compatibilidade com
uma API antiga durante o deploy. A API nova chama a função de três entradas,
que também recebe quantas propostas o modelo devolveu antes do corte local.
`missoes_ia_execucoes` é interna: RLS ligada, nenhuma policy para clientes,
SELECT somente para `service_role`; a função `SECURITY DEFINER` grava o log.

Revision ID: 20261103_11
Revises: 20261103_10
Create Date: 2026-11-03
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_11"
down_revision = "20261103_10"
branch_labels = None
depends_on = None


def _modulo(nome_arquivo: str):
    caminho = Path(__file__).with_name(nome_arquivo)
    spec = importlib.util.spec_from_file_location(f"_m_{caminho.stem}", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


TABELA = """
CREATE TABLE public.missoes_ia_execucoes (
  id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id                  uuid NOT NULL REFERENCES public.missoes_ia_pedidos (id) ON DELETE CASCADE,
  tentativa                  integer NOT NULL CHECK (tentativa >= 1),
  propostas_modelo           integer CHECK (propostas_modelo IS NULL OR propostas_modelo >= 0),
  propostas_enviadas         integer NOT NULL CHECK (propostas_enviadas >= 0),
  propostas_processadas      integer NOT NULL CHECK (propostas_processadas >= 0),
  propostas_aceitas          integer NOT NULL CHECK (propostas_aceitas >= 0),
  propostas_descartadas      integer NOT NULL CHECK (propostas_descartadas >= 0),
  motivos_descarte           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(motivos_descarte) = 'object'),
  propostas_nao_processadas  integer NOT NULL CHECK (propostas_nao_processadas >= 0),
  propostas_nao_enviadas     integer NOT NULL CHECK (propostas_nao_enviadas >= 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missoes_ia_execucoes_pedido_tentativa_uq UNIQUE (pedido_id, tentativa),
  CONSTRAINT missoes_ia_execucoes_processadas_ck
    CHECK (propostas_processadas + propostas_nao_processadas = propostas_enviadas),
  CONSTRAINT missoes_ia_execucoes_resultado_ck
    CHECK (propostas_aceitas + propostas_descartadas = propostas_processadas)
);

ALTER TABLE public.missoes_ia_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.missoes_ia_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.missoes_ia_execucoes TO service_role;
"""

INICIO = "CREATE OR REPLACE FUNCTION public.fn_missao_ia_registrar("
FIM = "GRANT EXECUTE ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) TO service_role;\n"


def _registrar_base() -> str:
    modulo = _modulo("20261103_10_missao_ia_metrica_pendente.py")
    return modulo.registrar_sql()


def registrar_diagnostico_sql() -> str:
    sql = _registrar_base()
    inicio = sql.index(INICIO)
    fim = sql.index(FIM, inicio) + len(FIM)
    sql = sql[inicio:fim]
    sql = sql.replace("fn_missao_ia_registrar", "fn_missao_ia_registrar_diagnostico")

    assinatura = "p_pedido_id uuid, p_propostas jsonb)"
    if sql.count(assinatura) != 1:
        raise RuntimeError("assinatura da função base não encontrada exatamente uma vez")
    sql = sql.replace(assinatura, "p_pedido_id uuid, p_propostas jsonb, p_propostas_modelo integer)")

    acl = "fn_missao_ia_registrar_diagnostico(uuid, jsonb)"
    if sql.count(acl) != 2:
        raise RuntimeError("GRANT/REVOKE da função base não encontrados")
    sql = sql.replace(acl, "fn_missao_ia_registrar_diagnostico(uuid, jsonb, integer)")

    def trocar(antes: str, depois: str, esperado: int = 1) -> None:
        nonlocal sql
        if sql.count(antes) != esperado:
            raise RuntimeError(f"trecho SQL não encontrado {esperado} vez(es): {antes!r}")
        sql = sql.replace(antes, depois)

    trocar(
        "  v_metricas text[] := ARRAY[]::text[];\n",
        """  v_metricas text[] := ARRAY[]::text[];
  v_metricas_pendentes text[] := ARRAY[]::text[];
  v_descartes text[] := ARRAY[]::text[];
  v_descartes_json jsonb;
  v_enviadas integer;
  v_processadas integer := 0;
  v_nao_processadas integer := 0;
""",
    )
    trocar(
        "  IF NOT FOUND OR v_ped.status <> 'pendente' THEN\n    RETURN 0;\n  END IF;",
        "  IF NOT FOUND OR v_ped.status <> 'pendente' THEN\n    RETURN -1;\n  END IF;",
    )
    trocar(
        "  IF p_propostas IS NULL OR jsonb_typeof(p_propostas) <> 'array' THEN\n"
        "    RAISE EXCEPTION 'propostas deve ser uma lista' USING ERRCODE = '22023';\n  END IF;",
        "  IF p_propostas IS NULL OR jsonb_typeof(p_propostas) <> 'array' THEN\n"
        "    RAISE EXCEPTION 'propostas deve ser uma lista' USING ERRCODE = '22023';\n  END IF;\n"
        "  IF p_propostas_modelo IS NOT NULL AND\n"
        "     (p_propostas_modelo < 0 OR p_propostas_modelo < jsonb_array_length(p_propostas)) THEN\n"
        "    RAISE EXCEPTION 'quantidade de propostas do modelo incoerente' USING ERRCODE = '22023';\n  END IF;",
    )
    trocar(
        "   AND m.criterio ->> 'metrica' IS NOT NULL;\n\n  FOR v_item",
        "   AND m.criterio ->> 'metrica' IS NOT NULL;\n"
        "  v_metricas_pendentes := v_metricas;\n\n  v_enviadas := jsonb_array_length(p_propostas);\n"
        "  FOR v_item",
    )
    trocar(
        "  FOR v_item IN SELECT * FROM jsonb_array_elements(p_propostas) LOOP\n"
        "    EXIT WHEN v_gerados >= v_ped.quantidade;\n"
        "    IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;",
        "  FOR v_item IN SELECT * FROM jsonb_array_elements(p_propostas) LOOP\n"
        "    IF v_gerados >= v_ped.quantidade THEN\n"
        "      v_nao_processadas := v_nao_processadas + 1;\n"
        "      CONTINUE;\n"
        "    END IF;\n"
        "    v_processadas := v_processadas + 1;\n"
        "    IF jsonb_typeof(v_item) <> 'object' THEN\n"
        "      v_descartes := array_append(v_descartes, 'formato_invalido');\n"
        "      CONTINUE;\n"
        "    END IF;",
    )
    trocar(
        "    IF char_length(v_titulo) NOT BETWEEN 3 AND 80 THEN CONTINUE; END IF;",
        "    IF char_length(v_titulo) NOT BETWEEN 3 AND 80 THEN\n"
        "      v_descartes := array_append(v_descartes, 'titulo_fora_limite'); CONTINUE; END IF;",
    )
    trocar(
        "    IF char_length(v_desc) NOT BETWEEN 10 AND 500 THEN CONTINUE; END IF;",
        "    IF char_length(v_desc) NOT BETWEEN 10 AND 500 THEN\n"
        "      v_descartes := array_append(v_descartes, 'descricao_fora_limite'); CONTINUE; END IF;",
    )
    trocar(
        r"    IF (v_titulo || ' ' || v_desc || ' ' || coalesce(v_base, '')) ~* '(https?://|www\.|@[a-z0-9])' THEN CONTINUE; END IF;",
        r"    IF (v_titulo || ' ' || v_desc || ' ' || coalesce(v_base, '')) ~* '(https?://|www\.|@[a-z0-9])' THEN"
        "\n      v_descartes := array_append(v_descartes, 'link_ou_email'); CONTINUE; END IF;",
    )
    trocar(
        "    IF v_chave = ANY (v_vistos) THEN CONTINUE; END IF;",
        "    IF v_chave = ANY (v_vistos) THEN\n"
        "      v_descartes := array_append(v_descartes, 'titulo_repetido'); CONTINUE; END IF;",
    )
    trocar(
        "    IF NOT FOUND THEN CONTINUE; END IF;\n"
        "    IF v_cat.metrica = ANY (v_metricas) THEN CONTINUE; END IF;",
        "    IF NOT FOUND THEN\n"
        "      v_descartes := array_append(v_descartes, 'metrica_fora_catalogo'); CONTINUE; END IF;\n"
        "    IF v_cat.metrica = ANY (v_metricas_pendentes) THEN\n"
        "      v_descartes := array_append(v_descartes, 'metrica_ja_pendente'); CONTINUE; END IF;\n"
        "    IF v_cat.metrica = ANY (v_metricas) THEN\n"
        "      v_descartes := array_append(v_descartes, 'metrica_repetida_no_pedido'); CONTINUE; END IF;",
    )
    trocar(
        "    EXCEPTION WHEN OTHERS THEN\n      CONTINUE;\n    END;",
        "    EXCEPTION WHEN OTHERS THEN\n"
        "      v_descartes := array_append(v_descartes, 'alvo_invalido'); CONTINUE;\n    END;",
    )
    trocar(
        "    IF v_alvo IS NULL OR v_alvo <> trunc(v_alvo) OR v_alvo < 1 OR v_alvo > v_cat.maximo THEN CONTINUE; END IF;",
        "    IF v_alvo IS NULL OR v_alvo <> trunc(v_alvo) OR v_alvo < 1 OR v_alvo > v_cat.maximo THEN\n"
        "      v_descartes := array_append(v_descartes, 'alvo_invalido'); CONTINUE; END IF;",
    )
    trocar(
        "  IF v_gerados = 0 THEN\n"
        "    RAISE EXCEPTION 'o modelo não trouxe nenhuma proposta válida' USING ERRCODE = '22023';\n"
        "  END IF;",
        """  SELECT coalesce(jsonb_object_agg(d.motivo, d.quantidade), '{}'::jsonb)
    INTO v_descartes_json
    FROM (
      SELECT u.motivo, count(*)::integer AS quantidade
        FROM unnest(v_descartes) AS u(motivo)
       GROUP BY u.motivo
    ) d;

  INSERT INTO public.missoes_ia_execucoes
    (pedido_id, tentativa, propostas_modelo, propostas_enviadas, propostas_processadas,
     propostas_aceitas, propostas_descartadas, motivos_descarte,
     propostas_nao_processadas, propostas_nao_enviadas)
  VALUES
    (v_ped.id, GREATEST(v_ped.tentativas, 1), p_propostas_modelo, v_enviadas, v_processadas,
     v_gerados, v_processadas - v_gerados, v_descartes_json, v_nao_processadas,
     CASE WHEN p_propostas_modelo IS NULL THEN 0
          ELSE GREATEST(p_propostas_modelo - v_enviadas, 0) END);

  -- O diagnóstico precisa sobreviver mesmo quando tudo é descartado. O worker
  -- confirma esta transação e registra a falha/retry numa transação separada.
  IF v_gerados = 0 THEN
    RETURN 0;
  END IF;""",
    )
    return sql


WRAPPER = """
CREATE OR REPLACE FUNCTION public.fn_missao_ia_registrar(p_pedido_id uuid, p_propostas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_gerados integer;
BEGIN
  v_gerados := public.fn_missao_ia_registrar_diagnostico(p_pedido_id, p_propostas, NULL);
  IF v_gerados < 0 THEN
    RETURN 0;
  END IF;
  IF v_gerados = 0 THEN
    RAISE EXCEPTION 'o modelo não trouxe nenhuma proposta válida' USING ERRCODE = '22023';
  END IF;
  RETURN v_gerados;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) TO service_role;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(registrar_diagnostico_sql())
    op.execute(WRAPPER)


def downgrade() -> None:
    modulo = _modulo("20261103_10_missao_ia_metrica_pendente.py")
    op.execute(modulo.registrar_sql())
    op.execute("DROP FUNCTION IF EXISTS public.fn_missao_ia_registrar_diagnostico(uuid, jsonb, integer)")
    op.execute("DROP TABLE IF EXISTS public.missoes_ia_execucoes")

"""Missão da IA: a mesma métrica não volta enquanto outra igual espera o professor

Primeira geração real em produção (03/11, #857): dois pedidos da mesma turma ficaram na fila durante a
queda da API e foram processados na mesma passada do worker. Cada um leva as pendentes da turma em
`missoes_existentes`, mas nenhum viu o outro, e o professor recebeu "Estude por 10 dias seguidos" e
"Mantenha o foco por 5 dias seguidos": a mesma métrica, só com outro alvo.

`fn_missao_ia_registrar` já descartava título repetido. Agora descarta também a proposta cuja métrica
já está numa missão da IA pendente da turma, ou numa proposta aceita antes no mesmo pedido. O prompt
já pede para não repetir; o banco garante, porque a corrida entre pedidos não passa pelo modelo.

Só as pendentes contam. Missão aprovada com a mesma métrica continua aceita: "7 dias seguidos"
cumprida e depois "14 dias seguidos" é progressão, não repetição.

Se tudo o que o modelo trouxe cair nessa regra, o pedido segue o caminho que já existia para
"nenhuma proposta válida": `fn_missao_ia_falhou` espaça e tenta de novo, e a nova tentativa vê as
pendentes no contexto.

Só o corpo da função muda: mesma assinatura, mesmos GRANT/REVOKE, nenhuma tabela ou policy.

Revision ID: 20261103_10
Revises: 20261103_09
Create Date: 2026-11-03
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_10"
down_revision = "20261103_09"
branch_labels = None
depends_on = None


def _modulo(nome_arquivo: str):
    caminho = Path(__file__).with_name(nome_arquivo)
    spec = importlib.util.spec_from_file_location(f"_m_{caminho.stem}", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


INICIO = "CREATE OR REPLACE FUNCTION public.fn_missao_ia_registrar("
FIM = "GRANT EXECUTE ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) TO service_role;\n"

DECLARE_ANTES = "  v_vistos  text[] := ARRAY[]::text[];\n"
DECLARE_DEPOIS = DECLARE_ANTES + "  v_metricas text[] := ARRAY[]::text[];\n"

PENDENTES_ANTES = "  FOR v_item IN SELECT * FROM jsonb_array_elements(p_propostas) LOOP\n"
PENDENTES_DEPOIS = """  -- Métricas que já esperam o professor nesta turma (20261103_10): dois pedidos processados na mesma
  -- passada não se veem pelo contexto do modelo, e só o banco enxerga os dois.
  SELECT coalesce(array_agg(DISTINCT m.criterio ->> 'metrica'), ARRAY[]::text[])
    INTO v_metricas
    FROM public.missoes m
   WHERE m.classe_id = v_ped.classe_id AND m.origem = 'ia' AND m.aprovacao = 'pendente'
     AND m.criterio ->> 'metrica' IS NOT NULL;

""" + PENDENTES_ANTES

CATALOGO_ANTES = "    IF NOT FOUND THEN CONTINUE; END IF;\n    BEGIN\n"
CATALOGO_DEPOIS = (
    "    IF NOT FOUND THEN CONTINUE; END IF;\n"
    "    IF v_cat.metrica = ANY (v_metricas) THEN CONTINUE; END IF;\n"
    "    BEGIN\n"
)

ACEITA_ANTES = "    v_vistos := v_vistos || v_chave;\n"
ACEITA_DEPOIS = ACEITA_ANTES + "    v_metricas := v_metricas || v_cat.metrica;\n"


def _funcao_original() -> str:
    worker = _modulo("20261102_20_missoes_sugeridas_pela_ia.py").WORKER
    inicio = worker.index(INICIO)
    fim = worker.index(FIM, inicio) + len(FIM)
    return worker[inicio:fim]


def registrar_sql() -> str:
    sql = _funcao_original()
    for antes, depois in (
        (DECLARE_ANTES, DECLARE_DEPOIS),
        (PENDENTES_ANTES, PENDENTES_DEPOIS),
        (CATALOGO_ANTES, CATALOGO_DEPOIS),
        (ACEITA_ANTES, ACEITA_DEPOIS),
    ):
        if sql.count(antes) != 1:
            raise RuntimeError(f"trecho de fn_missao_ia_registrar nao encontrado exatamente uma vez: {antes!r}")
        sql = sql.replace(antes, depois)
    return sql


def upgrade() -> None:
    op.execute(registrar_sql())


def downgrade() -> None:
    op.execute(_funcao_original())

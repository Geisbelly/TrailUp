"""Monitor: desafios automáticos parados por edge ou Gemini fora viram degradação, com e-mail e sino

## O que faltava

Desde a #1170, o `desafios_auto_loop` não queima tentativa quando o erro não é do conteúdo (edge
recusando o servidor, Gemini fora, chave inválida, rede): grava `esperando` com
`fn_desafios_auto_falhou(..., espera_min)`, e o conteúdo volta em 60 min. É o certo para a fila, mas
deixa a pane muda: nenhum conteúdo falha, nenhum desafio sai, e o único rastro é um `ERROR` no log
da API, que ninguém lê sozinho. A pane mais provável é a de deploy: a API publica pelo sync do
espelho e a edge só ganha deploy manual depois, e nessa janela a edge antiga recusa o servidor.

## O que muda

`fn_monitor_sinal_desafios_auto()` olha `desafios_auto_tentativas` na janela
(`monitor_config.desafios_auto.janela_min`, 120 por padrão) e abre a degradação `desafios_auto` quando:

- ao menos `minimo` (2) conteúdos foram tocados em `esperando` com erro que não é `429 ...`; e
- nenhum conteúdo saiu como `gerado` ou `sem_desafio` na mesma janela.

O `429` fica de fora porque é a espera prevista: limite por minuto (15 min) e cota do dia (até a
virada do Pacífico), que no tier free é rotina e não pane. `falhou` não fecha nem abre: é erro do
próprio conteúdo, e uma falha solta no meio da pane não prova que a edge voltou. Só um desafio
gerado (ou um `sem_desafio`, que também é a edge respondendo) fecha o incidente.

Sem nada tocado na janela (fila vazia, laço desligado, API fora), o sinal é `NULL`: não abre nem
fecha. API fora já é queda do alvo `api`, e fila vazia não diz nada sobre a edge.

A janela de 120 min cobre a espera de 60 min com folga: durante a pane, cada conteúdo volta e é
regravado em `esperando` a cada hora, e a passada para no primeiro, então a janela sempre vê os
conteúdos da pane. O texto do aviso leva só o último `erro` (`"<status> <code>"`, que a API já
limpa do material) e a contagem: nenhum id nem texto de conteúdo.

O tick passa a chamar o sinal a cada 10 min (`v_minuto % 10 = 0`, o mesmo compasso das leituras
lentas e do laço), num bloco próprio: erro dele vira `WARNING` e o tick segue. O tick é o da
`20261105_09`, recortado do texto dela com uma âncora só (o corpo em produção foi conferido igual
ao do repositório em 21/11/2026, por `md5(prosrc)`).

## Quem pode chamar

`SECURITY DEFINER`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, como as outras do monitor:
só o tick (como `postgres`) e o `service_role`.

O downgrade volta o tick antigo **antes** de dropar a função, e fecha um incidente aberto.

Revision ID: 20261121_05
Revises: 20261121_04
Create Date: 2026-11-21
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261121_05"
down_revision = "20261121_04"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_21_05", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M09 = _modulo("20261105_09_monitor_de_disponibilidade.py")


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


def _recortar_tick() -> str:
    inicio = M09.NUCLEO.index("CREATE OR REPLACE FUNCTION public.fn_monitor_tick()")
    corpo = M09.NUCLEO.index("AS $fn$", inicio)
    fim = M09.NUCLEO.index("$fn$;", corpo + len("AS $fn$")) + len("$fn$;")
    return M09.NUCLEO[inicio:fim] + "\n"


TICK_ANTIGO = _recortar_tick()

TICK_NOVO = _trocar(
    TICK_ANTIGO,
    """  BEGIN
    v_disparadas := public.fn_monitor_disparar();""",
    """  IF v_minuto % 10 = 0 THEN
    BEGIN
      PERFORM public.fn_monitor_sinal_desafios_auto();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monitor: desafios: %', SQLERRM;
    END;
  END IF;
  BEGIN
    v_disparadas := public.fn_monitor_disparar();""",
)

SINAL = """
CREATE OR REPLACE FUNCTION public.fn_monitor_sinal_desafios_auto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cfg jsonb := public.fn_monitor_cfg() -> 'desafios_auto';
  v_jan integer := greatest(coalesce((v_cfg ->> 'janela_min')::integer, 120), 1);
  v_minimo integer := greatest(coalesce((v_cfg ->> 'minimo')::integer, 2), 1);
  v_parados integer;
  v_saiu integer;
  v_falhou integer;
  v_ultimo text;
  v_ruim boolean;
BEGIN
  SELECT count(*) FILTER (WHERE t.estado = 'esperando' AND t.erro IS NOT NULL AND t.erro NOT LIKE '429 %'),
         count(*) FILTER (WHERE t.estado IN ('gerado', 'sem_desafio')),
         count(*) FILTER (WHERE t.estado = 'falhou')
    INTO v_parados, v_saiu, v_falhou
    FROM public.desafios_auto_tentativas t
   WHERE t.atualizado_em >= now() - make_interval(mins => v_jan);

  SELECT t.erro INTO v_ultimo
    FROM public.desafios_auto_tentativas t
   WHERE t.estado = 'esperando' AND t.erro IS NOT NULL AND t.erro NOT LIKE '429 %'
     AND t.atualizado_em >= now() - make_interval(mins => v_jan)
   ORDER BY t.atualizado_em DESC
   LIMIT 1;

  v_ruim := CASE
    WHEN v_saiu > 0 THEN false
    WHEN v_parados >= v_minimo THEN true
    ELSE NULL
  END;

  PERFORM public.fn_monitor_sinal(
    'desafios_auto', 'degradacao', v_ruim,
    format('%s conteúdos esperando sem culpa e nenhum desafio gerado em %s min', v_parados, v_jan),
    '[TrailUp] Desafios automáticos parados',
    format(E'%s conteúdos dos desafios automáticos estão esperando por um erro que não é deles, e nenhum desafio saiu nos últimos %s min (%s falharam por conta própria).\\nÚltimo erro: %s.\\nCostuma ser a generate-content-ai sem deploy depois da API (recusa o servidor) ou o Gemini recusando as chaves ou o modelo. Os conteúdos não perdem tentativa enquanto isso: voltam sozinhos quando a edge responder. O log da API tem um aviso por passada.',
           v_parados, v_jan, v_falhou, coalesce(v_ultimo, 'sem registro')),
    '[TrailUp] Desafios automáticos voltaram a sair');
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_monitor_sinal_desafios_auto() FROM PUBLIC, anon, authenticated;
"""

DROP_SINAL = """
UPDATE public.monitor_incidente
   SET fim = now()
 WHERE alvo_id = 'desafios_auto' AND tipo = 'degradacao' AND fim IS NULL;
DROP FUNCTION IF EXISTS public.fn_monitor_sinal_desafios_auto();
"""


def upgrade() -> None:
    op.execute(SINAL)
    op.execute(TICK_NOVO)


def downgrade() -> None:
    op.execute(TICK_ANTIGO)
    op.execute(DROP_SINAL)

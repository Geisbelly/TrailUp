"""Deploy curto sai da conta do monitor: a falha que termina numa versão nova vira sonda marcada

Cada deploy da API derruba o serviço por um minuto ou dois, e essas sondas contavam contra a meta como se
fosse queda. Agora, quando a sonda boa chega com versão diferente da anterior e a sequência de falhas que
ela encerra começou há no máximo `deploy_janela_min` minutos (5 por padrão), essas sondas passam a
`ok = NULL` e `motivo = 'deploy'`. `ok` nulo já não conta em nenhuma medida, então o painel, a instabilidade
e o orçamento mudam sem reescrever nenhuma consulta. `status` fica, como evidência.

O que continua contando, de propósito:

- sequência maior que a janela: deploy que demora é indisponibilidade para quem está usando;
- versão igual: é crash com restart, não deploy;
- primeira versão vista ou resposta sem versão: sem antes e depois não há prova de deploy.

A queda já aberta (3 falhas seguidas) não é apagada, porque só se sabe que foi deploy quando o serviço
volta, e o aviso já saiu. O incidente passa a dizer `motivo = 'deploy'`. As sondas entram na conta do
painel como `minutos_deploy`, para a exclusão ficar visível.

A API não recebe o commit no build (o Dokploy não o repassa), então `fn_monitor_versao` passa a aceitar
também `details.imagem`, o carimbo gravado no `Dockerfile`. Imagem nova muda o carimbo e restart não. O
histórico não é reclassificado: sonda antiga não guardou versão.

Revision ID: 20261105_26
Revises: 20261105_25
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261105_26"
down_revision = "20261105_25"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

VERSAO_ANTIGA_SQL = """  SELECT left((regexp_match(coalesce(p_conteudo, ''), '"build_commit"\\s*:\\s*"([0-9a-f]{7,40})"'))[1], 12);"""
VERSAO_NOVA_SQL = """  SELECT left(coalesce(
    (regexp_match(coalesce(p_conteudo, ''), '"build_commit"\\s*:\\s*"([0-9a-f]{7,40})"'))[1],
    (regexp_match(coalesce(p_conteudo, ''), '"imagem"\\s*:\\s*"([0-9a-f]{16,40})"'))[1]
  ), 12);"""

DECLARE_ANTIGO = """  v_instavel boolean;
BEGIN
  SELECT * INTO v_a FROM public.monitor_alvo WHERE id = p_alvo FOR UPDATE;"""
DECLARE_NOVO = """  v_instavel boolean;
  v_janela_deploy integer := coalesce((v_cfg ->> 'deploy_janela_min')::integer, 5);
BEGIN
  SELECT * INTO v_a FROM public.monitor_alvo WHERE id = p_alvo FOR UPDATE;"""

VERSAO_ANTIGA_PLPGSQL = """  IF p_versao IS NOT NULL AND p_versao IS DISTINCT FROM v_a.ultima_versao THEN
    v_a.ultima_versao := p_versao;"""
VERSAO_NOVA_PLPGSQL = """  -- Precisa vir antes de atualizar a versão e de zerar `primeira_falha_em`, logo abaixo.
  IF p_motivo IS NULL AND p_versao IS NOT NULL AND v_a.ultima_versao IS NOT NULL
     AND p_versao IS DISTINCT FROM v_a.ultima_versao
     AND v_a.primeira_falha_em IS NOT NULL
     AND p_em - v_a.primeira_falha_em <= make_interval(mins => v_janela_deploy) THEN
    UPDATE public.monitor_sonda s
       SET ok = NULL, motivo = 'deploy'
     WHERE s.alvo_id = v_a.id AND s.ok IS FALSE
       AND s.enviada_em >= v_a.primeira_falha_em AND s.enviada_em < p_em;
    UPDATE public.monitor_incidente i
       SET motivo = 'deploy'
     WHERE i.alvo_id = v_a.id AND i.tipo = 'queda' AND i.fim IS NULL;
  END IF;

  IF p_versao IS NOT NULL AND p_versao IS DISTINCT FROM v_a.ultima_versao THEN
    v_a.ultima_versao := p_versao;"""

AULA_ANTIGA = """           count(*) FILTER (WHERE s.ok) AS boas
      FROM public.monitor_sonda s
     WHERE s.enviada_em >= v_slo_inicio AND s.em_aula"""
AULA_NOVA = """           count(*) FILTER (WHERE s.ok) AS boas,
           count(*) FILTER (WHERE s.motivo = 'deploy') AS deploy
      FROM public.monitor_sonda s
     WHERE s.enviada_em >= v_slo_inicio AND s.em_aula"""

FORA_ANTIGO = """           'minutos_fora_aula', (coalesce(au.medidas, 0) - coalesce(au.boas, 0)) * b.intervalo_aula_min,
"""
FORA_NOVO = FORA_ANTIGO + """           'minutos_deploy', coalesce(au.deploy, 0) * b.intervalo_aula_min,
"""

REMARCAR = "UPDATE public.monitor_sonda SET ok = false WHERE motivo = 'deploy';"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:-3]}_para_05_26", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _funcao(fonte: str, nome: str) -> str:
    achado = re.search(rf"CREATE OR REPLACE FUNCTION public\.{nome}\(.*?\$fn\$;", fonte, re.DOTALL)
    if not achado:
        raise RuntimeError(f"{nome} não encontrada; revise a 20261105_26")
    return achado.group(0)


def _trocar(texto: str, antigo: str, novo: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError("o texto de origem mudou de forma; revise a 20261105_26")
    return texto.replace(antigo, novo)


def versao_antiga() -> str:
    m = _modulo("20261105_09_monitor_de_disponibilidade.py")
    return _funcao(m.PURAS, "fn_monitor_versao")


def aplicar_antiga() -> str:
    m = _modulo("20261105_09_monitor_de_disponibilidade.py")
    return _funcao(m.NUCLEO, "fn_monitor_aplicar")


def painel_antigo() -> str:
    m = _modulo("20261105_10_painel_disponibilidade.py")
    return _funcao(m.PAINEL, "painel_disponibilidade")


def versao_nova() -> str:
    return _trocar(versao_antiga(), VERSAO_ANTIGA_SQL, VERSAO_NOVA_SQL)


def aplicar_nova() -> str:
    texto = _trocar(aplicar_antiga(), DECLARE_ANTIGO, DECLARE_NOVO)
    return _trocar(texto, VERSAO_ANTIGA_PLPGSQL, VERSAO_NOVA_PLPGSQL)


def painel_novo() -> str:
    texto = _trocar(painel_antigo(), AULA_ANTIGA, AULA_NOVA)
    return _trocar(texto, FORA_ANTIGO, FORA_NOVO)


def upgrade() -> None:
    op.execute(versao_nova())
    op.execute(aplicar_nova())
    op.execute(painel_novo())


def downgrade() -> None:
    op.execute(versao_antiga())
    op.execute(aplicar_antiga())
    op.execute(painel_antigo())
    op.execute(REMARCAR)

"""Monitor vale 24 horas: a meta e as sondas deixam de depender de horário de aula

O TrailUp é um app, e a janela de segunda a sexta, das 07:00 às 22:00, deixava queda de madrugada e de
fim de semana fora da meta. Agora vale todo minuto de todo dia, com sonda de 1 min nos três alvos.

A regra não foi reescrita: `aula` passa a cobrir tudo (`dias` 1 a 7, de `00:00` a `24:00`, que o Postgres
aceita em `time`), e `fn_monitor_em_aula`, `fn_monitor_minutos_aula` e `painel_disponibilidade` seguem
iguais. Os nomes `aula` e `em_aula` ficam só por dentro: renomear reescreveria funções já testadas, e
`monitor_sonda.em_aula` guarda o que cada sonda registrou ao sair.

`fn_monitor_cfg` também muda, porque o padrão dela entra quando a linha de `app_config` falta ou está
inválida, e nesse caso a janela antiga voltaria em silêncio. `slo_24x7` sai: era o número informativo ao
lado da meta, e agora os dois seriam o mesmo.

A sonda sem resposta continua não contando, e o orçamento passa a sair de todos os minutos desde a
primeira sonda. A retenção de 35 dias com três alvos a cada minuto dá cerca de 151 mil linhas em
`monitor_sonda`.

Revision ID: 20261105_19
Revises: 20261105_18
Create Date: 2026-11-05
"""

from __future__ import annotations

import copy
import importlib.util
import json
import re
from pathlib import Path

from alembic import op

revision = "20261105_19"
down_revision = "20261105_18"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

SEMPRE = {"dias": [1, 2, 3, 4, 5, 6, 7], "inicio": "00:00", "fim": "24:00", "sem_aula": []}


def _monitor():
    nome = "20261105_09_monitor_de_disponibilidade.py"
    spec = importlib.util.spec_from_file_location("m_20261105_09_para_05_19", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _funcao_de_config(config: dict) -> str:
    """`fn_monitor_cfg` com outro padrão, tirada do texto da `_09` para não divergir dela."""
    achado = re.search(
        r"CREATE OR REPLACE FUNCTION public\.fn_monitor_cfg\(\).*?\$fn\$;", _monitor().NUCLEO, re.DOTALL
    )
    if not achado or "__CONFIG__" not in achado.group(0):
        raise RuntimeError("fn_monitor_cfg mudou de forma; revise a 20261105_19")
    return achado.group(0).replace("__CONFIG__", json.dumps(config, ensure_ascii=False))


def config_nova() -> dict:
    config = copy.deepcopy(_monitor().CONFIG_PADRAO)
    config["aula"] = dict(SEMPRE)
    del config["slo_24x7"]
    return config


def linha_nova() -> str:
    return f"""
UPDATE public.app_config
   SET valor = ((valor::jsonb - 'slo_24x7')
                || jsonb_build_object('aula', CAST('{json.dumps(SEMPRE)}' AS jsonb)))::text
 WHERE chave = 'monitor_config';
"""


def linha_antiga() -> str:
    antiga = _monitor().CONFIG_PADRAO
    return f"""
UPDATE public.app_config
   SET valor = (valor::jsonb
                || jsonb_build_object('aula', CAST('{json.dumps(antiga["aula"])}' AS jsonb))
                || jsonb_build_object('slo_24x7', {antiga["slo_24x7"]}))::text
 WHERE chave = 'monitor_config';
"""


ALVOS_1_MIN = "UPDATE public.monitor_alvo SET intervalo_min = 1 WHERE id IN ('console', 'web_aluno');"
ALVOS_5_MIN = "UPDATE public.monitor_alvo SET intervalo_min = 5 WHERE id IN ('console', 'web_aluno');"


def upgrade() -> None:
    op.execute(_funcao_de_config(config_nova()))
    op.execute(linha_nova())
    op.execute(ALVOS_1_MIN)


def downgrade() -> None:
    op.execute(_funcao_de_config(_monitor().CONFIG_PADRAO))
    op.execute(linha_antiga())
    op.execute(ALVOS_5_MIN)

"""`20261105_19` num Postgres descartável: madrugada e domingo contam, e toda sonda roda a cada minuto."""

import os

import pytest

from tests.test_e2e_monitor_disponibilidade import DONO, EMAIL_DONO, _como, _modulo, banco, colher, sonda  # noqa: F401

pytestmark = pytest.mark.skipif(
    os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker"
)

M = _modulo("20261105_19_monitor_24_horas.py")


def aplicar(c):
    c.execute(M._funcao_de_config(M.config_nova()))
    c.execute(M.linha_nova())
    c.execute(M.ALVOS_1_MIN)


def reverter(c):
    c.execute(M._funcao_de_config(M._monitor().CONFIG_PADRAO))
    c.execute(M.linha_antiga())
    c.execute(M.ALVOS_5_MIN)


def janela(c):
    return c.execute("SELECT public.fn_monitor_cfg() -> 'aula'").fetchone()[0]


def em_aula(c, instante):
    return c.execute(
        "SELECT public.fn_monitor_em_aula(%s::timestamptz, public.fn_monitor_cfg() -> 'aula')", (instante,)
    ).fetchone()[0]


def test_madrugada_fim_de_semana_e_ultimo_minuto_do_dia_contam(banco):  # noqa: F811
    aplicar(banco)
    assert em_aula(banco, "2026-11-08T06:00:00Z") is True  # domingo, 03:00 em Brasília
    assert em_aula(banco, "2026-11-07T15:00:00Z") is True  # sábado, 12:00
    assert em_aula(banco, "2026-11-10T02:59:30Z") is True  # segunda, 23:59:30
    assert em_aula(banco, "2026-11-10T03:00:00Z") is True  # terça, 00:00


def test_orcamento_sai_de_todos_os_minutos(banco):  # noqa: F811
    aplicar(banco)
    minutos = banco.execute(
        "SELECT public.fn_monitor_minutos_aula('2026-11-07T03:00:00Z', '2026-11-09T03:00:00Z',"
        " public.fn_monitor_cfg() -> 'aula')"
    ).fetchone()[0]
    assert minutos == 2880  # sábado e domingo inteiros


def test_toda_sonda_roda_a_cada_minuto(banco):  # noqa: F811
    aplicar(banco)
    assert banco.execute("SELECT public.fn_monitor_tick()").fetchone()[0]["disparadas"] == 3
    assert banco.execute("SELECT bool_and(em_aula) FROM public.monitor_sonda").fetchone()[0] is True
    assert banco.execute("SELECT min(intervalo_min), max(intervalo_min) FROM public.monitor_alvo").fetchone() == (1, 1)
    banco.execute("UPDATE public.monitor_alvo SET ultima_sonda_em = now() - interval '2 minutes'")
    assert banco.execute("SELECT public.fn_monitor_disparar()").fetchone()[0] == 3


def test_o_que_mais_esta_na_configuracao_nao_muda(banco):  # noqa: F811
    banco.execute(
        "UPDATE public.app_config SET valor = (valor::jsonb || '{\"emails_por_dia\": 7}'::jsonb)::text"
        " WHERE chave = 'monitor_config'"
    )
    aplicar(banco)
    cfg = banco.execute("SELECT public.fn_monitor_cfg()").fetchone()[0]
    assert cfg["emails_por_dia"] == 7 and cfg["slo"]["api"] == 99.5
    assert "slo_24x7" not in cfg


def test_sem_a_linha_de_config_o_padrao_tambem_e_24_horas(banco):  # noqa: F811
    aplicar(banco)
    banco.execute("DELETE FROM public.app_config WHERE chave = 'monitor_config'")
    assert janela(banco)["fim"] == "24:00"


def test_queda_de_madrugada_gasta_a_meta_no_painel(banco):  # noqa: F811
    c = banco
    aplicar(c)
    for i in range(9):
        sonda(c, ha_min=i + 1, em_aula=True)
    sonda(c, status=500, ha_min=1000, em_aula=True)
    colher(c)
    c.execute("UPDATE public.monitor_alvo SET ultima_sonda_em = now() WHERE id = 'api'")
    _como(c, {"sub": DONO, "email": EMAIL_DONO, "role": "authenticated"})
    painel = c.execute("SELECT public.painel_disponibilidade(24)").fetchone()[0]
    c.execute("COMMIT")
    api = next(a for a in painel["alvos"] if a["id"] == "api")
    assert api["disponibilidade_aula_pct"] == 90 and api["minutos_fora_aula"] == 1
    assert 990 <= api["minutos_aula"] <= 1000
    assert painel["aula"]["agora"] is True and painel["aula"]["slo_24x7_pct"] is None


def test_downgrade_devolve_a_janela(banco):  # noqa: F811
    aplicar(banco)
    reverter(banco)
    assert janela(banco)["inicio"] == "07:00" and janela(banco)["fim"] == "22:00"
    assert banco.execute("SELECT public.fn_monitor_cfg() ->> 'slo_24x7'").fetchone()[0] == "99"
    assert banco.execute("SELECT intervalo_min FROM public.monitor_alvo WHERE id = 'console'").fetchone()[0] == 5

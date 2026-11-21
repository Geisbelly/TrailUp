"""`20261121_05` num Postgres descartável: desafios parados sem culpa abrem degradação, e só desafio
gerado fecha."""

import os

import pytest

from tests.test_e2e_monitor_disponibilidade import _modulo, alertas, banco, incidentes  # noqa: F401

pytestmark = pytest.mark.skipif(
    os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker"
)

M = _modulo("20261121_05_monitor_desafios_auto_parados.py")
M03 = _modulo("20261120_03_desafios_gerados_automaticamente.py")

# A tabela real, sem a FK para `conteudos`, que o esqueleto do monitor não tem.
TABELA = M03.TABELA.replace("REFERENCES public.conteudos (id) ON DELETE CASCADE", "")


def aplicar(c):
    c.execute(TABELA)
    c.execute(M.SINAL)
    c.execute(M.TICK_NOVO)


def tentativa(c, conteudo_id, estado, erro=None, ha_min=5):
    c.execute(
        "INSERT INTO public.desafios_auto_tentativas (conteudo_id, estado, iniciada_em, erro, atualizado_em)"
        " VALUES (%s, %s, now() - make_interval(mins => %s), %s, now() - make_interval(mins => %s))"
        " ON CONFLICT (conteudo_id) DO UPDATE SET estado = EXCLUDED.estado, erro = EXCLUDED.erro,"
        "   atualizado_em = EXCLUDED.atualizado_em",
        (conteudo_id, estado, ha_min, erro, ha_min),
    )


def varrer(c):
    c.execute("SELECT public.fn_monitor_sinal_desafios_auto()")


def degradacoes(c):
    return [i for i in incidentes(c, "degradacao") if i[0] == "desafios_auto"]


def test_pane_sem_desafio_gerado_abre_e_avisa_e_desafio_gerado_fecha(banco):  # noqa: F811
    c = banco
    aplicar(c)
    tentativa(c, 1, "esperando", "502 gemini_error")
    tentativa(c, 2, "esperando", "401 sem_codigo", ha_min=70)
    varrer(c)
    (aberto,) = degradacoes(c)
    assert aberto[2] is None
    assert "2 conteúdos esperando sem culpa" in aberto[3]
    assert alertas(c) == ["[TrailUp] Desafios automáticos parados"]
    texto = c.execute("SELECT texto FROM public.monitor_alerta").fetchone()[0]
    assert "Último erro: 502 gemini_error." in texto

    varrer(c)
    assert len(degradacoes(c)) == 1 and len(alertas(c)) == 1  # não repete

    tentativa(c, 3, "gerado", ha_min=1)
    varrer(c)
    (fechado,) = degradacoes(c)
    assert fechado[2] is not None
    assert alertas(c)[-1] == "[TrailUp] Desafios automáticos voltaram a sair"


def test_429_e_espera_prevista_e_nao_abre(banco):  # noqa: F811
    c = banco
    aplicar(c)
    for i in range(5):
        tentativa(c, i, "esperando", "429 gemini_rate_limit")
    varrer(c)
    assert degradacoes(c) == []


def test_um_conteudo_so_e_sem_dado_e_falhou_nao_fecha(banco):  # noqa: F811
    c = banco
    aplicar(c)
    tentativa(c, 1, "esperando", "502 gemini_error")
    varrer(c)
    assert degradacoes(c) == []  # abaixo do mínimo: sem dado

    tentativa(c, 2, "esperando", "0 ConnectError")
    varrer(c)
    assert len(degradacoes(c)) == 1

    # Falha do próprio conteúdo no meio da pane não prova que a edge voltou.
    tentativa(c, 3, "falhou", "502 invalid_ai_response", ha_min=1)
    varrer(c)
    assert degradacoes(c)[0][2] is None


def test_fora_da_janela_nao_conta_e_sem_nada_nao_fecha(banco):  # noqa: F811
    c = banco
    aplicar(c)
    tentativa(c, 1, "esperando", "502 gemini_error", ha_min=200)
    tentativa(c, 2, "esperando", "502 gemini_error", ha_min=200)
    varrer(c)
    assert degradacoes(c) == []

    tentativa(c, 1, "esperando", "502 gemini_error")
    tentativa(c, 2, "esperando", "502 gemini_error")
    varrer(c)
    assert len(degradacoes(c)) == 1
    c.execute("UPDATE public.desafios_auto_tentativas SET atualizado_em = now() - interval '5 hours'")
    varrer(c)
    assert degradacoes(c)[0][2] is None  # nada tocado: o laço pode estar parado, não fecha


def test_janela_e_minimo_saem_do_monitor_config(banco):  # noqa: F811
    c = banco
    aplicar(c)
    c.execute(
        "UPDATE public.app_config SET valor = jsonb_set(valor::jsonb, '{desafios_auto}', '{\"minimo\": 1}')::text"
        " WHERE chave = 'monitor_config'"
    )
    tentativa(c, 1, "esperando", "503 sem_codigo")
    varrer(c)
    assert len(degradacoes(c)) == 1


def test_tick_novo_roda_e_o_downgrade_volta_o_antigo(banco):  # noqa: F811
    c = banco
    aplicar(c)
    assert c.execute("SELECT public.fn_monitor_tick()").fetchone()[0] is not None
    c.execute(M.TICK_ANTIGO)
    c.execute(M.DROP_SINAL)
    assert c.execute("SELECT public.fn_monitor_tick()").fetchone()[0] is not None
    assert c.execute("SELECT to_regprocedure('public.fn_monitor_sinal_desafios_auto()')").fetchone()[0] is None

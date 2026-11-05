"""`20261105_26` num Postgres descartável: deploy curto sai da conta, e o resto continua contando."""

import json
import os

import pytest

from tests.test_e2e_monitor_disponibilidade import (  # noqa: F401
    DONO,
    EMAIL_DONO,
    _como,
    _modulo,
    alvo,
    banco,
    colher,
    incidentes,
    sonda,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker"
)

M = _modulo("20261105_26_monitor_marca_deploy.py")

IMAGEM_A = "a" * 40
IMAGEM_B = "b" * 40


def saude(detalhes):
    """Corpo real do /health, sem espaços: é o que `corpo_esperado` procura."""
    return json.dumps({"status": "ok", "details": detalhes}, separators=(",", ":"))


def aplicar(c):
    c.execute(M.versao_nova())
    c.execute(M.aplicar_nova())
    c.execute(M.painel_novo())


def boa(c, imagem, ha_min):
    sonda(c, conteudo=saude({"build_commit": None, "imagem": imagem}), ha_min=ha_min, em_aula=True)
    colher(c)


def falha(c, ha_min):
    sonda(c, status=502, conteudo="Bad Gateway", ha_min=ha_min, em_aula=True)
    colher(c)


def sondas(c):
    return c.execute(
        "SELECT count(*) FILTER (WHERE ok IS FALSE), count(*) FILTER (WHERE ok IS NULL AND motivo = 'deploy')"
        "  FROM public.monitor_sonda WHERE alvo_id = 'api'"
    ).fetchone()


def painel_da_api(c):
    _como(c, {"sub": DONO, "email": EMAIL_DONO, "role": "authenticated"})
    painel = c.execute("SELECT public.painel_disponibilidade(24)").fetchone()[0]
    c.execute("COMMIT")
    return next(a for a in painel["alvos"] if a["id"] == "api")


def test_falha_curta_que_termina_em_versao_nova_sai_da_conta(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 10)
    falha(banco, 3)
    falha(banco, 2)
    boa(banco, IMAGEM_B, 1)
    assert sondas(banco) == (0, 2)
    assert alvo(banco)[2] == IMAGEM_B[:12]
    status = banco.execute("SELECT status FROM public.monitor_sonda WHERE motivo = 'deploy'").fetchall()
    assert status == [(502,), (502,)]  # a evidência fica
    a = painel_da_api(banco)
    assert a["disponibilidade_aula_pct"] == 100
    assert a["minutos_fora_aula"] == 0
    assert a["minutos_deploy"] == 2


def test_queda_mais_longa_que_a_janela_continua_contando(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 30)
    for ha_min in range(20, 1, -1):
        falha(banco, ha_min)
    boa(banco, IMAGEM_B, 1)
    assert sondas(banco) == (19, 0)
    assert incidentes(banco)[0][3] != "deploy"
    a = painel_da_api(banco)
    assert a["minutos_deploy"] == 0 and a["minutos_fora_aula"] == 19


def test_restart_com_a_mesma_imagem_continua_contando(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 10)
    falha(banco, 3)
    falha(banco, 2)
    boa(banco, IMAGEM_A, 1)
    assert sondas(banco) == (2, 0)


def test_sem_versao_de_antes_nao_ha_prova_de_deploy(banco):  # noqa: F811
    aplicar(banco)
    falha(banco, 3)
    boa(banco, IMAGEM_B, 1)
    assert sondas(banco) == (1, 0)


def test_resposta_sem_versao_nao_marca_nem_apaga_a_versao(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 10)
    falha(banco, 2)
    sonda(banco, conteudo=saude({}), ha_min=1, em_aula=True)
    colher(banco)
    assert sondas(banco) == (1, 0)
    assert alvo(banco)[2] == IMAGEM_A[:12]


def test_so_a_sequencia_encerrada_sai_da_conta(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 30)
    falha(banco, 20)  # falha antiga, sem nada a ver com o deploy
    boa(banco, IMAGEM_A, 19)
    falha(banco, 2)
    boa(banco, IMAGEM_B, 1)
    assert sondas(banco) == (1, 1)


def test_queda_aberta_em_deploy_curto_fica_com_o_motivo(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 10)
    for ha_min in (5, 4, 3):
        falha(banco, ha_min)
    assert incidentes(banco)[0][2] is None  # a queda abriu
    boa(banco, IMAGEM_B, 2)
    boa(banco, IMAGEM_B, 1)
    incidente = incidentes(banco)[0]
    assert incidente[2] is not None and incidente[3] == "deploy"
    assert sondas(banco) == (0, 3)


def test_janela_vem_da_configuracao(banco):  # noqa: F811
    aplicar(banco)
    banco.execute(
        "UPDATE public.app_config SET valor = (valor::jsonb || '{\"deploy_janela_min\": 0}'::jsonb)::text"
        " WHERE chave = 'monitor_config'"
    )
    boa(banco, IMAGEM_A, 10)
    falha(banco, 2)
    boa(banco, IMAGEM_B, 1)
    assert sondas(banco) == (1, 0)


def test_versao_le_o_commit_e_cai_para_a_imagem(banco):  # noqa: F811
    aplicar(banco)
    def ler(corpo):
        return banco.execute("SELECT public.fn_monitor_versao(%s)", (corpo,)).fetchone()[0]

    commit = "c" * 40
    assert ler(json.dumps({"build_commit": commit, "imagem": IMAGEM_A})) == commit[:12]
    assert ler(json.dumps({"build_commit": None, "imagem": IMAGEM_A})) == IMAGEM_A[:12]
    assert ler(json.dumps({"build_commit": None, "imagem": "curta"})) is None
    assert ler("Bad Gateway") is None


def test_reversao_volta_as_sondas_para_a_conta(banco):  # noqa: F811
    aplicar(banco)
    boa(banco, IMAGEM_A, 10)
    falha(banco, 2)
    boa(banco, IMAGEM_B, 1)
    assert sondas(banco)[1] == 1
    banco.execute(M.versao_antiga())
    banco.execute(M.aplicar_antiga())
    banco.execute(M.painel_antigo())
    banco.execute(M.REMARCAR)
    assert banco.execute("SELECT count(*) FROM public.monitor_sonda WHERE ok IS FALSE").fetchone()[0] == 1
    assert "minutos_deploy" not in painel_da_api(banco)

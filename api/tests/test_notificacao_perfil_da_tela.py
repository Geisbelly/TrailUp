"""O texto da IA sai com o guia e o tom do perfil que o aluno vê na tela, não sempre do dominante.

Mesma regra de `perfilVisualDoAluno` (app) e de `notificacoes_perfil_do_aluno` (banco): o perfil
escolhido vale quando é o 1º ou o 2º com afinidade > 0, ou tem afinidade >= 20.
"""

from __future__ import annotations

import importlib
from datetime import UTC, datetime

import pytest

from app.agent.graph.nodes.agente_notificacao import _contexto_do_perfil, _perfil_da_tela, notificacao_da_regra

# O pacote `nodes` exporta a FUNÇÃO agente_notificacao com o nome do módulo.
an = importlib.import_module("app.agent.graph.nodes.agente_notificacao")

PERFIS = [
    {"perfil": "Socialiser", "afinidade": 90},
    {"perfil": "Mastermind", "afinidade": 40},
    {"perfil": "Conqueror", "afinidade": 25},
    {"perfil": "Seeker", "afinidade": 5},
]


@pytest.mark.parametrize(
    ("ativo", "esperado"),
    [
        (None, "Socialiser"),
        ("mastermind", "Mastermind"),  # 2º com afinidade
        ("conqueror", "Conqueror"),  # 3º, mas com afinidade >= 20
        ("seeker", "Socialiser"),  # 4º com 5: não representativo
        ("achiever", "Socialiser"),  # nem está na lista
        ("socializer", "Socialiser"),  # grafia do app
        ("", "Socialiser"),
    ],
)
def test_perfil_da_tela(ativo, esperado):
    perfil, _ = _perfil_da_tela({"perfil_brainhex": PERFIS, "perfil_ativo": ativo})
    assert perfil == esperado


def test_desempate_pelo_nome_e_nao_pela_ordem_de_chegada():
    perfis = [{"perfil": "Seeker", "afinidade": 50}, {"perfil": "Achiever", "afinidade": 50}]
    assert _perfil_da_tela({"perfil_brainhex": perfis})[0] == "Achiever"
    assert _perfil_da_tela({"perfil_brainhex": list(reversed(perfis))})[0] == "Achiever"


def test_segundo_sem_afinidade_nao_vale():
    perfis = [{"perfil": "Seeker", "afinidade": 50}, {"perfil": "Achiever", "afinidade": 0}]
    assert _perfil_da_tela({"perfil_brainhex": perfis, "perfil_ativo": "achiever"})[0] == "Seeker"


def test_sem_perfis_e_mastermind():
    assert _perfil_da_tela({"perfil_brainhex": [], "perfil_ativo": "seeker"})[0] == "Mastermind"


def test_guia_do_texto_e_o_da_tela():
    dominante = _contexto_do_perfil({"perfil_brainhex": PERFIS})
    da_tela = _contexto_do_perfil({"perfil_brainhex": PERFIS, "perfil_ativo": "mastermind"})
    assert dominante["perfil_dominante"] == "Socialiser"
    assert da_tela["perfil_dominante"] == "Mastermind"
    assert da_tela["guia_nome"] != dominante["guia_nome"]
    assert da_tela["tom_voz"] != dominante["tom_voz"]


# Regressão da #827: as tabelas grafam "Socializer" e o perfil chega como "Socialiser".
@pytest.mark.parametrize("grafia", ["Socialiser", "Socializer", "socialiser", "socializer"])
def test_socializer_tem_o_proprio_tom_e_texto(grafia):
    ctx = _contexto_do_perfil({"perfil_brainhex": [{"perfil": grafia, "afinidade": 90}]})
    assert ctx["tom_voz"] == an._JEITO_NA_NOTIFICACAO["Socializer"]["tom_voz"]
    regra = notificacao_da_regra(grafia, "inatividade", datetime(2026, 11, 5, 15, tzinfo=UTC))
    assert regra.titulo == an._TEXTOS_DA_REGRA["Socializer"]["lembrete"][0]


def test_tabelas_cobrem_os_sete_perfis_e_nenhum_cai_no_mastermind():
    for tabela in (an._JEITO_NA_NOTIFICACAO, an._TEXTOS_DA_REGRA, an._TEXTOS_COM_TOPICO):
        assert set(tabela) == {"Seeker", "Survivor", "Daredevil", "Mastermind", "Conqueror", "Socializer", "Achiever"}
    for nome in ("Seeker", "Survivor", "Daredevil", "Mastermind", "Conqueror", "Socialiser", "Achiever"):
        ctx = _contexto_do_perfil({"perfil_brainhex": [{"perfil": nome, "afinidade": 90}]})
        assert ctx["tom_voz"] == an._JEITO_NA_NOTIFICACAO[an._chave_das_tabelas(nome)]["tom_voz"]

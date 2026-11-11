"""Fase 3 (parte da API): a camada leve pondera o vetor em vez de olhar só o dominante.

O cronômetro e o tempo do boss eram decididos pelo 1º perfil: um aluno 51/49 Survivor/Conqueror
recebia o cronômetro inteiro de Survivor, e o 49/51 o inteiro de Conqueror. Agora cada perfil
representativo entra com o seu peso. Vetor de um perfil só dá exatamente o resultado de antes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.settings import Settings
from app.services import behavioral_personalization as bp
from app.services.behavioral_personalization import build_behavioral_personalization
from app.services.perfil_vetor import PERFIL_PADRAO, pesos_representativos

# --------------------------------------------------------------------------- pesos do vetor


def test_pesos_ficam_so_com_os_representativos_e_somam_um() -> None:
    perfis = [
        {"perfil": "daredevil", "afinidade": 40},
        {"perfil": "achiever", "afinidade": 30},
        {"perfil": "survivor", "afinidade": 20},
        {"perfil": "seeker", "afinidade": 10},  # 4º e < 20: fora
    ]
    pesos = pesos_representativos(perfis)
    assert [p for p, _ in pesos] == ["daredevil", "achiever", "survivor"]
    assert pesos[0][1] == pytest.approx(40 / 90)
    assert sum(peso for _, peso in pesos) == pytest.approx(1.0)


def test_vetor_plano_de_producao_fica_com_os_dois_primeiros() -> None:
    perfis = [
        {"perfil": "daredevil", "afinidade": 18},
        {"perfil": "conqueror", "afinidade": 16},
        {"perfil": "achiever", "afinidade": 14},
        {"perfil": "seeker", "afinidade": 13},
    ]
    assert pesos_representativos(perfis) == [("daredevil", pytest.approx(18 / 34)), ("conqueror", pytest.approx(16 / 34))]


@pytest.mark.parametrize("perfis", [None, [], [{"perfil": "seeker", "afinidade": 0}]])
def test_sem_sinal_o_peso_inteiro_e_do_padrao(perfis) -> None:
    assert pesos_representativos(perfis) == [(PERFIL_PADRAO, 1.0)]


# --------------------------------------------------------------------------- cronômetro e boss


@pytest.mark.parametrize(
    ("perfil", "estado", "esperado"),
    [
        ("Survivor", "focused", ("soft", 35)),
        ("Conqueror", "focused", ("assertive", 12)),
        ("Achiever", "confident", ("assertive", 12)),
        ("Conqueror", "neutral", ("steady", 22)),
        ("Seeker", "focused", ("steady", 22)),
        ("Seeker", "anxious", ("soft", 45)),
    ],
)
def test_perfil_unico_mantem_o_cronometro_de_antes(perfil, estado, esperado) -> None:
    assert bp._base_timer_pressure(estado, {perfil: 1.0}, "imediato") == esperado


def test_modo_cauteloso_continua_suavizando() -> None:
    assert bp._base_timer_pressure("focused", {"Conqueror": 1.0}, "cauteloso") == ("soft", 35)


def test_vetor_misto_interpola_o_cronometro() -> None:
    # Metade Survivor (35), metade Conqueror focado (12): 23,5, folga do meio, ritmo regular.
    assert bp._base_timer_pressure("focused", {"Survivor": 0.5, "Conqueror": 0.5}, "imediato") == ("steady", 24)
    # Quase todo Survivor: ainda suave.
    assert bp._base_timer_pressure("focused", {"Survivor": 0.9, "Conqueror": 0.1}, "imediato") == ("soft", 33)
    # Quase todo Conqueror: ainda assertivo.
    assert bp._base_timer_pressure("focused", {"Survivor": 0.1, "Conqueror": 0.9}, "imediato") == ("assertive", 14)


@pytest.mark.parametrize(
    ("perfil", "duracao"),
    [("Conqueror", 110), ("Achiever", 110), ("Daredevil", 95), ("Survivor", 95)],
)
def test_perfil_unico_mantem_o_tempo_do_boss_de_antes(perfil, duracao) -> None:
    assert bp._battle_timing("focused", {perfil: 1.0}).encounter_duration_sec == duracao


def test_vetor_misto_interpola_o_tempo_do_boss() -> None:
    timing = bp._battle_timing("focused", {"Conqueror": 0.6, "Daredevil": 0.4})
    assert timing.encounter_duration_sec == 104  # 0,6 * 110 + 0,4 * 95
    assert timing.warning_at_sec == 72  # 0,6 * 75 + 0,4 * 68 = 72,2


def test_empate_exato_fica_no_ritmo_regular() -> None:
    # Vetor de produção 53/47 Daredevil/Conqueror: folga 17, o meio exato entre 12 e 22.
    # "assertive" encerraria a tentativa local da atividade; no empate fica "steady".
    assert bp._base_timer_pressure("focused", {"Daredevil": 0.53, "Conqueror": 0.47}, "imediato") == ("steady", 17)


def test_estado_negativo_continua_vencendo_o_vetor() -> None:
    assert bp._battle_timing("anxious", {"Conqueror": 1.0}).encounter_duration_sec == 80


# --------------------------------------------------------------------------- de ponta a ponta no patch


async def _patch(perfis):
    return await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-peso",
        context={
            "aluno": {"modo_operacao": "imediato", "modo_resposta": "imediato"},
            "perfil_brainhex": perfis,
            "desempenho_recente": {"media_acertos": 84, "percentual_concluido": 72},
            "historico_eventos": [],
        },
        plano={"nivel": "avancado"},
        topico={"id": 12, "nome": "Geometria"},
        conteudos=[{"id": 501, "titulo": "Area", "tipo": "texto", "conteudo": "area " * 80}],
        atividades=[],
        questoes=[],
        cards=[],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )


def _timer_de_leitura(patch):
    return next(item for item in patch.items["content:501"] if item.key == "reading_timer").timer


@pytest.mark.asyncio
async def test_dois_alunos_quase_empatados_recebem_cronometros_vizinhos() -> None:
    # Antes, 51/49 e 49/51 caíam em extremos opostos (35 x 12 de folga).
    a = _timer_de_leitura(await _patch([{"perfil": "survivor", "afinidade": 51}, {"perfil": "conqueror", "afinidade": 49}]))
    b = _timer_de_leitura(await _patch([{"perfil": "conqueror", "afinidade": 51}, {"perfil": "survivor", "afinidade": 49}]))
    assert abs(a.duration_sec - b.duration_sec) <= 1


# --------------------------------------------------------------------------- payload do modelo


def _payload(perfis):
    contexto = {"aluno": {}, "perfil_brainhex": perfis}
    patch = bp._fallback_patch(
        aluno_id="a",
        ciclo_id="c",
        context=contexto,
        plano={},
        topico=None,
        conteudos=[],
        atividades=[],
        questoes=[],
        cards=[],
        conteudo_boss_foco_id=None,
        emit_legacy_topic_battle=False,
    )
    return bp._payload_for_llm(
        context=contexto,
        plano={},
        topico=None,
        conteudos=[],
        atividades=[],
        questoes=[],
        cards=[],
        fallback_patch=patch,
        conteudo_boss_foco_id=None,
        emit_legacy_topic_battle=False,
    )


def test_payload_leva_os_representativos_com_peso_no_fim() -> None:
    payload = _payload([{"perfil": "daredevil", "afinidade": 60}, {"perfil": "achiever", "afinidade": 40}])
    # O que muda por aluno vai por último: o começo do payload é o mesmo entre alunos e o cache
    # de prompt do Gemini depende da ordem.
    assert list(payload)[-1] == "perfis_representativos"
    assert payload["perfis_representativos"] == [
        {"perfil": "Daredevil", "peso": 0.6},
        {"perfil": "Achiever", "peso": 0.4},
    ]
    json.dumps(payload)


def test_prompt_explica_os_pesos() -> None:
    prompt = (Path(__file__).resolve().parents[1] / "app/agent/prompts/personalizacao_comportamental.txt").read_text(
        encoding="utf-8"
    )
    assert "perfis_representativos" in prompt

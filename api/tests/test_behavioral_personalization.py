import pytest

from app.core.settings import Settings
from app.services.behavioral_personalization import build_behavioral_personalization


def _base_context(**overrides):
    context = {
        "aluno": {
            "modo_operacao": "imediato",
            "modo_resposta": "imediato",
        },
        "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 80}],
        "desempenho_recente": {
            "media_acertos": 0.84,
            "percentual_concluido": 72,
            "tempo_medio_min": 11,
            "atividade_recente_id": 201,
            "topico_recente_id": 9,
        },
        "historico_eventos": [],
    }
    context.update(overrides)
    return context


@pytest.mark.asyncio
async def test_behavioral_personalization_fallback_builds_item_first_battle_and_legacy_mirror() -> None:
    patch = await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-1",
        context=_base_context(perfil_brainhex=[{"perfil": "Conqueror", "afinidade": 92}]),
        plano={"nivel": "equilibrado", "tom": "dinamico"},
        topico={"id": 9, "nome": "Equacoes"},
        conteudos=[{"id": 101, "titulo": "Resumo", "tipo": "texto", "conteudo": "equacao " * 120}],
        atividades=[{"id": 201, "titulo": "Desafio", "tipo": "quiz"}],
        questoes=[{"id": 301, "atividade_id": 201, "tipo": "multipla_escolha"}],
        cards=[{"id": 401, "titulo": "Card-chave"}],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    content_patches = patch.items["content:101"]
    reading_patch = next(item for item in content_patches if item.key == "reading_timer")
    battle_patch = next(item for item in content_patches if item.key == "battle_mode")
    topic_battle = next(item for item in patch.topic if item.key == "battle_mode")

    assert patch.mental_state.kind in {"focused", "confident"}
    assert reading_patch.timer is not None
    assert battle_patch.battle is not None
    assert battle_patch.battle.enemy is not None
    assert battle_patch.battle.enemy.item_key == "content:101"
    assert battle_patch.battle.enemy.content_id == 101
    assert battle_patch.battle.source_item_key == "content:101"
    assert battle_patch.battle.enemy.image_prompt
    assert "Vilao educacional maligno" in battle_patch.battle.enemy.image_prompt
    assert "Tirano" in battle_patch.battle.enemy.name
    assert battle_patch.battle.enemy.intro_line
    assert battle_patch.battle.enemy.defeat_line
    assert battle_patch.battle.enemy.visual is not None
    assert battle_patch.battle.enemy.visual.preset
    assert topic_battle.battle is not None
    assert topic_battle.battle.source_item_key == "content:101"
    assert patch.items["activity:201"][0].key == "activity_timer"
    assert patch.items["question:301"][0].enabled is False
    assert patch.items["card:401"][0].key == "mentor_character"


@pytest.mark.asyncio
async def test_behavioral_personalization_uses_neutral_when_there_is_no_evidence() -> None:
    patch = await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-2",
        context={
            "aluno": {"modo_operacao": "imediato", "modo_resposta": "imediato"},
            "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 80}],
            "desempenho_recente": {},
            "historico_eventos": [],
        },
        plano={"nivel": "equilibrado"},
        topico={"id": 5, "nome": "Funcoes"},
        conteudos=[],
        atividades=[],
        questoes=[],
        cards=[],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    assert patch.mental_state.kind == "neutral"


@pytest.mark.asyncio
async def test_behavioral_personalization_softens_timers_and_disables_content_battle_for_anxious() -> None:
    patch = await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-3",
        context=_base_context(
            perfil_brainhex=[{"perfil": "Achiever", "afinidade": 88}],
            desempenho_recente={
                "media_acertos": 0.42,
                "percentual_concluido": 34,
                "tempo_medio_min": 14,
                "atividade_recente_id": 201,
                "topico_recente_id": 9,
            },
        ),
        plano={"nivel": "reforco"},
        topico={"id": 9, "nome": "Equacoes"},
        conteudos=[{"id": 101, "titulo": "Resumo", "tipo": "texto", "conteudo": "equacao " * 40}],
        atividades=[{"id": 201, "titulo": "Desafio", "tipo": "quiz"}],
        questoes=[{"id": 301, "atividade_id": 201, "tipo": "multipla_escolha"}],
        cards=[],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    battle = next(item for item in patch.items["content:101"] if item.key == "battle_mode")
    activity_timer = patch.items["activity:201"][0]

    assert patch.mental_state.kind == "anxious"
    assert activity_timer.timer is not None
    assert activity_timer.timer.urgency == "soft"
    assert activity_timer.timer.timeout_action == "suggest_break"
    assert battle.enabled is False


@pytest.mark.asyncio
async def test_behavioral_personalization_keeps_reading_timer_and_battle_timing_separate() -> None:
    patch = await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-4",
        context=_base_context(perfil_brainhex=[{"perfil": "Conqueror", "afinidade": 91}]),
        plano={"nivel": "avancado"},
        topico={"id": 12, "nome": "Geometria"},
        conteudos=[{"id": 501, "titulo": "Area", "tipo": "texto", "conteudo": "area " * 80}],
        atividades=[],
        questoes=[],
        cards=[],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    content_patches = patch.items["content:501"]
    reading_timer = next(item for item in content_patches if item.key == "reading_timer")
    battle_mode = next(item for item in content_patches if item.key == "battle_mode")

    assert reading_timer.timer is not None
    assert battle_mode.battle is not None
    assert battle_mode.battle.timing is not None
    assert battle_mode.battle.timing.encounter_duration_sec != reading_timer.timer.duration_sec

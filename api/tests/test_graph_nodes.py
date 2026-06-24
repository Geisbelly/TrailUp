import pytest
from importlib import import_module

from app.adapters.mock_emocao import MockEmocaoAdapter
from app.agent.graph.nodes.agente_boss_visual import agente_boss_visual
from app.agent.graph.nodes.agente_emocao import agente_emocao
from app.agent.graph.nodes.agente_geracao_midia import agente_geracao_midia
from app.agent.graph.nodes.agente_midias_personalizadas import agente_midias_personalizadas
from app.agent.graph.nodes.agente_perfil import agente_perfil
from app.agent.graph.routing import compute_personalizacao_next, compute_supervisor_next
from app.core.settings import Settings


def test_compute_supervisor_next_routes_parallel_steps() -> None:
    state = {
        "frame_b64": "abc123",
        "eventos_novos": [{"tipo": "atividade_concluida"}],
        "historico_eventos": [],
        "desempenho_recente": {"media_acertos": 0.4, "topico_concluido": True},
        "completed_nodes": [],
        "perfil_update": None,
        "emocao_atual": None,
        "ui_config": None,
        "conteudo_adaptado": None,
        "trilha_config": None,
        "notificacao_payload": None,
        "textos_gerados": [],
    }

    next_nodes = compute_supervisor_next(state)

    assert "agente_emocao" in next_nodes
    assert "agente_perfil" in next_nodes
    assert "agente_conteudo" in next_nodes


def test_compute_supervisor_next_routes_material_generation_after_content() -> None:
    state = {
        "historico_eventos": [],
        "eventos_novos": [],
        "completed_nodes": ["agente_conteudo"],
        "conteudo_adaptado": {"topico_id": 1, "conteudos": ["A"]},
        "gerar_materiais": True,
        "materiais_gerados": None,
        "perfil_update": None,
        "emocao_atual": None,
        "ui_config": None,
        "trilha_config": None,
        "notificacao_payload": None,
        "textos_gerados": [],
        "desempenho_recente": {"media_acertos": 0.8, "topico_concluido": False},
    }

    next_nodes = compute_supervisor_next(state)

    assert "agente_geracao_midia" in next_nodes


def test_compute_personalizacao_next_routes_plan_then_ai_patch_and_media() -> None:
    initial = {
        "workflow_kind": "personalizar",
        "completed_nodes": [],
        "plano_personalizacao": None,
        "ai_patch": None,
        "materiais_personalizados": None,
        "boss_visual_processado": False,
    }
    after_plan = {
        **initial,
        "plano_personalizacao": {"nivel": "equilibrado"},
        "completed_nodes": ["agente_plano_personalizacao"],
    }
    after_ai = {
        **after_plan,
        "ai_patch": {
            "mentalState": {
                "kind": "neutral",
                "intensity": 0.2,
                "confidence": 0.4,
                "reason": "fallback",
                "source": "ai",
                "observedAt": "2026-04-06T12:00:00Z",
                "expiresAt": "2026-04-06T12:20:00Z",
            },
            "session": [],
            "topic": [],
            "items": {
                "content:10": [
                    {
                        "key": "battle_mode",
                        "scope": "item",
                        "itemKey": "content:10",
                        "enabled": True,
                        "mode": "content_boss_encounter",
                        "priority": 60,
                        "cooldownSec": 0,
                        "copy": {},
                        "battle": {
                            "sourceItemKey": "content:10",
                            "enemy": {
                                "id": "boss:10",
                                "name": "Boss",
                                "archetype": "warbringer",
                                "avatarUrl": None,
                                "imagePrompt": "prompt",
                                "hpMax": 100,
                                "shieldMax": 0,
                                "introLine": "intro",
                                "defeatLine": "fim",
                                "contentId": 10,
                                "itemKey": "content:10",
                                "visual": {
                                    "preset": "arena",
                                    "avatarUrl": None,
                                    "backgroundUrl": None,
                                    "frameUrl": None,
                                    "effectUrl": None,
                                    "badgeLabel": "Boss",
                                    "palette": {
                                        "primaryColor": "#d24c33",
                                        "secondaryColor": "#4f1710",
                                        "accentColor": "#ffd27d",
                                        "hpColor": "#ff5d5d",
                                        "shieldColor": "#94f7c5",
                                        "textColor": "#fff8f2",
                                    },
                                },
                            },
                            "timing": {
                                "encounterDurationSec": 100,
                                "warningAtSec": 70,
                                "introDelayMs": 300,
                                "defeatDelayMs": 700,
                            },
                            "damageOnContentComplete": 16,
                            "damageOnActivityCorrect": 18,
                            "damageOnStreakBonus": 10,
                            "damageOnActivityComplete": 24,
                            "persistKey": "persist",
                            "resetOn": ["topic_complete", "cycle_change"],
                        },
                        "cues": [],
                    }
                ],
            },
            "triggers": [],
        },
        "completed_nodes": ["agente_plano_personalizacao", "agente_ai_patch"],
    }
    final_ready = {
        **after_ai,
        "materiais_personalizados": {"cards": {"payload": []}},
        "boss_visual_processado": True,
        "completed_nodes": ["agente_plano_personalizacao", "agente_ai_patch", "agente_midias_personalizadas", "agente_boss_visual"],
    }

    assert compute_personalizacao_next(initial) == ["agente_plano_personalizacao"]
    assert set(compute_personalizacao_next(after_plan)) == {"agente_ai_patch", "agente_midias_personalizadas"}
    assert "agente_boss_visual" in compute_personalizacao_next(after_ai)
    assert compute_personalizacao_next(final_ready) == ["persist_personalizacao"]


@pytest.mark.asyncio
async def test_agente_emocao_uses_mock_adapter_for_events() -> None:
    result = await agente_emocao(
        {
            "aluno_id": "aluno-1",
            "classe_id": 10,
            "eventos_novos": [{"tipo": "inatividade"}],
            "emocao_historico": [],
        },
        adapter=MockEmocaoAdapter(),
    )

    assert result["emocao_atual"]["emocao_primaria"] == "frustrado"
    assert result["completed_nodes"] == ["agente_emocao"]


@pytest.mark.asyncio
async def test_agente_perfil_falls_back_without_openai() -> None:
    settings = Settings(openai_api_key=None)
    result = await agente_perfil(
        {
            "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 50}],
            "historico_eventos": [],
            "eventos_novos": [{"tipo": "atividade_concluida"}],
            "desempenho_recente": {"media_acertos": 0.8},
        },
        settings=settings,
    )

    assert result["perfil_update"]["perfis"][0]["perfil"] in {"Achiever", "Conqueror"}
    assert result["completed_nodes"] == ["agente_perfil"]


class _FakeSession:
    responses: list[object] = []

    async def execute(self, statement, params=None):
        class _Result:
            def mappings(self):
                return []

        return _Result()

    async def commit(self):
        return None

    async def rollback(self):
        return None


class _FakeSessionContext:
    async def __aenter__(self):
        return _FakeSession()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeSessionFactory:
    def __call__(self):
        return _FakeSessionContext()


@pytest.mark.asyncio
async def test_agente_geracao_midia_generates_materials_when_enabled() -> None:
    settings = Settings(openai_api_key=None)
    result = await agente_geracao_midia(
        {
            "aluno_id": "aluno-1",
            "classe_id": 1,
            "ciclo_id": "ciclo-1",
            "conteudo_foco_id": 10,
            "conteudo_adaptado": {
                "topico_id": 5,
                "conteudo_id": 10,
                "conteudos": ["Definicao principal", "Exemplo aplicado"],
                "nivel": "equilibrado",
                "exemplos": [],
                "observacoes": [],
            },
            "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 80}],
            "modo_operacao": "imediato",
            "emocao_atual": {"emocao_primaria": "concentrado"},
            "payload_modo": "prova",
            "gerar_materiais": True,
        },
        settings=settings,
        session_factory=_FakeSessionFactory(),
    )

    assert result["completed_nodes"] == ["agente_geracao_midia"]
    assert "cards" in result["materiais_gerados"]
    assert result["materiais_gerados"]["cards"]["metadata"]["status"] in {"completed", "failed", "failed_quality"}
    for formato in ("apresentacao", "audio", "markdown"):
        if formato in result["materiais_gerados"]:
            assert result["materiais_gerados"][formato]["metadata"]["status"] in {"completed", "failed", "failed_quality", "pending"}
    assert result["materiais_cache_hit"] is False


@pytest.mark.asyncio
async def test_agente_midias_personalizadas_propagates_media_state(monkeypatch) -> None:
    midias_node_module = import_module("app.agent.graph.nodes.agente_midias_personalizadas")

    async def _fake_generate(state, settings, session_factory, phase):
        del settings, session_factory
        assert phase == "fast_only"
        state["midias_em_processamento"] = True
        state["materiais_saved_ids"] = {"cards": 101, "pdf": 202}
        state["media_pending_payload"] = {"pdf": {"payload": {"titulo": "Guia"}}}
        state["media_status"] = {"pdf": "pending"}
        state["media_generation_warnings"] = ["video_unavailable"]
        state["media_render_job_id"] = "job-123"
        return {"cards": {"payload": [{"frente": "Q", "verso": "R"}]}}

    monkeypatch.setattr(midias_node_module, "generate_materiais_personalizados", _fake_generate)

    result = await agente_midias_personalizadas(
        state={"aluno_id": "aluno-1", "classe_id": 1, "ciclo_id": "ciclo-1"},
        settings=Settings(openai_api_key=None),
        session_factory=_FakeSessionFactory(),
    )

    assert result["completed_nodes"] == ["agente_midias_personalizadas"]
    assert result["midias_em_processamento"] is True
    assert result["materiais_saved_ids"] == {"cards": 101, "pdf": 202}
    assert result["media_pending_payload"]["pdf"]["payload"]["titulo"] == "Guia"
    assert result["media_status"]["pdf"] == "pending"
    assert result["media_generation_warnings"] == ["video_unavailable"]
    assert result["media_render_job_id"] == "job-123"


@pytest.mark.asyncio
async def test_agente_boss_visual_keeps_contract_and_sets_avatar_when_generated(monkeypatch) -> None:
    boss_visual_module = import_module("app.agent.graph.nodes.agente_boss_visual")

    async def _fake_materialize(**kwargs):
        enemy = kwargs["enemy"].model_copy(deep=True)
        enemy.avatar_url = "https://cdn.example.com/boss.png"
        enemy.visual.avatar_url = "https://cdn.example.com/boss.png"
        return enemy

    monkeypatch.setattr(boss_visual_module, "materialize_boss_visual", _fake_materialize)

    result = await agente_boss_visual(
        {
            "aluno_id": "aluno-1",
            "payload_topico_id": 5,
            "ciclo_id": "ciclo-1",
            "ai_patch": {
                "mentalState": {
                    "kind": "neutral",
                    "intensity": 0.2,
                    "confidence": 0.4,
                    "reason": "fallback",
                    "source": "ai",
                    "observedAt": "2026-04-06T12:00:00Z",
                    "expiresAt": "2026-04-06T12:20:00Z",
                },
                "session": [],
                "topic": [
                    {
                        "key": "battle_mode",
                        "scope": "topic",
                        "enabled": True,
                        "mode": "legacy_topic_mirror",
                        "priority": 20,
                        "cooldownSec": 0,
                        "copy": {},
                        "battle": {
                            "topicId": 5,
                            "sourceItemKey": "content:10",
                            "enemy": {
                                "id": "boss:5:10",
                                "name": "Boss",
                                "archetype": "warbringer",
                                "avatarUrl": None,
                                "imagePrompt": "prompt",
                                "hpMax": 120,
                                "shieldMax": 12,
                                "introLine": "intro",
                                "defeatLine": "fim",
                                "contentId": 10,
                                "itemKey": "content:10",
                                "visual": {
                                    "preset": "arena",
                                    "avatarUrl": None,
                                    "backgroundUrl": None,
                                    "frameUrl": None,
                                    "effectUrl": None,
                                    "badgeLabel": "Boss",
                                    "palette": {
                                        "primaryColor": "#d24c33",
                                        "secondaryColor": "#4f1710",
                                        "accentColor": "#ffd27d",
                                        "hpColor": "#ff5d5d",
                                        "shieldColor": "#94f7c5",
                                        "textColor": "#fff8f2",
                                    },
                                },
                            },
                            "timing": {
                                "encounterDurationSec": 100,
                                "warningAtSec": 70,
                                "introDelayMs": 300,
                                "defeatDelayMs": 700,
                            },
                            "damageOnContentComplete": 16,
                            "damageOnActivityCorrect": 18,
                            "damageOnStreakBonus": 10,
                            "damageOnActivityComplete": 24,
                            "persistKey": "persist",
                            "resetOn": ["topic_complete", "cycle_change"],
                        },
                        "cues": [],
                    }
                ],
                "items": {
                    "content:10": [
                        {
                            "key": "battle_mode",
                            "scope": "item",
                            "itemKey": "content:10",
                            "enabled": True,
                            "mode": "content_boss_encounter",
                            "priority": 60,
                            "cooldownSec": 0,
                            "copy": {},
                            "battle": {
                                "topicId": 5,
                                "sourceItemKey": "content:10",
                                "enemy": {
                                    "id": "boss:5:10",
                                    "name": "Boss",
                                    "archetype": "warbringer",
                                    "avatarUrl": None,
                                    "imagePrompt": "prompt",
                                    "hpMax": 120,
                                    "shieldMax": 12,
                                    "introLine": "intro",
                                    "defeatLine": "fim",
                                    "contentId": 10,
                                    "itemKey": "content:10",
                                    "visual": {
                                        "preset": "arena",
                                        "avatarUrl": None,
                                        "backgroundUrl": None,
                                        "frameUrl": None,
                                        "effectUrl": None,
                                        "badgeLabel": "Boss",
                                        "palette": {
                                            "primaryColor": "#d24c33",
                                            "secondaryColor": "#4f1710",
                                            "accentColor": "#ffd27d",
                                            "hpColor": "#ff5d5d",
                                            "shieldColor": "#94f7c5",
                                            "textColor": "#fff8f2",
                                        },
                                    },
                                },
                                "timing": {
                                    "encounterDurationSec": 100,
                                    "warningAtSec": 70,
                                    "introDelayMs": 300,
                                    "defeatDelayMs": 700,
                                },
                                "damageOnContentComplete": 16,
                                "damageOnActivityCorrect": 18,
                                "damageOnStreakBonus": 10,
                                "damageOnActivityComplete": 24,
                                "persistKey": "persist",
                                "resetOn": ["topic_complete", "cycle_change"],
                            },
                            "cues": [],
                        }
                    ]
                },
                "triggers": [],
            },
        },
        settings=Settings(gemini_api_key=None),
    )

    content_battle = result["ai_patch"]["items"]["content:10"][0]["battle"]
    topic_battle = result["ai_patch"]["topic"][0]["battle"]

    assert result["boss_visual_processado"] is True
    assert content_battle["enemy"]["avatarUrl"] == "https://cdn.example.com/boss.png"
    assert content_battle["enemy"]["visual"]["avatarUrl"] == "https://cdn.example.com/boss.png"
    assert topic_battle["enemy"]["avatarUrl"] == "https://cdn.example.com/boss.png"

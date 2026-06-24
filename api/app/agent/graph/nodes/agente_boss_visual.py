from app.core.settings import Settings
from app.schemas.ia_patch import IAPersonalizationPatch
from app.services.boss_image import materialize_boss_visual


async def agente_boss_visual(state: dict, settings: Settings) -> dict:
    if not state.get("ai_patch"):
        return {"completed_nodes": ["agente_boss_visual"], "boss_visual_processado": True}

    patch = IAPersonalizationPatch.model_validate(state["ai_patch"])
    changed = False

    for item_key, patches in patch.items.items():
        for feature_patch in patches:
            if (
                feature_patch.key != "battle_mode"
                or not feature_patch.enabled
                or feature_patch.battle is None
                or feature_patch.battle.enemy is None
            ):
                continue
            enemy = feature_patch.battle.enemy
            if enemy.avatar_url or (enemy.visual and enemy.visual.avatar_url):
                continue
            updated_enemy = await materialize_boss_visual(
                settings=settings,
                aluno_id=state["aluno_id"],
                topico_id=state.get("payload_topico_id"),
                ciclo_id=state["ciclo_id"],
                enemy=enemy,
            )
            feature_patch.battle.enemy = updated_enemy
            changed = True
            for topic_patch in patch.topic:
                if topic_patch.key == "battle_mode" and topic_patch.battle and topic_patch.battle.source_item_key == item_key:
                    topic_patch.battle.enemy = updated_enemy

    return {
        "ai_patch": patch.model_dump(mode="json", by_alias=True),
        "boss_visual_processado": True,
        "completed_nodes": ["agente_boss_visual"],
        "messages": ["boss visual materializado" if changed else "boss visual mantido sem asset"],
    }

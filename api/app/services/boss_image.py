from app.adapters.gemini_boss_image import GeminiBossImageAdapter
from app.adapters.base_boss_image import BossImageAdapter
from app.adapters.placeholder_boss_image import PlaceholderBossImageAdapter
from app.core.settings import Settings
from app.schemas.ia_patch import IAEnemySpec, IAEnemyVisualSpec
from app.services.storage import SupabaseStorage


async def materialize_boss_avatar(
    *,
    settings: Settings,
    aluno_id: str,
    topico_id: int | None,
    ciclo_id: str,
    enemy: IAEnemySpec,
    adapter: BossImageAdapter | None = None,
) -> str | None:
    selected_adapter = adapter or GeminiBossImageAdapter(settings)
    png_bytes = await selected_adapter.generate_png(enemy)
    if not png_bytes and adapter is None:
        png_bytes = await PlaceholderBossImageAdapter().generate_png(enemy)
    if not png_bytes:
        return None

    storage = SupabaseStorage(settings)
    ref_topico = topico_id if topico_id is not None else "sem-topico"
    ref_content = enemy.content_id if enemy.content_id is not None else "sem-conteudo"
    return await storage.upload(
        path=f"{aluno_id}/boss/topico-{ref_topico}/content-{ref_content}/{ciclo_id}.png",
        data=png_bytes,
        content_type="image/png",
    )


async def materialize_boss_visual(
    *,
    settings: Settings,
    aluno_id: str,
    topico_id: int | None,
    ciclo_id: str,
    enemy: IAEnemySpec,
    adapter: BossImageAdapter | None = None,
) -> IAEnemySpec:
    avatar_url = await materialize_boss_avatar(
        settings=settings,
        aluno_id=aluno_id,
        topico_id=topico_id,
        ciclo_id=ciclo_id,
        enemy=enemy,
        adapter=adapter,
    )
    visual = enemy.visual.model_copy(deep=True) if enemy.visual is not None else IAEnemyVisualSpec()
    visual.avatar_url = avatar_url
    updated_enemy = enemy.model_copy(deep=True)
    updated_enemy.avatar_url = avatar_url
    updated_enemy.visual = visual
    return updated_enemy

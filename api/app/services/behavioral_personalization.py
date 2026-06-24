from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError

from app.core.settings import Settings
from app.schemas.ia_patch import (
    IABattleConfig,
    IABattleTiming,
    IACharacterCue,
    IAEnemyPalette,
    IAEnemySpec,
    IAEnemyVisualSpec,
    IAFeaturePatch,
    IAPersonalizationPatch,
    IATimerConfig,
    IATriggerSignal,
    IAMentalStateSnapshot,
)
from app.services.llm import JsonLLMService

_PROFILE_PRESETS: dict[str, dict[str, Any]] = {
    "Survivor": {
        "archetype": "night-stalker",
        "preset": "sentinel",
        "badge": "Ameaca",
        "pressure": "soft",
        "title": "O Perseguidor Escarlate",
        "visual_hook": "predador opressivo, armadura rachada, olhar frio, postura de cacada",
        "intro": "Cada passo seu alimenta a perseguicao deste modulo.",
        "defeat": "O perseguidor caiu. Voce tomou o controle do percurso.",
    },
    "Achiever": {
        "archetype": "fallen-usurper",
        "preset": "duelist",
        "badge": "Rival",
        "pressure": "steady",
        "title": "O Usurpador de Ouro",
        "visual_hook": "rival elitista, coroa quebrada, postura impecavel, arrogancia gelida",
        "intro": "Supere este rival e transforme desempenho em dominio real.",
        "defeat": "A mascara da excelencia caiu. O objetivo agora e seu.",
    },
    "Conqueror": {
        "archetype": "arena-tyrant",
        "preset": "arena",
        "badge": "Tirano",
        "pressure": "assertive",
        "title": "O Tirano da Arena",
        "visual_hook": "senhor de guerra brutal, armadura pesada, energia vulcanica, imponencia absoluta",
        "intro": "Este tirano domina a arena ate voce esmagar o conceito.",
        "defeat": "O trono rachou. O conceito foi conquistado a forca.",
    },
    "Mastermind": {
        "archetype": "shadow-puppeteer",
        "preset": "oracle",
        "badge": "Mente Sombria",
        "pressure": "steady",
        "title": "O Marionetista Frio",
        "visual_hook": "estrategista sombrio, fios de energia, mascara austera, calculo cruel",
        "intro": "Leia o padrao escondido e corte os fios desse manipulador.",
        "defeat": "O plano sombrio desmoronou. A logica ficou do seu lado.",
    },
    "Seeker": {
        "archetype": "void-entity",
        "preset": "veil",
        "badge": "Abismo",
        "pressure": "steady",
        "title": "A Entidade do Vazio",
        "visual_hook": "criatura enigmatica, brilho corrompido, manto etereo, magnetismo perigoso",
        "intro": "A curiosidade certa dissolve os segredos desta entidade.",
        "defeat": "O misterio cedeu. O desconhecido agora tem forma.",
    },
    "Daredevil": {
        "archetype": "chaos-saboteur",
        "preset": "rift",
        "badge": "Sabotador",
        "pressure": "assertive",
        "title": "O Sabotador do Rift",
        "visual_hook": "agente caotico, postura agressiva, energia explosiva, sorriso ameacador",
        "intro": "Aceleracao sem controle favorece o sabotador. Domine o ritmo.",
        "defeat": "O caos perdeu tracao. O risco virou progresso.",
    },
    "Socialiser": {
        "archetype": "toxic-demagogue",
        "preset": "parade",
        "badge": "Demagogo",
        "pressure": "soft",
        "title": "O Demagogo de Ferro",
        "visual_hook": "lider carismatico e toxico, capa cerimonial, presenca dominadora, sorriso falso",
        "intro": "Nao siga a massa. Leia o contexto e derrube o demagogo.",
        "defeat": "A influencia toxica ruiu. O grupo agora avanca com clareza.",
    },
}

_PALETTES: dict[str, IAEnemyPalette] = {
    "sentinel": IAEnemyPalette(
        primary_color="#7d1d30",
        secondary_color="#240913",
        accent_color="#f5b173",
        hp_color="#ff7b7b",
        shield_color="#75d7c8",
        text_color="#fff3f1",
    ),
    "duelist": IAEnemyPalette(
        primary_color="#7a2137",
        secondary_color="#221019",
        accent_color="#ffd166",
        hp_color="#ff6b6b",
        shield_color="#93efcf",
        text_color="#fff7f7",
    ),
    "arena": IAEnemyPalette(
        primary_color="#d24c33",
        secondary_color="#4f1710",
        accent_color="#ffd27d",
        hp_color="#ff5d5d",
        shield_color="#94f7c5",
        text_color="#fff8f2",
    ),
    "oracle": IAEnemyPalette(
        primary_color="#355b68",
        secondary_color="#101b22",
        accent_color="#d7f171",
        hp_color="#f46d75",
        shield_color="#81f2df",
        text_color="#f2fffb",
    ),
    "veil": IAEnemyPalette(
        primary_color="#4e3286",
        secondary_color="#171225",
        accent_color="#8fe5ff",
        hp_color="#ff7f90",
        shield_color="#74f0d3",
        text_color="#f6f7ff",
    ),
    "rift": IAEnemyPalette(
        primary_color="#dd6b20",
        secondary_color="#5a250a",
        accent_color="#ffe08a",
        hp_color="#ff6d61",
        shield_color="#8bf2b7",
        text_color="#fff8ef",
    ),
    "parade": IAEnemyPalette(
        primary_color="#7a2f58",
        secondary_color="#24111d",
        accent_color="#ffd57a",
        hp_color="#ff7b7b",
        shield_color="#83efdf",
        text_color="#f8fbff",
    ),
}

_BATTLE_DAMAGE_ON_CONTENT_COMPLETE = 16
_BATTLE_DAMAGE_ON_ACTIVITY_COMPLETE = 24
_BATTLE_DAMAGE_ON_ACTIVITY_CORRECT = 0
_BATTLE_DAMAGE_ON_STREAK_BONUS = 0


def _dominant_profile(context: dict[str, Any]) -> str:
    perfis = context.get("perfil_brainhex", [])
    if not perfis:
        return "Achiever"
    dominant = max(perfis, key=lambda item: item.get("afinidade", 0))
    return str(dominant.get("perfil") or dominant.get("nome") or "Achiever")


def _ordered_profiles(context: dict[str, Any]) -> list[dict[str, Any]]:
    perfis = context.get("perfil_brainhex", []) or []
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(perfis):
        profile = str(item.get("perfil") or item.get("nome") or "").strip()
        if not profile:
            continue
        normalized.append(
            {
                "index": index,
                "perfil": profile,
                "afinidade": float(item.get("afinidade") or 0.0),
            }
        )
    return sorted(normalized, key=lambda item: (-item["afinidade"], item["index"]))


def _has_profile_signal(
    context: dict[str, Any],
    target: str,
    *,
    minimum_affinity: float = 20.0,
) -> bool:
    normalized_target = target.strip().lower()
    ordered = _ordered_profiles(context)
    if not ordered:
        return False

    for index, item in enumerate(ordered):
        if str(item["perfil"]).strip().lower() != normalized_target:
            continue
        return index in {0, 1} or float(item["afinidade"]) >= minimum_affinity
    return False


def _has_any_profile_signal(
    context: dict[str, Any],
    targets: set[str],
    *,
    minimum_affinity: float = 20.0,
) -> bool:
    return any(_has_profile_signal(context, target, minimum_affinity=minimum_affinity) for target in targets)


def _mode_name(context: dict[str, Any]) -> str:
    aluno = context.get("aluno", {})
    return str(aluno.get("modo_operacao") or aluno.get("modo_resposta") or "imediato").lower()


def _infer_mental_state(context: dict[str, Any], plano: dict[str, Any]) -> IAMentalStateSnapshot:
    desempenho = context.get("desempenho_recente", {}) or {}
    if not desempenho:
        now = datetime.now(UTC)
        return IAMentalStateSnapshot(
            kind="neutral",
            intensity=0.18,
            confidence=0.32,
            reason="Sem sinais suficientes para inferencia comportamental.",
            observed_at=now,
            expires_at=now + timedelta(minutes=20),
        )

    media = float(desempenho.get("media_acertos", 0) or 0)
    percentual = float(desempenho.get("percentual_concluido", 0) or 0)
    tempo_medio = float(desempenho.get("tempo_medio_min", 0) or 0)
    nivel = str(plano.get("nivel") or "").lower()

    kind = "neutral"
    intensity = 0.18
    confidence = 0.42
    reason = "fallback neutro por baixa evidência comportamental."

    if media >= 0.85 and percentual >= 70:
        kind = "confident"
        intensity = 0.74
        confidence = 0.71
        reason = "Bom desempenho recente e alta conclusão sugerem confiança."
    elif media >= 0.7:
        kind = "focused"
        intensity = 0.58
        confidence = 0.62
        reason = "A média recente indica foco sustentado."
    elif media >= 0.55 and nivel in {"reforco", "revisao"}:
        kind = "motivated"
        intensity = 0.46
        confidence = 0.51
        reason = "Mesmo com reforço, há indícios de engajamento."
    elif media < 0.45 and percentual < 40:
        kind = "anxious"
        intensity = 0.81
        confidence = 0.74
        reason = "Baixo acerto e progresso reduzido sugerem ansiedade."
    elif media < 0.55 and tempo_medio >= 12:
        kind = "frustrated"
        intensity = 0.67
        confidence = 0.63
        reason = "Tempo alto com média moderada sugere frustração."
    elif percentual < 25 and tempo_medio <= 3:
        kind = "bored"
        intensity = 0.52
        confidence = 0.48
        reason = "Baixo progresso e baixa permanência sugerem desengajamento."
    elif tempo_medio >= 18:
        kind = "tired"
        intensity = 0.6
        confidence = 0.55
        reason = "Sessões longas sugerem fadiga."

    now = datetime.now(UTC)
    return IAMentalStateSnapshot(
        kind=kind,
        intensity=round(intensity, 2),
        confidence=round(confidence, 2),
        reason=reason,
        observed_at=now,
        expires_at=now + timedelta(minutes=20),
    )


def _base_timer_pressure(mental_state: str, dominant_profile: str, mode_name: str) -> tuple[str, int]:
    if mental_state in {"anxious", "overwhelmed", "frustrated"}:
        return "soft", 45
    if dominant_profile == "Survivor" or mode_name in {"cauteloso", "acolhimento"}:
        return "soft", 35
    if dominant_profile in {"Conqueror", "Achiever"} and mental_state in {"focused", "confident", "motivated"}:
        return "assertive", 12
    return "steady", 22


def _reading_timer(
    *,
    content: dict[str, Any],
    mental_state: str,
    dominant_profile: str,
    mode_name: str,
) -> IATimerConfig:
    urgency, slack = _base_timer_pressure(mental_state, dominant_profile, mode_name)
    body = str(content.get("conteudo") or "")
    duration = max(60, min(420, 90 + (len(body) // 40) + slack))
    warning = max(20, duration - max(25, duration // 5))
    timeout_action = "suggest_break" if urgency == "soft" else "nudge"
    return IATimerConfig(
        duration_sec=duration,
        warning_at_sec=warning,
        timeout_action=timeout_action,
        urgency=urgency,
        show_progress=True,
    )


def _activity_timer(
    *,
    atividade: dict[str, Any],
    mental_state: str,
    dominant_profile: str,
    mode_name: str,
) -> IATimerConfig:
    urgency, slack = _base_timer_pressure(mental_state, dominant_profile, mode_name)
    max_score = int(atividade.get("pontuacao_maxima") or 10)
    duration = max(45, min(900, 120 + (max_score * 8) + slack))
    warning = max(20, duration - max(30, duration // 4))
    if mental_state in {"anxious", "overwhelmed"}:
        timeout_action = "suggest_break"
    elif urgency == "assertive":
        timeout_action = "end_local_attempt"
    else:
        timeout_action = "pause"
    return IATimerConfig(
        duration_sec=duration,
        warning_at_sec=warning,
        timeout_action=timeout_action,
        urgency=urgency,
        show_progress=True,
    )


def _battle_timing(mental_state: str, dominant_profile: str) -> IABattleTiming:
    if mental_state in {"anxious", "overwhelmed", "frustrated"}:
        return IABattleTiming(encounter_duration_sec=80, warning_at_sec=60, intro_delay_ms=350, defeat_delay_ms=800)
    if dominant_profile in {"Conqueror", "Achiever"}:
        return IABattleTiming(encounter_duration_sec=110, warning_at_sec=75, intro_delay_ms=250, defeat_delay_ms=650)
    return IABattleTiming(encounter_duration_sec=95, warning_at_sec=68, intro_delay_ms=300, defeat_delay_ms=700)


def _build_enemy(
    *,
    aluno_id: str,
    ciclo_id: str,
    topico: dict[str, Any] | None,
    focus_content: dict[str, Any] | None,
    dominant_profile: str,
    mental_state: str,
    hp_max: int,
) -> IAEnemySpec | None:
    if not topico or not focus_content:
        return None
    if hp_max <= 0:
        return None

    preset_data = _PROFILE_PRESETS.get(dominant_profile, _PROFILE_PRESETS["Achiever"])
    preset = preset_data["preset"]
    palette = _PALETTES[preset]
    content_id = int(focus_content["id"])
    item_key = f"content:{content_id}"
    topico_name = topico.get("nome") or "Topico"
    content_title = focus_content.get("titulo") or "Conteudo"

    archetype = preset_data["archetype"]
    shield_max = 22 if mental_state in {"focused", "confident"} else 12
    badge = preset_data["badge"]
    boss_title = preset_data["title"]
    visual_hook = preset_data["visual_hook"]
    intro_line = preset_data["intro"]
    defeat_line = preset_data["defeat"]

    return IAEnemySpec(
        id=f"boss:{topico.get('id', 'sem-topico')}:{content_id}",
        name=f"{boss_title} de {content_title}",
        archetype=archetype,
        image_prompt=(
            f"Vilao educacional maligno para o topico '{topico_name}', associado ao conteudo '{content_title}'. "
            f"Perfil dominante: {dominant_profile}. Archetype: {archetype}. "
            f"Direcao visual: {visual_hook}. "
            "Ilustracao vertical para mobile, silhueta forte, tracos ameacadores, armadura ou veste marcante, "
            "olhar hostil, presenca dominante, brilho dramatico, fundo limpo, sem texto embutido, sem interface."
        ),
        hp_max=hp_max,
        shield_max=shield_max,
        intro_line=intro_line,
        defeat_line=defeat_line,
        visual=IAEnemyVisualSpec(
            preset=preset,
            avatar_url=None,
            background_url=None,
            frame_url=None,
            effect_url=None,
            badge_label=badge,
            palette=palette,
        ),
        content_id=content_id,
        item_key=item_key,
    )


def _is_battle_enabled(mental_state: str, dominant_profile: str, context: dict[str, Any]) -> bool:
    if mental_state in {"anxious", "overwhelmed"}:
        return False
    if dominant_profile == "Survivor" and mental_state in {"tired", "frustrated"}:
        return False
    return _has_profile_signal(context, "Survivor")


def _fallback_patch(
    *,
    aluno_id: str,
    ciclo_id: str,
    context: dict[str, Any],
    plano: dict[str, Any],
    topico: dict[str, Any] | None,
    conteudos: list[dict[str, Any]],
    atividades: list[dict[str, Any]],
    questoes: list[dict[str, Any]],
    cards: list[dict[str, Any]],
    conteudo_boss_foco_id: int | None,
    emit_legacy_topic_battle: bool,
) -> IAPersonalizationPatch:
    dominant_profile = _dominant_profile(context)
    mode_name = _mode_name(context)
    mental = _infer_mental_state(context, plano)
    timer_signal_enabled = _has_any_profile_signal(
        context,
        {"Survivor", "Mastermind", "Achiever", "Conqueror"},
    )

    items: dict[str, list[IAFeaturePatch]] = {}
    focus_content = next((item for item in conteudos if int(item["id"]) == conteudo_boss_foco_id), None)
    if focus_content is None and conteudos:
        focus_content = conteudos[0]
    total_conteudos = len(conteudos)
    total_atividades = len(atividades)
    hp_max = (
        (total_conteudos * _BATTLE_DAMAGE_ON_CONTENT_COMPLETE)
        + (total_atividades * _BATTLE_DAMAGE_ON_ACTIVITY_COMPLETE)
    )

    for content in conteudos:
        content_id = int(content["id"])
        item_key = f"content:{content_id}"
        content_patches: list[IAFeaturePatch] = []
        if timer_signal_enabled:
            content_patches.append(
                IAFeaturePatch(
                    key="reading_timer",
                    scope="item",
                    item_key=item_key,
                    enabled=True,
                    mode="content_window",
                    priority=42,
                    cooldown_sec=0,
                    copy_text={
                        "title": f"Janela sugerida para {content.get('titulo') or 'conteudo'}",
                        "timeout": "Siga no seu ritmo. O conteudo continua disponivel.",
                    },
                    timer=_reading_timer(
                        content=content,
                        mental_state=mental.kind,
                        dominant_profile=dominant_profile,
                        mode_name=mode_name,
                    ),
                )
            )
        if focus_content and content_id == int(focus_content["id"]):
            enemy = _build_enemy(
                aluno_id=aluno_id,
                ciclo_id=ciclo_id,
                topico=topico,
                focus_content=focus_content,
                dominant_profile=dominant_profile,
                mental_state=mental.kind,
                hp_max=hp_max,
            )
            if enemy is not None:
                battle_enabled = _is_battle_enabled(mental.kind, dominant_profile, context)
                if total_conteudos <= 0 and total_atividades <= 0:
                    battle_enabled = False
                content_patches.append(
                    IAFeaturePatch(
                        key="battle_mode",
                        scope="item",
                        item_key=item_key,
                        enabled=battle_enabled,
                        mode="content_boss_encounter",
                        priority=58 if battle_enabled else 16,
                        cooldown_sec=0,
                        copy_text={
                            "intro": enemy.intro_line,
                            "defeat": enemy.defeat_line,
                        },
                        battle=IABattleConfig(
                            topic_id=topico.get("id") if topico else None,
                            enemy=enemy,
                            damage_on_content_complete=_BATTLE_DAMAGE_ON_CONTENT_COMPLETE,
                            damage_on_activity_correct=_BATTLE_DAMAGE_ON_ACTIVITY_CORRECT,
                            damage_on_streak_bonus=_BATTLE_DAMAGE_ON_STREAK_BONUS,
                            damage_on_activity_complete=_BATTLE_DAMAGE_ON_ACTIVITY_COMPLETE,
                            metadata={
                                "hp_formula_version": "2026-04-10-exact-proportional-v1",
                                "qtd_conteudos": total_conteudos,
                                "qtd_atividades": total_atividades,
                                "hp_max_calculado": hp_max,
                            },
                            persist_key=f"{aluno_id}:{topico.get('id') if topico else 'sem-topico'}:{item_key}:{ciclo_id}:{enemy.id}",
                            timing=_battle_timing(mental.kind, dominant_profile),
                            source_item_key=item_key,
                        ),
                    )
                )
        items[item_key] = content_patches

    for atividade in atividades:
        atividade_id = int(atividade["id"])
        item_key = f"activity:{atividade_id}"
        items[item_key] = (
            [
                IAFeaturePatch(
                    key="activity_timer",
                    scope="item",
                    item_key=item_key,
                    enabled=True,
                    mode="local_attempt_timer",
                    priority=48,
                    cooldown_sec=0,
                    copy_text={
                        "warning": "Falta pouco para encerrar a tentativa local.",
                        "timeout": "A tentativa local acabou, mas a atividade continua disponivel.",
                    },
                    timer=_activity_timer(
                        atividade=atividade,
                        mental_state=mental.kind,
                        dominant_profile=dominant_profile,
                        mode_name=mode_name,
                    ),
                )
            ]
            if timer_signal_enabled
            else []
        )

    for questao in questoes:
        item_key = f"question:{int(questao['id'])}"
        items[item_key] = [
            IAFeaturePatch(
                key="activity_timer",
                scope="item",
                item_key=item_key,
                enabled=False,
                mode="question_override",
                priority=10,
                cooldown_sec=0,
                copy_text={},
            )
        ] if timer_signal_enabled else []

    for card in cards:
        item_key = f"card:{int(card['id'])}"
        items[item_key] = [
            IAFeaturePatch(
                key="mentor_character",
                scope="item",
                item_key=item_key,
                enabled=True,
                mode="contextual_hint",
                priority=36,
                cooldown_sec=60,
                copy_text={"hint": f"Use o card '{card.get('titulo') or 'apoio'}' como reforco rapido."},
                cues=[
                    IACharacterCue(
                        id=f"cue:{item_key}:open",
                        trigger="content_open",
                        text=f"Se travar, consulte {card.get('titulo') or 'este card'} para reforcar a memoria.",
                        tone="supportive",
                        cooldown_sec=60,
                        priority=40,
                    )
                ],
            )
        ]

    session_patches = [
        IAFeaturePatch(
            key="mentor_character",
            scope="session",
            enabled=True,
            mode="proactive",
            priority=34,
            cooldown_sec=75,
            copy_text={"tone": "apoio breve e oportuno"},
            cues=[
                IACharacterCue(
                    id="mentor:wrong_streak",
                    trigger="wrong_streak",
                    text="Respira. Vamos dividir o problema em uma etapa menor.",
                    tone="supportive",
                    cooldown_sec=90,
                    priority=70,
                )
            ],
        )
    ]

    topic_patches: list[IAFeaturePatch] = []
    focus_item_key = f"content:{focus_content['id']}" if focus_content else None
    focus_battle_patch = None
    if focus_item_key and focus_item_key in items:
        focus_battle_patch = next((patch for patch in items[focus_item_key] if patch.key == "battle_mode"), None)
    if emit_legacy_topic_battle and focus_battle_patch is not None:
        topic_patches.append(
            IAFeaturePatch(
                key="battle_mode",
                scope="topic",
                enabled=focus_battle_patch.enabled,
                mode="legacy_topic_mirror",
                priority=focus_battle_patch.priority,
                cooldown_sec=0,
                copy_text=focus_battle_patch.copy_text,
                battle=focus_battle_patch.battle,
            )
        )

    triggers = [
        IATriggerSignal(
            signal="topic_open",
            feature="mentor_character",
            action="show_cue",
            cooldown_sec=45,
            character_cue_id="mentor:wrong_streak",
        ),
        IATriggerSignal(
            signal="content_complete",
            feature="battle_mode",
            item_key=focus_item_key,
            action="apply_battle_damage",
            cooldown_sec=0,
        ),
        IATriggerSignal(
            signal="activity_complete",
            feature="battle_mode",
            item_key=focus_item_key,
            action="apply_battle_damage",
            cooldown_sec=0,
        ),
    ]
    if timer_signal_enabled:
        triggers.append(
            IATriggerSignal(
                signal="timer_timeout",
                feature="activity_timer",
                action="timeout",
                cooldown_sec=0,
            )
        )

    return IAPersonalizationPatch(
        mental_state=mental,
        session=session_patches,
        topic=topic_patches,
        items=items,
        triggers=triggers,
    )


def _payload_for_llm(
    *,
    context: dict[str, Any],
    plano: dict[str, Any],
    topico: dict[str, Any] | None,
    conteudos: list[dict[str, Any]],
    atividades: list[dict[str, Any]],
    questoes: list[dict[str, Any]],
    cards: list[dict[str, Any]],
    fallback_patch: IAPersonalizationPatch,
    conteudo_boss_foco_id: int | None,
    emit_legacy_topic_battle: bool,
) -> dict[str, Any]:
    return {
        "perfil_dominante": _dominant_profile(context),
        "perfil_brainhex": context.get("perfil_brainhex", []),
        "modo_operacao": context.get("aluno", {}).get("modo_operacao"),
        "modo_resposta": context.get("aluno", {}).get("modo_resposta"),
        "desempenho_recente": context.get("desempenho_recente", {}),
        "topico": topico,
        "conteudos": [
            {
                "id": item.get("id"),
                "titulo": item.get("titulo"),
                "tipo": item.get("tipo"),
                "ordem": item.get("ordem"),
                "contentIdRef": item.get("id"),
                "itemKey": f"content:{item.get('id')}",
            }
            for item in conteudos
        ],
        "atividades": [
            {
                "id": item.get("id"),
                "titulo": item.get("titulo"),
                "tipo": item.get("tipo"),
                "itemKey": f"activity:{item.get('id')}",
            }
            for item in atividades
        ],
        "questoes": [
            {
                "id": item.get("id"),
                "atividade_id": item.get("atividade_id"),
                "tipo": item.get("tipo"),
                "itemKey": f"question:{item.get('id')}",
            }
            for item in questoes
        ],
        "cards": [
            {
                "id": item.get("id"),
                "titulo": item.get("titulo"),
                "itemKey": f"card:{item.get('id')}",
                "contentIdRef": item.get("conteudo_id"),
            }
            for item in cards
        ],
        "conteudo_boss_foco_id": conteudo_boss_foco_id,
        "emit_legacy_topic_battle": emit_legacy_topic_battle,
        "plano": plano,
        "fallback_contract": fallback_patch.model_dump(mode="json", by_alias=True),
    }


async def build_behavioral_personalization(
    *,
    aluno_id: str,
    ciclo_id: str,
    context: dict[str, Any],
    plano: dict[str, Any],
    topico: dict[str, Any] | None,
    conteudos: list[dict[str, Any]],
    atividades: list[dict[str, Any]],
    questoes: list[dict[str, Any]],
    cards: list[dict[str, Any]],
    settings: Settings,
    conteudo_boss_foco_id: int | None = None,
    emit_legacy_topic_battle: bool = True,
) -> IAPersonalizationPatch:
    focus_content_id = conteudo_boss_foco_id or (int(conteudos[0]["id"]) if conteudos else None)
    fallback_patch = _fallback_patch(
        aluno_id=aluno_id,
        ciclo_id=ciclo_id,
        context=context,
        plano=plano,
        topico=topico,
        conteudos=conteudos,
        atividades=atividades,
        questoes=questoes,
        cards=cards,
        conteudo_boss_foco_id=focus_content_id,
        emit_legacy_topic_battle=emit_legacy_topic_battle,
    )

    llm = JsonLLMService(settings)
    raw_patch = await llm.ainvoke_json(
        prompt_name="personalizacao_comportamental.txt",
        payload=_payload_for_llm(
            context=context,
            plano=plano,
            topico=topico,
            conteudos=conteudos,
            atividades=atividades,
            questoes=questoes,
            cards=cards,
            fallback_patch=fallback_patch,
            conteudo_boss_foco_id=focus_content_id,
            emit_legacy_topic_battle=emit_legacy_topic_battle,
        ),
        fallback_factory=lambda: fallback_patch.model_dump(mode="json", by_alias=True),
        provider="gemini",
    )

    try:
        return IAPersonalizationPatch.model_validate(raw_patch)
    except ValidationError:
        return fallback_patch

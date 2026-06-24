from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class IACamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        extra="forbid",
    )


IAMentalStateKind = Literal[
    "neutral",
    "focused",
    "motivated",
    "confident",
    "tired",
    "frustrated",
    "anxious",
    "overwhelmed",
    "bored",
]

IAFeatureKey = Literal[
    "activity_timer",
    "reading_timer",
    "mentor_character",
    "battle_mode",
]

IAFeatureScope = Literal["session", "topic", "item"]

IATriggerName = Literal[
    "topic_open",
    "content_open",
    "content_complete",
    "activity_start",
    "activity_correct",
    "activity_wrong",
    "wrong_streak",
    "activity_complete",
    "timer_warning",
    "timer_timeout",
    "idle_detected",
]

IATriggerAction = Literal[
    "show_cue",
    "start_timer",
    "warn",
    "timeout",
    "apply_battle_damage",
    "nudge",
    "pause",
    "suggest_break",
    "end_local_attempt",
]

IATimeoutAction = Literal["nudge", "pause", "suggest_break", "end_local_attempt"]


class IAMentalStateSnapshot(IACamelModel):
    kind: IAMentalStateKind = "neutral"
    intensity: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reason: str = ""
    source: Literal["ai"] = "ai"
    observed_at: datetime
    expires_at: datetime


class IAFeatureDescriptor(IACamelModel):
    key: IAFeatureKey
    scopes: list[IAFeatureScope]
    default_enabled: bool = False
    sensitive: bool = False
    supports_timer: bool = False
    supports_battle: bool = False
    supports_cues: bool = False
    description: str = ""


class IATimerConfig(IACamelModel):
    duration_sec: int = Field(default=180, ge=15)
    warning_at_sec: int = Field(default=150, ge=5)
    timeout_action: IATimeoutAction = "nudge"
    urgency: Literal["soft", "steady", "assertive"] = "soft"
    show_progress: bool = True


class IABattleTiming(IACamelModel):
    encounter_duration_sec: int = Field(default=90, ge=10)
    warning_at_sec: int = Field(default=70, ge=5)
    intro_delay_ms: int = Field(default=350, ge=0)
    defeat_delay_ms: int = Field(default=750, ge=0)


class IAEnemyPalette(IACamelModel):
    primary_color: str = "#3d4de0"
    secondary_color: str = "#1d1f6f"
    accent_color: str = "#ffcc4d"
    hp_color: str = "#ff6b6b"
    shield_color: str = "#63e6be"
    text_color: str = "#f8f9ff"


class IAEnemyVisualSpec(IACamelModel):
    preset: str = "guardian"
    avatar_url: str | None = None
    background_url: str | None = None
    frame_url: str | None = None
    effect_url: str | None = None
    badge_label: str | None = None
    palette: IAEnemyPalette = Field(default_factory=IAEnemyPalette)


class IAEnemySpec(IACamelModel):
    id: str
    name: str
    archetype: str
    avatar_url: str | None = None
    image_prompt: str
    hp_max: int = Field(default=100, ge=1)
    shield_max: int = Field(default=0, ge=0)
    intro_line: str = ""
    defeat_line: str = ""
    visual: IAEnemyVisualSpec | None = None
    content_id: int | None = None
    item_key: str | None = None


class IACharacterCue(IACamelModel):
    id: str
    trigger: IATriggerName
    text: str
    tone: Literal["supportive", "neutral", "challenging"] = "supportive"
    cooldown_sec: int = Field(default=90, ge=0)
    priority: int = Field(default=50, ge=0, le=100)


class IABattleConfig(IACamelModel):
    topic_id: int | None = None
    enemy: IAEnemySpec | None = None
    damage_on_content_complete: int = Field(default=12, ge=0)
    damage_on_activity_correct: int = Field(default=14, ge=0)
    damage_on_streak_bonus: int = Field(default=8, ge=0)
    damage_on_activity_complete: int = Field(default=20, ge=0)
    metadata: dict[str, int | float | str | bool | None] = Field(default_factory=dict)
    persist_key: str = ""
    reset_on: list[str] = Field(default_factory=lambda: ["topic_complete", "cycle_change"])
    timing: IABattleTiming | None = None
    source_item_key: str | None = None


class IAFeaturePatch(IACamelModel):
    key: IAFeatureKey
    scope: IAFeatureScope
    item_key: str | None = None
    enabled: bool | None = None
    mode: str | None = None
    priority: int | None = Field(default=None, ge=0, le=100)
    cooldown_sec: int | None = Field(default=None, ge=0)
    copy_text: dict[str, str] = Field(default_factory=dict, validation_alias="copy", serialization_alias="copy")
    timer: IATimerConfig | None = None
    battle: IABattleConfig | None = None
    cues: list[IACharacterCue] = Field(default_factory=list)


class IAResolvedFeatureState(IACamelModel):
    key: IAFeatureKey
    scope: IAFeatureScope
    item_key: str | None = None
    enabled: bool
    priority: int = Field(default=0, ge=0, le=100)
    suppressed_reason: str | None = None
    timer: IATimerConfig | None = None
    battle: IABattleConfig | None = None
    cues: list[IACharacterCue] = Field(default_factory=list)


class IATriggerSignal(IACamelModel):
    signal: IATriggerName
    feature: IAFeatureKey | None = None
    item_key: str | None = None
    action: IATriggerAction
    cooldown_sec: int | None = Field(default=None, ge=0)
    character_cue_id: str | None = None


class IAPersonalizationPatch(IACamelModel):
    mental_state: IAMentalStateSnapshot
    session: list[IAFeaturePatch] = Field(default_factory=list)
    topic: list[IAFeaturePatch] = Field(default_factory=list)
    items: dict[str, list[IAFeaturePatch]] = Field(default_factory=dict)
    triggers: list[IATriggerSignal] = Field(default_factory=list)

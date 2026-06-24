from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "TrailUp API"
    app_env: str = "development"
    app_debug: bool = False
    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_methods: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_headers: list[str] = Field(default_factory=lambda: ["*"])

    database_url: str = "sqlite+aiosqlite:///:memory:"
    alembic_database_url: str | None = None
    langgraph_db_url: str | None = None
    database_connect_timeout_sec: int = 20
    database_command_timeout_sec: int = 60

    supabase_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("supabase_url", "SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"),
    )
    supabase_service_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "supabase_service_key",
            "SUPABASE_SERVICE_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
        ),
    )
    supabase_jwt_secret: str = Field(default="development-secret")
    supabase_jwt_audience: str | None = "authenticated"

    llm_provider: str = "openai"  # "openai" | "gemini"

    openai_api_key: str | None = None
    openai_model_supervisor: str = "gpt-4o-mini"
    openai_model_default: str = "gpt-4o-mini"

    gemini_api_key: str | None = None
    gemini_model_supervisor: str = "gemini-1.5-pro"
    gemini_model_default: str = "gemini-1.5-flash"
    gemini_materiais_model: str = "gemini-2.5-flash"
    gemini_model_multimodal_primary: str = "gemini-2.5-flash"
    gemini_model_multimodal_fallback: str = "gemini-2.5-flash-lite"
    gemini_model_image: str = "gemini-2.0-flash-preview-image-generation"
    gemini_model_tts: str = "gemini-2.5-flash-preview-tts"

    brainhex_api_url: str | None = None

    emotion_model_provider: str = "deepface"
    reading_model_provider: str = "isolation_forest"
    interaction_model_provider: str = "hidden_markov_model"
    performance_model_provider: str = "deep_knowledge_tracing"
    attention_model_provider: str = "random_forest"
    decision_model_provider: str = "xgboost"
    adaptive_content_provider: str = "graph_llm"

    @property
    def active_model_supervisor(self) -> str:
        return self.gemini_model_supervisor if self.llm_provider == "gemini" else self.openai_model_supervisor

    @property
    def active_model_default(self) -> str:
        return self.gemini_model_default if self.llm_provider == "gemini" else self.openai_model_default

    langchain_tracing_v2: bool = False
    langchain_project: str = "trailup-local"

    default_checkpoint_ns: str = "default"
    personalizacao_checkpoint_ns: str = "personalizacao"
    checkpoint_retention_days: int = 3
    checkpoint_retention_enabled: bool = True
    checkpoint_retention_interval_hours: int = 24
    personalizacao_job_concurrency: int = 2
    personalizacao_job_poll_sec: int = 5
    personalizacao_job_max_retries: int = 3
    personalizacao_job_db_failure_max_backoff_sec: int = 60
    personalizacao_job_db_failure_log_interval_sec: int = 30
    personalizacao_media_render_concurrency: int = 2
    personalizacao_media_render_timeout_sec: int = 240
    media_render_timeout_seconds: int = 1800
    personalizacao_media_job_timeout_sec: int = 1800
    personalizacao_force_all_media_formats: bool = True
    personalizacao_max_inline_source_bytes: int = 18_000_000
    personalizacao_media_review_max_cycles: int = 3
    personalizacao_media_min_quality_score: float = 0.72
    admin_panel_username: str = "admin"
    admin_panel_password: str = "admin"


@lru_cache
def get_settings() -> Settings:
    return Settings()

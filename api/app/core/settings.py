from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
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
    database_migrations_on_startup: bool = True

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
    supabase_jwt_secret: str
    supabase_jwt_audience: str | None = "authenticated"

    # Gemini e gratuito (varias chaves com rotacao, ver GEMINI_API_KEY) e e o
    # provedor principal em todo o resto do sistema (content_enrichment.py,
    # microservice) — esse default so controla os caminhos que usam
    # JsonLLMService.ainvoke_json sem fixar `provider=` explicitamente
    # (supervisor, gerar_cards_direto, generate_plano_personalizacao etc.).
    # Era "openai": com a conta da OpenAI de proposito sem credito, esses
    # caminhos falhavam sempre (fallback_factory), sem nem tentar o Gemini.
    llm_provider: str = "gemini"  # "openai" | "gemini"

    openai_api_key: str | None = None
    openai_model_supervisor: str = "gpt-4o-mini"
    openai_model_default: str = "gpt-4o-mini"
    # gpt-5.4-mini tem limite de tier de 10 RPM / 50 RPD — inviavel como
    # provedor de enriquecimento (ate 24 blocos x 3 tentativas por topico).
    # gpt-4o-mini (500 RPM / 10.000 RPD) e usado so como reserva secundaria,
    # com Gemini como principal (ver content_enrichment.py).
    openai_content_enrichment_model: str = "gpt-4o-mini"
    # Era 1: um topico com ~24 blocos precisava de ~24 chamadas de
    # enriquecimento, e o free tier do Gemini tem cota de so 20
    # requisicoes/dia (gemini-3.6-flash) - um unico topico ja estourava a
    # cota gratuita sozinho. Subido pra 6 (24 blocos ~= 4 chamadas/topico)
    # as custas de granularidade de retry mais grossa: se a validacao
    # rejeitar 1 bloco do lote, o lote inteiro pode precisar ser re-tentado.
    content_enrichment_batch_size: int = 6
    content_enrichment_max_attempts: int = 3
    openai_content_enrichment_max_output_tokens: int = 8192
    content_enrichment_quota_cooldown_sec: int = 300
    # Trava de gasto estimado (best-effort, em memoria — reseta se o processo
    # reiniciar). A garantia real e o hard limit configurado no dashboard da
    # OpenAI; isso e so uma camada extra de defesa.
    openai_spend_cap_usd: float = 1.0

    gemini_api_key: str | None = None
    gemini_model_supervisor: str = "gemini-1.5-pro"
    gemini_model_default: str = "gemini-1.5-flash"
    # gemini-2.5-flash retornou 404 NOT_FOUND em producao ("no longer
    # available to new users") — gemini-3.6-flash e o modelo confirmado
    # funcionando no mesmo tier (ja usado como default no microservice,
    # DEFAULT_GEMINI_CONTENT_GENERATION_MODEL em contentGenerationService.ts).
    gemini_materiais_model: str = "gemini-3.6-flash"
    gemini_model_multimodal_primary: str = "gemini-3.6-flash"
    gemini_model_multimodal_fallback: str = "gemini-2.5-flash-lite"
    gemini_model_image: str = "gemini-2.0-flash-preview-image-generation"
    gemini_model_tts: str = "gemini-2.5-flash-preview-tts"
    content_enrichment_gemini_model: str = "gemini-3.6-flash"
    content_enrichment_gemini_quota_cooldown_sec: int = 300

    brainhex_api_url: str | None = None
    # Precisa bater com API_SHARED_SECRET no microservice (api-brainhex) quando
    # configurado lá — obrigatório em produção; sem ele, /api/personalizar retorna 401.
    brainhex_api_secret: str | None = None
    # Deve ser maior que o timeout maximo do pipeline no microservico.
    brainhex_api_wait_timeout_sec: int = 1980
    # O Render pode levar dezenas de segundos para acordar o microservico e
    # validar o Chromium. O health precisa tolerar esse cold start.
    brainhex_health_timeout_sec: float = 90.0
    brainhex_health_max_attempts: int = 3
    brainhex_health_retry_delay_sec: float = 2.0

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
    personalizacao_job_partial_retry_delay_sec: int = 15
    # Job preso em 'processing' ha mais que isso (ex.: processo caiu no meio) volta
    # a ser reclamavel pelo worker — evita orfaos permanentes apos crash/restart.
    personalizacao_job_stale_processing_min: int = 40
    # Tentativas de redisparo por geracao (mesmo ciclo_id/source_hash) antes de
    # parar de reclamar/regerar automaticamente. Sem isso, uma geracao que
    # falha sempre do mesmo jeito (ex.: contrato de conteudo incompativel com
    # o provedor) e redisparada para sempre a cada stale_processing_min,
    # queimando cota de IA sem chance real de sucesso.
    personalizacao_falha_streak_max: int = 3
    # Gargalo real: o tier gratuito do Gemini tem poucas requisicoes por
    # minuto. Gerar varios perfis do mesmo topico em paralelo faz um 429
    # isolado abrir o circuito de indisponibilidade de 5 minutos do Gemini e
    # travar TODOS os perfis simultaneos (o audioScript so sai do Gemini,
    # nunca da OpenAI). Espacando os disparos, cada perfil roda sozinho.
    personalizacao_media_render_profile_pace_sec: int = 300
    personalizacao_job_db_failure_max_backoff_sec: int = 60
    personalizacao_job_db_failure_log_interval_sec: int = 30
    # A preparação curricular é neutra e compartilhada entre os sete perfis.
    # Mantê-la separada da concorrência de mídia evita gastar slots de geração
    # com targets apenas aguardando o mesmo enriquecimento.
    personalizacao_content_enrichment_concurrency: int = 1
    personalizacao_content_enrichment_cache_max_entries: int = 128
    personalizacao_media_render_concurrency: int = 2
    personalizacao_media_render_timeout_sec: int = 240
    media_render_timeout_seconds: int = 1800
    personalizacao_media_job_timeout_sec: int = 1800
    personalizacao_force_all_media_formats: bool = True
    personalizacao_max_inline_source_bytes: int = 18_000_000
    # Fontes do contexto são lidas em páginas. Acima do teto total o job falha
    # explicitamente, em vez de gerar material a partir de um subconjunto.
    personalizacao_source_page_size: int = 100
    personalizacao_max_context_sources: int = 400
    personalizacao_media_review_max_cycles: int = 3
    personalizacao_media_min_quality_score: float = 0.72
    admin_panel_username: str = "admin"
    admin_panel_password: str

    @model_validator(mode="after")
    def _check_production_safety(self) -> "Settings":
        if self.app_env == "production" and self.cors_allow_origins == ["*"]:
            raise ValueError(
                "cors_allow_origins não pode ser ['*'] em produção. "
                "Defina CORS_ALLOW_ORIGINS com as origens permitidas."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

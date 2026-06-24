from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, get_settings
from app.core.settings import Settings
from app.db.session import ping_database
from app.schemas.api import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def healthcheck(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    await ping_database(session)
    return HealthResponse(
        status="ok",
        environment=settings.app_env,
        database="ok",
        checkpointer=request.app.state.checkpointer_backend_personalizacao,
        details={
            "graphs": ["personalizacao", "ephemeral"],
            "checkpointer_personalizacao": request.app.state.checkpointer_backend_personalizacao,
            "checkpointer_ephemeral": request.app.state.checkpointer_backend_ephemeral,
            "checkpoint_retention_days": settings.checkpoint_retention_days,
            "personalizacao_job_concurrency": settings.personalizacao_job_concurrency,
            "personalizacao_job_poll_sec": settings.personalizacao_job_poll_sec,
            "personalizacao_jobs_worker": "running" if request.app.state.personalizacao_jobs_task else "disabled",
        },
        checked_at=datetime.now(UTC),
    )

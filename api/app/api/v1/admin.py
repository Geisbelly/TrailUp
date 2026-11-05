from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminContext, get_session, require_admin
from app.schemas.api import (
    AdminPersonalizacaoMediaBackfillRequest,
    AdminPersonalizacaoMediaBackfillResponse,
)
from app.services.personalizacao import backfill_media_render_jobs

router = APIRouter(prefix="/admin", tags=["admin"], include_in_schema=False)


def _schema_unavailable_http_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Schema TrailUp indisponivel na base configurada. "
            "Configure DATABASE_URL para o banco principal da aplicacao."
        ),
    )


@router.post(
    "/personalizacao/media/backfill",
    response_model=AdminPersonalizacaoMediaBackfillResponse,
)
async def backfill_media_render_admin(
    payload: AdminPersonalizacaoMediaBackfillRequest,
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminPersonalizacaoMediaBackfillResponse:
    del admin
    try:
        result = await backfill_media_render_jobs(
            session=session,
            classe_id=payload.classe_id,
            aluno_id=payload.aluno_id,
            personalizacao_id=payload.personalizacao_id,
            limit=payload.limit,
            dry_run=payload.dry_run,
        )
    except OperationalError as exc:
        raise _schema_unavailable_http_error() from exc
    return AdminPersonalizacaoMediaBackfillResponse(**result)

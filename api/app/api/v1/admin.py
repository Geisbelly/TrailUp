from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminContext, get_session, require_admin
from app.repositories.access import AccessRepository
from app.schemas.api import (
    AdminPersonalizacaoMediaBackfillRequest,
    AdminPersonalizacaoMediaBackfillResponse,
    AdminProfessorAlunoAcessoRequest,
    AdminProfessorAlunoAcessoResponse,
    AdminProfessorLiberacaoRequest,
    AdminProfessorLiberacaoResponse,
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
    "/professores/{professor_id}/liberacao",
    response_model=AdminProfessorLiberacaoResponse,
)
async def atualizar_liberacao_professor(
    professor_id: str,
    payload: AdminProfessorLiberacaoRequest,
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminProfessorLiberacaoResponse:
    del admin
    repo = AccessRepository(session)
    try:
        if not await repo.professor_exists(professor_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Professor nao encontrado.",
            )

        await repo.set_professor_liberado(professor_id, payload.liberado)
        await session.commit()
    except OperationalError as exc:
        raise _schema_unavailable_http_error() from exc
    return AdminProfessorLiberacaoResponse(
        professor_id=professor_id,
        liberado=payload.liberado,
    )


@router.post(
    "/professores/{professor_id}/alunos",
    response_model=AdminProfessorAlunoAcessoResponse,
)
async def atualizar_acesso_aluno_professor(
    professor_id: str,
    payload: AdminProfessorAlunoAcessoRequest,
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminProfessorAlunoAcessoResponse:
    del admin
    repo = AccessRepository(session)
    try:
        if not await repo.professor_exists(professor_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Professor nao encontrado.",
            )
        if not await repo.aluno_exists(payload.aluno_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Aluno nao encontrado.",
            )

        await repo.set_professor_student_access(
            professor_id=professor_id,
            aluno_id=payload.aluno_id,
            has_acesso=payload.has_acesso,
        )
        await session.commit()
    except OperationalError as exc:
        raise _schema_unavailable_http_error() from exc
    return AdminProfessorAlunoAcessoResponse(
        professor_id=professor_id,
        aluno_id=payload.aluno_id,
        has_acesso=payload.has_acesso,
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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_professor_access, get_current_user, get_session
from app.repositories.materiais import MateriaisRepository
from app.schemas.api import MateriaisAlunoResponse, MaterialGeradoResponse
from app.services.auth import UserContext


router = APIRouter(prefix="/materiais", tags=["materiais"])


@router.get("/{aluno_id}", response_model=MateriaisAlunoResponse)
async def listar_materiais(
    aluno_id: str,
    conteudo_id: int | None = Query(default=None),
    tipo: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MateriaisAlunoResponse:
    if user.is_aluno and (user.aluno_id or user.user_id) == aluno_id:
        pass
    elif user.is_professor:
        if not user.professor_liberado:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem liberacao de acesso.",
            )
        await ensure_professor_access(aluno_id, user, session)
    elif user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aluno sem acesso a materiais de outro usuario.",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Perfil sem acesso a materiais.",
        )

    materiais = await MateriaisRepository(session).listar_por_aluno(
        aluno_id=aluno_id,
        conteudo_id=conteudo_id,
        tipo=tipo,
        limit=limit,
    )
    return MateriaisAlunoResponse(
        aluno_id=aluno_id,
        total=len(materiais),
        materiais=[MaterialGeradoResponse.model_validate(material) for material in materiais],
    )

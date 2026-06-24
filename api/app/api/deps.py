from collections.abc import AsyncIterator
from dataclasses import dataclass
import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBasic, HTTPBasicCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.db.session import session_dependency
from app.repositories.access import AccessRepository
from app.services.auth import AuthService, UserContext


bearer_scheme = HTTPBearer(auto_error=False)
basic_scheme = HTTPBasic(auto_error=False)


@dataclass(slots=True)
class AdminContext:
    username: str


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async for session in session_dependency(request.app.state.session_factory):
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> UserContext:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization bearer token obrigatorio.",
        )

    auth_service = AuthService(settings=settings, session=session)
    return await auth_service.authenticate(credentials.credentials)


def require_admin(
    credentials: HTTPBasicCredentials | None = Depends(basic_scheme),
    settings: Settings = Depends(get_settings),
) -> AdminContext:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais de admin obrigatorias.",
            headers={"WWW-Authenticate": "Basic"},
        )

    valid_username = secrets.compare_digest(credentials.username, settings.admin_panel_username)
    valid_password = secrets.compare_digest(credentials.password, settings.admin_panel_password)
    if not (valid_username and valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais de admin invalidas.",
            headers={"WWW-Authenticate": "Basic"},
        )

    return AdminContext(username=credentials.username)


async def require_aluno(user: UserContext = Depends(get_current_user)) -> UserContext:
    if not user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso permitido apenas para alunos.",
        )
    return user


async def require_professor(user: UserContext = Depends(get_current_user)) -> UserContext:
    if not user.is_professor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso permitido apenas para professores.",
        )
    if not user.professor_liberado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem liberacao de acesso.",
        )
    return user


async def ensure_professor_access(
    aluno_id: str,
    user: UserContext,
    session: AsyncSession,
) -> None:
    access_repo = AccessRepository(session)
    allowed = await access_repo.professor_can_access(user.professor_id or user.user_id, aluno_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem acesso a este aluno.",
        )

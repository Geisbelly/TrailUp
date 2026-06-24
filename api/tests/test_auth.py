import jwt
import pytest
from fastapi import HTTPException, status
from fastapi.security import HTTPBasicCredentials

from app.api.deps import require_admin, require_aluno, require_professor
from app.core.settings import Settings
from app.services.auth import AuthService, UserContext


class AlunoRepo:
    def __init__(self, session) -> None:
        self.session = session

    async def resolve_user_role(self, user_id: str) -> str | None:
        return "aluno"


class UnknownRepo:
    def __init__(self, session) -> None:
        self.session = session

    async def resolve_user_role(self, user_id: str) -> str | None:
        return None


class BlockedProfessorRepo:
    def __init__(self, session) -> None:
        self.session = session

    async def resolve_user_identity(self, user_id: str) -> dict | None:
        return {"role": "professor", "is_professor": True, "liberado": False}


class DualRoleRepo:
    def __init__(self, session) -> None:
        self.session = session

    async def resolve_user_identity(self, user_id: str) -> dict | None:
        return {
            "role": "aluno",
            "is_aluno": True,
            "is_professor": True,
            "liberado": True,
        }


class DualRoleBlockedProfessorRepo:
    def __init__(self, session) -> None:
        self.session = session

    async def resolve_user_identity(self, user_id: str) -> dict | None:
        return {
            "role": "aluno",
            "is_aluno": True,
            "is_professor": True,
            "liberado": False,
        }


@pytest.mark.asyncio
async def test_authenticate_resolves_aluno_role() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "aluno-1", "aud": "authenticated"}, "test-secret", algorithm="HS256")

    auth = AuthService(settings=settings, session=None, access_repository_factory=AlunoRepo)
    user = await auth.authenticate(token)

    assert user.user_id == "aluno-1"
    assert user.role == "aluno"
    assert user.aluno_id == "aluno-1"


@pytest.mark.asyncio
async def test_authenticate_resolves_dual_role_user_without_losing_student_access() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "dual-1", "aud": "authenticated"}, "test-secret", algorithm="HS256")

    auth = AuthService(settings=settings, session=None, access_repository_factory=DualRoleRepo)
    user = await auth.authenticate(token)

    assert user.role == "aluno"
    assert user.roles == ("aluno", "professor")
    assert user.is_aluno is True
    assert user.is_professor is True
    assert user.aluno_id == "dual-1"
    assert user.professor_id == "dual-1"


@pytest.mark.asyncio
async def test_authenticate_keeps_student_access_for_dual_role_with_unreleased_professor() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "dual-2", "aud": "authenticated"}, "test-secret", algorithm="HS256")

    auth = AuthService(settings=settings, session=None, access_repository_factory=DualRoleBlockedProfessorRepo)
    user = await auth.authenticate(token)

    assert user.is_aluno is True
    assert user.is_professor is True
    assert user.professor_liberado is False


@pytest.mark.asyncio
async def test_authenticate_rejects_user_without_platform_role() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "ghost-1", "aud": "authenticated"}, "test-secret", algorithm="HS256")

    auth = AuthService(settings=settings, session=None, access_repository_factory=UnknownRepo)

    with pytest.raises(HTTPException) as exc:
        await auth.authenticate(token)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_authenticate_rejects_professor_without_release() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "prof-1", "aud": "authenticated"}, "test-secret", algorithm="HS256")

    auth = AuthService(settings=settings, session=None, access_repository_factory=BlockedProfessorRepo)

    with pytest.raises(HTTPException) as exc:
        await auth.authenticate(token)

    assert exc.value.status_code == 403
    assert exc.value.detail == "Professor sem liberacao de acesso."


@pytest.mark.asyncio
async def test_require_aluno_accepts_dual_role_user() -> None:
    user = UserContext(
        user_id="dual-1",
        role="aluno",
        roles=("aluno", "professor"),
        aluno_id="dual-1",
        professor_id="dual-1",
        professor_liberado=True,
    )

    resolved = await require_aluno(user)

    assert resolved.user_id == "dual-1"


@pytest.mark.asyncio
async def test_require_professor_rejects_unreleased_professor_role() -> None:
    user = UserContext(
        user_id="dual-1",
        role="aluno",
        roles=("aluno", "professor"),
        aluno_id="dual-1",
        professor_id="dual-1",
        professor_liberado=False,
    )

    with pytest.raises(HTTPException) as exc:
        await require_professor(user)

    assert exc.value.status_code == 403
    assert exc.value.detail == "Professor sem liberacao de acesso."


def test_require_admin_accepts_valid_basic_credentials() -> None:
    settings = Settings(admin_panel_username="admin", admin_panel_password="secret-admin")
    context = require_admin(
        credentials=HTTPBasicCredentials(username="admin", password="secret-admin"),
        settings=settings,
    )

    assert context.username == "admin"


def test_require_admin_rejects_invalid_basic_credentials() -> None:
    settings = Settings(admin_panel_username="admin", admin_panel_password="secret-admin")

    with pytest.raises(HTTPException) as exc:
        require_admin(
            credentials=HTTPBasicCredentials(username="admin", password="wrong"),
            settings=settings,
        )

    assert exc.value.status_code == 401


def test_decode_token_rejects_empty_token() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    auth = AuthService(settings=settings, session=None, access_repository_factory=AlunoRepo)

    with pytest.raises(HTTPException) as exc:
        auth.decode_token("   ")

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc.value.detail == "Token ausente."


def test_decode_token_rejects_invalid_audience() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "aluno-1", "aud": "other-aud"}, "test-secret", algorithm="HS256")
    auth = AuthService(settings=settings, session=None, access_repository_factory=AlunoRepo)

    with pytest.raises(HTTPException) as exc:
        auth.decode_token(token)

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc.value.detail == "Audience do token invalida."


def test_decode_token_rejects_missing_audience_claim() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "aluno-1"}, "test-secret", algorithm="HS256")
    auth = AuthService(settings=settings, session=None, access_repository_factory=AlunoRepo)

    with pytest.raises(HTTPException) as exc:
        auth.decode_token(token)

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc.value.detail == "Audience do token ausente."


def test_decode_token_rejects_invalid_algorithm() -> None:
    settings = Settings(supabase_jwt_secret="test-secret", supabase_jwt_audience="authenticated")
    token = jwt.encode({"sub": "aluno-1", "aud": "authenticated"}, "test-secret", algorithm="HS384")
    auth = AuthService(settings=settings, session=None, access_repository_factory=AlunoRepo)

    with pytest.raises(HTTPException) as exc:
        auth.decode_token(token)

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc.value.detail == "Token invalido (InvalidAlgorithmError)."

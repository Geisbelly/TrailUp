from dataclasses import dataclass, field
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.access import AccessRepository


@dataclass(slots=True)
class UserContext:
    user_id: str
    role: str
    roles: tuple[str, ...] = ()
    aluno_id: str | None = None
    professor_id: str | None = None
    professor_liberado: bool = False
    claims: dict[str, Any] = field(default_factory=dict)

    @property
    def is_aluno(self) -> bool:
        return "aluno" in self.roles or self.role == "aluno"

    @property
    def is_professor(self) -> bool:
        return "professor" in self.roles or self.role == "professor"


class AuthService:
    def __init__(
        self,
        settings: Settings,
        session: AsyncSession,
        access_repository_factory: type[AccessRepository] = AccessRepository,
    ) -> None:
        self.settings = settings
        self.session = session
        self.access_repository_factory = access_repository_factory

    def decode_token(self, token: str) -> dict[str, Any]:
        normalized_token = (token or "").strip()
        if not normalized_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token ausente.",
            )
        try:
            kwargs: dict[str, Any] = {
                "jwt": normalized_token,
                "key": self.settings.supabase_jwt_secret,
                "algorithms": ["HS256"],
            }
            if self.settings.supabase_jwt_audience:
                kwargs["audience"] = self.settings.supabase_jwt_audience
            return jwt.decode(**kwargs)
        except jwt.ExpiredSignatureError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expirado.",
            ) from exc
        except jwt.InvalidAudienceError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Audience do token invalida.",
            ) from exc
        except jwt.MissingRequiredClaimError as exc:
            claim = str(getattr(exc, "claim", "") or "").strip().lower()
            if claim == "aud":
                detail = "Audience do token ausente."
            else:
                detail = f"Claim obrigatoria ausente no token: {claim or 'desconhecida'}."
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=detail,
            ) from exc
        except jwt.InvalidSignatureError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Assinatura do token invalida.",
            ) from exc
        except jwt.DecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Formato de token invalido.",
            ) from exc
        except jwt.InvalidTokenError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token invalido ({type(exc).__name__}).",
            ) from exc

    async def _resolve_via_supabase_auth(self, token: str) -> dict[str, Any] | None:
        base_url = (self.settings.supabase_url or "").rstrip("/")
        api_key = self.settings.supabase_service_key
        if not base_url or not api_key:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{base_url}/auth/v1/user",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "apikey": api_key,
                    },
                )
        except httpx.HTTPError:
            return None

        if response.status_code != status.HTTP_200_OK:
            return None

        payload = response.json()
        user_id = payload.get("id")
        if not user_id:
            return None

        return {
            "sub": user_id,
            "aud": payload.get("aud") or self.settings.supabase_jwt_audience,
            "email": payload.get("email"),
            "role": payload.get("role") or payload.get("app_metadata", {}).get("role"),
            "app_metadata": payload.get("app_metadata") or {},
            "user_metadata": payload.get("user_metadata") or {},
        }

    async def authenticate(self, token: str) -> UserContext:
        try:
            payload = self.decode_token(token)
        except HTTPException as exc:
            payload = await self._resolve_via_supabase_auth(token)
            if payload is None:
                raise exc

        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token sem subject.",
            )

        access_repo = self.access_repository_factory(self.session)
        identity = None
        primary_role = None
        is_aluno = False
        is_professor = False
        liberado = True

        if hasattr(access_repo, "resolve_user_identity"):
            identity = await access_repo.resolve_user_identity(user_id)
            if identity is not None:
                primary_role = identity.get("role")
                is_aluno = bool(identity.get("is_aluno", primary_role == "aluno"))
                is_professor = bool(identity.get("is_professor", primary_role == "professor"))
                liberado = bool(identity.get("liberado", True))
        else:
            primary_role = await access_repo.resolve_user_role(user_id)
            is_aluno = primary_role == "aluno"
            is_professor = primary_role == "professor"

        if not (is_aluno or is_professor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario nao autorizado na plataforma.",
            )
        if is_professor and not liberado and not is_aluno:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Professor sem liberacao de acesso.",
            )

        role = primary_role or ("aluno" if is_aluno else "professor")
        roles = tuple(role_name for role_name, enabled in (("aluno", is_aluno), ("professor", is_professor)) if enabled)

        return UserContext(
            user_id=user_id,
            role=role,
            roles=roles,
            aluno_id=user_id if is_aluno else None,
            professor_id=user_id if is_professor else None,
            professor_liberado=liberado if is_professor else False,
            claims=payload,
        )

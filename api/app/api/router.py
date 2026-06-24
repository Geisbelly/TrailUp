from fastapi import APIRouter

from app.api.admin import router as admin_router
from app.api.health import router as health_router
from app.api.v1.admin import router as admin_api_router
from app.api.v1.emocoes import router as emocoes_router
from app.api.v1.materiais import router as materiais_router
from app.api.v1.personalizacao import router as personalizacao_router
from app.api.v1.telemetria import router as telemetria_router


api_router = APIRouter()
v1_router = APIRouter(prefix="/api/v1")

v1_router.include_router(admin_api_router)
v1_router.include_router(emocoes_router)
v1_router.include_router(materiais_router)
v1_router.include_router(personalizacao_router)
v1_router.include_router(telemetria_router)

api_router.include_router(admin_router)
api_router.include_router(health_router)
api_router.include_router(v1_router)

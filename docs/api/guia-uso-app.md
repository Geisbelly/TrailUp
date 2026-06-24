# Guia de Uso - API TrailUp

## Passos
1. Configurar `.env`.
2. Rodar migracoes (`alembic upgrade head`).
3. Subir API (`uvicorn app.main:app --reload`).
4. Validar `GET /health`.
5. Testar enfileiramento de job de personalizacao.

## Fluxos para validar
- `POST /api/v1/personalizar/jobs/enrollment`
- `GET /api/v1/personalizar/jobs`
- `POST /api/v1/telemetria/lotes`

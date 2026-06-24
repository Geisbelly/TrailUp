# TrailUp API

API principal do ecossistema TrailUp (FastAPI + LangGraph + Supabase).

## Papel no sistema
- Autenticacao backend com JWT do Supabase.
- Orquestracao de personalizacao por perfil BrainHex/turma/topico.
- Pipeline assincro de jobs (`personalizacao_jobs` e `personalizacao_job_targets`).
- Ingestao de telemetria do app mobile.
- Integracao com o microservico `ApiBrainHex` para geracao de midias.

## Estado atual (2026-04-19)
- Fluxo de `media_render` deduplicado por perfil BrainHex (`brainhex_profile_key`) e nao por `aluno_id`.
- Reuso de job aberto por `kind + classe_id + topico_id + source_hash + brainhex_profile_key`.
- Reuso de midia dentro do mesmo job via snapshot compartilhado (`shared_rendered_media`).
- Prefixo de storage orientado a perfil (`brainhex/{perfil}/classe-{id}/topico-{id}`).
- API nao e responsavel por regra de ranking no banco; ranking e consolidado por view SQL consumida pelos clientes.

## Integracoes
- Web Professor (`brainhex-navigator`): dispara jobs e consulta status/contexto.
- Mobile (`trailup-app-dsm-2502`): le personalizacao direto no Supabase; usa API para disparo/retentativa, progresso personalizado, chat e telemetria.
- ApiBrainHex: gera markdown, audio e apresentacao e grava em Storage + `conteudo_personalizado.materiais`.

## Estrutura principal
```text
app/
  api/                endpoints v1
  agent/              grafos e estado
  repositories/       acesso SQL
  services/           personalizacao, jobs, telemetria, storage, auth
  schemas/            contratos pydantic
  core/               settings
alembic/              migracoes
sql/                  scripts manuais
tests/                testes unitarios e de integracao
```

## Configuracao
Variaveis base (ver `app/core/settings.py`):
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_JWT_AUDIENCE`
- `brainhex_api_url`
- `GEMINI_API_KEY`
- `PERSONALIZACAO_JOB_CONCURRENCY`
- `PERSONALIZACAO_JOB_POLL_SEC`

Exemplo em `.env.example`.

## Executar localmente
```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

## Testes
```bash
pytest
```

## Endpoints relevantes
- `GET /health`
- `POST /api/v1/personalizar`
- `GET /api/v1/personalizar/{aluno_id}`
- `POST /api/v1/personalizar/progresso`
- `POST /api/v1/personalizar/chat`
- `POST /api/v1/personalizar/jobs/enrollment`
- `POST /api/v1/personalizar/jobs/class-delta`
- `POST /api/v1/telemetria/lotes`

## Documentacao
Indice oficial em `docs/README.md`.

## Documentos novos
- docs/arquitetura-microservico-e-app.md
- docs/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md
- docs/README.md

## Documentacao detalhada (arquitetura separada)
- docs/arquitetura-app-detalhada.md
- docs/arquitetura-microservico-detalhada.md
- docs/funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md

## Pacote TCC
- docs/tcc/README.md

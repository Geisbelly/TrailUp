# Funcionamento da API e Fluxos

## Visao geral
A API coordena a personalizacao e a telemetria do ecossistema TrailUp.

Fluxo principal:
1. Web cria/ajusta conteudo pedagogico no Supabase.
2. Web enfileira jobs de personalizacao na API.
3. Worker processa targets por perfil BrainHex/topico (com owner tecnico quando necessario).
4. API persiste resultado em `conteudo_personalizado`.
5. Mobile le personalizacao no Supabase e usa API para progresso personalizado/chat/telemetria.

## Fluxo de jobs de personalizacao
- Job: `personalizacao_jobs`.
- Target por aluno: `personalizacao_job_targets`.
- Estados comuns: `pending`, `processing`, `completed`, `partial`, `failed`.

### Midia por perfil BrainHex
No fluxo atual, o job de midia usa chave de deduplicacao por perfil:
- `kind`
- `classe_id`
- `topico_id`
- `source_hash`
- `brainhex_profile_key`

Consequencias:
- Evita gerar a mesma midia repetidamente para alunos com o mesmo perfil.
- Reaproveita artefatos no mesmo job via `shared_rendered_media`.
- Reduz custo e tempo de processamento.

## Integracao com ApiBrainHex
A API chama o microservico para gerar:
- markdown
- audio
- apresentacao

Esses artefatos sao gravados no Storage e refletidos em `conteudo_personalizado.materiais`.

## Telemetria
Endpoint: `POST /api/v1/telemetria/lotes`.

Objetivo:
- consolidar sinais de estudo enviados pelo app.
- alimentar analise adaptativa.

## Ranking
Ranking nao e calculado pela API HTTP.
As regras de rank sao aplicadas no banco (views/triggers), e os clientes leem o resultado consolidado.

## Observabilidade minima
- `GET /health`
- `GET /api/v1/personalizar/jobs`
- logs de worker (`personalizacao_jobs.py`)
- retries e backoff configurados em settings

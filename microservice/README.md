# ApiBrainHex

Microservico de geracao de materiais personalizados por perfil BrainHex.

## O que este servico faz
- Recebe contexto pedagogico de personalizacao.
- Aprofunda o conteudo-base com OpenAI antes de qualquer adaptacao BrainHex,
  usando Gemini somente como contingencia para quota ou indisponibilidade.
- Gera markdown, roteiro de audio e estrutura de slides com Gemini como
  provedor principal, usando OpenAI automaticamente quando o Gemini estiver
  temporariamente indisponivel ou sem cota.
- Renderiza apresentacoes editoriais 16:9 em um sistema visual tematico por perfil,
  com layouts variados no estilo Slidesgo e imagens sem texto geradas pela OpenAI.
- Faz upload dos artefatos no Supabase Storage.
- Atualiza `conteudo_personalizado.materiais` com status por artefato.

## Perfis BrainHex suportados
- `mastermind`
- `seeker`
- `survivor`
- `daredevil`
- `conqueror`
- `socializer`
- `achiever`

## Endpoints
- `GET /api/health`
- `POST /api/enrich-content` (OpenAI Responses API, em lotes validados)
- `POST /api/v1/archive` (uso via frontend)
- `POST /api/personalizar` (integracao com ApiTraiUp)

## Apresentacoes tematicas
- Cada perfil BrainHex possui paleta, linguagem visual, textura, motivos e narrativa
  proprios, sem substituir o tema pedagogico do conteudo.
- O deck alterna capa, divisao editorial, cards, destaque, linha do tempo e
  encerramento; nao usa mais um unico molde de dois paineis.
- A API envia `presentation_theme` e exige
  `required_presentation_design_version=slidesgo-editorial-v3`.
- `GET /api/health` informa `presentation_engine_version` e
  `presentation_design_version`, impedindo que um deploy antigo gere slides legados.
- Os metadados do PDF registram `design_system`; arquivos sem essa assinatura sao
  considerados antigos e entram novamente na fila de geracao.

## Estado atual (2026-07-28)
- Integrado ao fluxo de `media_render` da API TrailUp.
- Armazenamento por perfil em prefixos `brainhex/{perfil}/classe-{id}/topico-{id}`.
- Merge seguro em `materiais` sem sobrescrever artefato ja finalizado (`completed`).
- App mobile consome personalizacao direto no Supabase; ApiBrainHex permanece backend-only via API TrailUp.

## Variaveis de ambiente
- `OPENAI_API_KEY` (principal no enriquecimento; usada tambem em imagens e na
  contingencia da geracao)
- `OPENAI_CONTENT_ENRICHMENT_MODEL` (padrao: `gpt-5.6-sol`)
- `CONTENT_ENRICHMENT_BATCH_SIZE` (padrao: `8`)
- `CONTENT_ENRICHMENT_MAX_ATTEMPTS` (padrao: `3`)
- `GEMINI_CONTENT_ENRICHMENT_FALLBACK_MODEL` (padrao: `gemini-3.5-flash-lite`)
- `GEMINI_CONTENT_ENRICHMENT_EMERGENCY_MODEL` (ultima contingencia; padrao:
  `gemini-3.6-flash`)
- `CONTENT_ENRICHMENT_OPENAI_COOLDOWN_MS` (padrao: `300000`)
- `CONTENT_ENRICHMENT_GEMINI_COOLDOWN_MS` (padrao: `300000`)
- `GEMINI_API_KEY`
- `CONTENT_GENERATION_MODEL` (Gemini principal; padrao: `gemini-3.6-flash`)
- `CONTENT_GENERATION_BLOCK_BATCH_SIZE` (padrao: `12`, maximo: `24`)
- `OPENAI_CONTENT_GENERATION_FALLBACK_MODEL` (padrao: `gpt-5.6-sol`)
- `GEMINI_CONTENT_GENERATION_EMERGENCY_MODEL` (ultima contingencia; padrao:
  `gemini-3.5-flash-lite`)
- `CONTENT_GENERATION_GEMINI_COOLDOWN_MS` (padrao: `300000`)
- `CONTENT_GENERATION_OPENAI_COOLDOWN_MS` (padrao: `300000`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Comandos
```bash
npm install
npm run dev        # inicia o servidor em :3000
npm start          # alias de dev (para produção)
npm test           # roda a suite (node:test + tsx)
npm run lint       # tsc --noEmit
```

## Estrutura
```text
server.ts
src/
  constants/brainHex.ts
  lib/
    serialQueue.ts        # serializa por chave (testado)
    textSanitize.ts       # Latin-1 sanitizer para jsPDF (testado)
    wav.ts                # header WAV para PCM Gemini TTS (testado)
  services/
    contentEnrichmentService.ts # aprofundamento curricular via OpenAI
    contentGenerationService.ts # contingencia OpenAI para indisponibilidade Gemini
    geminiService.ts      # texto/slides via Gemini principal e áudio TTS
    openaiImageService.ts # fundos editoriais temáticos via OpenAI
    pdfService.ts         # deck HTML 16:9 renderizado pelo Puppeteer
    supabaseService.ts    # storage + merge defensivo + heartbeat + recovery
  types/index.ts
```

## Migrações SQL (Supabase)
Migrações ficam em `sql/migrations/` e são aplicadas manualmente
(SQL Editor do dashboard, `supabase db push` via CLI, ou psql).
O serviço detecta se a migração foi aplicada e cai em fallback JS
quando ausente — pode deployar código antes da migração.

| Arquivo | Efeito |
|---------|--------|
| `0001_merge_personalizacao_materiais_rpc.sql` | Adiciona função PL/pgSQL atômica com `pg_advisory_xact_lock` para o merge de `materiais`. Resolve race cross-instance |
| `0002_mark_personalizacao_failed_rpc.sql` | Mesma proteção para `markPersonalizacaoFailed` — preserva artefatos completados quando marca status `falha` |

## Nota
Antes da versão 0.2.0 o repo continha um app React (demo do AI Studio) servido
no mesmo processo. Foi removido — este é um microsserviço puramente backend.
Veja `docs/arquitetura-microservico-e-app.md` para o desenho atualizado.

## Documentacao
- `DOCS_API.md` (referencia de endpoints e contratos)
- `GUIA_USO.md` (guia operacional)
- `docs/README.md` (indice da documentacao)
- `docs/integracao-apitraiup.md`
- `docs/operacao-e-observabilidade.md`

## Documentos novos
- docs/arquitetura-microservico-e-app.md
- docs/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md
- docs/README.md

## Documentacao detalhada (arquitetura separada)
- docs/arquitetura-microservico-detalhada.md
- docs/arquitetura-app-detalhada.md
- docs/funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md

## Pacote TCC
- docs/tcc/README.md

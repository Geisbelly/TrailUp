# ApiBrainHex

Microservico de geracao de materiais personalizados por perfil BrainHex.

## O que este servico faz
- Recebe contexto pedagogico de personalizacao.
- Gera markdown, audio e apresentacao com Gemini.
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
- `POST /api/v1/archive` (uso via frontend)
- `POST /api/personalizar` (integracao com ApiTraiUp)

## Estado atual (2026-04-19)
- Integrado ao fluxo de `media_render` da API TrailUp.
- Armazenamento por perfil em prefixos `brainhex/{perfil}/classe-{id}/topico-{id}`.
- Merge seguro em `materiais` sem sobrescrever artefato ja finalizado (`completed`).
- App mobile consome personalizacao direto no Supabase; ApiBrainHex permanece backend-only via API TrailUp.

## Variaveis de ambiente
- `GEMINI_API_KEY`
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
    geminiService.ts      # texto/slides/áudio/imagens via Gemini
    pdfService.ts         # PDF 2-painéis dos slides (jsPDF)
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

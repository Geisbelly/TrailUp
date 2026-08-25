# TrailUp Web (Console do Professor)

Repositório da aplicação web do ecossistema TrailUp. Esta camada cobre:
- páginas institucionais/públicas
- autenticação de aluno e professor
- console do professor para modelagem pedagógica
- disparo de jobs de personalização na API
- uso de Edge Functions para geração e avaliação com IA

## Atualizações recentes (2026-04-13)

- Integração com pipeline multimídia fast-first da API:
  - retorno inicial com `cards` + `quiz`;
  - mídias (`pdf`, `documento`, `apresentacao`, `audio`, `video`) finalizadas em segundo plano.
- Contrato da personalização preservado para Web/Mobile, com status por mídia em `materiais[*].metadata.status`.
- Fluxo de sincronização temática de classe ativo:
  - alterações em `classe` podem enfileirar job `class_theme_sync` na API;
  - resultado alimenta `classe_mapa_tema` no banco.
- Mantida semântica de `nota_estabelecida` opcional (`NULL`) nas questões.

## 1. Papel da Web no ecossistema

A Web não executa a personalização assíncrona por conta própria. Ela:
1. grava estrutura acadêmica no Supabase
2. chama endpoints de jobs na API
3. consome status/contexto para observabilidade docente

Fluxo macro:

```text
Professor
  -> Web Console
     -> Supabase (CRUD de classe/topico/conteudo/atividade/questao)
     -> API /api/v1/personalizar/jobs/*
         -> worker gera conteudo_personalizado
  -> Mobile le personalizacao persistida
```

## 2. Fluxos principais implementados

### 2.1 autenticação e autorização

- Fonte primária: Supabase Auth.
- Resolução de papel em `professor` e `alunos`.
- Rota `/console` exige:
  - usuario autenticado
  - role professor
  - `professor.liberado = true`

Arquivos centrais:
- `src/App.tsx`
- `src/hooks/useAuth.tsx`
- `src/components/ProtectedRoute.tsx`

### 2.2 Gestão pedagógica

CRUD principal em tabelas:
- `classe`, `classe_aluno`
- `topicos`, `topico_edges`
- `conteudos`, `midias`, `cards`
- `atividades`, `atividade_conteudos`, `questoes`

Componentes principais:
- `src/components/console/ClassManagementSection.tsx`
- `src/components/console/trilha/TopicsManager.tsx`
- `src/components/console/trilha/TopicEditDrawer.tsx`
- `src/components/console/trilha/QuestionsManager.tsx`

### 2.3 Personalização por aluno (via API)

Chamadas feitas pela Web:
- `POST /api/v1/personalizar/jobs/enrollment`
- `POST /api/v1/personalizar/jobs/class-delta`
- `POST /api/v1/personalizar/jobs/student-cleanup`
- `POST /api/v1/personalizar/jobs/full-sync`
- `GET /api/v1/personalizar/jobs`
- `GET /api/v1/personalizar/contexto/{aluno_id}`

Cliente HTTP:
- `src/components/console/trilha/personalizacaoJobsApi.ts`
- `src/components/console/DashboardSection.tsx`

### 2.4 Edge Functions usadas pelo console

1. `generate-content-ai`
- gera sugestões de trilha, conteúdos, cards e atividades.
- arquivo: `supabase/functions/generate-content-ai/index.ts`

2. `validate-essay-answer-ai`
- corrige questão dissertativa com Gemini.
- arquivo: `supabase/functions/validate-essay-answer-ai/index.ts`

Semântica atual para nota da dissertativa:
- com `notaEstabelecida`: usa nota informada
- sem `notaEstabelecida`: usa escala percentual padrão (`nota_maxima = 100`)

Cliente web:
- `src/components/console/trilha/essayValidationApi.ts`

## 3. Regra de `nota_estabelecida` (questões)

Estado atual aprovado:
- campo opcional de verdade (`NULL` permitido)
- sem conversão automatica para `1`

Comportamento na Web:
- input vazio -> persiste `null`
- input preenchido -> deve ser `> 0` (normalizado para 2 casas)
- input inválido preenchido -> bloqueia submit
- exibição com `null` -> "Sem nota definida"

Arquivos relacionados:
- `src/lib/question-score.ts`
- `src/components/console/trilha/QuestionsManager.tsx`
- `src/components/console/trilha/TopicEditDrawer.tsx`
- `src/components/console/trilha/GenerateTrailDialog.tsx`
- `supabase/migrations/20260412_make_nota_estabelecida_optional.sql`

## 4. Banco de dados e contratos

Documentação detalhada do schema:
- [estrutura-banco-supabase.md](../docs/frontend/estrutura-banco-supabase.md)

Tipos Supabase locais:
- `src/integrations/supabase/types.ts`
- `src/lib/database-schema.ts`

## 4.1 Documentação complementar

- [guia-uso-app.md](../docs/frontend/guia-uso-app.md)
- [seguranca.md](../docs/frontend/seguranca.md)
- [politicas-dados-privacidade.md](../docs/frontend/politicas-dados-privacidade.md)
- [arquitetura-funcionamento-geral-sistema.md](../docs/frontend/arquitetura-funcionamento-geral-sistema.md)
- [funcionamento-api-arquitetura-fluxos.md](../docs/frontend/funcionamento-api-arquitetura-fluxos.md)

## 5. Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<project-id>
VITE_SITE_URL=https://<site>
VITE_APITRAIUP_URL=http://<host>:8000
VITE_PLAY_STORE_LINK=https://play.google.com/store/apps/details?id=...
VITE_APK_URL=https://...
```

## 6. Execução local

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## 7. Estrutura resumida

```text
src/
  components/console/        areas do console do professor
  hooks/                     auth e hooks
  integrations/supabase/     cliente e tipos
  lib/                       normalizadores e utilitarios
  pages/                     rotas publicas e console
supabase/functions/
  generate-content-ai/
  validate-essay-answer-ai/
supabase/migrations/
```

## 8. Repositório relacionados

- API: `C:\Users\geisb\Downloads\ApiTraiUp`
- Mobile: `C:\Users\geisb\Documents\GitHub\trailup-app-dsm-2502`

Para visão completa do ecossistema, ler os READMEs desses repositórios junto com o documento de banco.

## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.

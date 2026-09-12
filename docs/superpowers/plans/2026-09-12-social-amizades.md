# Social completo com amizades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a aba Social real no mobile com amigos, convites, colegas e bloqueios, mantendo a loja modal como ação contextual.

**Architecture:** O PostgreSQL mantém uma linha canônica por par de alunos e expõe leituras seguras e mutações transacionais por RPC. O mobile consulta um serviço tipado, renderiza a aba condicionada ao portão Social e atualiza o estado somente após confirmação do banco.

**Tech Stack:** PostgreSQL/Supabase, Alembic, RLS/RPC, Expo Router, React Native, TypeScript, Node test runner.

---

### Task 1: Modelo social, RPCs, view segura e RLS

**Files:**
- Create: `docs/mobile/sql/20260912_02_social_amizades.sql`
- Create: `api/alembic/versions/20260912_02_social_amizades.py`
- Create: `api/tests/test_social_schema.py`

- [ ] **Step 1: Escrever teste estrutural da migração**

Verificar tabela canônica, estados, unique do par, checks, funções das seis ações, view segura, regra de colega e RLS sem INSERT/UPDATE/DELETE direto.

- [x] **Step 2: Criar SQL idempotente**

Criar `social_relacionamentos`, canonicalizar o par com `LEAST/GREATEST`, adicionar índices e criar as RPCs `social_enviar_convite`, `social_aceitar_convite`, `social_recusar_convite`, `social_desfazer_amizade`, `social_bloquear` e `social_desbloquear`. Criar `social_listar_pessoas` retornando somente DTO público e filtrando colegas elegíveis.

- [x] **Step 3: Aplicar RLS**

Permitir leitura somente via view/RPC e bloquear mutação direta do papel `authenticated`. Conceder EXECUTE das RPCs.

- [x] **Step 4: Criar wrapper Alembic**

Aplicar o SQL compartilhado no upgrade e remover funções, view e tabela no downgrade.

- [ ] **Step 5: Rodar teste estrutural**

Run: `python3 -m pytest api/tests/test_social_schema.py -q`

Expected: PASS quando o ambiente Python estiver com dependências instaladas; caso contrário, registrar a dependência ausente.

### Task 2: Serviço social mobile

**Files:**
- Create: `mobile/src/services/social/socialService.ts`
- Create: `mobile/src/services/social/socialModel.ts`
- Create: `mobile/src/services/social/socialModel.test.ts`

- [ ] **Step 1: Testar normalização dos DTOs**

Cobrir agrupamento em amigos, convites recebidos/enviados e colegas; mapear códigos de erro das RPCs.

- [x] **Step 2: Criar tipos e normalizadores**

Definir `SocialPerson`, `SocialSnapshot`, `SocialStatus` e `SocialActionError`. Normalizar respostas da RPC e manter o relacionamento por `relationshipId`.

- [x] **Step 3: Criar serviço Supabase**

Implementar `carregarSocial` e as seis ações via RPC, usando `supabase.auth.getUser()` somente para identidade local quando necessário.

- [ ] **Step 4: Rodar teste e typecheck**

Run: `node --import tsx --test src/services/social/socialModel.test.ts` e `./node_modules/.bin/tsc --noEmit -p tsconfig.json`

Expected: PASS.

### Task 3: Componentes da aba Social

**Files:**
- Create: `mobile/src/components/social/SocialPersonCard.tsx`
- Create: `mobile/src/components/social/SocialInviteCard.tsx`
- Create: `mobile/src/app/(tabs)/social/index.tsx`
- Create: `mobile/src/app/(tabs)/social/_layout.tsx`

- [x] **Step 1: Implementar card de pessoa**

Renderizar avatar fallback, nome, perfil ativo, status e ação contextual; expor bloqueio em menu/ação secundária.

- [x] **Step 2: Implementar tela**

Criar os segmentos Amigos, Convites e Encontrar colegas, com loading, vazio, erro/retry e feedback de ação. Integrar `StoreLauncher` e `StoreModal` no cabeçalho.

- [x] **Step 3: Implementar layout de rota**

Configurar header oculto e tela pronta para o tab navigator.

- [ ] **Step 4: Rodar lint e typecheck**

Run: `npm run lint` e `./node_modules/.bin/tsc --noEmit -p tsconfig.json`

Expected: sem erros.

### Task 4: Expor a aba conforme o portão Social

**Files:**
- Modify: `mobile/src/app/(tabs)/_layout.tsx`
- Modify: `mobile/src/components/DesbloqueioModal.tsx` only if icon/copy integration needs it
- Test: `mobile/src/utils/portoes.test.ts` only if a route visibility assertion is added

- [x] **Step 1: Adicionar Social ao tab navigator**

Inserir a aba entre Notificações e Ranking, com ícone `account-heart`, `href: aberturas.social ? undefined : null`, e o mesmo palette/perfil ativo.

- [x] **Step 2: Remover launcher duplicado do Ranking**

Retirar `StoreLauncher`/`StoreModal` da tela Ranking e manter o Ranking focado em classificação.

- [ ] **Step 3: Validar fluxo de rota**

Run: `npm run lint`, `./node_modules/.bin/tsc --noEmit -p tsconfig.json` e `npm test`

Expected: PASS; a suíte existente continua com os mesmos resultados.

### Task 5: Verificação e integração

**Files:**
- Modify: none unless verification finds a defect

- [ ] **Step 1: Conferir SQL e diff**

Run: `git diff --check` e inspeção das funções/RLS.

- [ ] **Step 2: Rodar suíte mobile completa**

Run: `npm test`

Expected: todos os testes passando.

- [ ] **Step 3: Commitar mudanças**

```bash
git add docs/mobile/sql/20260912_02_social_amizades.sql api/alembic/versions/20260912_02_social_amizades.py api/tests/test_social_schema.py mobile/src/services/social mobile/src/components/social "mobile/src/app/(tabs)/social" "mobile/src/app/(tabs)/_layout.tsx"
git commit -m "feat: add social friendships tab"
```

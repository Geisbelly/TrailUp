# Loja Modal Social por Perfil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma loja modal contextual, acessível pela superfície social existente, com identidade visual por perfil, catálogo em cinco seções, gate de telemetria e compra transacional segura.

**Architecture:** A migração SQL cria catálogo, tema por perfil, saldo/livro-razão, posse e uma função de compra/gate protegida por RLS. O mobile consulta o Supabase diretamente através de um serviço tipado e renderiza um `StoreModal` reutilizável; como ainda não há rota Social dedicada, o primeiro ponto de entrada será o cabeçalho da aba Ranking, que é a superfície social disponível e já é liberada pelo gate Social.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS e funções SQL; Expo React Native; TypeScript; React Native Modal; Supabase JS; Vitest/Jest via scripts existentes.

---

### Task 1: Banco da loja e contrato transacional

**Files:**
- Create: `docs/mobile/sql/20260912_01_loja_modal_social.sql`
- Create: `api/alembic/versions/20260912_01_loja_modal_social.py`
- Test: `api/tests/test_loja_modal_schema.py`

- [x] **Step 1: Escrever testes da migração e do contrato**

Criar testes que verifiquem que a migração contém as tabelas `loja_perfis`, `loja_itens`, `loja_saldos`, `loja_movimentos`, `loja_posses`, as cinco seções, a restrição de posse única, a função de compra e referências a `scope`, `active_sec` e `captured_at`.

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `pytest api/tests/test_loja_modal_schema.py -q`

Expected: FAIL porque os arquivos de migração ainda não existem.

- [x] **Step 3: Criar a migração SQL de referência**

Adicionar tipos/checks, tabelas, índices, seed idempotente do tema padrão, RLS e a função `trailup_comprar_loja_item(p_item_id bigint, p_request_id uuid)`. O gate deve calcular `sum(active_sec)` apenas para o `scope` declarado, filtrando o aluno autenticado e capturas até `captured_at` atual; a função deve bloquear saldo, revalidar preço/ativo/gate/posse, inserir movimento e posse em uma transação.

- [x] **Step 4: Criar a migração Alembic equivalente**

Usar `op.execute` para aplicar o mesmo SQL em ambientes que sobem pelo backend Python. O downgrade deve remover função, políticas e tabelas na ordem reversa.

- [ ] **Step 5: Rodar os testes da migração**

Run: `pytest api/tests/test_loja_modal_schema.py -q`

Expected: PASS.

- [ ] **Step 6: Commitar a camada de dados**

```bash
git add docs/mobile/sql/20260912_01_loja_modal_social.sql api/alembic/versions/20260912_01_loja_modal_social.py api/tests/test_loja_modal_schema.py
git commit -m "feat: add store schema and purchase transaction"
```

### Task 2: Serviço mobile tipado

**Files:**
- Create: `mobile/src/services/loja/lojaService.ts`
- Create: `mobile/src/services/loja/lojaService.test.ts`
- Modify: `mobile/src/database/supabase.ts` only if a typed helper is required

- [x] **Step 1: Escrever testes do serviço**

Cobrir `carregarLoja` com perfil ativo, seção e aluno; normalização dos cinco estados de item; e `comprarItem` enviando somente `item_id` e `request_id`, sem aceitar preço/gate do cliente.

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run: `npm --prefix mobile test -- --runInBand mobile/src/services/loja/lojaService.test.ts`

Expected: FAIL porque o serviço ainda não existe.

- [x] **Step 3: Implementar tipos e consultas**

Definir `StoreSection`, `StoreProfileTheme`, `StoreItem`, `StoreSnapshot` e `PurchaseResult`. Consultar configuração do perfil, itens ativos, saldo e posses; mapear o estado calculado retornado pelo banco. Usar `supabase.rpc("trailup_comprar_loja_item", ...)` para compra.

- [ ] **Step 4: Rodar os testes e lint**

Run: `npm --prefix mobile test -- --runInBand mobile/src/services/loja/lojaService.test.ts` e `npm --prefix mobile run lint`

Expected: PASS e lint sem erros novos.

- [ ] **Step 5: Commitar o serviço**

```bash
git add mobile/src/services/loja
git commit -m "feat: add typed store service"
```

### Task 3: Modal visual da loja

**Files:**
- Create: `mobile/src/components/loja/StoreModal.tsx`
- Create: `mobile/src/components/loja/StoreLauncher.tsx`
- Create: `mobile/src/components/loja/storeTheme.ts`
- Test: `mobile/src/components/loja/storeTheme.test.ts`

- [x] **Step 1: Escrever testes do tema**

Verificar que perfil normalizado resolve tema determinístico, que configuração ausente usa fallback e que o ícone não expõe saldo.

- [x] **Step 2: Implementar o tema e o launcher**

O launcher será um `Pressable` pequeno com acessibilidade, usando `icon_key`/fallback e cor do perfil. Ele abre o modal sem navegação.

- [x] **Step 3: Implementar o modal**

Usar `Modal` transparente, cabeçalho “LOJA”, saldo, baú temático, botão de fechar, barra vertical com Informações/Itens/Combos/Bônus/Presentes, cards e estados de loading/erro/bloqueado/disponível/adquirido. Preservar a seção enquanto o modal estiver aberto e permitir retry.

- [ ] **Step 4: Rodar testes e lint**

Run: `npm --prefix mobile test -- --runInBand mobile/src/components/loja/storeTheme.test.ts` e `npm --prefix mobile run lint`

Expected: PASS e lint sem erros novos.

- [ ] **Step 5: Commitar a UI**

```bash
git add mobile/src/components/loja
git commit -m "feat: add profile-themed store modal"
```

### Task 4: Integrar na superfície social existente

**Files:**
- Modify: `mobile/src/app/(tabs)/ranking/index.tsx`
- Test: `mobile/src/app/(tabs)/ranking/index.test.tsx` if the repository test setup supports screen tests

- [ ] **Step 1: Adicionar teste de integração**

Verificar que o launcher aparece no cabeçalho da tela Ranking, abre o modal e usa o perfil ativo do `SessaoContext`.

- [x] **Step 2: Implementar integração**

Adicionar estado `storeVisible`, carregar snapshot sob demanda ao abrir, renderizar `StoreLauncher` no cabeçalho superior e `StoreModal` como irmão do `ScrollView`. Não criar nova rota e não alterar o gate de Ranking.

- [ ] **Step 3: Rodar build mobile**

Run: `npm --prefix mobile run lint` e `npx tsc --noEmit -p mobile/tsconfig.json`

Expected: PASS.

- [ ] **Step 4: Commitar a integração**

```bash
git add "mobile/src/app/(tabs)/ranking/index.tsx" mobile/src/app/(tabs)/ranking/index.test.tsx
git commit -m "feat: expose store from social surface"
```

### Task 5: Verificação final

**Files:**
- Modify: none unless a test exposes a defect

- [ ] **Step 1: Rodar testes Python relacionados**

Run: `pytest api/tests -q`

Expected: PASS.

- [ ] **Step 2: Rodar testes e typecheck mobile**

Run: `npm --prefix mobile test -- --runInBand`, `npm --prefix mobile run lint` e `npx tsc --noEmit -p mobile/tsconfig.json`

Expected: PASS.

- [ ] **Step 3: Conferir diff e estado do branch**

Run: `git diff --check HEAD~5..HEAD` e `git status --short`

Expected: nenhum erro de whitespace; mudanças da tarefa isoladas dos artefatos preexistentes de `graphify-out`.

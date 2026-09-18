# Bag de itens pessoais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma Bag acessível pela Trilha e pelo Perfil que reúna cards gerados e itens autorais, permitindo criar, editar, excluir e compartilhar resumos, anotações e cards dentro dos conteúdos.

**Architecture:** `cards_personalizados` permanece a fonte dos cards gerados. Uma nova `bag_itens` armazena apenas itens criados pelo aluno; RPCs autenticadas expõem uma projeção unificada e validam vínculos, autoria e compartilhamento. O mobile usa um serviço único e um componente de Bag reutilizável nos dois pontos de entrada e no editor contextual da trilha.

**Tech Stack:** PostgreSQL/Supabase, Alembic, PL/pgSQL/RLS, Expo Router, React Native, TypeScript, Node test runner.

---

### Task 1: Criar o modelo autoral e a leitura unificada

**Files:**
- Create: `api/alembic/versions/20260913_12_bag_itens_pessoais.py`
- Create: `api/tests/test_bag_itens_schema.py`

- [ ] **Step 1: Escrever os testes da migration**

```python
from pathlib import Path


MIGRACAO = Path(__file__).parents[1] / "alembic" / "versions" / "20260913_12_bag_itens_pessoais.py"


def test_migrationa_cria_tabela_autoral_com_tipos_e_soft_delete() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS public.bag_itens" in source
    assert "resumo" in source and "anotacao" in source and "card" in source
    assert "excluido_em" in source


def test_migrationa_expoe_cards_existentes_e_itens_autorais() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "cards_personalizados" in source
    assert "bag_itens" in source
    assert "origem" in source
    assert "editavel" in source


def test_migrationa_protege_posse_e_vinculo_com_a_turma() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "auth.uid()" in source
    assert "social_chat" not in source
    assert "classe_aluno" in source
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run: `api/.venv/bin/pytest -q api/tests/test_bag_itens_schema.py`

Expected: FAIL porque a migration ainda não existe.

- [ ] **Step 3: Implementar tabela, índices, RLS e RPCs**

Criar `bag_itens` com `aluno_id`, vínculos opcionais de classe/tópico/conteúdo,
`tipo`, `titulo`, `conteudo`, `frente`, `verso`, `metadata`, timestamps e
`excluido_em`. Criar `bag_listar(p_origem, p_tipo, p_classe_id, p_topico_id,
p_busca)` retornando JSONB e unindo cards ativos de `cards_personalizados` com
itens autorais não excluídos. Criar `bag_criar`, `bag_atualizar` e
`bag_excluir`, todos `SECURITY DEFINER`, com `search_path` fixo, validação do
formato por tipo, limite de texto e confirmação de que o aluno pertence à
classe e que tópico/conteúdo pertencem à classe. Conceder execução somente a
`authenticated`; políticas de tabela restringem `aluno_id = auth.uid()`.

- [ ] **Step 4: Rodar os testes e a migration em banco de desenvolvimento**

Run: `api/.venv/bin/pytest -q api/tests/test_bag_itens_schema.py`

Run: `cd api && .venv/bin/alembic upgrade head`

Expected: testes PASS e Alembic em `20260913_12 (head)`.

- [ ] **Step 5: Commitar**

```bash
git add api/alembic/versions/20260913_12_bag_itens_pessoais.py api/tests/test_bag_itens_schema.py
git commit -m "feat(bag): add personal items schema and secure catalog"
```

### Task 2: Criar contrato e serviço mobile da Bag

**Files:**
- Create: `mobile/src/services/bag/bagModel.ts`
- Create: `mobile/src/services/bag/bagService.ts`
- Create: `mobile/src/services/bag/bagService.test.ts`

- [ ] **Step 1: Escrever testes do contrato e normalização**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBagItem, validateBagDraft } from "./bagModel";

test("normaliza card gerado como somente leitura", () => {
  const item = normalizeBagItem({ id: 4, origem: "plataforma", tipo: "card", editavel: false });
  assert.equal(item.editavel, false);
  assert.equal(item.origem, "plataforma");
});

test("valida campos específicos por tipo", () => {
  assert.equal(validateBagDraft({ tipo: "resumo", titulo: "Resumo", conteudo: "Texto" }), null);
  assert.match(validateBagDraft({ tipo: "card", titulo: "Card", frente: "Pergunta" }) ?? "", /verso/);
});
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run: `npm test --prefix mobile -- src/services/bag/bagService.test.ts`

Expected: FAIL porque o contrato ainda não existe.

- [ ] **Step 3: Implementar modelos e chamadas RPC**

Definir `BagItem`, `BagOrigin`, `BagItemType`, `BagFilter` e `BagDraft`. O
serviço deve chamar `bag_listar`, `bag_criar`, `bag_atualizar` e `bag_excluir`,
converter erros RPC em mensagens estáveis e nunca aceitar `editavel` vindo do
cliente como autorização. A leitura deve preservar estados de carregamento e
retornar origem, tipo, vínculos e conteúdo completo.

- [ ] **Step 4: Rodar os testes e o lint**

Run: `npm test --prefix mobile -- src/services/bag/bagService.test.ts`

Run: `npm run lint --prefix mobile`

Expected: testes PASS; lint sem erros.

- [ ] **Step 5: Commitar**

```bash
git add mobile/src/services/bag
git commit -m "feat(bag): add mobile data service"
```

### Task 3: Implementar a tela reutilizável da Bag

**Files:**
- Create: `mobile/src/components/bag/BagModal.tsx`
- Create: `mobile/src/components/bag/BagItemCard.tsx`
- Create: `mobile/src/components/bag/BagEditorModal.tsx`
- Create: `mobile/src/components/bag/bagStyles.ts`
- Create: `mobile/src/components/bag/BagModal.test.tsx`

- [ ] **Step 1: Escrever testes de apresentação e ações**

```typescript
test("card gerado não apresenta editar nem excluir", () => {
  const actions = actionsForBagItem({ origem: "plataforma", editavel: false, tipo: "card" });
  assert.deepEqual(actions, ["compartilhar"]);
});

test("item autoral apresenta editar, excluir e compartilhar", () => {
  const actions = actionsForBagItem({ origem: "aluno", editavel: true, tipo: "anotacao" });
  assert.deepEqual(actions, ["editar", "excluir", "compartilhar"]);
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `npm test --prefix mobile -- src/components/bag/BagModal.test.tsx`

Expected: FAIL porque os componentes e a função de ações ainda não existem.

- [ ] **Step 3: Implementar a UI no padrão visual atual**

Criar modal de tela cheia com palette do perfil, título `BAG`, filtros
`Meus itens`/`Gerados para você`, tipo, tópico e busca. Renderizar resumo e
anotação em detalhe expansível; renderizar card com frente/verso e controle de
virada. Exibir origem e vínculo. Usar `BagEditorModal` para criar/editar itens
autorais, com validação local e mensagens de erro. Gerados não exibem editar ou
excluir. Compartilhar fica exposto nos itens conforme permissão do contrato.

- [ ] **Step 4: Rodar testes e validar estados**

Run: `npm test --prefix mobile -- src/components/bag/BagModal.test.tsx`

Run: `npm run lint --prefix mobile`

Expected: testes PASS; sem erros de lint; loading, vazio e erro preservam o
layout e permitem fechar o modal.

- [ ] **Step 5: Commitar**

```bash
git add mobile/src/components/bag
git commit -m "feat(bag): add reusable inventory interface"
```

### Task 4: Adicionar entradas na Trilha e no Perfil

**Files:**
- Modify: `mobile/src/screens/TrilhaScreen.tsx`
- Modify: `mobile/src/components/trilhas/TrilhaBase.tsx`
- Modify: `mobile/src/app/(tabs)/perfil/index.tsx`
- Modify: `mobile/src/components/bag/BagModal.tsx`
- Create: `mobile/src/components/bag/BagEntryButton.tsx`
- Test: `mobile/src/components/bag/BagEntryButton.test.tsx`

- [ ] **Step 1: Escrever teste de integração do ponto de entrada**

```typescript
test("Trilha e Perfil usam a mesma ação de abertura da Bag", () => {
  assert.equal(BAG_ROUTE_KEY, "bag");
  assert.equal(buildBagEntryAccessibilityLabel(), "Abrir Bag");
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run: `npm test --prefix mobile -- src/components/bag/BagEntryButton.test.tsx`

Expected: FAIL porque o botão compartilhado ainda não existe.

- [ ] **Step 3: Implementar as entradas e o estado único**

Adicionar ícone consistente `bag-personal` ao cabeçalho da Trilha e ao resumo do
Perfil. Cada entrada abre o mesmo `BagModal`, sem duplicar a tela. No contexto
do tópico, passar `classeId`, `topicoId` e `conteudoId` para o editor abrir já
associado ao conteúdo atual. Após salvar/excluir, invalidar a lista da Bag e
mostrar confirmação sem navegar para fora da trilha.

- [ ] **Step 4: Rodar testes e lint**

Run: `npm test --prefix mobile -- src/components/bag/BagEntryButton.test.tsx`

Run: `npm run lint --prefix mobile`

Expected: PASS, com os quatro warnings preexistentes documentados e zero erros.

- [ ] **Step 5: Commitar**

```bash
git add mobile/src/screens/TrilhaScreen.tsx mobile/src/components/trilhas/TrilhaBase.tsx mobile/src/app/'(tabs)'/perfil/index.tsx mobile/src/components/bag
git commit -m "feat(bag): open inventory from trail and profile"
```

### Task 5: Permitir criação contextual dentro dos conteúdos

**Files:**
- Modify: `mobile/src/app/(tabs)/trilha/[id].tsx`
- Modify: `mobile/src/components/ContentRenderer.tsx`
- Modify: `mobile/src/components/QuestionActivity.tsx`
- Modify: `mobile/src/components/StudyCardsBlock.tsx`
- Create: `mobile/src/components/bag/AddToBagAction.tsx`
- Create: `mobile/src/components/bag/AddToBagAction.test.ts`

- [ ] **Step 1: Escrever testes do vínculo contextual**

```typescript
test("ação leva o tópico e o conteúdo atual para o rascunho", () => {
  const draft = buildBagDraftContext({ classeId: 3, topicoId: 8, conteudoId: 21 });
  assert.deepEqual(draft, { classe_id: 3, topico_id: 8, conteudo_id: 21 });
});

test("card autoral exige frente e verso", () => {
  assert.match(validateBagDraft({ tipo: "card", titulo: "Q", frente: "F" }) ?? "", /verso/);
});
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run: `npm test --prefix mobile -- src/components/bag/AddToBagAction.test.ts`

Expected: FAIL porque a ação contextual ainda não existe.

- [ ] **Step 3: Implementar a ação contextual**

Adicionar `Adicionar à Bag` em conteúdos de texto, mídia, cards e questões,
sem interromper responder a questão. O editor abre com o vínculo recebido;
salvar cria apenas item autoral. Para um card gerado, oferecer `Criar cópia
pessoal`, que copia frente/verso para `bag_itens` e mantém o original somente
leitura. Não contar o item autoral como conteúdo acadêmico nem alterar
`personalizacao_item_progresso` apenas por criá-lo.

- [ ] **Step 4: Rodar testes mobile completos**

Run: `npm test --prefix mobile -- --runInBand`

Expected: todos os testes existentes e novos PASS.

- [ ] **Step 5: Commitar**

```bash
git add mobile/src/app/'(tabs)'/trilha/'[id].tsx mobile/src/components/ContentRenderer.tsx mobile/src/components/QuestionActivity.tsx mobile/src/components/StudyCardsBlock.tsx mobile/src/components/bag
git commit -m "feat(bag): create personal items from study content"
```

### Task 6: Compartilhar itens na conversa com autorização

**Files:**
- Modify: `mobile/src/components/social/PrivateChatModal.tsx`
- Modify: `mobile/src/components/social/GuildChatModal.tsx`
- Modify: `mobile/src/services/social/socialModel.ts`
- Create: `mobile/src/services/bag/bagShareModel.ts`
- Create: `mobile/src/services/bag/bagShareModel.test.ts`
- Create: `api/alembic/versions/20260913_13_bag_compartilhamento_social.py`
- Create: `api/tests/test_bag_compartilhamento_social.py`

- [ ] **Step 1: Escrever testes de segurança da referência**

```python
def test_share_rpc_valida_participante_e_nao_publica_item() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "auth.uid()" in source
    assert "bag_itens" in source
    assert "guilda" in source
    assert "social_mensagens" in source
    assert "SECURITY DEFINER" in source
```

```typescript
test("referência de Bag inválida não renderiza conteúdo", () => {
  assert.equal(resolveBagShare({ kind: "bag_item", itemId: null }), null);
});
```

- [ ] **Step 2: Rodar testes para confirmar a falha**

Run: `api/.venv/bin/pytest -q api/tests/test_bag_compartilhamento_social.py`

Run: `npm test --prefix mobile -- src/services/bag/bagShareModel.test.ts`

Expected: FAIL porque o RPC e o resolvedor ainda não existem.

- [ ] **Step 3: Implementar referência e resolução autorizada**

Criar RPC que recebe item e destino, verifica que o item é autoral do remetente,
que o destinatário é amigo/colega permitido ou que o remetente participa da
guilda, e grava uma mensagem com payload `bag_item_id`, tipo e prévia. Na
leitura, resolver a referência apenas para participantes autorizados; item
apagado aparece como indisponível. Adicionar ícone e cartão de compartilhamento
nos chats, sem permitir editar o item recebido.

- [ ] **Step 4: Aplicar migration e rodar testes**

Run: `cd api && .venv/bin/alembic upgrade head`

Run: `api/.venv/bin/pytest -q api/tests/test_bag_compartilhamento_social.py`

Run: `npm test --prefix mobile -- --runInBand`

Expected: Alembic no novo head e todos os testes PASS.

- [ ] **Step 5: Commitar**

```bash
git add api/alembic/versions/20260913_13_bag_compartilhamento_social.py api/tests/test_bag_compartilhamento_social.py mobile/src/components/social mobile/src/services/bag
git commit -m "feat(bag): share personal items in authorized chats"
```

### Task 7: Verificação final e publicação

**Files:**
- Modify: `docs/mobile/sql/20260913_12_bag_itens_pessoais.sql`

- [ ] **Step 1: Documentar SQL operacional**

Adicionar o SQL equivalente das migrations 12 e 13 em `docs/mobile/sql`, com
ordem de aplicação, grants e nota de que o deploy deve usar Alembic como fonte
canônica.

- [ ] **Step 2: Rodar a bateria final**

Run: `cd api && .venv/bin/ruff check .`

Run: `cd api && .venv/bin/pytest -q`

Run: `npm test --prefix mobile -- --runInBand`

Run: `npm run lint --prefix mobile`

Run: `git diff --check`

Expected: Ruff sem erros; testes API e mobile PASS; lint mobile sem erros; sem
problemas de whitespace.

- [ ] **Step 3: Aplicar migrations finais e confirmar head**

Run: `cd api && .venv/bin/alembic upgrade head && .venv/bin/alembic current`

Expected: `20260913_13 (head)`.

- [ ] **Step 4: Publicar no branch do PR**

Transferir os commits funcionais para `/tmp/trailup-pr2`, verificar que o
worktree está limpo e executar:

```bash
git -C /tmp/trailup-pr2 push origin HEAD:feat/guild-chat-10-members
```

- [ ] **Step 5: Commitar documentação**

```bash
git add docs/mobile/sql/20260913_12_bag_itens_pessoais.sql
git commit -m "docs(bag): document bag migrations"
```


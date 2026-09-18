# Social, Perfil Público e Guildas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no mobile um Social funcional com perfil público, conquistas e guildas por turma, protegido por RPC/RLS e pronto para receber o snapshot do motor de eventos.

**Architecture:** O PostgreSQL será a fonte das regras: guildas, convites, limites, bloqueios, permissões e leitura pública serão transacionais. O mobile consumirá serviços tipados e exibirá um modal de perfil e uma seção de guildas dentro do Social, sem reutilizar métricas privadas do perfil do próprio usuário.

**Tech Stack:** PostgreSQL/Supabase, Alembic, Python/pytest, Expo React Native, TypeScript, React Native Testing Library/Jest, SVG local.

---

## Mapa de arquivos

- Criar `docs/mobile/sql/20260912_03_guildas_perfil_publico.sql`: SQL canônico da migração.
- Criar `api/alembic/versions/20260912_07_guildas_perfil_publico.py`: wrapper Alembic, dependente de `20260912_06_social_amizades`.
- Criar `api/tests/test_guildas_schema.py`: contratos da migração, constraints, RPCs, RLS e perfil público.
- Criar `mobile/src/services/social/publicProfileModel.ts`: modelos serializáveis do perfil público.
- Criar `mobile/src/services/social/guildModel.ts`: modelos de guilda, convite e membro.
- Criar `mobile/src/services/social/publicProfileService.ts`: carregamento seguro do perfil público.
- Criar `mobile/src/services/social/guildService.ts`: chamadas das operações de guilda.
- Criar `mobile/src/components/social/SocialProfileModal.tsx`: modal visual baseado no exemplo aprovado.
- Criar `mobile/src/components/social/GuildSection.tsx`: lista, criação, membros e ações de guilda.
- Criar `mobile/src/assets/social/guild-icons.tsx`: ícones SVG locais e únicos.
- Modificar `mobile/src/services/social/socialModel.ts`: dados públicos de guilda nas pessoas do Social.
- Modificar `mobile/src/services/social/socialService.ts`: carregar dados de guilda na resposta do Social.
- Modificar `mobile/src/components/social/SocialPersonCard.tsx`: tornar o cartão tocável e acessível.
- Modificar `mobile/src/app/(tabs)/social/index.tsx`: abrir perfil, renderizar Guildas e tratar estados.
- Criar `mobile/src/services/social/publicProfileModel.test.ts`, `guildModel.test.ts` e testes de componentes/serviços correspondentes.

### Task 1: Escrever os testes do contrato de banco

**Files:**
- Create: `api/tests/test_guildas_schema.py`

- [ ] **Step 1: Definir os invariantes esperados**

Adicionar testes que procurem a revisão `20260912_07`, confirmem as tabelas `guildas`, `guilda_membros`, `guilda_convites`, `guilda_config_turma` e `guilda_evento_snapshot`, e verifiquem as funções de leitura/escrita listadas na Task 2.

- [ ] **Step 2: Cobrir regras de segurança e concorrência**

Os testes devem exigir: uma guilda ativa por aluno/turma, limite positivo, convite com estados válidos, ausência de leitura entre turmas, bloqueio social impedindo convite e função de snapshot imutável depois da criação.

- [ ] **Step 3: Rodar a suíte em vermelho**

Run: `api/.venv/bin/pytest api/tests/test_guildas_schema.py -q`

Expected: FAIL porque a revisão e os objetos ainda não existem.

- [ ] **Step 4: Commit**

```bash
git add api/tests/test_guildas_schema.py
git commit -m "test: define contrato de guildas e perfil publico"
```

### Task 2: Criar migração SQL, RPCs e RLS

**Files:**
- Create: `docs/mobile/sql/20260912_03_guildas_perfil_publico.sql`
- Create: `api/alembic/versions/20260912_07_guildas_perfil_publico.py`

- [ ] **Step 1: Criar tabelas e constraints**

Usar UUID para entidades novas, FKs para `classe` e `alunos`, `status` com `CHECK`, timestamps UTC e índice por turma. `guilda_membros` deve guardar `joined_at` e `left_at` para preservar histórico; um índice parcial em membro ativo deve garantir uma guilda ativa por aluno/turma.

- [ ] **Step 2: Criar configuração de turma**

Guardar `tamanho_maximo`, `formacao_inicio` e `formacao_fim`. As funções devem aceitar alteração somente por `app_classes_do_professor()` e rejeitar janela invertida ou limite menor que um.

- [ ] **Step 3: Criar RPCs transacionais de guilda**

Implementar `guilda_listar`, `guilda_criar`, `guilda_atualizar`, `guilda_convidar`, `guilda_aceitar_convite`, `guilda_recusar_convite`, `guilda_cancelar_convite`, `guilda_entrar`, `guilda_sair`, `guilda_dissolver` e `guilda_configurar_turma`. Toda aceitação/entrada deve travar a guilda com `FOR UPDATE`, verificar matrícula, janela, associação ativa e limite antes de inserir.

- [ ] **Step 4: Reusar o bloqueio social**

Antes de criar ou aceitar convite, consultar `social_relacionamentos` nos dois sentidos. Se houver bloqueio ativo, retornar exceção estável `social_bloqueio_impede_guilda`.

- [ ] **Step 5: Criar snapshot compatível com eventos futuros**

Adicionar `guilda_evento_snapshot` com `evento_id`, `guilda_id`, aluno, posição e `captured_at`, chave única por evento/guilda/aluno. A RPC `guilda_congelar_composicao(p_evento_id, p_classe_id)` deve inserir a composição ativa em uma transação e ser idempotente; não deve existir update/delete público do snapshot.

- [ ] **Step 6: Criar RPC de perfil público**

Implementar `social_perfil_publico(p_aluno_id, p_classe_id)` como `SECURITY DEFINER`: verificar que solicitante e alvo são alunos ativos da mesma turma; retornar somente perfil visível, guilda ativa e conquistas concluídas/badges permitidas. Não retornar e-mail, telemetria, métricas, progresso privado ou dados de outra turma.

- [ ] **Step 7: Configurar RLS e privilégios**

Habilitar RLS nas tabelas, negar acesso anônimo, permitir leitura apenas por colegas da turma e escrita somente via RPC. Conceder `EXECUTE` para `authenticated`, revogar funções/tabelas de `anon` e adicionar comentários de segurança.

- [ ] **Step 8: Aplicar e rodar testes**

Run: `cd api && ./.venv/bin/python -m alembic upgrade head`

Run: `cd .. && api/.venv/bin/pytest api/tests/test_guildas_schema.py -q`

Expected: migration em `20260912_07 (head)` e todos os testes do contrato passando.

- [ ] **Step 9: Commit**

```bash
git add docs/mobile/sql/20260912_03_guildas_perfil_publico.sql api/alembic/versions/20260912_07_guildas_perfil_publico.py api/tests/test_guildas_schema.py
git commit -m "feat: adiciona guildas e perfil publico no banco"
```

### Task 3: Criar modelos e serviços mobile

**Files:**
- Create: `mobile/src/services/social/publicProfileModel.ts`
- Create: `mobile/src/services/social/guildModel.ts`
- Create: `mobile/src/services/social/publicProfileService.ts`
- Create: `mobile/src/services/social/guildService.ts`
- Modify: `mobile/src/services/social/socialModel.ts`
- Modify: `mobile/src/services/social/socialService.ts`
- Test: `mobile/src/services/social/publicProfileModel.test.ts`
- Test: `mobile/src/services/social/guildModel.test.ts`

- [ ] **Step 1: Escrever testes de normalização**

Testar payloads nulos, datas inválidas, lista vazia de conquistas, convite pendente e conversão de resposta JSON para os modelos `PublicProfile`, `Guild`, `GuildMember` e `GuildInvite`.

- [ ] **Step 2: Implementar modelos sem dados privados**

Separar `PublicProfile` do modelo privado `Aluno`; aceitar somente `nome`, `apelido`, `fotoUrl`, arte, perfil ativo, dados públicos, guilda e conquistas concluídas.

- [ ] **Step 3: Implementar serviços RPC**

Seguir o padrão de `socialService.ts`, usando `supabase.rpc`, normalização centralizada e erros tipados. O perfil deve chamar `social_perfil_publico`; guildas devem mapear cada RPC da Task 2.

- [ ] **Step 4: Integrar resumo de guilda ao Social**

Adicionar `guildaId`, `guildaNome` e `guildaEmblema` somente quando retornados pela consulta autorizada, sem fazer query individual por pessoa.

- [ ] **Step 5: Rodar testes mobile**

Run: `cd mobile && npm test -- --runInBand src/services/social`

Expected: testes novos e existentes passando.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/services/social
git commit -m "feat: adiciona servicos de perfil publico e guildas"
```

### Task 4: Implementar modal de perfil público

**Files:**
- Create: `mobile/src/components/social/SocialProfileModal.tsx`
- Create: `mobile/src/assets/social/guild-icons.tsx`
- Modify: `mobile/src/components/social/SocialPersonCard.tsx`

- [ ] **Step 1: Criar ícones SVG locais**

Exportar componentes SVG para guilda, conquista, conversa e curtir usando `react-native-svg`, com `accessibilityLabel` e cores recebidas por propriedade.

- [ ] **Step 2: Tornar o cartão tocável**

Adicionar `onPressProfile?: () => void` ao `SocialPersonCard`; envolver somente a área de identidade em `Pressable`, manter botões de convite separados e definir `accessibilityRole="button"`.

- [ ] **Step 3: Montar o modal no padrão aprovado**

Renderizar banner, avatar sobreposto, badges e card escuro com nome, apelido, dados, preferências, texto “Sobre”, guilda e ações. Usar `Modal`, `SafeAreaView`, `ScrollView` e o tema existente, com largura adaptável ao mobile.

- [ ] **Step 4: Cobrir estados**

Exibir skeleton durante carregamento, mensagem de perfil indisponível quando vazio, erro com retry e desabilitar ações durante mutation. Nunca renderizar campos privados mesmo se vierem em payload inesperado.

- [ ] **Step 5: Testar comportamento**

Testar abertura ao tocar, fechamento, retry, lista de conquistas, guilda, acessibilidade e ausência de e-mail/telemetria no texto renderizado.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/social mobile/src/assets/social
git commit -m "feat: adiciona modal de perfil publico ao social"
```

### Task 5: Implementar seção de guildas no Social

**Files:**
- Create: `mobile/src/components/social/GuildSection.tsx`
- Modify: `mobile/src/app/(tabs)/social/index.tsx`

- [ ] **Step 1: Adicionar a seção Guildas**

Manter Amigos, Convites e Encontrar e adicionar Guildas como seção ativa no mesmo componente, com navegação horizontal compatível com a largura atual.

- [ ] **Step 2: Renderizar guilda atual e lista da turma**

Mostrar emblema SVG, nome, tamanho, limite, descrição, membros e ações contextuais: criar, entrar, convidar, sair ou dissolver conforme papel/estado.

- [ ] **Step 3: Implementar formulários e confirmações**

Validar nome não vazio e limite válido no cliente; confirmar saída/dissolução; após sucesso atualizar o snapshot do Social e limpar convites resolvidos.

- [ ] **Step 4: Mapear erros do banco**

Converter códigos `guilda_cheia`, `guilda_janela_fechada`, `guilda_bloqueio_social`, `guilda_sem_permissao` e `guilda_membro_existente` em mensagens visíveis no estilo do sistema.

- [ ] **Step 5: Testar seção**

Testar estado sem guilda, guilda cheia, convite pendente, professor configurando turma, aluno saindo e erro de carregamento.

- [ ] **Step 6: Commit**

```bash
git add "mobile/src/app/(tabs)/social/index.tsx" mobile/src/components/social/GuildSection.tsx
git commit -m "feat: adiciona guildas ao social mobile"
```

### Task 6: Integrar perfil e guildas ao fluxo existente

**Files:**
- Modify: `mobile/src/app/(tabs)/social/index.tsx`
- Modify: `mobile/src/components/social/SocialInviteCard.tsx` quando necessário
- Test: testes do Social existentes e novos testes de integração

- [ ] **Step 1: Abrir modal usando o aluno selecionado**

No toque do cartão, guardar `selectedPerson`, abrir o modal e carregar o perfil usando o `classeId` atual. Fechar deve limpar seleção e abortar estado visual pendente.

- [ ] **Step 2: Preservar o fluxo de loja**

Manter `StoreLauncher`/`StoreModal` exclusivamente no Social, sem recolocá-los no Ranking, e garantir que o modal da loja não concorra com o modal de perfil.

- [ ] **Step 3: Recarregar dados após mutations**

Depois de aceitar convite, entrar/sair de guilda ou bloquear usuário, chamar o carregamento único do Social e atualizar pessoa, guilda e convites juntos.

- [ ] **Step 4: Validar mobile**

Run: `cd mobile && npm test -- --runInBand`

Run: `cd mobile && npx eslint src/app/\(tabs\)/social src/components/social src/services/social`

Expected: suíte completa e lint do Social passando.

- [ ] **Step 5: Commit**

```bash
git add "mobile/src/app/(tabs)/social" mobile/src/components/social mobile/src/services/social
git commit -m "feat: integra perfil publico e guildas no fluxo social"
```

### Task 7: Verificação final e handoff

**Files:**
- Modify only files necessários após falhas dos testes.

- [ ] **Step 1: Rodar testes de banco focados**

Run: `api/.venv/bin/pytest api/tests/test_guildas_schema.py api/tests/test_social_schema.py -q`

- [ ] **Step 2: Rodar testes mobile focados e totais**

Run: `cd mobile && npm test -- --runInBand`

Run: `cd mobile && npx eslint src/app/\(tabs\)/social src/components/social src/services/social`

- [ ] **Step 3: Confirmar migração aplicada**

Run: `cd api && ./.venv/bin/python -m alembic current`

Expected: `20260912_07 (head)`.

- [ ] **Step 4: Verificar diff e preservar trabalho alheio**

Run: `git diff --check` e `git status --short --untracked-files=no -- . ':(exclude)graphify-out'`.

Não adicionar nem modificar arquivos gerados em `graphify-out`.

- [ ] **Step 5: Commit final de correções**

```bash
git add api mobile docs/mobile/sql
git commit -m "test: valida social perfil publico e guildas"
```

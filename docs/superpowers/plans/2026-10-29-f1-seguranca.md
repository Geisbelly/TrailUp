# F1 — Segurança do ranking e dos eventos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as três brechas de segurança medidas em produção: o ranking que o aluno não consegue ler, a view de ranks que vaza outras turmas, e o `criado_em`/`referencia` de `eventos_aluno` que o próprio aluno consegue alterar. Também tirar do mobile o cálculo local do ranking que expõe a turma inteira.

**Architecture:** Três migrations encadeadas depois da F0 (`20261029_03`) e uma mudança no mobile. Tudo no Postgres (fronteira do CLAUDE.md), nada passa pela API. O critério de pronto é a I10 e a I11 da F0 passarem.

**Tech Stack:** Alembic (SQL cru), PL/pgSQL, pytest (offline + e2e em Postgres local), React Native/TS com `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-28-metricas-ponta-a-ponta-design.md` — §3 (D-3), §5.1 (I10, I11), §8 F1, §9.

## Escopo

**Entram:**
- **D7:** ranking com `42501` para todo aluno, e o fallback local do mobile.
- **D8:** `vw_ranks_info_por_classe` contorna a RLS.
- **D9:** `criado_em`/`referencia` graváveis pelo cliente.

**Ficam fora, e por quê:**
- **D13 (`consentimento_telemetria`):** medido em 29/10 com `SET LOCAL ROLE anon`, o resultado foi 0 linhas. As policies são só do próprio aluno. Não há o que corrigir; o Task 5 deixa um teste de regressão.
- **D10 (contagem × valor em conquista/missão; `atividade_revisada` sem dedup; tipo fora do catálogo):**
  - Mudar `eventos_no_dia` para contar só evento com valor muda o que a missão "5 ações hoje" significa. Abrir tópico vale 0 XP, e deixaria de contar.
  - Rejeitar tipo desconhecido pode recusar eventos que clientes já mandam (`ciclo_iniciado`: 223 linhas).
  - As duas coisas são decisão de produto e de gamificação, não correção de segurança. Vão para uma fase própria, com brainstorming.

## Global Constraints

- **Revisões:** `20261029_04` → `_05` → `_06`. `down_revision` da primeira = `20261029_03` (cabeça da F0). Esta branch está empilhada sobre `feat/f0-medir` (#701), que está sobre o #699. `alembic heads` precisa devolver uma cabeça só.
- **Fechado para o cliente:** `fn_app_config_int` continua sem EXECUTE para cliente. Ela também lê tetos anti-abuso (`credito_extra_maximo`, `conquista_recompensa_maxima`, `contato_envios_por_hora`…).
  - O acesso é por wrapper dedicado a uma chave, no molde de `app_rank_limite_visivel()`: `SECURITY DEFINER`, `SET search_path = ''`, `GRANT EXECUTE ... TO authenticated`, sem `anon`.
- **Quem é cliente:** decide-se por `current_user` (`authenticated` ou `anon`), **não** pelas claims do JWT.
  - As claims continuam valendo dentro de RPC `SECURITY DEFINER`.
  - Já o `current_user` dentro delas é o dono da função.
  - Funções do servidor gravam `criado_em` retroativo de propósito: `avaliar_entrega` usa a data da entrega para o atraso, e a presença usa a data da aula.
- **View nova:** nasce `security_invoker = on`.
- **Molde da reconstrução de view:** recortar da migration anterior e trocar trechos com `_troca`, falhando alto se o trecho não existir. Ver `20261025_02_periodo_e_progresso_do_rank.py:127-174`. Não copiar a view à mão.
- **Produção:** não aplicar migration. Só PR, nunca merge (CLAUDE.md).

## Review Focus

1. **RPC do servidor que grava evento retroativo** (`avaliar_entrega`, presença): o `criado_em` informado precisa ser **preservado**. Só a gravação direta do cliente é travada. (Task 3, e2e.)
2. **Aluno sem turma lendo `vw_ranks_info_por_classe`:** precisa ver 0 linhas. Professor lê os ranks das suas turmas, e aluno os da turma em que está matriculado. (Task 2, e2e.)
3. **Ranking com menos participantes que o mínimo, ou sem rank aberto:** o mobile mostra vazio, não calcula localmente nem mostra a turma inteira. (Task 4, teste.)
4. **Erro de leitura do ranking (rede, RLS):** o mobile mostra estado de erro, não um ranking inventado. (Task 4, teste.)
5. **O UPDATE legítimo que o cliente ainda faz em `eventos_aluno`** (se existir no app): continua funcionando para as outras colunas. Antes de travar, conferir com `git grep` quem faz UPDATE nessa tabela. (Task 3.)

---

### Task 1: ranking legível pelo aluno sem abrir `fn_app_config_int`

**Files:**
- Create: `api/alembic/versions/20261029_04_ranking_le_config_por_wrapper.py`
- Modify: a função da invariante I10, redefinida na mesma migration
- Create: `api/tests/test_migration_ranking_le_config_por_wrapper.py` (offline)
- Create: `api/tests/test_e2e_ranking_le_config_por_wrapper.py`

**Interfaces:**
- Produces: `public.app_elo_inicial() RETURNS integer` e `public.app_rank_progresso_min_participantes() RETURNS integer`, com os mesmos padrões de hoje (1000 e 8); `vw_rank_posicoes_por_classe_todas` sem nenhuma chamada a `fn_app_config_int`; `fn_inv_i10()` redefinida.

- [ ] **Step 1: Testes offline.**
  - O SQL de upgrade cria os dois wrappers, com `SECURITY DEFINER`, `SET search_path = ''`, `GRANT EXECUTE ... TO authenticated` e `REVOKE ... FROM PUBLIC, anon`.
  - O corpo da view recriada não contém `fn_app_config_int` e contém os dois wrappers.
  - `fn_inv_i10` passa a ter o corpo:
    ```sql
    SELECT 'vw_rank_posicoes_por_classe_todas'
     WHERE pg_get_viewdef('public.vw_rank_posicoes_por_classe_todas'::regclass) LIKE '%fn_app_config_int%'
    ```
  - `fn_app_config_int` continua sem nenhum `GRANT`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementar.**
  - `view_nova()` parte da view da `20261025_02` (`_load(...).view_nova()`).
  - Troca `public.fn_app_config_int('elo_inicial', 1000)` → `public.app_elo_inicial()`, e `public.fn_app_config_int('rank_progresso_min_participantes', 8)` → `public.app_rank_progresso_min_participantes()`.
  - Se algum trecho não existir, falha alto (`_troca`). A view atual da produção tem exatamente essas duas chamadas (medido em 29/10).
  - Downgrade: volta à view da `20261025_02` e dropa os wrappers.
- [ ] **Step 4:** offline verde.
- [ ] **Step 5: e2e.**
  - `test_aluno_le_o_ranking_da_sua_turma`: como `authenticated` real, SELECT em `vw_rank_posicoes_por_classe` funciona, sem `42501`.
  - `test_wrappers_devolvem_o_padrao_sem_chave`.
  - `test_aluno_nao_executa_fn_app_config_int` (`42501`).
  - `test_i10_passa_depois_da_migration`.
- [ ] **Step 6: Commit** `fix(rank): aluno volta a ler o ranking sem abrir fn_app_config_int`

### Task 2: `vw_ranks_info_por_classe` respeita a RLS

**Files:**
- Create: `api/alembic/versions/20261029_05_ranks_info_com_invoker.py`
- Create: `api/tests/test_migration_ranks_info_com_invoker.py`
- Create: `api/tests/test_e2e_ranks_info_com_invoker.py`

**Interfaces:**
- Produces: `vw_ranks_info_por_classe` com `security_invoker = on`. As colunas não mudam (o mobile lê `*`).

- [ ] **Step 1: Teste offline.** `ALTER VIEW public.vw_ranks_info_por_classe SET (security_invoker = on)` no upgrade, e `RESET (security_invoker)` no downgrade.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementar.**
  - Antes, confirmar que a policy de `rank_tipo` deixa `authenticated` ler. A tabela tem 1 policy em produção; ler qual na migration `20260826_09` ou nas seguintes.
  - Se a policy não deixar, a migration acrescenta a policy de SELECT necessária, no mesmo commit (CLAUDE.md).
- [ ] **Step 4: e2e.**
  - `test_aluno_sem_turma_ve_zero` (Review Focus 2).
  - `test_aluno_ve_os_ranks_da_sua_turma`.
  - `test_professor_ve_os_ranks_das_suas_turmas`.
  - `test_i11_passa_depois_da_migration`.
- [ ] **Step 5: Commit** `fix(rank): vw_ranks_info_por_classe deixa de mostrar ranks de outras turmas`

### Task 3: o cliente não grava `criado_em` nem troca `referencia` em `eventos_aluno`

**Files:**
- Create: `api/alembic/versions/20261029_06_eventos_aluno_trava_do_cliente.py`
- Create: `api/tests/test_migration_eventos_aluno_trava_do_cliente.py`
- Create: `api/tests/test_e2e_eventos_aluno_trava_do_cliente.py`

**Interfaces:**
- Produces: `public.fn_eventos_aluno_trava_cliente()` (`SECURITY INVOKER`, `SET search_path = ''`) e o gatilho `trg_eventos_aluno_a_trava_cliente`, BEFORE INSERT OR UPDATE.
  - O nome com `a_` faz ele disparar **antes** de `trg_eventos_aluno_valor_*`, já que os gatilhos do mesmo evento disparam em ordem alfabética. Assim o cálculo de valor e de atraso já vê o `criado_em` travado.

- [ ] **Step 1: Medir antes de escrever.** `git grep -n "eventos_aluno" -- mobile/src frontend/src` procurando `.update(`. Listar no relatório quem faz UPDATE e de que colunas (Review Focus 5).
- [ ] **Step 2: Testes offline.**
  - A função testa `current_user IN ('authenticated', 'anon')`, sem usar `request.jwt.claims`.
  - Em INSERT: `NEW.criado_em := now()`.
  - Em UPDATE: `NEW.criado_em := OLD.criado_em` e `NEW.referencia := OLD.referencia`.
  - O gatilho tem o nome `trg_eventos_aluno_a_trava_cliente`.
  - O downgrade remove o gatilho e a função.
- [ ] **Step 3:** FAIL.
- [ ] **Step 4: Implementar.**
  - O docstring explica por que o critério é `current_user` e não as claims.
  - Diz também que as RPCs `SECURITY DEFINER` (`avaliar_entrega`, presença) continuam gravando o `criado_em` que informam.
- [ ] **Step 5: e2e.** O esqueleto precisa incluir o gatilho de valor real da `20261021_06`, para provar a ordem.
  - `test_aluno_insere_com_data_passada_e_grava_agora`: com `SET LOCAL ROLE authenticated`, um `criado_em` de 30 dias atrás é gravado como `now()` (tolerância de 5 s).
  - `test_aluno_nao_troca_referencia_nem_data_no_update`.
  - `test_rpc_do_servidor_preserva_criado_em_retroativo`: uma função `SECURITY DEFINER` dona `postgres`, criada no teste e chamada como `authenticated`, insere com `criado_em` de 3 dias atrás e o valor é preservado (Review Focus 1).
  - `test_fator_de_atraso_ve_a_data_travada`: o valor do evento é calculado sobre `now()`, não sobre a data enviada.
- [ ] **Step 6: Commit** `fix(eventos): aluno não grava criado_em nem troca referencia do próprio evento`

### Task 4: o mobile não calcula o ranking localmente

**Files:**
- Modify: `mobile/src/models/Rank.ts` (`loadRankRowsByClasse` ~l.344-362; o caminho de `vw_ranks_info_por_classe` ~l.440-450)
- Modify: `mobile/src/services/rankMetadata.ts` (o "caminho de reserva" ~l.17), se ele recalcular dados de outras turmas
- Test: o teste existente do ranking (`git grep -ln "loadFallbackRankRowsByClasse\|vw_rank_posicoes" mobile/src -- '*.test.ts'`), ou um novo `mobile/src/models/Rank.semFallback.test.ts`, registrado em `mobile/testes/principal.txt`

**Interfaces:**
- Consumes: Task 1, que faz a view responder ao aluno.
- Produces:
  - `loadRankRowsByClasse` devolve as linhas da view.
  - Lista vazia quando a view volta vazia.
  - Em erro, **lança**. A tela mostra o estado de erro que ela já tem para falha de carga, se existir; se não existir, o relatório diz onde fica o tratamento.
  - `loadFallbackRankRowsByClasse` e `buildFallbackRankRows` saem, se ficarem sem uso.

- [ ] **Step 1: Testes.**
  - View vazia → `[]`, sem consultar `eventos_aluno` (o mock falha se `eventos_aluno` for lido).
  - Erro da view → rejeita.
  - View com linhas → as mesmas linhas.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementar e apagar o código morto.** Ajustar os comentários de `rankCorte.ts` e `portoes.ts` se eles citarem o fallback.
- [ ] **Step 4:** `npm test` e `npm run typecheck`. Falhas pré-existentes na `main`: `testesRegistrados` por `supabase.sessaoNaUrl.test.ts`, e `perfil/index.tsx`.
- [ ] **Step 5: Commit** `fix(mobile): ranking vem só do banco; sem cálculo local que expunha a turma`

### Task 5: regressão do consentimento, verificação e PR

- [ ] e2e `test_anon_nao_le_consentimento_telemetria` e `test_aluno_so_le_o_proprio_consentimento`, no arquivo do Task 2 ou num próprio.
- [ ] `cd api && pytest -q`, `ruff check` nos arquivos novos, e `alembic heads` com uma cabeça.
- [ ] `cd mobile && npm test && npm run typecheck`.
- [ ] **Medir em produção, só leitura:** os corpos da I10 e da I11 **novos** contra o banco atual. Antes da migration, a I10 nova deve falhar: a view ainda usa `fn_app_config_int`.
- [ ] **PR empilhado sobre o #701.** O texto diz:
  - que depende do #699 e do #701;
  - que D10 e D13 ficam fora, e por quê;
  - a ordem de deploy (migration antes do mobile, porque o mobile sem fallback precisa da view respondendo);
  - nunca mesclar.

# F4a — tempo de estudo com uma fonte só: o tempo ativo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** I06 (`tempo_gasto_min` com fórmula única) e I07 (tempo da matrícula = soma dos tópicos) passarem. `tempo_gasto_min` passa a ser **uma** conta, o tempo ativo da telemetria (D-1), gravada por **um** gatilho versionado.

**Architecture:**
- O gatilho que hoje vive fora do Alembic (`trg_tme_sync_tempo_*` → `trailup_sync_tempo_da_telemetria`) **é versionado** e passa a ser o dono de `tempo_gasto_min`, com a conta `trailup_tempo_telemetria_min`. Depois de atualizar o tempo, ele recalcula tópico e matrícula (`trailup_recalcular_topico_aluno` e `trailup_recalcular_classe_aluno`).
- As duas RPCs do cronômetro do app (`trailup_registrar_sessao_estudo` e `trailup_registrar_intervalo_estudo`) continuam gravando `estudo_sessoes` e `estudo_intervalos`, que viram a fonte de **presença** e de sessões. Quando gravam `tempo_gasto_min`, usam **a mesma** conta do gatilho.
- O retroativo recalcula todas as linhas e todas as matrículas.

**Tech Stack:** Postgres 17 (Alembic, plpgsql), pytest com e2e em Postgres local.

**Spec:** [`docs/superpowers/specs/2026-10-28-metricas-ponta-a-ponta-design.md`](../specs/2026-10-28-metricas-ponta-a-ponta-design.md), D-1 e D-5 do §3, I06 e I07 do §5.1, linha F4 do §8 e item 6 do §10. A F4 da spec tem três subsistemas independentes: tempo (este plano, F4a), livro único de respostas (F4b, I19) e reconciliação de pontos com aviso (F4c, I08, I09 e I13). Cada um tem plano e PR próprios.

## Medido em produção (só leitura, 30/10)

**Três gravadores de `tempo_gasto_min`, com duas contas diferentes**, e vale o último que gravar:

| Gravador | Onde está | Conta | Recalcula a matrícula? |
|---|---|---|---|
| `trailup_sync_tempo_da_telemetria`, gatilho `trg_tme_sync_tempo_{ins,upd,del}` (por instrução, tabela de transição `afetadas`) em `telemetria_time_metric_entries` | **fora do Alembic**, ligado (`tgenabled = O`) | `trailup_tempo_telemetria_min`, ou seja, soma de `active_sec` / 60 | **não** |
| `trailup_registrar_sessao_estudo`, RPC do `StudyClock` (`mobile/src/services/studySessions.ts`) | `20260921_01` | `tempo_direto_min + trailup_tempo_sessao_min` (soma de `estudo_sessoes.duracao_sec`) | sim |
| `trailup_registrar_intervalo_estudo`, RPC dos builds antigos (`mobile/src/hooks/trilha/persistirIntervalo.ts`) | `20260921_01` | `tempo_direto_min + p_tempo_min + trailup_tempo_sessao_min` | sim |

- A `20260921_01` diz que **desligou** o gatilho da telemetria. Em produção ele está ligado. É drift não versionado (`docs/architecture/schema-nao-versionado.md`).
- **I07 hoje:** a matrícula 98 tem 12,25 min, e a soma dos tópicos dá 1,07 min. O gatilho da telemetria atualizou o tópico e não recalculou a matrícula.

**Tempo de tópico, somado em produção** (um aluno, o de QA):

| Fonte | Minutos |
|---|---|
| tempo ativo (`active_sec`, escopo `topic`), a escolha D-1 | **7,68** |
| tempo com o material aberto (`dwell_sec`, escopo `topic`) | 35,63 |
| sessões do cronômetro (`estudo_sessoes`, escopo `topic`) | 68,40 |
| o que `topico_aluno.tempo_gasto_min` mostra hoje (12 linhas, 4 com tempo) | 45,04, dos quais 17,90 são de `tempo_direto_min` |

## Decisão que este plano executa, e o que ela custa

**D-1 da spec: tempo de estudo é tempo ativo.** A spec já registra o custo ("números já vistos caem"). Medido agora: o tempo de tópico do aluno de QA **cai de 45,04 para 7,68 min**, cerca de 6×. O cronômetro mediria 68,40 min.

A `20260921_01` tinha decidido o contrário. Ela mediu que `active_sec` descarta cerca de 73% do tempo, porque leitura sem toque vira ociosidade depois de 15 s, e passou o tempo para as sessões do cronômetro. Este plano **reverte** essa decisão porque a spec manda (D-1 e D-5: uma fonte por fato, e tempo é `active_sec`). Os números das sessões e da presença não somem: viram métricas próprias, que a F5 exibe com rótulo honesto ("tempo com o material aberto"). **Se o time preferir manter as sessões do cronômetro como tempo de estudo, é a D-1 que muda, não este plano. Decida antes de executar.**

## Global Constraints

- Só abrir PR. Nunca mesclar, nunca fazer push para `main`, nunca aplicar migration em produção.
- Chaves e `DATABASE_URL` só no `.env`, nunca em doc, commit ou chat.
- **Branch e Alembic:**
  - a branch `feat/f4a-tempo-ativo` vai sobre `feat/f3-transporte-ia` (PR #712);
  - a migration nova tem `down_revision = "20261029_09"`;
  - `alembic heads` tem de terminar com **uma** cabeça;
  - **o PR abre contra a `main` só depois de o #712 entrar.** Mesclar PR empilhado já deixou F2 e #708 fora da `main` duas vezes.
- **Funções:** função `SECURITY DEFINER` sempre com `SET search_path = ''` e nomes qualificados com `public.`. As que hoje usam `search_path TO 'public', 'pg_temp'` passam a `''` ao serem redefinidas.
- **Rótulos de `status_atividade` com acento** (`não iniciado`, `em andamento`, `concluido`): esta fase não escreve status, mas `trailup_recalcular_topico_aluno` escreve; não mexa nele.
- **`text()` do SQLAlchemy:** não use `:param::tipo`; use `CAST(:param AS TIPO)`.
- **Testes de banco:**
  - e2e só em Postgres local (`TRAILUP_E2E_RETENCAO_DATABASE_URL`, docker `trailup-e2e-pg`, porta 55432);
  - fixture **com os gatilhos do caminho real**: o `telemetria_resolver_entidade` de `telemetria_time_metric_entries`, os de `topico_aluno`, `conteudo_aluno` e `atividade_aluno` que chamam `trailup_recalcular_topico_aluno`, e os da F0, F2, #709 e F3 em `telemetria_lotes`, que a entrada de métrica referencia;
  - cortar SQL dos módulos de migration, nunca copiar à mão.
- **Falhas que já existem na `main`** (citar pelo nome, não consertar): os e2e `bucket_conteudos_privado`, `exclusao_professor_aviso` e `urls_em_textos`.
- Texto em PT-BR, UTF-8 sem BOM.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Lote de telemetria chega antes da linha de `topico_aluno`.** Esperado: quando a RPC do cronômetro cria a linha, ela já grava o tempo ativo certo, sem esperar o próximo lote (Task 1).
2. **O cronômetro e a telemetria do mesmo tópico, em qualquer ordem.** Esperado: `tempo_gasto_min` termina igual à conta ativa nas duas ordens (Task 1).
3. **Um lote mexe em tópicos de duas turmas.** Esperado: a matrícula de cada turma é recalculada, e a I07 dá 0 (Task 1).
4. **Lote duplicado.** A chave única `(lote_id, scope, entry_key)` barra a linha repetida. Esperado: o tempo não soma em dobro e o gatilho não falha (Task 1).
5. **Apagar métricas de tempo** (retenção, ou exclusão do aluno). Esperado: o gatilho de DELETE recalcula o tempo para baixo, e a matrícula acompanha (Task 1).

Fora desta fase, por decisão:
- **Presença e sessões no console e no app:** a F5 exibe, com o rótulo de §4.2.
- **`tempo_direto_min`:** a coluna fica, porque é livro-caixa histórico, mas deixa de entrar em `tempo_gasto_min`. Apagar a coluna exige olhar os leitores, e isso fica para a F5.

---

### Task 1: uma conta, um dono, e a matrícula acompanha

**Files:**
- Create: `api/alembic/versions/20261030_01_tempo_ativo_fonte_unica.py`
- Modify: `CLAUDE.md`, o parágrafo "Corolário: `tempo_gasto_min` ..." (~l.363). Ele passa a dizer:
  - `tempo_gasto_min` é **tempo ativo**, e o único dono é o gatilho versionado nesta migration;
  - as RPCs do cronômetro usam a mesma conta;
  - `estudo_sessoes` é presença e sessões, não tempo de estudo;
  - a `20260921_01` decidiu o contrário, e a D-1 reverteu (cite os números medidos acima).
- Test: `api/tests/test_migration_tempo_ativo_fonte_unica.py` (offline)
- Test: `api/tests/test_e2e_tempo_ativo_fonte_unica.py` (Postgres local)

**Interfaces:**
- Consumes:
  - `public.trailup_tempo_telemetria_min(p_aluno uuid, p_scope text, p_topico bigint, p_conteudo bigint, p_atividade bigint) RETURNS numeric`, já versionada, é a conta canônica;
  - `public.trailup_recalcular_topico_aluno(uuid, bigint)` e `public.trailup_recalcular_classe_aluno(uuid, bigint)`, que já existem.
- Produces:
  - **`public.trailup_sync_tempo_da_telemetria()`**, redefinida: `RETURNS trigger`, `SECURITY DEFINER`, `SET search_path = ''`. Faz o mesmo `UPDATE` de hoje nas três tabelas, com `trailup_tempo_telemetria_min`. **Depois**, recalcula `trailup_recalcular_topico_aluno(aluno, topico)` para cada `(aluno_id, topico_id)` distinto de `afetadas` e `trailup_recalcular_classe_aluno(aluno, classe)` para cada `(aluno_id, topicos.classe_id)` distinto.
  - **Gatilhos `trg_tme_sync_tempo_ins`, `_upd` e `_del`** recriados exatamente como estão em produção:
    - `AFTER INSERT | UPDATE | DELETE ON public.telemetria_time_metric_entries`;
    - `REFERENCING NEW TABLE AS afetadas` em INSERT e UPDATE, e `OLD TABLE AS afetadas` em DELETE;
    - `FOR EACH STATEMENT`.

    Use `DROP TRIGGER IF EXISTS` antes, porque o banco pode ou não tê-los.
  - **`trailup_registrar_sessao_estudo(...)` e `trailup_registrar_intervalo_estudo(...)`**, redefinidas com **as mesmas assinaturas e as mesmas validações** de hoje. Corte o corpo de `20260921_01` e troque só as expressões de tempo:
    - `tempo_gasto_min` passa a ser `public.trailup_tempo_telemetria_min(<escopo da linha>)`;
    - a RPC de intervalo continua somando `tempo_direto_min`, como livro-caixa;
    - `search_path = ''`, com os nomes qualificados que faltarem (`auth.uid()` já é qualificado).
  - **`public.trailup_tempo_presenca_min(p_aluno uuid, p_scope text, p_topico bigint, p_conteudo bigint, p_atividade bigint) RETURNS numeric`:** soma de `dwell_sec` / 60, na mesma forma de `trailup_tempo_telemetria_min`, `STABLE`, `search_path = ''`. É a métrica "tempo com o material aberto" que a F5 vai exibir. Nada lê dela nesta fase.
  - **I06 redefinida (`fn_inv_i06`):** use o helper `_funcao_invariante("06", corpo)` de `20261029_03`, como a F1 fez com a I10. O corpo novo é `SELECT ta.id::text FROM public.topico_aluno ta WHERE abs(coalesce(ta.tempo_gasto_min, 0) - public.trailup_tempo_telemetria_min(ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)) > 0.01`. O downgrade restaura o corpo da F0, cortado do módulo.
  - **Retroativo no `upgrade()`, depois das funções:** recalcula `tempo_gasto_min` em todas as linhas das três tabelas com a conta canônica. Depois roda `trailup_recalcular_classe_aluno` em todas as linhas de `classe_aluno`.
  - **`downgrade()`:**
    - restaura as duas RPCs com o corpo da `20260921_01` (cortado);
    - restaura `trailup_sync_tempo_da_telemetria` ao corpo de produção (o mesmo `UPDATE`, sem os recálculos);
    - restaura a I06 da F0;
    - derruba `trailup_tempo_presenca_min`;
    - **não desfaz** o retroativo. Os números não voltam, e a docstring diz isso.

- [ ] **Step 1: Testes e2e.** A fixture tem as tabelas de progresso (`topicos`, `conteudos`, `atividades`, `classe_aluno`, `topico_aluno`, `conteudo_aluno`, `atividade_aluno`, `estudo_sessoes`, `estudo_intervalos` e `telemetria_time_metric_entries`) com os gatilhos reais cortados dos módulos. Testes:
  - `test_lote_de_telemetria_grava_tempo_ativo`: duas entradas `topic` com `active_sec` 60 e 30 (`dwell_sec` 120 e 90). Esperado: `tempo_gasto_min = 1.5`.
  - `test_matricula_acompanha_o_gatilho_da_telemetria`: depois do teste acima, `classe_aluno."tempoGastoMin"` é igual à soma dos tópicos da turma, e a I07 (cortada) devolve 0. Este teste falha **hoje**, e é o defeito da matrícula 98.
  - `test_sessao_do_cronometro_nao_sobrescreve_o_tempo_ativo`: com o tempo ativo em 1,5, chame `trailup_registrar_sessao_estudo` como o aluno (`authenticated` com claims), com uma sessão de 10 min. Esperado: `tempo_gasto_min` continua 1,5 e `estudo_sessoes` ganha a linha.
  - `test_intervalo_antigo_nao_sobrescreve_o_tempo_ativo`: o mesmo teste com `trailup_registrar_intervalo_estudo`, `p_tempo_min = 10`. Esperado: `tempo_direto_min` sobe 10 e `tempo_gasto_min` continua 1,5.
  - `test_rpc_cria_a_linha_ja_com_o_tempo_ativo`: com telemetria já gravada para um tópico sem linha em `topico_aluno`, a RPC do cronômetro cria a linha, e ela nasce com `tempo_gasto_min = conta ativa`.
  - `test_ordem_cronometro_telemetria_nao_importa`: parametrizado nas duas ordens. O resultado é o mesmo.
  - `test_lote_com_topicos_de_duas_turmas_recalcula_as_duas_matriculas`.
  - `test_apagar_metrica_recalcula_para_baixo`: `DELETE` de uma entrada. O tempo e a matrícula caem.
  - `test_presenca_soma_dwell`: `trailup_tempo_presenca_min(...)` = (120 + 90) / 60.
  - `test_i06_nova_passa_e_a_velha_acusaria`: depois do `upgrade()`, a I06 nova devolve 0. O corpo da F0 aplicado ao mesmo banco devolve a linha, porque o tópico tem `tempo_direto_min` e sessão.
  - `test_retroativo_alinha_tudo`: antes do `upgrade()`, semeia um tópico com `tempo_gasto_min = 45` (conta das sessões), telemetria ativa de 7,68 min e uma matrícula fora da soma. Depois, o tópico vale 7,68, a matrícula é a soma, e a I06 e a I07 dão 0.
  - `test_rpcs_mantem_a_seguranca`: outro aluno recebe `42501` (`aluno_invalido`), e aluno sem matrícula recebe `matricula_invalida`. O comportamento é o mesmo de antes.
  - `test_downgrade_restaura_rpcs_e_i06`.

  Offline:
  - as quatro funções redefinidas têm `search_path = ''` e nomes qualificados;
  - nenhuma expressão de `tempo_gasto_min` usa `trailup_tempo_sessao_min` nem `tempo_direto_min`;
  - os três gatilhos são `FOR EACH STATEMENT` com a tabela de transição certa;
  - não há `%`;
  - há uma cabeça só no Alembic.
- [ ] **Step 2:** rodar e ver falhar: o módulo ainda não existe, e a I07 e a I06 acusam.
- [ ] **Step 3:** implementar a migration e o parágrafo do `CLAUDE.md`. A docstring traz a tabela medida, a decisão D-1 com o custo (45,04 → 7,68) e a reversão da `20260921_01`.
- [ ] **Step 4:** rodar os dois arquivos e a suíte inteira da API, com e sem o DSN do e2e.
- [ ] **Step 5: Commit** `fix(tempo): tempo de estudo é o tempo ativo, com um dono só, e a matrícula acompanha`

### Task 2: verificação e PR

- [ ] **API:** `cd api && pytest -q` (com e sem o DSN), `ruff check` nos arquivos novos, e `alembic heads` com uma cabeça só (`20261030_01`).
- [ ] **Medir em produção, só leitura, o que o retroativo muda:** por tópico, por matrícula e no total, a diferença entre o `tempo_gasto_min` de hoje e a conta ativa. Esperado no total de tópicos: 45,04 → 7,68.
- [ ] **PR contra a `main` depois de o #712 entrar.** O texto diz:
  - **o custo da D-1 em números,** e que a `20260921_01` é revertida;
  - **o que o aluno e o professor veem cair** (tempo no app e no console). Isso precisa ser comunicado antes do deploy;
  - **presença e sessões continuam gravadas** e entram na F5;
  - **sem merge pela sessão.**

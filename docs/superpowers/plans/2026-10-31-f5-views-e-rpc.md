# F5 — views e RPC: o console mostra só número que mede o que diz — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** I16 (tempo de uso da view de engajamento ÷ soma das sessões = 1,00) passar, e cada KPI de engajamento do console ter definição única, versionada e testada (spec §5.2). Isso fecha a #12: tempo ativo por tópico, sessões por aluno, retorno semanal e abandono por etapa, com janela, fuso e "sem dado" ≠ 0.

**Architecture:**
- **Primeiro espelhar, depois corrigir.** As dez `vw_metricas_*` existem só na produção (schema não versionado). A Task 1 as traz para o Alembic com o texto exato de `pg_get_viewdef`, sem mudar nada. As Tasks 2 e 3 corrigem, cada uma num commit com a medição. É o molde da `20261021_21` ("espelhar primeiro, estreitar depois").
- **Uma definição por fato, no banco.** Tempo é `active_sec` do escopo `topic` (D-1, já valendo desde a F4a). Retorno, abandono e conclusão usam as mesmas regras da RPC `metricas_engajamento_turma` (`20261026_01`), que já resolve janela, fuso e nulo. As views passam a ler as mesmas fontes que a RPC, em vez de cada uma ter a sua conta.
- **A regra de exibição chega ao console.** Todo card lê `vw_metricas_disponibilidade` antes de desenhar e tem os quatro estados do §4.2. Hoje o console não consulta a disponibilidade: os dois cards `legado.*` estão indisponíveis no banco e aparecem mesmo assim.

**Tech Stack:** Postgres 17 (Alembic, views com `security_invoker`, plpgsql), React/Vite (console), pytest com e2e em Postgres local, `node --test`/vitest no frontend.

**Spec:** [`docs/superpowers/specs/2026-10-28-metricas-ponta-a-ponta-design.md`](../specs/2026-10-28-metricas-ponta-a-ponta-design.md): a linha F5 do §8, §4.2 (quatro estados), §5.2 (teste por KPI), §6.2 (o que o professor vê e o que não vê) e I16 do §5.1.

## Medido em produção (só leitura, 31/10)

- **O banco está em `20261029_06`.** As migrations da F2 em diante (`20261029_07` …) estão mescladas e não aplicadas. O resultado das invariantes abaixo é da rodada de 30/10, 03h30.
- **As dez views** (`chat`, `comportamento`, `desempenho`, `disponibilidade`, `distribuicao_turma`, `engajamento`, `evolucao_desempenho`, `sessoes`, `turma_geral` e `turma_perfil`):
  - todas têm `security_invoker = on`, `SELECT` para `authenticated` e nenhum para `anon`;
  - **nove não existem no Alembic.** A exceção é a `vw_metricas_disponibilidade`, da F0;
  - têm de 0 a 99 linhas.
  - **Dependências:** `turma_geral` e `turma_perfil` leem `engajamento`, `desempenho`, `comportamento` e `chat`; `distribuicao_turma` lê `engajamento`; `engajamento` lê `sessoes`.
- **I16 falha em 3 de 3 pares aluno × turma.** A razão entre o tempo de uso da view e a soma das sessões é de **6,00, 81,00 e 10,00**.
  - **Causa, lida na definição:** `vw_metricas_engajamento_aluno_classe` faz `LEFT JOIN topic_durations` (uma linha por abertura de tópico) antes do `sum(sb.tempo_sessao_seg)`. Cada sessão é somada uma vez por abertura.
- **Defeitos de definição, lidos no texto das views:**
  - **Abandono:** `taxa_abandono_pct` = tópicos não concluídos ÷ tópicos com linha. Um aluno no meio da trilha aparece com 60% de abandono, e `risco.ts` o marca como "crítico".
  - **Retorno:** `taxa_retorno_pct` = dias ativos ÷ intervalo de dias. Um aluno que usou o app num dia só sai com 100%.
  - **Tempo de conclusão:** `tempo_medio_conclusao_topico_seg` entra com 0 em toda abertura sem conclusão.
  - **Fuso:** `vw_metricas_sessoes_aluno_dia` usa `date(s.started_at)`, que corta o dia em UTC. Estudo das 21h às 24h de Brasília cai no dia seguinte.
  - **Nulo:** todo agregado termina em `COALESCE(..., 0)`. "Sem dado" vira 0.
- **Disponibilidade:** `legado.tempo_uso`, `legado.abandono`, `prof.inatividade` e `prof.cobertura` estão **indisponíveis**. O console lê as views direto e não consulta `vw_metricas_disponibilidade` em lugar nenhum (`grep` em `frontend/src` e `mobile/src`).
- **Quem lê as views hoje:**
  - **console:** `useTurmaKpis.ts` (`turma_geral`, `turma_perfil`, `distribuicao_turma`); `useSinaisDosAlunos.ts` e `risco.ts` (`engajamento.taxa_abandono_pct`, `sessoes.dia`); `DashboardSection.tsx` e `evolucao.ts` (`evolucao_desempenho`);
  - **API:** `insights_turma.py:198-209` (`engajamento.taxa_abandono_pct`, `sessoes.dia`), que vai para o prompt dos insights; `escriba.py:118-130` (`turma_geral`, `turma_perfil`, `distribuicao_turma`).
- **A RPC `metricas_engajamento_turma`** (`20261026_01`, já aplicada) já tem tempo ativo, sessões, retorno semanal por interseção de semanas completas, janela com fuso e `NULL` quando falta denominador. Mas ninguém a chama, nem o console nem o mobile. Faltam nela a quebra por tópico e o abandono por etapa.

## Decisões deste plano

| # | Decisão | Por quê | Custo se errado |
|---|---|---|---|
| P1 | **Acerto, nota e questão ficam fora da F5.** `desempenho`, `comportamento`, `evolucao_desempenho` e as colunas de acerto de `turma_geral`/`turma_perfil` são espelhadas (Task 1), mas não corrigidas. | A spec põe a F5 depois da F4, e da F4 só a F4a (tempo) entrou. O livro único de respostas (D-5, I19) e a reconciliação de pontos (D-3) não existem ainda. Corrigir a conta de acerto agora, sobre os quatro livros-caixa, valida artefato. | Os cards de acerto continuam com o número de hoje até a F4b. A Task 5 os registra no catálogo como `legado.acerto`, para que a disponibilidade deles exista quando a F4b criar a invariante. |
| P2 | **Abandono deixa de ser taxa por aluno.** Vira os três construtos da spec (§7, linha "Risco de abandono"), cada um com fato e data (§6.2): **inatividade** (7 dias sem atividade acadêmica), **estagnação** (14 dias sem avanço no tópico e atrás da mediana da turma) e **evasão** (30 dias sem atividade acadêmica, a parte mensurável hoje do rótulo de evasão; "sem avaliação final" ainda não tem fonte). Para a #12, **abandono por etapa** = quantos alunos estão estagnados em cada tópico da trilha. | A taxa antiga mede "ainda não terminou", não abandono. A spec proíbe exibir "crítico" derivado dela (§6.2), e a etapa natural do fluxo é o tópico da trilha. | Quem esperava uma porcentagem de abandono passa a ver contagens por tópico. Se a orientação do TCC pedir outra etapa (formato do material, por exemplo), a RPC ganha um eixo novo, mas a regra de estagnação continua a mesma. |
| P3 | **Retorno = interseção de duas semanas completas consecutivas**, a regra da RPC, agora também na view. | Uma regra só para o mesmo nome. A da RPC já foi revisada (#699) e testada. | Turma com menos de duas semanas completas na janela mostra "sem dado", não 0% nem 100%. |
| P4 | **As views mudam de colunas, não só de conta.** `taxa_abandono_pct` e `taxa_retorno_pct` **saem**; entram `retorno_semanal_pct`, `inativo_desde`, `estagnado_desde` e `tempo_ativo_seg`. As dependentes são recriadas na mesma migration (`DROP ... CASCADE` e `CREATE` na ordem das dependências). | Manter o nome com outra semântica faria `insights_turma.py`, `escriba.py` e o console lerem um número novo como se fosse o antigo, sem nenhum erro. Coluna que some quebra alto, no teste e no typecheck. | Todos os consumidores mudam no mesmo PR (Task 6). Esquecer um quebra o build, não o significado. |
| P5 | **Fuso fixo `America/Sao_Paulo` nas views; a RPC continua recebendo `p_timezone`.** | Todo aluno de hoje está em Brasília, e uma view não recebe parâmetro. | Turma em outro fuso vê o corte do dia errado nas views; a RPC continua certa. |
| P6 | **Dois PRs.** PR A, banco: Tasks 1 a 5. PR B, console e API: Tasks 6 a 8, sobre o PR A. | O PR A é revisável sozinho e as invariantes passam com ele. O PR B troca o que o professor vê, e isso tem de ser conferido no navegador com login de professor. | O PR B não entra sem o A. Entre os dois, o console lê colunas que não existem mais. Por isso o PR A **não pode ser aplicado em produção antes do PR B estar pronto**, e o texto dele diz isso. |

## Global Constraints

- Só abrir PR. Nunca mesclar, nunca fazer push para `main`, nunca aplicar migration em produção.
- Chaves e `DATABASE_URL` só no `.env`, nunca em doc, commit ou chat.
- **Alembic:**
  - a primeira migration desta fase encadeia na cabeça da `main` no dia: hoje é `20261031_01`, ou `20261031_02` se a #726 já tiver entrado;
  - `alembic heads` termina com **uma** cabeça;
  - se a #726 estiver aberta, a branch vai sobre a `main` e a PR diz que depende dela. **Não empilhar a PR sobre outra PR aberta:** a #725 entrou na branch errada exatamente por isso.
- **Views:** toda view nasce com `security_invoker = on` e `GRANT SELECT ... TO authenticated` (nunca `anon`). A I11 continua passando.
- **Regra de fronteira:** nada desta fase passa pela API. A API só **lê** as views (insights e escriba); quem calcula é o banco.
- **Testes:**
  - e2e de banco em Postgres local (`TRAILUP_E2E_RETENCAO_DATABASE_URL`, Docker `postgres:17.6-alpine`), sobre o esqueleto `tests/fixtures/schema_prod_esqueleto_20261024.sql`;
  - fixture com os gatilhos do caminho real de telemetria, cortados dos módulos: o de via (`20261029_01`), o de fechamento de sessão (`20261029_07`), o de sessão própria (`20261029_08`) e o do tempo ativo (`20261030_01`);
  - cada KPI tem resultado calculado à mão num comentário do teste (§5.2).
- **Em SQL:** `COALESCE(enum, '')` estoura (use `::text`), e os rótulos de `status_atividade` têm acento (`concluido`, `não iniciado`).
- Texto em PT-BR, UTF-8 sem BOM. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **I16 passa** na fixture com duas sessões e três aberturas de tópico (o caso que hoje dá 6×) e na turma sem sessão nenhuma (Task 2).
2. **Fuso:** uma sessão às 22h30 de Brasília conta no dia de Brasília, não no dia seguinte em UTC (Task 2).
3. **"Sem dado" ≠ 0:** turma sem telemetria na janela → `NULL` em tempo, retorno e estagnação; turma com telemetria e zero estudo ativo → `0` (Tasks 2, 3 e 4).
4. **Abandono por etapa:** um aluno que concluiu o tópico 1 e parou no 2 há 15 dias, atrás da mediana, conta **só** no tópico 2. Um aluno que nunca abriu a trilha não conta em etapa nenhuma (é inativo, não estagnado) (Tasks 3 e 4).
5. **Nenhum consumidor lê coluna removida:** `grep` por `taxa_abandono_pct` e `taxa_retorno_pct` em `frontend/src`, `mobile/src` e `api/app` sem resultado (Task 6).
6. **Quatro estados no console:** uma métrica indisponível aparece "em revisão" mesmo com valor na view; erro de RLS aparece como erro, não como vazio (Task 7).
7. **Aluno não lê agregado da turma:** como `authenticated` com claims de aluno, as views de turma devolvem só a própria linha ou nada. Nunca a dos colegas (teste de papel em todas as Tasks de banco).

Fora desta fase, por decisão:
- **Acerto, nota e questão problemática:** ficam para depois da F4b (P1).
- **Métricas do aluno no mobile** (`aluno.tempo_ativo_semana`, `aluno.sequencia`): a F5 da spec é o console. O mobile vem quando a tela de progresso for refeita.
- **Aba de dev (§6.3):** fica para a F6, junto com os modelos em sombra.
- **Aplicar as migrations em produção:** é do time, depois do PR B (P6).

---

### Task 1: espelhar as views no Alembic (PR A)

**Files:**
- Create: `api/alembic/versions/2026MMDD_01_views_de_metricas_no_alembic.py`
- Test: `api/tests/test_migration_views_de_metricas_no_alembic.py`

**Interfaces:** para cada uma das nove views sem versão, `CREATE OR REPLACE VIEW public.<nome> WITH (security_invoker = on) AS <texto exato de pg_get_viewdef(...,true)>`, em ordem de dependência, seguido do `GRANT SELECT ... TO authenticated`. O `downgrade()` não remove nada: as views existiam antes, mesma decisão da `20261021_21`.

- [ ] **Step 1:** ler da produção, só leitura, o texto de cada view (`pg_get_viewdef(oid, true)`) e o md5 dele. Os números vão para a docstring.
- [ ] **Step 2: Teste** `test_as_nove_sao_o_texto_de_producao`: o md5 do corpo de cada view, cortado do módulo, bate com o medido. Outros testes: `test_todas_com_invoker_e_sem_anon` e `test_ordem_respeita_dependencias` (`sessoes` antes de `engajamento`, que vem antes de `turma_geral`).
- [ ] **Step 3:** implementar e rodar. O e2e aplica a migration sobre o esqueleto e confere que as nove existem e devolvem as colunas atuais.
- [ ] **Step 4: Commit** `chore(metricas): as views de métricas entram no Alembic com o texto de produção`

### Task 2: sessões e tempo sem fan-out, no fuso de Brasília (PR A)

**Files:**
- Create: `api/alembic/versions/2026MMDD_02_views_de_metricas_tempo_e_sessoes.py`
- Test: `api/tests/test_e2e_views_metricas_tempo.py`

**Interfaces:**
- **`vw_metricas_sessoes_aluno_dia`:**
  - `dia` = `(s.started_at AT TIME ZONE 'America/Sao_Paulo')::date`;
  - `tempo_ativo_seg` = soma de `active_sec` do escopo `topic` de `telemetria_time_metric_entries` (D-1; a F4a já faz a coluna derivar daí). Sem entrada de tempo, fica `NULL`;
  - `tempo_sessao_seg` (presença, "tempo com o app aberto") continua com a regra de hoje: é o denominador da I16.
- **`vw_metricas_engajamento_aluno_classe`:**
  - agrega **cada fonte por `(aluno, classe)` antes do join**: sessões, tempo por tópico e eventos de tópico;
  - `tempo_total_uso_seg` = soma das sessões, `tempo_ativo_seg` = soma do tempo ativo, `numero_sessoes`;
  - `tempo_medio_conclusao_topico_seg` só sobre aberturas **com** conclusão; `NULL` quando não há nenhuma;
  - **nenhum `COALESCE(..., 0)` em média ou taxa.**
- As dependentes (`turma_geral`, `turma_perfil`, `distribuicao_turma`) são recriadas na mesma migration (P4). Nesta task elas só deixam de ler as colunas que mudaram de sentido. As colunas novas entram na Task 3.

- [ ] **Step 1: Testes e2e** (fixture: duas sessões do mesmo aluno, uma às 22h30 de Brasília; três aberturas de tópico, uma sem conclusão; um aluno matriculado sem telemetria):
  - `test_i16_passa`: a I16, cortada de `20261029_03`, devolve 0 linhas;
  - `test_tempo_total_e_a_soma_das_sessoes` (calculado à mão no comentário);
  - `test_sessao_das_22h30_conta_no_dia_de_brasilia`;
  - `test_tempo_ativo_vem_do_escopo_topic`: somar os quatro escopos daria 4×, e o teste mostra isso;
  - `test_conclusao_media_ignora_abertura_sem_conclusao`;
  - `test_aluno_sem_telemetria_fica_nulo_nao_zero`;
  - `test_aluno_so_le_a_propria_linha` (papel simulado).
- [ ] **Step 2:** rodar contra a Task 1 e ver falhar, com a I16 devolvendo 1 linha (o fan-out reproduzido).
- [ ] **Step 3:** implementar. A docstring traz a medição (6×, 81×, 10×) e a causa (`LEFT JOIN topic_durations`).
- [ ] **Step 4: Commit** `fix(metricas): tempo de uso sem fan-out e dia no fuso de Brasília (I16)`

### Task 3: retorno e os três sinais: inatividade, estagnação e evasão (PR A)

**Files:**
- Create: `api/alembic/versions/2026MMDD_03_views_de_metricas_retorno_e_sinais.py`
- Test: `api/tests/test_e2e_views_metricas_sinais.py`

**Interfaces:**
- **`vw_metricas_engajamento_aluno_classe`:**
  - **saem** `taxa_abandono_pct` e `taxa_retorno_pct` (P4);
  - **entram:**
    - `ultima_atividade_em`: o último `captured_at` com `active_sec > 0` no escopo `topic`;
    - `inativo_desde`: `ultima_atividade_em` quando faz mais de 7 dias, senão `NULL`. Matriculado sem atividade nenhuma tem a data da matrícula;
    - `estagnado_topico_id` e `estagnado_desde`: o tópico em andamento em que o percentual não muda há 14 dias e está abaixo da mediana da turma naquele tópico;
    - `evadido_desde`: `ultima_atividade_em` (ou a data da matrícula) quando faz mais de 30 dias, senão `NULL`. Evadido também é inativo; o console mostra só o mais grave.
- **`vw_metricas_turma_geral_classe`:**
  - `retorno_semanal_pct`: a regra da RPC (interseção de semanas completas consecutivas nas últimas 8 semanas). `NULL` quando há menos de duas semanas completas;
  - `alunos_inativos`, `alunos_estagnados` e `alunos_evadidos`: contagens;
  - `alunos_sem_dado`: matriculado que recusou telemetria ou está em modo restrito. **Não** conta como inativo (§6.2).
- **"Sem avanço" sem histórico:** o banco não guarda histórico de percentual. A estagnação usa a última mudança de `topico_aluno` (`updated_at`, que o gatilho de progresso toca), e a docstring registra isso.

- [ ] **Step 1: Testes e2e** (calculados à mão):
  - `test_retorno_um_dia_de_uso_nao_e_100`;
  - `test_retorno_sem_duas_semanas_completas_e_nulo`;
  - `test_inativo_7_dias_e_sem_dado_nao_e_inativo`;
  - `test_evadido_30_dias_e_tambem_inativo`;
  - `test_estagnado_so_no_topico_em_que_parou` (o caso 4 do Review Focus);
  - `test_aluno_no_meio_da_trilha_nao_aparece_como_abandono` (o achado da spec §1).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4: Commit** `fix(metricas): retorno semanal e sinais de inatividade, estagnação e evasão no lugar da taxa de abandono`

### Task 4: a RPC ganha a quebra por tópico e o abandono por etapa (PR A, fecha a #12)

**Files:**
- Create: `api/alembic/versions/2026MMDD_04_kpis_por_topico.py`
- Modify (teste): `api/tests/test_e2e_kpis_engajamento_banco.py`

**Interfaces:** `metricas_engajamento_turma` (mesma assinatura e mesma checagem de posse) devolve, além do que já devolve, `por_topico`: um array ordenado pela ordem da trilha com:
- `topico_id`;
- `tempo_ativo_seg` e `tempo_ativo_medio_por_aluno_ativo_seg`;
- `alunos_ativos` e `sessoes`;
- `iniciaram`, `concluiram` e `estagnados` (o abandono por etapa, P2).

Tudo dentro da janela e do fuso de `p_timezone`, com `NULL` quando o denominador é zero. A função é reescrita a partir do texto da `20261026_01`, e o teste marca o trecho novo.

- [ ] **Step 1: Testes:** os critérios da #12, um por teste, com o mesmo dado das Tasks 2 e 3:
  - `test_por_topico_tempo_ativo_por_aluno`;
  - `test_por_topico_respeita_a_janela`;
  - `test_abandono_por_etapa_e_estagnado_por_topico`;
  - `test_topico_sem_aluno_vem_com_nulos`.
  - **O número da RPC e o da view para o mesmo aluno e período são iguais.** É a "uma definição" que a P3 promete.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4: Commit** `feat(metricas): KPIs da turma por tópico, com abandono por etapa (#12)`

### Task 5: catálogo (PR A)

**Files:**
- Create: `api/alembic/versions/2026MMDD_05_catalogo_f5.py`
- Test: `api/tests/test_migration_catalogo_f5.py`

**Interfaces:**
- `legado.tempo_uso` e `legado.abandono` **saem** do catálogo;
- entram:
  - `prof.tempo_ativo` (I01–I03 e I16);
  - `prof.retorno_semanal` (I16 e I17);
  - `prof.abandono_por_etapa` (I04, I05 e I17);
  - `legado.acerto` (P1): sem invariante por enquanto. A docstring diz que a F4b cria a dela;
- `prof.inatividade` e `prof.estagnado` passam a apontar para a view nova (`fonte`).

- [ ] **Step 1:** teste offline das linhas e e2e de que `vw_metricas_disponibilidade` lista as chaves novas e não lista as removidas. **Step 2:** implementar. **Step 3: Commit** `feat(metricas): catálogo troca os cards legados pelos da F5`
- [ ] **Step 4: Abrir o PR A.**
  - **Medida a registrar:** a mesma consulta da I16 contra a produção, só leitura, mostra hoje as razões 6, 81 e 10, e o teste mostra 1,00 depois.
  - **O texto da PR diz:** **não aplicar em produção antes do PR B** (P6); a cabeça do Alembic; sem merge pela sessão.

### Task 6: consumidores (PR B)

**Files:**
- Modify: `frontend/src/components/console/useTurmaKpis.ts` e os tipos; `frontend/src/components/console/dashboard/useSinaisDosAlunos.ts`; `frontend/src/integrations/supabase/types.ts` (regerado ou ajustado à mão nas views tocadas)
- Modify: `api/app/services/insights_turma.py:198-209` e `api/app/services/escriba.py:118-130`
- Test: os testes existentes desses arquivos e `npm run typecheck` (o do projeto, **não** `npx tsc --noEmit`)

- [ ] **Step 1:** `grep` pelas colunas removidas em `frontend/src`, `mobile/src` e `api/app`. Toda ocorrência passa a ler a coluna nova ou a RPC.
- [ ] **Step 2:** o prompt de `insights_turma` passa a receber inatividade e estagnação com data, não `taxa_abandono_pct`. O teste do insight confere o texto montado.
- [ ] **Step 3:** suítes da API e do frontend. **Commit** `refactor(console): KPIs leem as colunas novas da F5`

### Task 7: quatro estados e risco com três construtos (PR B)

**Files:**
- Create: `frontend/src/components/console/dashboard/useDisponibilidade.ts`. Lê `vw_metricas_disponibilidade` uma vez por carga do dashboard.
- Modify: `KpisPrincipais.tsx` e `KpisSecundarios.tsx`, e `risco.ts`.
- Modify: o seletor de janela de `DashboardHeader.tsx` (hoje "só a UI") passa `p_inicio`/`p_fim` à RPC.

**Interfaces:**
- Cada card recebe `estado: "valor" | "sem_dado" | "em_revisao" | "erro"` e nunca colapsa em zero (§4.2). Segmento com `n < n_minimo` fica oculto.
- **`avaliarRisco`:**
  - perde o critério `abandono` e a regra "dois sinais = crítico" (§6.2: nota baixa não soma com inatividade);
  - passa a ter os três construtos, `inatividade`, `estagnacao` e `evasao`, cada um com fato e data ("sem atividade há 9 dias"), e "sem dado" não é sinal;
  - o rótulo "crítico" sai: fica um nível só, "atenção", até a F6 promover um modelo.

- [ ] **Step 1: Testes** (vitest/node): um por estado do card; `risco` com o aluno no meio da trilha (sem sinal), o inativo há 9 dias (sinal com data), o evadido há 31 dias (só a evasão aparece, não a inatividade junto) e o que recusou telemetria (sem sinal).
- [ ] **Step 2:** implementar. **Step 3:** `npm run typecheck`, `npm test` e build.
- [ ] **Step 4: Commit** `feat(console): cards de métrica nos quatro estados e risco pelos três construtos`

### Task 8: verificação e PR B

- [ ] **Postgres local:** com as migrations do PR A aplicadas e o console apontando para ele, abrir o dashboard **com login de professor** e conferir com os olhos:
  - um card em cada estado;
  - a janela mudando os números;
  - o abandono por etapa batendo com a consulta SQL da RPC.

  Registrar com captura de tela na PR. O `trailup.vercel.app` não serve como alvo de regressão (CLAUDE.md).
- [ ] **Abrir o PR B**, que depende do PR A. O texto diz:
  - **ordem de aplicação:** primeiro o PR A e o PR B no ar juntos, depois `alembic upgrade head`. Entre os dois, o console quebraria (P6);
  - **o que o professor deixa de ver:** a taxa de abandono e o "crítico" (§6.2). Isso precisa ser comunicado ao time antes do deploy;
  - **sem merge pela sessão.**

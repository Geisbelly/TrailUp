# F3 — transporte da IA: todo lote é analisado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** I15 (lote com mais de 1 h sem análise nem erro) e I20 (analisados ÷ recebidos ≥ 0,95 na semana) passarem e continuarem passando. Isso vale para todo lote, chegue ele pela API ou pelo caminho direto do aparelho.

**Architecture:**
- **O banco enfileira.** Um gatilho em `telemetria_lotes` põe todo lote novo numa fila, `telemetria_analise_fila`. A fila se esvazia sozinha quando o lote ganha `analysis_ciclo_id` ou `analysis_error`.
- **A API consome.** Um laço em segundo plano da API reivindica itens vencidos com `FOR UPDATE SKIP LOCKED` e roda a mesma `run_analysis` do endpoint, fora de qualquer pedido HTTP.
- **A análise dentro do pedido continua.** O app usa `acoes_aplicadas` da resposta para disparar o refresh da personalização (`usePersonalizationRefresh.ts:61`). A fila é a rede: pega o que o pedido não analisou, seja do caminho direto, de falha, de timeout ou da API fora do ar.

**Tech Stack:** Postgres 17 (Alembic, plpgsql), FastAPI (laço `asyncio` no `lifespan`, como `retencao_externa_loop`), pytest com e2e em Postgres local.

**Spec:** [`docs/superpowers/specs/2026-10-28-metricas-ponta-a-ponta-design.md`](../specs/2026-10-28-metricas-ponta-a-ponta-design.md), linha F3 do §8, e I15 e I20 do §5.1. As duas invariantes já estão na F0 (`20261029_03`, chaves `"15"` e `"20"`) e não mudam.

## Medido em produção (só leitura, 29/10)

- **Lotes:** são 156 `telemetria_lotes`, de 14/10 a 29/10, todos de **um** aluno.
  - **Análise:** nenhum tem `analysis_ciclo_id` nem `analysis_error`.
  - **Recentes:** 15 são dos últimos 7 dias.
  - **Payload:** todos têm `payload`.
- **Por que nenhum foi analisado** (spec §2): o build em campo aponta para `*.traefik.me`, que serve certificado autoassinado. O `fetch` cai no caminho direto, e o caminho direto não analisa. O #689 corrige a URL, mas só no build EAS novo, e gerar esse build é com o time.
- **O que o pipeline usa do `Request`:** só `request.app.state` (`settings` e `graph_ephemeral`), em `analysis_runner.py:149,156` e `linear_analysis_pipeline.py:786`. Um objeto com `.app` basta para rodar fora do pedido.
- **Frames:** os frames da câmera não são gravados (`_sanitize_lote_payload`). A análise pela fila roda **sem frames**, o que está de acordo com D-4: câmera e emoção ficam fora até haver o termo biométrico.

## Decisões deste plano

| # | Decisão | Por quê | Custo se errado |
|---|---|---|---|
| P1 | A análise dentro do pedido **fica**, e a fila é a rede | O refresh da personalização no app lê a resposta do pedido. Tirar a análise de lá exige o app ler o resultado de outro jeito, e isso fica para a F6 | Pedidos lentos continuam lentos (o lote já está salvo antes da análise) |
| P2 | O item entra na fila com `proxima_tentativa_em = now() + 5 min` | É a folga para a análise do pedido terminar e esvaziar a fila primeiro, sem análise em dobro | Até 5 min a mais para o lote do caminho direto ser analisado |
| P3 | **Retroativo só dos últimos 7 dias** (a janela da I20). Os pendentes mais antigos recebem `analysis_error = 'expirado_sem_analise'` | Analisar hoje 141 lotes de QA de 22/10 gastaria LLM e poderia gerar ações e notificações sobre estudo de uma semana atrás | Os lotes antigos ficam sem análise, rotulados honestamente, e a I15 os conta como tratados |
| P4 | 5 tentativas, com espera de `2^tentativas` minutos. Na quinta falha, `analysis_error = 'fila: ' \|\| erro` | Um lote envenenado não pode prender a fila nem gastar LLM sem fim | Uma falha transitória longa (mais de 30 min (2+4+8+16)) vira erro definitivo |
| P5 | A fila **não** grava eventos legados em `eventos_aluno` | O pedido já grava para os lotes da API. Gravar pela fila mexe em pontos, e isso é decisão da F4 | Os lotes do caminho direto continuam sem eventos legados. Está registrado em "Fora desta fase" |

## Global Constraints

- Só abrir PR. Nunca mesclar, nunca fazer push para `main`, nunca aplicar migration em produção.
- Chaves e `DATABASE_URL` só no `.env`, nunca em doc, commit ou chat.
- **Branch e Alembic:**
  - a branch `feat/f3-transporte-ia` vai sobre `fix/telemetria-lote-sessao-alheia-v2` (PR #709, contra a `main`); a `main` já tem F0, F1 e F2;
  - a migration nova tem `down_revision = "20261029_08"`;
  - `alembic heads` tem de terminar com **uma** cabeça.
- **Regra de fronteira:** enfileirar é encanamento, então fica no banco. Analisar é IA, então fica na API.
- **Tabela nova:** nasce com RLS ligada (o event trigger `ensure_rls` faz isso) e **sem policy**, porque é só de `service_role`/`postgres`. A docstring da migration diz isso, como manda o CLAUDE.md.
- **Funções:** função `SECURITY DEFINER` sempre com `SET search_path = ''`, nomes qualificados com `public.` e `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- **SQL na API:** `text()` do SQLAlchemy não aceita `:param::tipo`: use `CAST(:param AS TIPO)`. Parâmetro usado só em `IS NULL` precisa de cast explícito.
- **Laço da API:** nunca morre (`except Exception` com log do tipo, como `retencao_externa_loop`) e cancela limpo no `lifespan`.
- **Testes de banco:**
  - e2e só em Postgres local (`TRAILUP_E2E_RETENCAO_DATABASE_URL`, docker `trailup-e2e-pg`, porta 55432);
  - fixture com os gatilhos do caminho real: os da F0 (`20261029_01`), F2 (`20261029_07`) e #709 (`20261029_08`) que estejam em `telemetria_lotes`;
  - cortar SQL dos módulos de migration, nunca copiar à mão.
- **Falhas que já existem na `main`** (citar pelo nome, não consertar): os e2e `bucket_conteudos_privado`, `exclusao_professor_aviso` e `urls_em_textos`.
- Texto em PT-BR, UTF-8 sem BOM.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pedido e fila no mesmo lote.** A análise do pedido termina antes de vencer a espera. Esperado: o item sai da fila e o laço não analisa de novo (Task 1 e Task 2).
2. **Duas instâncias da API ao mesmo tempo** (sobreposição de deploy no Dokploy). Esperado: as duas reivindicações devolvem conjuntos disjuntos (Task 1).
3. **Lote envenenado.** `run_analysis` sempre levanta exceção. Esperado: a espera cresce e, na quinta tentativa, o lote ganha `analysis_error` e sai da fila (Task 1 e Task 2).
4. **Aluno sem consentimento** (sem a finalidade `telemetria` ou `emocional`). Esperado: o lote ganha `analysis_error = 'modo_restrito'` sem chamar o pipeline (Task 2).
5. **Lote apagado pela retenção enquanto está na fila.** Esperado: o item some junto (FK `ON DELETE CASCADE`), sem erro no laço (Task 1).
6. **Instância morta no meio da análise.** Esperado: a trava vence (`p_trava_seg`) e outra reivindicação pega o item (Task 1).

Fora desta fase, por decisão:
- **Build EAS novo com o #689:** é com o time. Sem ele, os lotes de produção continuam vindo pelo caminho direto. A partir desta fase eles **passam a ser analisados** mesmo assim.
- **Eventos legados dos lotes do caminho direto (P5):** ficam para a F4.
- **Ler o resultado da análise da fila no app** (refresh sem a resposta do pedido): fica para a F6.

---

### Task 1: a fila no banco

**Files:**
- Create: `api/alembic/versions/20261029_09_analise_de_lote_pela_fila.py`
- Test: `api/tests/test_migration_analise_de_lote_pela_fila.py` (offline)
- Test: `api/tests/test_e2e_analise_de_lote_pela_fila.py` (Postgres local; copie o molde de `test_e2e_sessao_fecha_pelo_banco.py`)

**Interfaces:**
- **Tabela `public.telemetria_analise_fila`:**
  - `lote_id uuid PRIMARY KEY REFERENCES public.telemetria_lotes(id) ON DELETE CASCADE`
  - `enfileirado_em timestamptz NOT NULL DEFAULT now()`
  - `proxima_tentativa_em timestamptz NOT NULL`
  - `tentativas integer NOT NULL DEFAULT 0`
  - `travado_em timestamptz`
  - `ultimo_erro text`
  - Índice em `(proxima_tentativa_em)`.
  - Sem policy e sem GRANT para `anon`/`authenticated`: `REVOKE ALL ... FROM anon, authenticated`.
- **`public.fn_telemetria_lote_enfileira_analise()`:** `SECURITY DEFINER`, `search_path = ''`. Gatilho `trg_telemetria_lotes_enfileira_analise`, `AFTER INSERT ON public.telemetria_lotes FOR EACH ROW`.
  - Se `NEW.analysis_ciclo_id IS NULL AND NEW.analysis_error IS NULL`, insere `(NEW.id, now() + interval '5 minutes')` com `ON CONFLICT (lote_id) DO NOTHING`.
- **`public.fn_telemetria_lote_sai_da_fila()`:** `SECURITY DEFINER`, `search_path = ''`. Gatilho `trg_telemetria_lotes_sai_da_fila`, `AFTER UPDATE OF analysis_ciclo_id, analysis_error ON public.telemetria_lotes FOR EACH ROW`.
  - Quando `NEW.analysis_ciclo_id IS NOT NULL OR NEW.analysis_error IS NOT NULL`, faz `DELETE` do item.
- **`public.fn_telemetria_analise_reivindicar(p_limite integer, p_trava_seg integer) RETURNS SETOF uuid`:** `SECURITY DEFINER`, `search_path = ''`, EXECUTE só para `service_role`.
  - Primeiro apaga os itens cujo lote já tem análise ou erro.
  - Depois trava até `p_limite` itens com `proxima_tentativa_em <= now()` e (`travado_em IS NULL` ou `travado_em < now() - make_interval(secs => p_trava_seg)`), com `ORDER BY proxima_tentativa_em` e `FOR UPDATE SKIP LOCKED`.
  - Marca `travado_em = now()` e `tentativas = tentativas + 1`, e devolve os `lote_id`.
- **`public.fn_telemetria_analise_falhou(p_lote uuid, p_erro text) RETURNS void`:** `SECURITY DEFINER`, `search_path = ''`, EXECUTE só para `service_role`.
  - Com `tentativas >= 5`: `UPDATE telemetria_lotes SET analysis_error = left('fila: ' || p_erro, 500)`. O gatilho tira o item da fila.
  - Senão: `proxima_tentativa_em = now() + make_interval(mins => power(2, tentativas)::int)`, `travado_em = NULL` e `ultimo_erro = left(p_erro, 500)`.
- **Retroativo no `upgrade()`** (decisão P3):
  - enfileira com `proxima_tentativa_em = now()` os lotes pendentes com `created_at >= now() - interval '7 days'`;
  - marca `analysis_error = 'expirado_sem_analise'` nos pendentes mais antigos.
- **`downgrade()`:** derruba os gatilhos, as funções e a tabela. **Não desfaz** o rótulo `expirado_sem_analise`; a docstring diz isso.

- [ ] **Step 1: Testes e2e.** A fixture tem `telemetria_sessoes` e `telemetria_lotes` do esqueleto de produção, com os gatilhos de lote da F0, da F2 e do #709 cortados dos módulos. Testes:
  - `test_lote_novo_entra_na_fila_com_espera`: depois do insert, existe o item, com `proxima_tentativa_em` entre `now() + 4 min` e `now() + 6 min`.
  - `test_lote_ja_analisado_no_insert_nao_entra`.
  - `test_analise_do_pedido_tira_da_fila`: `UPDATE ... SET analysis_ciclo_id = 'c1'` faz o item sumir. O mesmo vale para `analysis_error`.
  - `test_reivindicar_respeita_vencimento_e_limite`: são 3 itens vencidos e 1 futuro. Com `p_limite = 2`, volta 2 vencidos, em ordem. A segunda chamada devolve o terceiro.
  - `test_reivindicacoes_concorrentes_sao_disjuntas`: duas conexões em transações abertas chamam `fn_telemetria_analise_reivindicar(10, 600)`, e os conjuntos não se cruzam.
  - `test_trava_vencida_volta_a_ser_reivindicavel`: um item com `travado_em = now() - 20 min` e `p_trava_seg = 600` é devolvido.
  - `test_falha_espaca_e_na_quinta_vira_erro`: quatro chamadas de `fn_telemetria_analise_falhou` deixam `proxima_tentativa_em` crescente (2, 4, 8, 16 min); a quinta grava `analysis_error` começando com `'fila: '` e o item some.
  - `test_lote_apagado_leva_o_item`: `DELETE` do lote apaga o item.
  - `test_cliente_nao_le_nem_executa_a_fila`: como `authenticated` com claims, `SELECT` na tabela dá 0 linhas ou `42501`, e chamar as duas funções dá `42501`.
  - `test_retroativo_enfileira_7_dias_e_expira_o_resto`: antes do `upgrade()`, semeia um pendente de 2 dias, um pendente de 10 dias e um já analisado. Depois, o de 2 dias está na fila e vence agora, o de 10 dias tem `analysis_error = 'expirado_sem_analise'` e o analisado não muda.
  - `test_i15_so_acusa_o_que_a_fila_ainda_vai_analisar`: a I15, cortada de `20261029_03` (`INVARIANTES["15"]`), não olha a fila. Depois do `upgrade()`, ela devolve **exatamente** o lote de 2 dias; o de 10 dias já tem erro e não aparece. Depois de uma análise simulada (`UPDATE ... SET analysis_ciclo_id = 'c1'`), ela devolve 0 e a fila fica vazia.
  - `test_downgrade_tira_tudo_e_mantem_o_rotulo`.

  Offline: o SQL gerado tem `SECURITY DEFINER`, `search_path = ''`, `FOR UPDATE SKIP LOCKED`, os REVOKE e nenhum `%`, e há uma cabeça só no Alembic.
- [ ] **Step 2:** rodar e ver falhar: o módulo ainda não existe.
- [ ] **Step 3:** implementar a migration. A docstring traz a medição acima, as decisões P2, P3 e P4 e por que a tabela não tem policy.
- [ ] **Step 4:** rodar os dois arquivos e a suíte inteira da API, com e sem o DSN do e2e.
- [ ] **Step 5: Commit** `feat(telemetria): o banco enfileira a análise de todo lote novo`

### Task 2: a API consome a fila

**Files:**
- Create: `api/app/services/analise_fila.py`
- Create: `api/app/services/telemetria_eventos_legados.py`. Mova para cá, **sem mudar o comportamento**, `_normalize_eventos_legados` e os helpers que só ele usa, hoje em `api/app/api/v1/telemetria.py:65-158`. O nome público passa a ser `normalizar_eventos_legados(payload: TelemetriaLotePayload) -> list[Evento]`. O endpoint importa daqui.
- Modify: `api/app/core/settings.py`. Ao lado de `retencao_externa_*`:
  - `telemetria_analise_fila_enabled: bool = True`
  - `telemetria_analise_fila_interval_seconds: int = 30`
  - `telemetria_analise_fila_lote: int = 5`
  - `telemetria_analise_fila_trava_seconds: int = 600`
- Modify: `api/app/main.py`. No `lifespan`, crie a task `analise_fila_loop(app)` quando `telemetria_analise_fila_enabled` e o banco for Postgres, guarde em `app.state.analise_fila_task` e cancele no `finally`, como `retencao_task`.
- Test: `api/tests/test_analise_fila.py` (unidade, com `run_analysis` substituído) e `api/tests/test_e2e_analise_fila.py` (laço contra o Postgres local).

**Interfaces:**
- Consumes: as funções da Task 1; `run_analysis(*, request, session, aluno_id, classe_id, topico_id, atividade_id, frame_b64, frames_b64, eventos_novos, modo, telemetry_payload, batch_id, sessao_id)` de `app/services/analysis_runner.py`; `modo_restrito.finalidades_permitidas(session, aluno_id) -> dict[str, bool]` e `modo_restrito.CODIGO`; `TelemetriaRepository.update_lote_analysis(*, batch_id, analysis_ciclo_id, analysis_error)`.
- Produces:
  - `@dataclass(frozen=True) class RequisicaoInterna: app: Any`. É o que o pipeline lê de `request` (`.app.state`). A docstring cita as três linhas medidas.
  - `async def analisar_lote_da_fila(app: Any, lote_id: str) -> str`. Devolve `'analisado'`, `'modo_restrito'`, `'payload_invalido'`, `'sumiu'` ou `'falhou'`. Comportamento:
    - lê o lote (`aluno_id`, `classe_id`, `topico_id`, `atividade_id`, `sessao_id`, `payload`);
    - se o lote não existe, devolve `'sumiu'`;
    - sem `telemetria` ou sem `emocional`, grava `analysis_error = modo_restrito.CODIGO` e devolve `'modo_restrito'`, sem chamar `run_analysis`;
    - `TelemetriaLotePayload.model_validate(payload)` que falha grava `analysis_error = 'payload_invalido'`, sem tentar de novo;
    - senão chama `run_analysis(request=RequisicaoInterna(app), ..., frame_b64=None, frames_b64=[], eventos_novos=normalizar_eventos_legados(modelo), modo="telemetria", telemetry_payload=payload, batch_id=lote_id, sessao_id=...)` e grava `analysis_ciclo_id` e o primeiro erro, como o endpoint;
    - exceção vira `rollback` + `fn_telemetria_analise_falhou(lote_id, type(exc).__name__ + ': ' + str(exc))`, e devolve `'falhou'`.

    Cada lote usa a sua própria sessão de `app.state.session_factory`.
  - `async def processar_fila_analise_uma_vez(app: Any) -> dict[str, int]`: reivindica com `telemetria_analise_fila_lote` e `telemetria_analise_fila_trava_seconds`, analisa em série e devolve a contagem por resultado.
  - `async def analise_fila_loop(app: Any) -> None`: o laço. Loga só quando a contagem não é zero e nunca morre.

- [ ] **Step 1: Testes de unidade** (`test_analise_fila.py`, `run_analysis` substituído por monkeypatch):
  - `test_lote_analisado_grava_ciclo`: o falso devolve um ciclo `'c-1'`, `update_lote_analysis` recebe `analysis_ciclo_id='c-1'` e o retorno é `'analisado'`.
  - `test_modo_restrito_nao_chama_o_pipeline`: parametrizado em `telemetria=False` e `emocional=False`; o falso de `run_analysis` levanta exceção se for chamado.
  - `test_payload_invalido_nao_volta_para_a_fila`.
  - `test_excecao_chama_falhou_com_o_tipo_do_erro`.
  - `test_requisicao_interna_expoe_app_state`: `RequisicaoInterna(app).app.state.settings is app.state.settings`.
  - `test_eventos_legados_movidos_sem_mudar`: o teste de `_normalize_eventos_legados` que já existe passa importando de `telemetria_eventos_legados`. Rode `grep -rn _normalize_eventos_legados api/tests` para achá-lo; se não houver teste, escreva um com um `timer_timeout` de atividade sem conclusão e outro com conclusão depois, comparando a saída do endpoint antes e depois da mudança.
- [ ] **Step 2: Teste e2e** (`test_e2e_analise_fila.py`): o banco tem a migration da Task 1; um app falso tem `state.settings` e `state.session_factory` (async engine no DSN local); `run_analysis` é substituído; `modo_restrito.finalidades_permitidas` é substituído para devolver tudo permitido.
  - `test_processar_uma_vez_esvazia_a_fila_e_a_i15_zera`: dois lotes vencidos viram analisados, a fila fica vazia e a I15 (cortada) devolve 0.
  - `test_lote_envenenado_sai_da_fila_na_quinta`: com o falso sempre levantando exceção e cinco ciclos, forçando `proxima_tentativa_em = now()` entre eles, o lote termina com `analysis_error` começando com `'fila: '`.
- [ ] **Step 3:** FAIL.
- [ ] **Step 4:** implementar. Mova `normalizar_eventos_legados` primeiro e rode os testes do endpoint antes de seguir.
- [ ] **Step 5:** suíte inteira da API, com e sem o DSN; `ruff check` nos arquivos tocados.
- [ ] **Step 6: Commit** `feat(api): laço da API analisa os lotes que ficaram na fila`

### Task 3: verificação e PR

- [ ] **API:** `cd api && pytest -q` (com e sem o DSN), `ruff check` nos arquivos novos, e `alembic heads` com uma cabeça só (`20261029_09`).
- [ ] **Medir em produção, só leitura:** quantos lotes o retroativo enfileiraria (pendentes de 7 dias) e quantos marcaria como `expirado_sem_analise`. Esperado hoje: 15 e 141.
- [ ] **PR contra a `main` depois do #709**, ou sobre a branch do #709 se ele ainda não tiver entrado. O texto diz:
  - **dependência:** depende do #709, pela cadeia do Alembic (F0, F1 e F2 já estão na `main`);
  - **decisões P1 a P5,** com o custo de cada uma;
  - **o que só o time faz:** gerar o build EAS com o #689; ver em produção, por duas semanas, a I15 e a I20 passando (é o critério de pronto da spec); conferir no Dokploy que o laço está ligado (`TELEMETRIA_ANALISE_FILA_ENABLED`);
  - **efeito:** a partir do deploy, os lotes do caminho direto também são analisados, sem frames (D-4);
  - **sem merge pela sessão.**

# CLAUDE.md — TrailUp

Guia de base para o monorepo TrailUp. Foca no **não óbvio** e nas **decisões de
arquitetura** do sistema de personalização. Não repete o que o `README.md` /
`docs/MANUAL.md` já cobrem.

## Monorepo (4 serviços)

| Pasta           | Stack                      | Porta dev | Papel                                            |
| --------------- | -------------------------- | --------- | ------------------------------------------------ |
| `api/`          | Python · FastAPI · LangGraph | 8000    | Backend principal e **orquestrador** da IA        |
| `microservice/` | Node · TS (`api-brainhex`) | 3000      | **Gerador de mídia** (texto/áudio/slides) por perfil |
| `frontend/`     | Vite · React · TS          | 8080      | Web (landing + **console do professor**)          |
| `mobile/`       | Expo · React Native        | 8081      | App do aluno (consome personalização)             |

Rodar tudo: `npm run dev` (Windows, abre uma janela por serviço via
`scripts/dev.ps1`). A API é iniciada por `python -m uvicorn` (não pelo
`uvicorn.exe` da venv — a venv foi movida e os `.exe` apontam para caminho
antigo). Banco: **Supabase** (externo, via `.env`).

> Existe um app **BrainHex** separado (`../BrainHex`, Google AI Studio) e um
> `../ApiBrainHex` (origem do `microservice/`). São repositórios externos ao
> monorepo; o `microservice/` é a versão integrada e é a fonte da verdade aqui.

## Regra de fronteira (a mais importante do repo)

> **A API é para IA: LangGraph, RAG, geração e decisão adaptativa. Nada além
> disso. Todo o resto é via banco.**

Encanamento — CRUD, fila, agendamento, sessão, contador, entrega — **não entra
na API**. Vai para o Postgres (funções/RPC, trigger, RLS) e o mobile fala direto
com o Supabase, como `notificacoes` e `topico_aluno` já fazem.

Dois motivos concretos, não estilo:

1. **A API dorme.** Ela roda no free tier do Render e hiberna. Qualquer coisa
   com relógio (rotina diária, fila, expiração) simplesmente **para** enquanto
   ela está fria. O banco não hiberna.
2. **Um salto a menos.** `mobile → Supabase` já é o caminho autenticado e com
   Realtime. Passar por `mobile → API → Supabase` adiciona latência, um ponto de
   falha e uma segunda cópia das regras de acesso.

Ao estender: se a pergunta for "onde ponho isso?", e a resposta não envolver um
modelo de linguagem, **não é na API**.

> Dívida conhecida: `POST /api/v1/telemetria/lote` recebe lotes do mobile e
> grava — é encanamento vivendo na API, anterior a esta regra. Ele fica porque o
> mesmo endpoint dispara o pipeline de análise (que é IA), mas a **persistência**
> deveria descer para o banco. Não use como precedente.

## Sistema de personalização — decisões de arquitetura

Estas decisões são **fixas**; sigam-nas ao corrigir/estender.

1. **API orquestra, microservice gera mídia.** A API (`api/app/agent/graph/`,
   LangGraph) é o cérebro: lê contexto do aluno (perfil, emoção, telemetria),
   decide formatos, adequa e **dispara**. O `microservice` (`api-brainhex`)
   **gera a mídia base por perfil** (texto/áudio TTS/slides). Não duplicar
   geração pesada no Python — o caminho Python `MultiOutputPipeline` é fallback.

   O `microservice` delega a etapa de **apresentação** (deck + HTML) a um
   serviço externo, `../BrainHexPDF` (fora do monorepo, repo irmão — não
   confundir com o app BrainHex/Google AI Studio mencionado acima), via
   `BRAINHEXPDF_API_URL`/`POST /api/v1/render-and-store`. O BrainHexPDF gera
   o deck (Gemini) e o HTML completo e sobe o arquivo no Supabase Storage;
   o microservice continua dono do merge em `conteudo_personalizado.materiais`
   (`mergePersonalizacaoMateriais`). Ver
   `docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`.

2. **Duas camadas de personalização:**
   - **Base por perfil** — material compartilhável por `(classe × tópico × perfil BrainHex)`. Reusado entre alunos do mesmo perfil. É o que o microservice gera.
   - **Adequação por aluno** — camada leve sobre a base, usando preferências,
     emoção (`agente_emocao`), estado mental (`ai_patch`) e **necessidades do
     grupo e do indivíduo**. Não regerar mídia pesada por aluno.

3. **Geração por `tópico × perfil`.** O conteúdo cadastrado pelo professor é
   dividido por **tópico**; para **cada tópico** geram-se **texto e áudio** para
   **cada um dos 7 perfis** e persiste-se no Supabase. O `source_hash` inclui
   `_PERSONALIZACAO_PIPELINE_VERSION`; incremente essa versão quando prompts,
   enriquecimento, áudio ou apresentações precisarem ser regenerados.

4. **Contraste WCAG AAA por ajuste cirúrgico.** Mantém a cor-assinatura de cada
   perfil, mas garante AAA: eleva o accent quando muito escuro, alpha mínimo em
   bordas/glow, e `success`/`warning`/`info` **fixos** (não derivados do accent).

5. **Progresso: o percurso é o material personalizado; o do professor é
   opcional e vale bônus.** O percentual do tópico sai de
   `trailup_recalcular_topico_aluno` (trigger sobre `conteudo_aluno`,
   `atividade_aluno` e `personalizacao_item_progresso`), e o denominador é só o
   material personalizado. Quando ele ainda não foi gerado, o conteúdo do
   professor volta a ser o percurso — senão o aluno que concluiu tudo o que
   existe veria 0%.

   **Nenhum cliente escreve `percentual_concluido` nem `status` em
   `topico_aluno`.** Havia quatro gravadores fazendo isso, todos com a conta
   sobre o material do professor apenas, e todos rodando DEPOIS do trigger — a
   conta certa nunca sobrevivia. `Topico.calcularPercentual()` continua
   existindo, mas serve só a leituras locais: não use o valor dele para gravar
   nem para "puxar para cima" o que veio do banco. Ver
   `20260826_18_progresso_professor_opcional.py`.

## Perfis BrainHex (7)

`Seeker`, `Survivor`, `Daredevil`, `Mastermind`, `Conqueror`, `Socializer`,
`Achiever`. Determinados no quiz de signup (`frontend/src/features/signup/brainhex.ts`),
guardados em `aluno_perfil` (com `afinidade` 0–100). O **perfil dominante** é o de
maior afinidade; o vetor completo de afinidades também é usado.

Cada perfil carrega:
- **Cor-assinatura, ícone, guia/mentor, gradiente** — `microservice/src/constants/brainHex.ts` (fonte oficial); espelhos em mobile/frontend.
- **Assinatura editorial** (tom de voz, ritmo, abertura, progressão narrativa,
  marcadores linguísticos, proibições) — `api/app/services/personalizacao.py`
  (`_BRAINHEX_EDITORIAL_SIGNATURES`). Injetada via `perfil_editorial` nos prompts
  Python (`gerador_conteudo.txt`, `pipeline_midia_etapas.txt`) e replicada no
  prompt do microservice (`geminiService.ts`) — ambos os caminhos aplicam a
  assinatura do perfil, não só o microservice (Fase 1 concluída).
- **Voz TTS** — `GUARDIAN_VOICE_PROFILES` em
  `microservice/src/constants/guardianVoices.ts` (Gemini TTS ativo). Além do
  preset, cada Guardião possui direção de idade, sexo, origem cultural e
  interpretação; o fallback Python espelha esses campos em
  `_BRAINHEX_GUIDE_PERSONAS`.

> Backend (`_build_design_tokens` em `api/app/api/v1/personalizacao.py`) e
> frontend (`frontend/src/lib/personalizacao-theme-guide.ts`,
> `frontend/src/features/signup/brainhex.ts`) partem todos da mesma
> cor-assinatura oficial por perfil em `microservice/src/constants/brainHex.ts`
> (Fase 3 concluída) — mas **não são a mesma variante calculada**: o backend
> deriva o accent dinamicamente contra `surface_elevated` via
> `_ensure_min_contrast`, enquanto os dois arquivos do frontend usam tons
> clareados fixos, calculados à mão para cada superfície. Não assumir que
> mudar um dos três atualiza os outros. Correções de contraste AAA devem
> sempre elevar a luminosidade HSL/HLS da cor-assinatura (nunca misturar com
> branco), para não desaturar o accent do perfil — misturar com branco "apaga"
> a cor mesmo passando no contraste.

## Tabelas Supabase (personalização)

- `conteudo_personalizado` — registro por aluno: `plano` (JSONB), `materiais`
  (JSONB: `audio`/`apresentacao`/`markdown`/`cards`), `ai_patch` (JSONB),
  `formato_prioritario`, `formatos_gerados`, `ciclo_id`. Unique por
  `(aluno, tópico, perfil BrainHex)`.
  > **`materiais.<tipo>.revisao`** é o sinal de "este material mudou" para o
  > cliente. A regeração faz `UPDATE` in place sem trocar `source_hash` — e não
  > pode trocar, porque `source_hash` governa a dedup de geração —, então a URL
  > no Storage (que embute `generation-<source_hash>`) continua a mesma. Sem
  > `revisao`, o cache do mobile nunca rebaixa o arquivo: ele é chaveado pela
  > URL, **não revalida**, e a expiração de 3 dias é renovada a cada acesso.
  >
  > É por MATERIAL, não por personalização: regerar o texto não pode invalidar
  > áudio e apresentação. No mobile ela é carimbada **no payload do bloco**
  > (`normalizeMediaBlocks`), nunca na URL — `resumeIdentity` deriva a posição
  > de retomada da URL, e versioná-la faria o aluno perder o progresso a cada
  > regeração.

- `cards_personalizados`, `atividades_personalizadas`, `questoes_personalizadas` — artefatos desnormalizados (com `ativo`/`obsoleto_em`).
- `fontes_personalizacao` — fontes do professor (upload/link), `visibilidade` `classe|aluno`.
- `personalizacao_jobs` + `personalizacao_job_targets` — fila assíncrona
  (`enrollment`, `class-delta`, `class-theme`, `student-cleanup`, `full-sync`).
  **`class_delta_sync` é enfileirado pelo BANCO**, não pela API
  (`20260827_03`): `fn_enqueue_class_delta_job` dispara em `topicos`,
  `conteudos`, `atividades`, `questoes` e `cards` — as cinco tabelas que o
  editor de trilha escreve. Salvar **é** o disparo; o console não chama nada
  depois. Isso e o `class_theme_sync` (`fn_enqueue_classe_mapa_tema_job`) são
  a aplicação direta da regra de fronteira: enfileirar não tem modelo de
  linguagem no meio, e a API hibernando fazia todo save do professor falhar
  com 502. Quem **processa** a fila continua na API — isso é geração, é IA.

  Dois detalhes que não são acidentais. **Coalescência:** o trigger funde o
  evento no job `pending` da classe (travando a linha com `FOR UPDATE`) em vez
  de criar um por linha — sem isso, a reordenação de tópicos (um `UPDATE` por
  linha) viraria N jobs. Job já em `processing` nunca é reaproveitado: o
  worker já leu o `total_targets` dele. **Escopo na fusão:** se qualquer um
  dos lados pediu o tópico inteiro, a fusão é o tópico inteiro — a união crua
  de `conteudo_ids` encolheria o escopo e deixaria conteúdo sem regerar.

  A listagem no console também não passa mais pela API: o professor lê
  `personalizacao_jobs` direto, autorizado por
  `personalizacao_jobs_professor_sel` (via `app_classes_do_professor()`).
- `personalizacao_sugestao` + `personalizacao_sugestao_log` — ordem **aconselhada**
  de consumo do material por `(aluno × tópico × conteúdo)` e o histórico
  append-only de cada decisão (`criada`/`revisada`/`mantida`). Motor
  determinístico em `api/app/services/sugestao_material.py`; o repositório só
  opera se **as duas** tabelas existirem (sem log, a métrica de efetividade
  ficaria furada justamente onde vai olhar). Ver
  `docs/superpowers/specs/2026-08-25-sugestao-de-material-por-aluno-design.md`.
- `telemetria_sessoes`, `telemetria_lotes` — telemetria bruta + payload JSONB.
- **Notificações — motor inteiro no banco.** Quatro tabelas com papéis **não
  intercambiáveis**: `notificacoes_ia` (o que a IA *sugeriu*; a API só insere
  aqui), `notificacoes_pendentes` (a *fila*, com `gatilho`
  `horario|login|tempo_uso` e `expira_em`), `notificacoes_agendamentos` (a
  *rotina* recorrente) e `notificacoes` (a *caixa de entrada*, só o entregue).
  O trigger `trg_notificacoes_ia_promover` liga sugestão → fila; as RPCs
  `notificacoes_registrar_login` / `_heartbeat` / `_minhas_rotinas` /
  `_salvar_rotina` são o que o mobile chama. Push sai do próprio Postgres por
  `pg_net` → Expo, e `pg_cron` varre a cada 5min. A **rotina diária é
  notificação local** agendada no aparelho: dispara com o app fechado sem
  servidor. Ver `docs/superpowers/specs/2026-08-26-notificacoes-via-banco-design.md`.
- `notificacoes_config` (parâmetros do motor, uma linha por chave),
  `expo_tokens` (push token por aparelho — tabela que **já existia**; a
  `notificacoes_dispositivos` que eu havia criado foi descartada em
  `20260826_07` por duplicá-la), `aluno_sessoes_app` (histórico de login) e
  `aluno_atividade_diaria` (tempo de uso por dia).
- `personalizacao_item_progresso` — progresso por item (merge: percentual/acertos = máx, tempo = soma).
- `aluno_perfil`, `perfil` — perfis BrainHex e afinidades.

## Telemetria → análise → realimentação

Mobile coleta lotes (`mobile/src/services/telemetriaApi.ts`: dwell/active/idle,
toque, scroll, sinais, câmera opcional) → `POST /api/v1/telemetria/lote` →
persiste em `telemetria_lotes` + `personalizacao_item_progresso` → pipeline de
análise (`api/app/services/linear_analysis_pipeline.py`: emoção → leitura →
interação → desempenho → atenção → decisão) → `usePersonalizationRefresh` no
mobile dispara novo ciclo quando uma ação casa com `refresh_policy.trigger_actions`.

Fase 4 (`23b38ef`): endpoint `GET /personalizar/grupo/{classe_id}`
(`app/services/group_analysis.py`) computa e persiste a distribuição de perfis
BrainHex + desempenho médio da turma em `classe_perfil_summary`, consumido pelo
console do professor na aba "Turma" de `PersonalizacoesSection.tsx`. Detecção
de ritmo de leitura (WPM) roda no `linear_analysis_pipeline.py`
(`_summarize_reading_pace`) usando `active_sec` por material como denominador
— **não** `dwell_sec`, que inclui tempo parado com o material aberto e sub-
estimaria o WPM de quem só fez uma pausa no meio da leitura.

> **`dwell_sec`, `active_sec` e `idle_sec` são contadores CUMULATIVOS** por
> `(sessão × item)`, reenviados inteiros a cada lote — não são o tempo daquele
> lote. Somar as linhas multiplica o tempo pelo número de lotes: em 15 das 34
> sessões medidas a soma dava mais que o relógio da própria sessão. Para totalizar,
> some os **incrementos** entre leituras consecutivas, tratando queda como reset
> do contador (a leitura inteira vale) e leitura repetida como zero — é o que
> `trailup_tempo_telemetria_min` faz (`20260827_02`). É também por isso que
> `topic`, `content` e `material` aparecem com o mesmo valor dentro de um lote:
> cada escopo tem o próprio acumulado, e o aninhamento é inclusivo.
>
> Corolário: `tempo_gasto_min` em `topico_aluno`, `conteudo_aluno` e
> `atividade_aluno` é **derivado por trigger** a partir da telemetria. Nenhum
> cliente escreve essa coluna.

> Lacuna real ainda aberta: `MentalStateHistoryRepository.listar_por_aluno`
> (`api/app/repositories/mental_state.py`) só é exercitado em teste — o
> histórico em `aluno_mental_state_history` é **gravado** a cada ciclo
> (`analysis_runner.py`) mas **nunca lido de volta** por nenhum nó do grafo ou
> serviço para influenciar decisões (ex.: detectar frustração recorrente ao
> longo de vários ciclos). É plumbing write-only até alguém decidir o que fazer
> com a leitura.

## Convenções

- **Encoding: UTF-8 sem BOM, sempre.** Já houve mojibake (UTF-8 salvo como
  Windows-1252) commitado em `frontend`/`brainhex-navigator`. Nunca gravar texto
  PT-BR em outra codificação. `index.html` deve ter `lang="pt-BR"` + `notranslate`
  (tradução automática do navegador quebra o React — `removeChild`).
- **Telemetria é transversal:** qualquer correção em personalização deve manter o
  fluxo de coleta e a realimentação por ciclo intactos.
- **Não quebrar o existente:** os 7 perfis, o grafo LangGraph, os endpoints e os
  schemas JSONB são pontos de extensão — corrigir/estender, não reescrever.
- **RLS é a autorização, não defesa extra.** `anon` e `authenticated` têm GRANT
  de SELECT/INSERT/UPDATE/DELETE nas 84 tabelas — RLS é a única barreira. A
  posse está implementada (`20260826_08` a `20260826_10`):
  - **anônimo não lê nada** — nem tabela nem view;
  - **aluno** vê o próprio dado, os colegas da sua turma (o ranking depende
    disso) e o conteúdo das classes em que está matriculado; escreve só o que é
    dele;
  - **professor** vê e escreve o conteúdo das classes que ele criou
    (`classe.professor_id = auth.uid()`), e lê o dado e a telemetria dos alunos
    dessas classes.

  Os predicados usam helpers `SECURITY DEFINER` (`app_classes_do_professor()`,
  `app_alunos_do_professor()`, `app_colegas_de_turma()`…) **de propósito**: uma
  policy em `classe_aluno` que consultasse `classe_aluno` entraria em recursão
  de RLS. Ao criar policy nova, use os helpers em vez de repetir o `EXISTS`.
- **View sem `security_invoker` ignora RLS.** Ela roda com os privilégios do
  dono (`postgres`), então as policies das tabelas base **não se aplicam** —
  era um segundo bypass, paralelo ao das policies, e por ele dava para ler
  ranking, métricas e telemetria sem login. Todas foram para
  `security_invoker = on` em `20260826_10`. A única exceção deliberada é
  `vw_rank_posicoes_por_classe`: ela soma eventos de vários alunos, o que um
  aluno não pode fazer lendo `eventos_aluno` linha a linha, então mantém o
  bypass e é filtrada na saída pelas classes do chamador. **Toda view nova
  nasce com `security_invoker = on`.**
- **`text()` do SQLAlchemy não aceita `:param::tipo`** — o `::` do Postgres
  colide com a sintaxe de bind e o parâmetro deixa de ser reconhecido (erro em
  tempo de execução, não de import). Use `CAST(:param AS TIPO)`. E parâmetro
  usado só em `IS NOT NULL`/`CASE WHEN` **precisa** de cast explícito, senão o
  asyncpg falha com `AmbiguousParameterError`.
- **`COALESCE(coluna_enum, '')` estoura em tempo de execução.** O Postgres
  resolve o COALESCE para o tipo da primeira expressão e tenta coagir `''` ao
  enum. Enquanto nenhuma linha vier NULL o segundo argumento não é avaliado e o
  bug fica dormindo — depois aborta a transação inteira, longe de onde foi
  escrito. Use `coluna::text` antes do COALESCE. `status` em `conteudo_aluno`,
  `atividade_aluno` e `topico_aluno` é o enum `status_atividade`; em
  `personalizacao_item_progresso` é `text` de verdade.
- **Os rótulos de `status_atividade` têm acento:** `não iniciado`,
  `em andamento`, `concluido`. Escrever `'nao iniciado'` compila e só falha em
  produção. Ao gerar SQL com esses rótulos, declare a variável com o tipo do
  enum (o erro aparece na atribuição, não dentro do INSERT) e valide o rótulo na
  própria migração — ver `20260826_11`.
- **`ON CONFLICT` sobre índice PARCIAL exige repetir o predicado**
  (`ON CONFLICT (col) WHERE col IS NOT NULL`). Sem ele o Postgres não casa o
  índice e levanta "no unique or exclusion constraint matching".

## Pontos de entrada (código)

- Grafo IA: `api/app/agent/graph/builder.py`, `routing.py`, `nodes/`.
- Geração: `api/app/services/personalizacao.py`, `media_pipeline.py`, `media_agents.py` (TTS Python).
- Rotas: `api/app/api/v1/personalizacao.py`, `telemetria.py`.
- Microservice: `microservice/server.ts` (`/api/personalizar`, `/api/v1/archive`), `src/services/geminiService.ts`.
- Professor (web): `frontend/src/components/console/` (`trilha/`, `DashboardSection`).
- Aluno (mobile): `mobile/src/services/personalizacao/`, `hooks/trilha/`, `components/PersonalizedTopicView.tsx`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

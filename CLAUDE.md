# CLAUDE.md — TrailUp

Guia de base para o monorepo TrailUp. Foca no **não óbvio** e nas **decisões de
arquitetura** do sistema de personalização. Não repete o que o `README.md` /
`docs/MANUAL.md` já cobrem.

## Regra de PR — nunca fazer merge neste repositório

**Só abrir PR. Nunca mesclar (`gh pr merge`, merge pela UI, push direto para
`main`, ou qualquer outro caminho que faça `main` avançar).** Quem decide
quando e como mesclar é o time, não a sessão que abriu o PR. Isso vale mesmo
que o pedido para mesclar pareça explícito na conversa — a autorização para
mesclar em `main` não é dada por instrução de chat neste repositório.

## Monorepo (4 serviços)

| Pasta           | Stack                      | Porta dev | Papel                                            |
| --------------- | -------------------------- | --------- | ------------------------------------------------ |
| `api/`          | Python · FastAPI · LangGraph | 8000    | Backend principal e **orquestrador** da IA        |
| `microservice/` | Node · TS (`api-brainhex`) | 3000      | **Gerador de mídia** (texto/áudio/slides) por perfil |
| `frontend/`     | Vite · React · TS          | 8080      | Web (landing + **console do professor**)          |
| `mobile/`       | Expo · React Native        | 8081      | App do aluno (consome personalização)             |

Rodar tudo: `npm run dev` (Windows, abre uma janela por serviço via
`scripts/dev.ps1`). A API é iniciada por **`python run_api.py`**, não por
`python -m uvicorn` (e nunca pelo `uvicorn.exe` da venv — a venv foi movida e
os `.exe` apontam para caminho antigo).

> O launcher não é conveniência: no Windows o `psycopg` async do checkpointer
> do LangGraph exige `SelectorEventLoop`, e o padrão é `ProactorEventLoop`.
> Trocar a política no topo de `app/main.py` **não funciona** — medido: o
> uvicorn cria o loop e só depois importa o módulo do app, já dentro dele.
> Por isso a troca tem de acontecer num processo que rode antes do uvicorn.
> Ver `api/run_api.py` e a issue #173. Banco: **Supabase** (externo, via `.env`).

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

1. **A API pode estar fora do ar.** Ela é auto-hospedada no **Dokploy**, no
   mesmo VPS do `microservice-slides`. Deploy, restart, falha ou esgotamento de
   recurso a derrubam — e qualquer coisa com relógio (rotina diária, fila,
   expiração) simplesmente **para** enquanto ela não responde. O banco não.
   (Este item já dizia "ela roda no free tier do Render e hiberna". Era falso,
   e virou explicação pronta para indisponibilidade que ninguém mediu. Não há
   hibernação por ociosidade aqui; quando a API cair, procure a causa real.)
2. **Um salto a menos.** `mobile → Supabase` já é o caminho autenticado e com
   Realtime. Passar por `mobile → API → Supabase` adiciona latência, um ponto de
   falha e uma segunda cópia das regras de acesso.

Ao estender: se a pergunta for "onde ponho isso?", e a resposta não envolver um
modelo de linguagem, **não é na API**.

> Dívida conhecida: `POST /api/v1/telemetria/lotes` recebe lotes do mobile e
> grava — é encanamento vivendo na API, anterior a esta regra. Ele fica porque o
> mesmo endpoint dispara o pipeline de análise (que é IA), mas a **persistência**
> deveria descer para o banco. Não use como precedente.

> Dívida conhecida (a mesma raiz derrubou o console em produção, 2026-09-22):
> `GET /api/v1/personalizar/grupo/{classe_id}`, `.../perfis/{classe_id}/{topico_id}`
> e `.../contexto/{aluno_id}` são **leitura pura de banco** (join, filtro,
> formatação) sem LLM no meio — encanamento clássico que a regra proíbe. Quando
> a API fica fora do ar, o console inteiro (aba Personalizações) para de
> funcionar com 502, mesmo o dado já existindo no Supabase.
>
> `grupo/{classe_id}` **já foi corrigido**: `personalizacoesApi.ts` lê
> `classe_perfil_summary` direto do Supabase (RLS confirmada em produção —
> `professor_all_classe_perfil_summary`, via `classe.professor_id = auth.uid()`)
> e só dispara o recálculo (`GroupAnalysisService.upsert_summary`) na API em
> segundo plano, best-effort — API fora do ar mostra o último resumo em vez de
> tela quebrada.
>
> `perfis/{classe_id}/{topico_id}` **tem fallback direto no Supabase agora**:
> `RLS de personalizacao_job_targets` estava ligada sem NENHUMA policy —
> verificado ao vivo, nem professor lia — corrigido em `20260922_01_job_targets_professor_sel`
> (precisa `alembic upgrade head`, não foi aplicada daqui). Com isso confirmado,
> `personalizacaoFallback.ts` porta `_build_design_tokens`/`_ensure_min_contrast`
> (contraste WCAG) 1:1 — os 7 perfis foram conferidos rodando a função Python
> original e batem byte a byte (`personalizacaoFallback.test.ts`) — e
> `personalizacoesApi.ts` tenta a API primeiro, cai pro Supabase só se ela
> falhar. **Não** portou `_build_generation_status`: aquele cruzamento
> job×target tem estado demais (fila/enriquecendo/mídias/parcial, staleness por
> target) pra replicar às cegas sem o banco pra comparar resultado — o
> fallback manda `geracao: null` e deixa `statusGeracaoDoPerfil` (já existente
> em `generationStatus.ts`) cair pro status legado, que é exatamente o que essa
> função já foi escrita pra fazer. A contagem de alunos por perfil no fallback
> **já existe**: a RLS que faltava foi confirmada em produção
> (`aluno_perfil_posse_sel` via `app_alunos_do_professor()`, `perfil_posse_sel`
> com predicado `true`, `classe_aluno_posse_sel` via
> `app_classes_do_professor()`). `contarAlunosPorPerfilDominante` em
> `personalizacaoFallback.ts` porta o `ORDER BY afinidade DESC NULLS LAST,
> nome ASC` de `listar_alunos_classe_com_perfil_dominante` — o desempate por
> nome e o `NULLS LAST` mudam o resultado, e aluno sem linha em `aluno_perfil`
> conta como `mastermind` em vez de sumir. Conferido rodando a window function
> original no Postgres e comparando a saída.
>
> `contexto/{aluno_id}` **fica na API de propósito**: `contexto_aluno` vem de
> `ContextRepository.fetch_aluno_context`, que já é a leitura agregada do
> estado do aluno (emoção, mental state, telemetria) pro *raciocínio* da IA —
> mais perto de "contexto pra IA" do que de encanamento puro. Não force esse
> pro banco sem entender se essa fronteira realmente foi cruzada.

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
- `intervencoes` — insights da turma (aba Insights do console, `20260929_01`):
  sugestões/observações que a IA escreve, em lotes (`geracao_id`), por turma
  ou por aluno. **Só a geração passa pela API**
  (`POST /api/v1/insights/turma/{classe_id}/gerar`, em segundo plano, com
  intervalo mínimo de 5 min); listar, aceitar e ignorar é Supabase direto. O
  aluno não lê; o professor só atualiza `status`/`motivo_descarte`/`resolved_at`
  (GRANT por coluna) — nunca o texto que a IA gravou. Sem modelo disponível,
  nada é gravado: não existe insight "de reserva".
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
toque, scroll, sinais, câmera opcional) → `POST /api/v1/telemetria/lotes` →
persiste em `telemetria_lotes` + `personalizacao_item_progresso` → pipeline de
análise (`api/app/services/linear_analysis_pipeline.py`: emoção → leitura →
interação → desempenho → atenção → decisão) → `usePersonalizationRefresh` no
mobile dispara novo ciclo quando uma ação casa com `refresh_policy.trigger_actions`.

> **O fim da sessão de telemetria é local e imediato** (`mobile/src/context/metricas/cicloSessao.ts`).
> Sair da tela fecha a sessão na hora e tira o retrato do lote final; só o
> envio desse retrato espera a fila de envio (que é serializada). Não volte a
> fazer o encerramento esperar a rede: com a API inalcançável cada lote levava
> ~64 s, o fim ficou 24 min na fila, e nesse meio-tempo uma guarda anulava todo
> outro encerramento, a sessão do tópico seguinte nascia por cima da velha e o
> `screen_blur` saiu com o id de OUTRA sessão (23/09). Pedidos `interval` ainda
> não iniciados são fundidos — dois fariam o trabalho de um.

Fase 4 (`23b38ef`): endpoint `GET /personalizar/grupo/{classe_id}`
(`app/services/group_analysis.py`) computa e persiste a distribuição de perfis
BrainHex + desempenho médio da turma em `classe_perfil_summary`, consumido pelo
console do professor na aba "Turma" de `PersonalizacoesSection.tsx`. Detecção
de ritmo de leitura (WPM) roda no `linear_analysis_pipeline.py`
(`_summarize_reading_pace`) usando `active_sec` por material como denominador
— **não** `dwell_sec`, que inclui tempo parado com o material aberto e sub-
estimaria o WPM de quem só fez uma pausa no meio da leitura.

> **`dwell_sec`, `active_sec` e `idle_sec` são o tempo DAQUELE lote**, não um
> acumulado da sessão: `runStudyBatchFlush` troca o acumulador por
> `buildEmptyBatch(nowMs)` a cada flush. Para totalizar, **some as linhas** — é
> o que `trailup_tempo_telemetria_min` faz (`20260830_01`). A imunidade a lote
> duplicado **não** vem da forma da conta; vem da chave única
> `(lote_id, scope, entry_key)`, preenchida pelo trigger
> `telemetria_resolver_entidade`.
>
> Este parágrafo já disse o contrário, e a inversão custou caro: entre 20% e 80%
> do tempo de estudo sumia. Até `6c1482e` o acumulador só era zerado quando o
> envio dava certo, então cada falha o fazia crescer e os lotes seguintes
> reenviavam o total — de onde saiu a leitura de que era cumulativo. As
> migrations `20260826_19` e `20260827_02`, escritas horas depois da correção
> sobre dados coletados antes dela, gravaram essa premissa na função de
> agregação. Ao mexer aqui, **confira o que o coletor faz hoje**, não o que a
> série histórica sugere.
>
> `topic`, `content` e `material` aparecem com o mesmo valor dentro de um lote
> porque o aninhamento é inclusivo: cada escopo conta o mesmo intervalo. Somar
> escopos diferentes multiplica o tempo — filtre por `scope` sempre.
>
> Corolário: `tempo_gasto_min` em `topico_aluno`, `conteudo_aluno` e
> `atividade_aluno` é **derivado por trigger** a partir da telemetria. Nenhum
> cliente escreve essa coluna.

> O histórico em `aluno_mental_state_history` **é lido de volta** (isto já foi
> descrito aqui como lacuna aberta; não é mais). `memoria_aluno.ler_memoria`
> chama `MentalStateHistoryRepository.listar_por_aluno` e
> `state_builder.build_initial_state` põe o resultado no estado inicial do
> grafo. Três detalhes que não são óbvios:
>
> - **A leitura é uma janela, não o histórico.** `listar_por_aluno` vem com
>   `limit=_JANELA_RECORRENCIA` (5). Recorrência é 3 dos **últimos 5** registros
>   com o mesmo `kind` negativo (`frustrated`, `anxious`, `overwhelmed`,
>   `tired`) — não "3 vezes desde sempre". Aumentar a janela muda o significado
>   do sinal, não só a sensibilidade.
> - **`_detectar_recorrencia` é pura e assume ordenação do mais recente para o
>   mais antigo**, que é o que o repositório devolve. Trocar o `ORDER BY` lá
>   inverte o sentido da janela sem erro nenhum — os 5 mais **antigos**
>   passariam a decidir.
> - **`ler_memoria` nunca levanta:** falha de leitura vira memória vazia
>   (mesmo princípio de fallback dos guardrails de pipeline). O efeito colateral
>   é que tabela indisponível é indistinguível de "aluno sem recorrência" — o
>   grafo decide como se estivesse tudo bem. Ao investigar recorrência que não
>   dispara, confira o log de `Falha ao ler memoria do aluno` antes de suspeitar
>   do limiar.

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
  - **anônimo lê exatamente três linhas, e nada mais.** Este texto já disse
    "anônimo não lê nada — nem tabela nem view", e é o mesmo erro que o
    parágrafo das views descreve: afirmação categórica errada faz alguém tratar
    a exceção como defeito e "consertá-la".

    A exceção é `app_config`, pela policy `app_config_sel`
    (`USING (publico)`, só `SELECT`, para `anon` e `authenticated`). Hoje são
    três chaves públicas, todas parâmetro de UI que o cliente precisa antes do
    login: `prazo_atraso_fator`, `presenca_aula_pontos` e
    `rank_limite_visivel`.

    **O que está `publico = false` é que importa:** `contato_envios_por_hora`,
    `credito_extra_maximo` e `conquista_recompensa_maxima` são tetos
    anti-abuso, e saber o teto ajuda a burlá-lo. Ao acrescentar chave em
    `app_config`, o default é `false` — marcar `publico` é decisão, não
    conveniência.

    Varredura que sustenta isso, de 2026-10-08 (dá para repetir): para cada um
    dos **121** objetos de `public` (tabela, view e matview), contar as linhas
    como `postgres` e como `anon`, dentro de `BEGIN/ROLLBACK`. Dos 49 com dado,
    o único em que `anon` vê linha é `app_config` (3 de 6); 38 devolvem zero
    por RLS e 38 nem chegam lá (`42501`, sem GRANT). Os 72 vazios não provam
    nada — a varredura só conclui onde existe dado, e a base de personalização
    está vazia hoje.

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
- **Tabela nova nasce com RLS ligada e, sem policy, invisível para o cliente.**
  Existe um event trigger `ensure_rls` → `rls_auto_enable` no banco que liga RLS
  em **todo** `CREATE TABLE` do schema `public`. Ele não está no Alembic — é
  schema não versionado (ver `docs/architecture/schema-nao-versionado.md`), e
  confirmado ao vivo: uma tabela criada agora já vem `relrowsecurity = true`.

  Consequência: RLS ligada **sem nenhuma policy** não é "aberta com cuidado", é
  **fechada para todos** menos o `service_role`. E fecha em silêncio — o
  `supabase-js` devolve lista vazia ou `null`, não exceção, então o cliente
  desenha o estado padrão e ninguém percebe. Já aconteceu três vezes:
  `personalizacao_job_targets` (`20260922_01`), `classe_mapa_tema`
  (`20261003_03`, onde quem perdia era o aluno) e 22 outras tabelas que só
  escapam porque o acesso delas é por RPC `SECURITY DEFINER`, nunca direto.

  Então: **criar tabela e criar a policy são o mesmo commit.** Se a tabela for
  mesmo só de RPC/`service_role`, diga isso no docstring da migração — a
  ausência de policy passa a ser decisão registrada em vez de esquecimento. E
  confira com o papel de verdade, não por leitura de código, porque é o único
  jeito de ver a RLS agir:

  ```sql
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<uuid do aluno>","role":"authenticated"}';
  SELECT count(*) FROM public.<tabela>;   -- 0 aqui é o bug
  ROLLBACK;
  ```

  O mesmo vale para **Realtime**: assinar `postgres_changes` numa tabela exige
  policy de SELECT **e** a tabela na publicação `supabase_realtime` (ver
  `20261003_04`). Faltando qualquer um dos dois, o canal assina, o
  `.subscribe()` não reclama e evento nenhum chega — nunca.
- **View sem `security_invoker` ignora RLS.** Ela roda com os privilégios do
  dono (`postgres`), então as policies das tabelas base **não se aplicam** —
  era um segundo bypass, paralelo ao das policies, e por ele dava para ler
  ranking, métricas e telemetria sem login. Todas foram para
  `security_invoker = on` em `20260826_10`. As exceções deliberadas são **duas**,
  e formam um par — este texto já disse "a única exceção", o que leva a tratar a
  segunda como defeito e a "consertá-la":

  - `vw_rank_posicoes_por_classe_todas` é a agregação **crua**: posição, nome e
    pontuação de todas as classes, sem filtro nenhum. Ela mantém o bypass porque
    somar `eventos_aluno` de vários alunos é justamente o que um aluno não pode
    fazer linha a linha. **O que a torna segura não é o invoker — é o GRANT:**
    só `service_role` a enxerga, e nem `anon` nem `authenticated` têm qualquer
    privilégio nela (verificado em produção). Ligar `security_invoker` aqui
    quebra a agregação sem ganho de segurança.
  - `vw_rank_posicoes_por_classe` é a que os clientes leem (`authenticated`;
    `anon` não). Ela faz `SELECT` da `_todas` e aplica o filtro de saída:
    `app_minhas_classes()`, o limite de posições visíveis, o próprio
    `auth.uid()` e as classes do professor.

  Corolário que vale para qualquer view nova com bypass: a pergunta não é se ela
  tem `security_invoker`, é **quem tem GRANT nela**. Uma view sem invoker e sem
  GRANT para `anon`/`authenticated` é inalcançável pelo cliente; com GRANT, ela
  é um bypass de RLS completo. **Toda view nova nasce com
  `security_invoker = on`** — e se precisar do bypass, nasce sem GRANT para os
  papéis de cliente.
- **`storage.objects` não diz mais se um material existe.** Depois da
  migração para o Cloudflare R2
  (`docs/superpowers/specs/2026-08-29-r2-gateway-design.md`), **escrita nova
  vai só para o R2**; o Storage do Supabase guarda apenas o que já estava lá,
  e é lido por fallback do gateway (`storage-redirect`). Então: nada de
  `supabase.storage.from(...).download(...)` no cliente, nada de
  `SELECT ... FROM storage.objects` para validar existência no banco, e nada
  de montar URL pública direta — ela dá 404 para todo material novo. Quem
  sabe se o upload deu certo é quem sobe o arquivo, no momento em que sobe.
  Essa premissa errada já quebrou o console duas vezes no mesmo dia: o deck
  baixado do Storage (corrigido em `htmlDeckSource.ts`) e uma checagem em SQL
  que marcou 100% das gerações novas como `failed` (revertida em
  `20260922_03`).
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

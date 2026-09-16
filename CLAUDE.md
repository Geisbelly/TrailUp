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
`scripts/dev.ps1`). A API sobe por **`python -m app`** (não pelo `uvicorn.exe`
da venv — a venv foi movida e os `.exe` apontam para caminho antigo, e **não**
por `python -m uvicorn app.main:app`, que no Windows escolhe `ProactorEventLoop`
e derruba o checkpointer do LangGraph; ver `app/event_loop.py`). Banco:
**Supabase** (externo, via `.env`).

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

1. **Um salto a menos.** `mobile → Supabase` já é o caminho autenticado e com
   Realtime. Passar por `mobile → API → Supabase` adiciona latência, um ponto de
   falha e uma segunda cópia das regras de acesso.
2. **Uma autoridade só.** Encanamento espalhado entre a API e o banco vira duas
   implementações da mesma regra, e elas divergem. Já custou caro três vezes:
   o merge de materiais em TS que ensinava o contrário da RPC viva, a audiência
   de conquista que o cliente filtrava e o gatilho não, e os três gravadores de
   `pronto` com gates diferentes.

Ao estender: se a pergunta for "onde ponho isso?", e a resposta não envolver um
modelo de linguagem, **não é na API** — com uma ressalva, abaixo.

> **A API não hiberna mais.** Este trecho já listou "a API dorme, roda no free
> tier do Render" como o PRIMEIRO motivo da regra, e a premissa deixou de
> valer. Isso importa porque ela era usada para decidir o oposto do que o
> motivo 2 recomenda: ao automatizar o recálculo de `classe_perfil_summary`, a
> leitura literal do texto antigo mandava portar para PL/pgSQL uma conta que só
> existe em Python — criando exatamente a segunda autoridade que o motivo 2
> proíbe, e numa conta cheia de sutileza (o percentual da distribuição usa como
> denominador os alunos COM perfil, as médias usam TODOS, e
> `perfil_predominante` é nulo em empate). O laço ficou na API, chamando o mesmo
> `upsert_summary` do endpoint (`20260911`, `group_analysis.py`).
>
> Regra atualizada: **relógio pode ficar na API** quando mover a conta para o
> banco duplicaria uma regra que já existe em Python. Quando não há conta a
> duplicar — enfileirar, expirar, entregar —, continua no Postgres, onde
> `pg_cron` e os gatilhos já vivem.

> Dívida conhecida: `POST /api/v1/telemetria/lotes` recebe lotes do mobile e
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
   `topico_aluno`, e agora o TIPO impede.** `construirEscritaDeTopico` não tem
   os dois parâmetros — a regra deixou de depender de quem lembra dela. Havia
   quatro gravadores fazendo isso, todos com a conta sobre o material do
   professor apenas, e todos rodando DEPOIS do trigger — a conta certa nunca
   sobrevivia.

   O `status` sobreviveu à remoção original por medo de re-travar o desbloqueio
   dos próximos tópicos. Medido depois: forçando o recálculo dos 9 tópicos da
   base, `trailup_recalcular_topico_aluno` devolve valores **idênticos** aos que
   o cliente escrevia. A escrita era redundante quando certa e enganosa quando
   não — um `concluido` do cliente que não fosse seguido de nenhuma escrita de
   item mascarava um 96% do banco para sempre. O desbloqueio lê o modelo local
   dentro da sessão, e o banco entre sessões; nos dois casos a resposta é a
   mesma. `Topico.calcularPercentual()` continua
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
>
> **O inimigo do painel de batalha tem paleta própria, e ela não é a do
> perfil.** O *chrome* de `IABattlePanel` lê `palette.*` normalmente (25 vezes),
> mas as cores do boss vêm de `IAEnemyVisualSpec.palette`, enviada pela IA — e,
> quando ela não vem, de `buildFallbackVisual`, que tem quatro presets
> (`mech`, `scholar`/`mage`, `beast`, `phantom`) com hex cravado no arquivo:
> `#38bdf8`, `#a78bfa`, `#fb7185`, `#f97316`. São defaults do Tailwind, não
> cor-assinatura. Trocar o tema do app não muda o inimigo.

> **A camada de arte do combate já está implementada e recebe `null`.**
> `IAEnemyVisualSpec` (`mobile/src/interfaces/personalizacao/IAContracts.ts`)
> tem `avatarUrl`, `backgroundUrl`, `frameUrl` e `effectUrl`, e `IABattlePanel`
> **renderiza os quatro** — fundo na linha 230, efeito na 231, moldura na 277
> com `resizeMode="stretch"`. O prompt que os alimenta
> (`api/app/agent/prompts/personalizacao_comportamental.txt`) declara os campos
> e emite `null` em todos. Ou seja: não falta código para arte de boss, de
> cenário e de moldura — falta conteúdo e falta quem preencha a URL.
>
> E o `backgroundLayer` usa **`opacity: 0.16`**, que é o mesmo que um véu de
> α 0,84 da superfície sobre a arte. Medido nos cenários da pasta de
> identidade, o mínimo para o texto passar em AAA sobre o cenário mais claro é
> α 0,79 — ou seja, o painel já está do lado certo do limite, e é o precedente
> a copiar em qualquer tela que ponha cenário atrás de texto. Ver
> `docs/superpowers/specs/2026-09-16-identidade-visual-design.md`.

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
toque, scroll, sinais, câmera opcional) → `POST /api/v1/telemetria/lotes` →
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
>
> **E o nível de cima também: `classe_aluno`.** Este parágrafo só falava das três
> tabelas de baixo, e a omissão custou caro. `classe_aluno` tem duas colunas
> agregadas lado a lado — `porcentagemConcluida` e `tempoGastoMin` — e por muito
> tempo só a primeira era derivada: `trailup_recalcular_classe_aluno` calculava
> o percentual e **não tocava o tempo**. Nada mais escrevia `tempoGastoMin` (nem
> mobile, nem API, nem frontend, nem função do banco), então o valor era um
> fóssil: gravado uma vez por código que não existe mais. Medido em produção,
> 0,39 min contra 2,17 min de soma real — e é essa coluna que o rank "Tempo de
> Estudo" lê, então o rank divergia da trilha e do perfil por 5,6×. As duas
> agora saem da mesma função (`20260910_03`); o percentual é **média** dos
> tópicos (cada tópico vale o mesmo) e o tempo é **soma** (estudo acumula).
> Ao criar agregado novo em `classe_aluno`, derive junto com esses dois.

> **Quatro armadilhas de tempo/progresso, todas medidas em produção.** O
> gatilho `trg_telemetria_tempo_gasto` RECALCULA o total a cada INSERT de
> telemetria (não soma incremental), então toda linha tocada por dado novo
> fica certa — e o que sobra errado é **fóssil**, nunca mais recalculado:
>
> 1. **`trailup_recalcular_topico_aluno` se ABSTÉM de `tempo_gasto_min`**, com
>    um comentário que alega ser "contador incremental do app". A justificativa
>    envelheceu, mas a função continua abstendo-se, então backfill de tempo do
>    tópico precisa fazê-lo por conta própria. Confiar nela custou uma tentativa
>    (`20260910_12`). Cuidado: um `grep` por `tempo_gasto_min` nessa função casa
>    com o COMENTÁRIO, não com uma atribuição.
> 2. **O total diário é limitado a 86400s** (`20260910_13`). Cada batida já era
>    limitada a 3600s, mas o acumulado não: o mesmo aluno com o app aberto em
>    dois lugares soma nos dois e a chave `(aluno_id, dia)` funde os aparelhos —
>    27,3 h num dia de 12,4 h de janela. `aluno_sessoes_app` não sofre disso
>    porque é por `session.id`, um por aparelho. O total alimenta o gatilho
>    `tempo_uso`, que dispara "Hora de uma pausa".
> 3. **Métrica do perfil NÃO soma a sessão ao vivo.** `vm.tempo` é o mesmo
>    número do rank, então vem do banco e só dele. Somar `session_elapsed_sec`
>    (que é `now - sessionStartedAt`, a sessão inteira) contava a sessão duas
>    vezes, e o erro crescia com a duração. O dado ao vivo fica em
>    `tempoAtivoMin`, separado.
> 4. **Abandono e conclusão da turma vêm de `topico_aluno`, nunca de contagem
>    de eventos** (`20260911_01`). `topic_open` é um evento por ABERTURA: 106
>    aberturas contra 1 `topic_complete` davam 0,94% de conclusão e 99,06% de
>    abandono onde a trilha tinha 75%. As duas somavam 100 entre si, então eram
>    coerentes uma com a outra e erradas juntas — nada dentro da view as
>    contradizia. Contar tópicos distintos da telemetria não é alternativa: o
>    payload não carrega `topico_id`.

> **Escrita de progresso, tempo e ponto passa por fila durável.** Os
> gravadores (`models/Conteudo`, `models/Atividade`, `models/Topico`,
> `models/Classe`, `models/Evento` e o upsert de tópico em `TrilhaContext`)
> chamam `gravarProgresso` (`services/progressoOutbox`), nunca
> `supabase.from(...).upsert(...)` direto. Sem isso, rede oscilando ou o
> sistema matando o app apagava o conteúdo concluído, a atividade corrigida e o
> ponto conquistado — em silêncio.
>
> A máquina da fila é a mesma da telemetria (`services/filaDuravel`), extraída
> em vez de copiada. **A forma de cada escrita mora em
> `services/progressoEscritas`**, em funções puras, sob uma regra só: *coluna
> que o chamador não conhece não entra no upsert*. O `ON CONFLICT` só toca no
> que foi enviado, então omitir preserva o que está no banco e mandar um
> palpite (`?? 0`, o valor velho da memória do app) sobrescreve o certo.
>
> Retentar ponto é seguro por causa de `eventos_aluno.idempotencia_key`
> (`20260911_02`): a chave nasce **antes da primeira tentativa** e viaja com a
> escrita para o disco, então a segunda entrega bate no índice único parcial,
> devolve 23505, e a fila trata 23505 como definitivo. Gerar a chave na hora de
> reenviar faz o oposto — duplica o ponto. Ao dar fila a uma escrita nova, veja
> se ela é idempotente por construção (`upsert` é) ou se precisa de chave.

> **Rank: a view é a única autoridade, e "vazio" é resposta.** O mobile lê
> `vw_rank_posicoes_por_classe` e mais nada. Havia um segundo cálculo em
> TypeScript (`buildFallbackRankRows`) acionado quando a consulta falhava **ou
> voltava vazia** — e vazio é legítimo, então o caminho normal passava por ele.
> Ele ignorava o corte de `app_rank_limite_visivel()`, deduzia a classe do
> evento por `referencia` (o defeito que a `20260910_06` tirou do banco) e
> calculava `percentual_do_lider` sobre o próprio máximo. Se a view falhar, a
> lista vem vazia: ranking inventado é pior que ranking ausente.
>
> Os rótulos do rank (`nome`, `descricao`, `icone`) vêm de **`rank_tipo`**, não
> de `ranks` — essa tabela é só `id, tipo_id, classe_id, periodo, created_at`.
> Um fallback que pedia essas colunas a `ranks` estourava com 42703 toda vez que
> rodava.
>
> A pontuação do rank **inclui as conquistas**, que têm `classe_id` nulo de
> propósito e são espalhadas por todas as turmas do aluno. Medido na classe 32:
> 234 pontos da turma + 560 de conquista = os 794 que a view mostra. Somar só
> `WHERE classe_id = <turma>` dá outro número e não é divergência.

> **Crédito concedido pelo professor — presença, participação e atividade em
> sala.** Uma RPC só (`registrar_credito_da_turma`, `20260911_05`) para os três
> tipos: os quatro bloqueios (sessão, posse da classe, tipo permitido, valor
> válido) são os mesmos, e duas cópias deles divergiriam.
> `registrar_presenca_da_turma` continua existindo e delega.
>
> **"Creditado" é decidido por PREFIXO**, em `fn_evento_creditado`:
> `presenca*`, `participacao*`, `conquista*`. Evento creditado mantém o `valor`
> de quem concedeu em vez de tirá-lo de `fn_pontos_do_evento` — então um tipo
> novo com um desses prefixos passa a valer o que o chamador mandar. A lista de
> tipos aceitos pela RPC é fechada de propósito por causa disso.
>
> O que protege a coluna é a RLS somada ao congelamento: `eventos_aluno_posse_ins`
> barra o aluno de INSERIR tipo creditado, e no UPDATE `tipo`, `valor`,
> `concedido_por`, `aluno_id`, `motivo` e `classe_id` são restaurados de OLD
> (`20260911_04`). Antes disso um `UPDATE ... SET valor = 99999` no próprio
> evento de presença passava — provado nesta base e desfeito por exceção. A
> **ordem** importa: `tipo` congela ANTES do teste de creditado, senão trocar o
> tipo no UPDATE escolhia qual regra de pagamento aplicar.
>
> **A referência é `classe:<id>:<AAAA-MM-DD>`, e o id está no SEGUNDO segmento.**
> `fn_eventos_aluno_resolve_classe_id` foi ensinada a ler de lá
> (`20260911_05`); antes ela usava `fn_eventos_aluno_referencia_id`, que pega os
> dígitos do FIM (`'^.*:[0-9]+$'`) e devolvia NULL para a data com hífen. Classe
> nula tira o evento do rank inteiro (a CTE `eventos_por_classe` filtra
> `IS NOT NULL`), então **presença concedida nunca teria contado** — não apareceu
> porque havia zero eventos de presença na base. Medido depois da correção:
> conceder 8 pontos leva o rank da classe 32 de 794 para 802.
>
> `participacao_extra` acrescenta um quarto segmento com o slug do motivo:
> presença deduplica por dia (há uma aula por dia), mas duas atividades em sala
> no mesmo dia são dois créditos, e com a mesma referência a segunda cairia no
> `DO NOTHING` sem erro nenhum. Por isso `motivo` é **obrigatório** nesse tipo, e
> o valor tem teto em `app_config.credito_extra_maximo`.

> **Prazo agora tem consequência, e ela nasce desligada.** `atividades.data_entrega`
> era só um selo — `prazoDaAtividade.ts`: *"Atrasado é AVISO, não porta fechada"* —
> e 0 das 248 atividades tinha prazo. `trg_eventos_aluno_valor_do_banco` passou a
> multiplicar o valor por `fn_fator_de_atraso`, que lê
> `app_config.prazo_atraso_fator` (`20260912_01`). O fator nasce em **1.0**, que é
> multiplicar por um: ligar é um UPDATE numa linha, não uma migração. Não bloqueia
> entrega. Quem decide se há atraso é a **referência** (`atividade:<id>`), não o
> tipo — conteúdo, tópico e o UUID do ciclo caem fora no regex. E o instante
> julgado é `criado_em`, não `now()`, senão um UPDATE futuro tornaria atrasado o
> que foi entregue no prazo. `fn_prazo_efetivo(aluno, atividade)` já nasce com o
> aluno na assinatura porque a extensão comprável de prazo é por aluno; hoje
> devolve a `data_entrega` crua.
>
> Três armadilhas que essa migração encontrou, e que valem para a próxima:
>
> 1. **O parser de `app_config` do resto do repo destrói decimal.** As outras
>    chaves são inteiras e usam `regexp_replace(valor, '[^0-9]', '', 'g')`. Medido
>    no Postgres: sobre `'0.5'` isso devolve `'05'`, ou seja **5** — multiplicaria
>    a pontuação por cinco em vez de cortá-la pela metade, calado. Chave decimal
>    precisa de `[^0-9.]`, de `translate(valor, ',', '.')` antes, e de clamp.
>    Configuração ilegível deve falhar para o lado de **não punir**: devolver zero
>    zeraria o rank inteiro por um typo.
> 2. **`CREATE OR REPLACE` sobre função que cresceu por emenda apaga regra em
>    silêncio.** A `20260911_05` não restatou `trg_eventos_aluno_valor_do_banco`:
>    ela leu `pg_get_functiondef`, inseriu `NEW.motivo := OLD.motivo;` depois de
>    uma âncora e executou. Então o texto da `20260911_04` **não é** o que roda.
>    Antes de substituir essa função, compare o `md5(pg_get_functiondef(...))` com
>    o corpo do repo — a `20260912_01` traz um `DO` que confere oito regras no
>    corpo vivo e recusa a substituição se faltar alguma.
> 3. **Função nova nasce executável por `anon`.** O Supabase concede EXECUTE a
>    PUBLIC por padrão, então uma `SECURITY DEFINER` recém-criada fica exposta em
>    `/rest/v1/rpc/<nome>` sem login — contra a primeira linha da RLS daqui. O
>    linter acusa em `anon_security_definer_function_executable`. A forma é a da
>    `20260826_09`: `REVOKE ALL ON FUNCTION <assinatura completa> FROM PUBLIC, anon`
>    seguido de `GRANT EXECUTE ... TO authenticated`.

> **Conquista: o gatilho avalia contra uma lista, e a lista agora tem dono.**
> `trg_eventos_aluno_after_iud` percorre `conquistas` a cada evento. Desde a
> `20260911_06` o `SELECT` filtra por turma — `classe_id IS NULL` (global) ou
> uma das turmas do aluno. Sem o filtro, conquista de turma seria avaliada para
> todo mundo e o aluno destravaria a de outra turma.
>
> **O `WHERE` desse loop é uma disjunção, e o filtro precisou de parênteses.** O
> predicado de perfil é `A OR B`; acrescentar `AND C` no fim faz o Postgres ler
> `A OR (B AND C)`, porque `AND` liga mais forte. Conquista comum de outra turma
> continuaria passando pelo primeiro ramo, calada. Ao mexer nesse `SELECT`,
> confira os parênteses — há teste guardando.
>
> **`tipo` é único POR TURMA**, via `COALESCE(classe_id, -1)` nos dois índices
> parciais. O `COALESCE` não é enfeite: em índice único NULL não colide com NULL,
> então `UNIQUE (classe_id, tipo)` cru deixaria duas globais com o mesmo tipo
> passarem. Antes da `20260911_06` a unicidade era global, e era o que travava a
> conquista do professor no primeiro cadastro.
>
> **A métrica é lista fechada, e isso é correção.** O que avalia é um ramo de
> `IF`; métrica desconhecida vira conquista morta — cadastrada com sucesso,
> nunca destravada, sem aviso (foi assim que 21 das 27 ficaram paradas).
> Acrescentar métrica exige **duas** coisas: o ramo no gatilho e a entrada em
> `fn_conquista_metrica_suportada`, que um CHECK usa. E a chave do limiar dentro
> de `criterio` tem de casar com o que o ramo lê (`minimo`, `dias_seguidos`,
> `max_tempo`…): chave errada faz `COALESCE(..., 0)` valer zero, e a conquista
> destrava para todo mundo no primeiro evento.

> **Caractere invisível no fonte é regra que ninguém revisa.** `normalize("NFD")`
> seguido de um range de combining marks (`[̀-ͯ]`) funciona, mas
> gravado literalmente no arquivo ele é **invisível** — um `replace` acidental
> apaga a regra sem deixar rastro, e o diff não mostra nada. Prefira a forma
> escapada ou uma tabela explícita de acentos, como `derivarTipo` em
> `frontend/src/lib/conquistaDaTurma.ts`.

> **Módulo com cara de vivo que ninguém chama.** Já custou tempo três vezes
> nesta área: `services/progressoTrilha.ts` existia desde o commit inicial e
> **nunca** teve um chamador, enquanto as escritas de verdade estavam nos
> models; o fallback do rank rodava no caminho normal fazendo a conta errada; e
> `Rank.loadByRankId` / `getPosicaoDoAluno` / `listRankInfosByClasse`
> continuam sem uso externo. Antes de corrigir um "gravador" ou "calculador",
> confirme quem o chama — `grep` pelo nome fora do próprio arquivo.

> **O inverso disso: backend inteiro sem tela, e uma cerimônia que já o
> prometeu.** Quatro tabelas existem no Supabase com dado dentro —
> `social_relacionamentos` (3), `social_mensagens` (2), `guildas` (3),
> `guilda_convites` (5) — e **nenhuma linha do monorepo lê ou escreve qualquer
> uma delas** (conferido em `mobile/src`, `frontend/src`, `api/app`). Enquanto
> isso, `utils/portoes.ts` tem dois portões e só um é consumido:
> `_layout.tsx` usa `aberturas.rank` para revelar a aba Ranking, mas
> **`aberturas.social` não é lido por ninguém** — e a cerimônia dele dispara ao
> concluir o primeiro conteúdo anunciando "Amizades liberadas", com passos que
> descrevem convite, aceite mútuo e bloqueio. O aluno recebe a promessa e não
> tem para onde ir. Ao mexer em portão ou em navegação, saiba que essa dívida
> existe; o desenho de como pagá-la está em
> `docs/superpowers/specs/2026-09-12-loja-no-mobile-design.md`, §2.

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
  `security_invoker = on` em `20260826_10`. A exceção deliberada é o ranking, e
  ele são **duas** views em camadas — descrevê-lo como uma só (o que este
  parágrafo fazia) esconde por que cada uma abre mão do `security_invoker`:

  - **`vw_rank_posicoes_por_classe_todas`** soma eventos de vários alunos, o que
    um aluno não pode fazer lendo `eventos_aluno` linha a linha. É por isso que
    ela roda como dono. E **o cliente não a lê**: `20260910_05` revogou
    `anon`/`authenticated` dela explicitamente, porque um `DROP`+`CREATE` não
    preserva grant e os *default privileges* do Supabase a republicariam — o
    ranking inteiro, sem corte e sem filtro.
  - **`vw_rank_posicoes_por_classe`** é a única que `authenticated` lê. Ela
    também roda como dono, e não por escolha: como `invoker`, leria a `_todas`
    como `authenticated`, que não tem privilégio nenhum nela, e o rank sumiria
    com "permission denied". A segurança dela é o filtro de saída —
    `app_minhas_classes()`, `auth.uid()`, `app_classes_do_professor()` — mais o
    corte de `app_rank_limite_visivel()`.

  **`CREATE OR REPLACE VIEW` NÃO preserva `security_invoker`.** Observado ao
  trocar uma expressão em `vw_metricas_comportamento_aluno_classe`
  (`20260911_10`): depois do replace ela era a única das nove `vw_metricas_*`
  sem a opção — ou seja, a única voltando a rodar como dono, com as policies das
  tabelas base sem se aplicar. O `ALTER VIEW ... SET (security_invoker = on)`
  faz parte da troca, não é zelo, e a migração confere isso — sem a conferência
  o bypass volta calado, porque a view continua devolvendo número.

  O linter marca a segunda como `security_definer_view` **ERROR**, e é esperado:
  é essa a exceção. Antes ele apontava a `_todas`; mudou de view quando o grant
  saiu de lá. **Toda view nova nasce com `security_invoker = on`.**
- **`text()` do SQLAlchemy lê `:qualquercoisa` dentro de string literal como
  bind parameter.** Ele varre a string CRUA, sem entender SQL: `'classe:1:2026-09-11'`
  derruba a migração com `A value is required for bind parameter '2026'`. E vale
  **inclusive dentro de comentário SQL** (`-- ... :2026 ...`), que ele não
  reconhece — isso custou duas rodadas na `20260911_05`, a segunda num
  comentário que explicava o problema. Contorne montando o literal por
  concatenação (`'classe' || ':' || '1'`), quebrando a sequência
  dois-pontos-seguido-de-caractere-de-palavra. `x::text` continua seguro: o
  duplo dois-pontos é tratado como cast. Um teste que varre o SQL renderizado
  com `(?<!:):[A-Za-z_]\w*` pega isso antes de ir ao banco.
- **`text()` do SQLAlchemy não aceita `:param::tipo`** — o `::` do Postgres
  colide com a sintaxe de bind e o parâmetro deixa de ser reconhecido (erro em
  tempo de execução, não de import). Use `CAST(:param AS TIPO)`. E parâmetro
  usado só em `IS NOT NULL`/`CASE WHEN` **precisa** de cast explícito, senão o
  asyncpg falha com `AmbiguousParameterError`.
- **Para falar com o banco, use `build_engine()` — nunca monte um engine à mão.**
  O Supabase fica atrás de **PgBouncer**, que não aceita prepared statements
  nomeados. `app/db/session.py` desliga o cache (`statement_cache_size = 0` +
  `NullPool`) quando o host termina em `pooler.supabase.com`; um
  `create_async_engine` improvisado não faz isso e morre com
  `DuplicatePreparedStatementError: prepared statement "__asyncpg_stmt_N__"
  already exists`. Vale para script de manutenção, backfill e teste de
  integração — o erro só aparece na segunda consulta, então parece intermitente.
  Também é o motivo de `executemany` (uma lista de dicts em `session.execute`)
  ser seguro aqui: sem cache de statement, ele não colide.
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
- **`eventos_aluno.classe_id` é resolvida no INSERT e CONGELA.** Nenhum cliente
  escreve essa coluna, e o gatilho `trg_eventos_aluno_valor_upd` restaura
  `OLD.classe_id` em qualquer UPDATE. Duas razões, e as duas doem:

  1. **Histórico não pode depender do presente.** A classe era deduzida na
     *leitura* — a view pegava o id dentro de `referencia` e caçava a tabela. Aí
     conteúdo regerado apaga atividade e os pontos do aluno somem
     retroativamente. Foram 66 ids órfãos e 160 pontos medidos em produção
     (`20260910_06`, `20260910_07`).
  2. **É superfície de ataque.** `eventos_aluno_posse_upd` deixa o aluno dar
     UPDATE nos próprios eventos, e o gatilho de valor olhava só
     `UPDATE OF valor, tipo`. Com a coluna gravável, um
     `UPDATE ... SET classe_id = <outra turma>` moveria a pontuação dele para a
     turma que quisesse liderar. É por isso que o gatilho dispara em **todas** as
     colunas: a lista curta era o buraco.

  Corolário: a view do rank **lê a coluna**, não deduz. Se ela voltar a resolver
  por `referencia`, os dois problemas voltam juntos. `fn_eventos_aluno_resolve_classe_id`
  continua existindo, e é ela que alimenta o INSERT — um lugar só.

  Exceção: `conquista_desbloqueada` fica com `classe_id` nulo de propósito.
  `conquistas.escopo` é `comum` ou `perfil`: o prêmio não pertence a uma classe,
  vale em todas as do aluno, e a view espalha por `classe_aluno`.

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

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

   O `microservice` delega a etapa de **apresentação** (deck + HTML) ao
   BrainHexPDF (não confundir com o app BrainHex/Google AI Studio mencionado
   acima), via `BRAINHEXPDF_API_URL`/`POST /api/v1/render-and-store`. **O
   publicado sai de `brainhexpdf/`, aqui no monorepo** (medido em 02/11: a
   mensagem de falha gravada no banco só existe nesta cópia). O
   `Geisbelly/BrainHexPDF` é uma cópia antiga, parada em 29/08: o que se
   muda só lá não chega ao ar. O BrainHexPDF gera o deck (Gemini) e o HTML
   completo e sobe o arquivo no R2 (ver o item do R2 em Convenções);
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
   **cada perfil que a turma tem** e persiste-se no Supabase. O `source_hash` inclui
   `_PERSONALIZACAO_PIPELINE_VERSION`; incremente essa versão quando prompts,
   enriquecimento, áudio ou apresentações precisarem ser regenerados.

   **"Perfil que a turma tem"** = principal **ou** secundário de algum aluno
   matriculado: 1º e 2º de `ORDER BY afinidade DESC NULLS LAST, nome ASC`
   (`listar_alunos_classe_com_perfil_dominante`); aluno sem `aluno_perfil` conta
   como `mastermind`. Turma vazia não gera base. Pedido explícito de perfil
   (`brainhex_profile_keys`) vale como veio. O class-delta do banco ainda emite os
   7 targets; o worker pula (`skipped`, `perfil_sem_aluno_na_turma`) os que
   ninguém tem (`_pular_base_de_perfil_ausente`). Matrícula com perfil novo
   enfileira a base dele (`_garantir_base_dos_perfis_do_aluno`) — a geração
   continua antecipada, **não** é sob demanda — e o alvo desse aluno espera a
   base e copia dela (`_base_do_perfil_na_fila`) em vez de gerar uma linha só
   dele: sem isso o primeiro aluno de um perfil novo custava duas gerações.

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

6. **Nova tentativa NÃO regera tudo: retoma só o que falhou** (#652). Antes,
   uma parte de áudio sem voz fazia a nova tentativa refazer o texto, todas as
   partes de TTS e todos os decks. A RPC descartava o texto refeito, e o que
   sobrava era cota do free tier queimada: cerca de 30 pipelines completos num
   dia, na turma 68. O `runPipeline` (`microservice/server.ts`,
   `src/services/mediaResume.ts`) funciona assim:
   - **Checkpoint antes do TTS e dos decks.** O texto de cada parte é subido e o
     **roteiro de cada parte de áudio** vai para `materiais.audio.partes[].roteiro`,
     com a marca `metadata.roteiro_generation_key`.
   - **Na nova tentativa**, o texto já subido é reaproveitado e o TTS roda só nas
     partes de áudio sem arquivo. O deck é refeito só nas partes que faltam.
     Material antigo, sem roteiro guardado, refaz **só o roteiro**
     (`generateAudioScriptsWithGemini`), nunca o texto.
   - **O que prova que um arquivo é desta geração é o caminho dele**
     (`storagePath` embute a `generation_key`), não `metadata.generation_key`: o
     `claim_retry_incomplete_generation` da API reescreve essa chave em todo
     material incompleto.
   - **Etapa de junção do áudio** (`src/utils/audioJunction.ts`). As partes de
     áudio não seguem mais as partes do texto. O roteiro de todos os blocos é
     limpo (sem `##`, sem markdown, tag de tom grudada na fala) e reagrupado em
     partes de ~3.600 caracteres, nunca acima de 4.500 (uma chamada de TTS cada).
     O corte é só entre parágrafo ou frase, e quem perde o corte no meio leva o
     tom adiante.
   - **Cota do dia ou 402 no TTS não se repete na hora.** O erro final leva
     `[sem_cota_tts]`, e a API marca o alvo `failed` sem as 3 tentativas
     (`_status_do_target_apos_falha`). "Reprocessar falhas" depois da virada (à
     meia-noite do Pacífico) retoma só as partes que faltam. Uma chave com 402
     sai do rodízio por 6 h; o 429 do dia pausa a chave até a virada.
   - **A nova tentativa reaproveita `plano.content_enrichment`** em vez de
     enriquecer de novo.
   - **O alvo procura a linha do próprio dono.** `buscar_mais_recente_por_perfil(dono=...)`:
     com `None` busca só a base, e com o aluno, só a linha dele. Sem isso, a base do
     Mastermind e a do Achiever da turma 68 foram geradas em linhas de alunos.

   Ao mexer nesse fluxo, a pergunta é sempre "**o que já está pronto nesta
   geração?**", antes de chamar qualquer modelo.

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
  `_BRAINHEX_GUIDE_PERSONAS`. Quando o Gemini TTS recusa (402 de crédito, 429
  de cota, resposta sem áudio), a voz sai pela OpenAI
  (`microservice/src/services/ttsRecovery.ts`, #652): o texto já tinha
  contingência e o áudio não, e foi assim que a turma 68 ficou com texto e sem
  nenhum áudio. 402 não é repetido — esperar não devolve crédito. Resposta sem
  áudio agora diz por quê (`extractTtsAudioData`: `finishReason`, bloqueio,
  texto devolvido), e a nova tentativa vai sem as tags de tom.

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

- `classe_arco_narrativo` — a história da turma que o professor escreve (#145, `20261102_16`),
  uma linha por classe. Só o professor dono lê e escreve (o aluno não lê; o arco chega a ele
  dentro do material). **Guardar é banco, usar é API**: o console grava direto (aba História
  de Personalizações) e `fetch_personalizacao_context` põe o arco no contexto, no prompt do
  microservice (`class_story_arc` → `buildClassStoryArcSection`) e nos prompts Python
  (`arco_narrativo_turma`). O arco é moldura comum aos 7 perfis; a voz continua a da
  assinatura editorial do perfil.
  - **Entra no `source_hash` só quando existe.** Turma sem arco mantém o hash de antes; editar o
    arco invalida o material da turma (e refaz o enriquecimento uma vez por conteúdo).
  - **O banco marca para regerar:** `fn_enqueue_arco_narrativo_job` enfileira `class_delta_sync`
    da turma inteira, com a mesma coalescência e o mesmo portão de geração manual do editor.
  - Cards não recebem o arco: são reaproveitados entre perfis e gerações, e ficariam com
    histórias diferentes lado a lado.
  > **Conteúdo idêntico se vincula, não gera** (`20261104_08`, spec
  > `2026-11-04-reuso-de-personalizacao-design.md`). Antes da expansão, o worker
  > compara `impressao_conteudo` (`reuso_personalizacao.py`): SHA-256 do que entra
  > na geração, **sem nenhum id, URL ou caminho**, com o hash dos bytes de cada
  > arquivo. `source_hash` não serve para isso porque inclui os ids. Nome,
  > descrição e objetivo do tópico ficam de fora por decisão: só o conteúdo importa.
  > Bateu, `trailup_vincular_personalizacao` cria a linha da turma citando os
  > **mesmos arquivos** da origem, sem modelo, microservice nem TTS.
  >
  > **A linha da turma é o vínculo**: uma linha por turma, de propósito. RLS,
  > gateway, retenção, trava do estudo, progresso e telemetria continuam por linha
  > da turma, e o app instalado funciona sem mudança. Um caminho
  > `brainhex/<perfil>/classe-N/...` **não prova mais** que o material é da turma N.
  >
  > Editar desvincula só a linha editada: o gatilho `trg_conteudo_personalizado_reuso`
  > zera as duas colunas quando `source_hash` muda. O material da outra turma não
  > muda, e o arquivo fica enquanto alguém o citar (`_ainda_usado`). O gatilho também
  > impede a forja: cliente não muda essas colunas, e mudar `materiais` por ele marca
  > `editado`. Sem isso, com o reuso entre professores, uma linha adulterada serviria
  > material a outra turma. Refinar à mão (`regenerar/documento`, `regenerar/slide`)
  > marca `editado` também: não serve de origem.

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

  **`student_enrollment` também é enfileirado pelo BANCO** (`20261011_02`):
  `fn_enqueue_student_enrollment_job`, AFTER INSERT em `classe_aluno`. Grava o
  mesmo job que a API criava para o console (escopo, alvos com o aluno e o
  perfil dominante, `target_profile_map`), só com `trigger_source`/`reason`
  próprios. Não duplica com job `pending`/`processing` do mesmo aluno e turma,
  e falha ao enfileirar não desfaz a matrícula. O console não chama mais
  `POST /personalizar/jobs/enrollment`. Dívida: o endpoint continua existindo
  (e deduplica contra o job do trigger, porque o escopo é idêntico) — não use
  como precedente.

- **Duplicar turma, tópico e atividade são funções do banco**, cada uma numa
  transação (`20261011_01`, `_03`, `_04`): `duplicar_classe`, `duplicar_topico`,
  `duplicar_atividade`. O console só chama `supabase.rpc(...)`. Antes a cópia era
  dezenas de INSERT no cliente, sem transação, e perdia colunas (anexos em
  `conteudos.metadata`, pontuação e regras das atividades, mídia das questões, cor
  e ordem dos cards). Todas conferem a posse **antes** de ler (`NOT EXISTS` sobre
  `app_classes_do_professor()`, nunca `NOT IN`). **Não copiam** matrícula, progresso,
  telemetria, personalização, nem as ligações `next`/`depende` do tópico. Os arquivos
  no Storage também não são copiados: a cópia aponta para os mesmos caminhos.
  Por isso apagar NUNCA remove arquivo direto: os gatilhos de `20261104_05`
  (`conteudos`, `midias`, `questoes`, `cards`, `conteudo_personalizado`) põem o
  caminho na `retencao_fila_externa`, e o worker só apaga se nenhuma outra linha
  ainda apontar para ele. Ver `docs/lgpd/storage-buckets-e-r2.md`.
  Ao criar uma função de cópia nova, copie o molde de `duplicar_classe` e acrescente
  o teste de estrutura (`api/tests/test_migration_duplicar_*.py`).

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

  **Uma base por vez, entre jobs.** Coalescer no enfileiramento não basta:
  pedido manual, retry e class-delta criam jobs distintos com o mesmo alvo. O
  worker só marca um target `processing` se nenhum outro da mesma base
  (turma × tópico × conteúdo × perfil × aluno × `media_kind`) estiver
  `processing` recente (`tomar_target_para_processar`, com
  `pg_advisory_xact_lock` — de transação, vale pelo pooler). Quem acha a base
  ocupada fica `pending` sem gastar tentativa. Sem isso, em 02/11, a base do
  achiever da turma 68 foi gerada 5 vezes do zero e um job invalidava o outro
  (`stale_generation`). Prova da corrida: `test_e2e_base_um_job_por_vez.py`.

  **KPIs da fila** (#14, `20261102_12`): a RPC `personalizacao_kpis_operacionais`
  (`SECURITY INVOKER`, card "Fila de personalização" no painel da turma) agrega latência,
  falha, reprocessamento e os gatilhos do cap. 10 §11, com o SLO em
  `app_config.personalizacao_kpi_slo`. O tempo por formato vem de
  `processing_started_at`/`_finished_at`/`_runs` em `personalizacao_job_targets`, que
  **só o gatilho `trg_job_target_relogio` escreve** (ignora o que vier no UPDATE). Ele
  mede de `processing` até o estado final: caminho novo de worker que leve um target ao
  fim **sem passar por `processing`** fica sem duração. `processing_runs` não zera na
  retomada manual (`attempts` zera).
- `personalizacao_sugestao` + `personalizacao_sugestao_log` — ordem **aconselhada**
  de consumo do material por `(aluno × tópico × conteúdo)` e o histórico
  append-only de cada decisão (`criada`/`revisada`/`mantida`). Motor
  determinístico em `api/app/services/sugestao_material.py`; o repositório só
  opera se **as duas** tabelas existirem (sem log, a métrica de efetividade
  ficaria furada justamente onde vai olhar). Ver
  `docs/superpowers/specs/2026-08-25-sugestao-de-material-por-aluno-design.md`.
  Cada item da ordem leva `evidencias` (regra do catálogo
  `evidencias_pedagogicas.py`, fontes `DAT-xx`, confiança e os números do
  aluno); o peso por perfil é **hipótese sem evidência** e a emoção não
  reordena. Mudou regra, suba `CATALOGO_VERSAO`: o log grava a versão (#66).

  **A ordem tem camadas, recalculadas a cada decisão** (`20261102_07`). Ver
  `docs/superpowers/specs/2026-11-01-recomendacao-conteudo-x-aluno-design.md`.
  Da mais forte para a mais fraca:
  - **0, necessidade do aluno:** dificuldade no tópico (acerto médio baixo nas atividades
    concluídas) põe os cards no topo (DAT-21);
  - **1, o que o conteúdo pede:** formato `essencial` em `conteudo_demanda_formato`
    (visual → apresentação, escrito → texto, sonoro → áudio, prática → cards). O
    nível `ajuda` só soma pontos;
  - **2, preferência:** perfil (só o que passa da fatia uniforme do vetor de afinidades),
    modo declarado e telemetria.

  A preferência do aluno não passa por cima do conteúdo que depende de um formato.
  Alerta de estudo recorrente vai para o log como observação e não reordena.

  A análise do conteúdo é IA, então é API: o worker faz uma chamada por tópico
  (`demanda_formato.py`, versão própria). Sem modelo, uma regra fixa grava `origem =
  'heuristica'`, e essa regra não conta como atual: o modelo é tentado de novo depois da
  pausa. Quem marca a revisão é o banco. Atividade concluída e análise nova do conteúdo
  ligam `revisao_pendente`, e a API revisa na próxima leitura ou no próximo ciclo, mesmo
  sem material no lote. O aluno lê a própria sugestão direto do Supabase (policy +
  trava do estudo). `motivo_aluno` é a frase que vai para a tela; `motivos`, nunca.
  A identidade dos passos no app é calculada na ordem canônica, antes de a sugestão
  reordenar: reordenar não pode mudar `item_key` nem id.
- **Estudo de efetividade (#13):** `estudo_coorte`, `marco_produto` e
  `topico_aluno_conclusao` (`20261102_02`), e a RPC `metricas_estudo_coortes` (`_03`).
  - **Cohort = turma com data de corte.** O baseline é `[baseline_inicio, corte)` e a
    turma de comparação também tem corte.
  - **O registro é prospectivo**: a RPC recusa baseline no passado, e um gatilho trava o
    corte quando a data dele chega. Não "conserte" isso dando `UPDATE` como dono: escolher
    a janela depois de ver o dado é o viés que a trava impede.
  - **Cada migration aplicada vira marco** (gatilho em `alembic_version`, que nunca derruba
    a migration).
  - **Célula com menos de `n_minimo` alunos volta nula.** As contagens cruas
    (`estudo_indicadores_*`) não têm EXECUTE para cliente nenhum.
  - **A trava da personalização** (`20261102_05`) retém a turma desde o registro. A intervenção
    é liberada no corte, e a comparação no dia seguinte ao `fim`. A liberação é pela data, sem
    job, e a regra está numa função só, `estudo_coorte_retem`. A trava **esconde, não impede a
    geração**:
    - uma policy `RESTRICTIVE` de SELECT esconde do aluno `conteudo_personalizado`,
      `cards_personalizados`, `boss_falas`, `personalizacao_jobs` e `personalizacao_sugestao`
      (esta pela `20261102_07`); o professor dono continua vendo;
    - a API repete a trava onde ela lê como `service_role`, por cima da RLS. O grafo só mede
      (`RETIDA_SPECIALIST_NODES`), `POST /personalizar` responde 409, a sugestão nem é criada e a
      listagem do aluno tira a turma (`EstudoRepository`).

    **Caminho novo que entregue personalização ao aluno pela API precisa perguntar a
    `EstudoRepository`.** A RLS não o cobre. A contaminação na RPC é a exposição medida (tempo
    ativo no escopo `material` dentro da janela retida). Ver
    `docs/superpowers/specs/2026-11-01-cohort-e-baseline-design.md` §6.
- **Rank do evento** (`20261104_01`, #155): `evento_inscricoes` + `ranks.evento_id`. Abrir o evento
  cria um rank por critério de `eventos_classe.arena_criterios` (só `pontuacao`, `missoes` e
  `ranqueada`, os que respeitam a janela) com `inicio`/`fim` do evento, e a `_todas` conta **só os
  inscritos** nele — e conta duelo ali, a única exceção ao `fora_do_xp` fora do `ranqueada`.
  Inscrever e sair são RPCs (`evento_classe_inscrever`/`_sair`); o cliente só lê a tabela. Ninguém
  escreve rank com `evento_id` por fora (`fn_ranks_guarda`), e como ele nasce com `fim`, nem
  `vw_ranks_info_por_classe` nem o "Novo período" o tratam como período da turma. Ao mexer na view,
  o filtro de inscritos é um `EXISTS` de propósito: função ali pede EXECUTE para o cliente.
- `boss_falas` — nome e falas do boss por `(conteúdo × perfil BrainHex)` (`20261101_11`):
  entrada, derrota, provocação de dano, marcos de metade/um quarto da vida, alerta de tempo,
  contra-ataque e a mensagem de vitória. **Gerar é IA, então é API**: o worker da fila faz uma
  chamada ao modelo por tópico × perfil nos jobs de base por perfil
  (`_gerar_falas_boss_do_job` → `app/services/boss_falas.py`), só para os perfis que têm
  batalha no app (`PERFIS_COM_BATALHA`, em paridade testada com `BATTLE_PROFILES` do mobile),
  pula quando o `source_hash` bate e nunca marca target como `failed`. **Ler é banco**: o mobile lê direto
  (`useFalasDoBoss`, RLS `app_minhas_classes()`) e sorteia no aparelho
  (`mobile/src/utils/bossFalas.ts`); sem linha, valem as falas fixas do `IAContext`. O nome
  gerado entra no inimigo, mas o `enemy.id` **não muda** — ele está na chave do estado salvo
  da batalha, e trocá-lo zeraria o boss do aluno. Versão própria (`BOSS_FALAS_VERSION`): subir
  `_PERSONALIZACAO_PIPELINE_VERSION` por causa de fala regeraria a mídia de todas as turmas.

  **Conteúdo idêntico copia, não chama o modelo** (`_copiar_falas_iguais`, e
  `_copiar_demandas_iguais` em `conteudo_demanda_formato`). `source_hash` inclui `conteudo_id` e
  nunca bate entre turmas; quem compara é a `impressao_conteudo`. A impressão da turma nova é
  **calculada na hora** (`_leitor_de_impressoes`), não lida da coluna: as duas fases rodam antes dos
  targets do poll, quando a turma nova ainda não tem linha. Só serve de origem o que o modelo geraria
  igual hoje: versão atual, hash recalculado batendo e o mesmo texto (a impressão gravada anda atrás
  do conteúdo). Fala desligada pelo professor, análise do professor e regra fixa não servem. Falha no
  reuso segue para o modelo. Efeito aceito, o mesmo do material: a fala pode citar o tópico de origem.
  **Nome próprio por perfil é garantido na gravação**, não no prompt: os perfis de um tópico são
  gerados um depois do outro (cada um recebe `nomes_em_uso`), e `nome_unico` relê os nomes sob
  `pg_advisory_xact_lock` do tópico e acrescenta o epíteto do perfil a nome igual ou que só troca o
  título. O prompt recebe a assinatura editorial inteira (`_assinatura`), amarrada a momentos da
  batalha; ela entra no `source_hash`, então mudar a voz de um perfil regera as falas dele.
- `intervencoes` — insights da turma (aba Insights do console, `20260929_01`):
  sugestões/observações que a IA escreve, em lotes (`geracao_id`), por turma
  ou por aluno (estes vêm do `agente_intervencao`, quando um alerta de estudo
  se repete; uma pendente por aluno × alerta a cada 7 dias). **Só a geração passa pela API**
  (`POST /api/v1/insights/turma/{classe_id}/gerar`, em segundo plano, com
  intervalo mínimo de 5 min); listar, aceitar e ignorar é Supabase direto. O
  aluno não lê; o professor só atualiza `status`/`motivo_descarte`/`resolved_at`
  (GRANT por coluna) — nunca o texto que a IA gravou. Sem modelo disponível,
  nada é gravado: não existe insight "de reserva".
- **XP é `eventos_aluno.valor` sem `fora_do_xp`** (`20261103_15`, #154). Duelo contra adversário
  (existe equipe 2) não entra em XP: vale no critério `ranqueada`, no Elo e nas moedas, e recusar
  batalha não custa rank, faixa nem nota. A marca é carimbada por gatilho na escrita e o cliente não a
  escolhe. Desafio cooperativo continua no XP. **Conta nova de XP tem de filtrar `NOT fora_do_xp`**:
  hoje são cinco (`pontuacao` do rank, apuração do evento, `aluno_faixa_xp`, `fn_xp_da_matricula` e
  `professor_notas_da_turma`). Não troque a coluna por função dentro da view do ranking: ela pediria
  EXECUTE para o cliente, e foi assim que o ranking deu `42501` em 29/10.
- `alteracao_professor` + `alteracao_aluno` — o professor mudou um conteúdo ou
  uma atividade que algum aluno já viu ou fez (`20261101_12`). **O banco
  registra** (gatilho nas quatro tabelas do editor e em `questao_gabarito`, só
  quando quem salva é o dono da turma) e **a IA decide**: cosmético × relevante,
  e, por aluno, se precisa revisar (worker `alteracao_professor_loop`). Sem
  modelo, fica `pendente_analise`: nada é inventado, o aluno não vê selo e o
  professor decide no console (`alteracao_decidir`). Gabarito corrigido é
  recorrigido pelo banco e a nota só sobe. Revisão pedida guarda a nota de antes
  (`nota_anterior`) e `trailup_recalcular_nota_classe_aluno` usa a maior. Ela
  **nunca** mexe em `atividade_aluno.status`: o progresso continua concluído. O
  aviso sai por `notificacoes_ia`. `alteracao_professor` guarda o gabarito antes
  e depois e o aluno não a lê; ele lê só `alteracao_aluno`.
- **A nota média da matrícula é do banco** (`classe_aluno."notaMedia"`, `20261101_10`).
  Antes ninguém a gravava, e console, CSV de notas e modelo de evasão liam uma
  coluna vazia. A conta é `trailup_recalcular_nota_classe_aluno`:
  10 × pontos obtidos ÷ pontos possíveis. Prazo vencido sem entrega conta 0 até o
  professor dar nota, e **sem nada avaliado o resultado é NULL, não 0**. Quem
  dispara a conta:
  - o gancho em `trailup_recalcular_classe_aluno`;
  - `trailup_recalcular_notas_com_prazo`, de hora em hora pelo `pg_cron`
    (`trailup_notas_com_prazo`), para o prazo que vence sem ninguém gravar nada.

  O cliente não grava a nota. Quando `anon` ou `authenticated` escreve
  `"notaMedia"` sem a marca `trailup.nota_pelo_banco`, o gatilho
  `trg_classe_aluno_nota_pelo_banco` **ignora** o valor em silêncio: o UPDATE
  mantém o antigo e o INSERT grava NULL. Não há erro. NULL é "sem nota" em
  toda parte (faixa `sem_dado` nas views, fora da média da turma). Não volte a
  tratar "0 sem progresso" como sem nota.
- **Faixas de XP** (#143, `20261102_10`): `xp_faixa` guarda o piso e o título de cada faixa, e o
  nível é a posição pelo piso. O app lê `aluno_faixa_xp(p_classe_id)` e mostra o título e a barra no
  Perfil. Os limites e os títulos não existem no código do app: mudar faixa é mudar a tabela. O XP é
  o **da matrícula**, a mesma conta do critério `pontuacao` do rank e do CSV do professor, sem janela
  de período, e o negativo conta como 0. Os títulos são etapas da subida, não pessoas, para não ter
  gênero.
- **Peso do XP na nota final** (#143, `20261102_13`). É uma coluna **nova**,
  `classe_aluno.nota_final`. `"notaMedia"` não muda de sentido: continua sendo só
  o desempenho nas atividades, e é ela que o risco, a distribuição e o modelo de
  evasão leem. Pôr XP ali contaria o engajamento duas vezes no modelo.
  - **A conta**, decidida em 02/11: `nota_xp = 10 × min(XP, meta) ÷ meta` e
    `nota_final = max(notaMedia, (1 − peso) × notaMedia + peso × nota_xp)`.
    - É contra a **meta da turma**, não contra o maior XP: a nota de um aluno depende só dele.
    - O XP **só soma**: quem tem pouco XP fica com a nota das atividades.
    - `notaMedia` NULL dá `nota_final` NULL, porque XP sozinho não vira nota.
  - **A configuração** é por turma, em `classe.xp_peso_nota_pct` (0 a 50, **padrão 0**)
    e `classe.xp_meta_nota` (padrão 1000). O professor edita os dois no console, em
    Turmas → Editar. Com peso 0, `nota_final` é igual a `notaMedia`. O estudo de base
    usava 2,9%, e o número do piloto é do professor.
  - **Só o banco grava**, por três gatilhos:
    - `trg_classe_aluno_z_nota_final` refaz a nota final a cada gravação de nota e ignora o
      valor do cliente. O `z` é de propósito: o BEFORE roda em ordem alfabética, e este tem
      de ler a nota já filtrada pela guarda `trg_classe_aluno_nota_pelo_banco`;
    - `trg_eventos_aluno_nota_final` recalcula quando o XP muda, só em turma com peso;
    - `trg_classe_nota_final` recalcula a turma inteira quando o peso ou a meta mudam.
  - O CSV (`professor_notas_da_turma`) traz as duas notas.
- **Tentativas de atividade pelo relógio do banco** (#136, `20261101_13`):
  - `atividade_iniciar_tentativa` abre a tentativa e devolve a que já está aberta, então reabrir o app não zera o relógio;
  - `atividade_responder_tentativa` fecha a tentativa. Ela recusa prazo vencido e tentativas esgotadas (`atividades.tentativas_max`), decide `no_tempo` e grava `atividade_aluno`;
  - **toda atividade tem limite** (`20261102_08`): `tentativas_max` é `NOT NULL`, padrão 3, e um gatilho troca o NULL do console antigo pelo padrão;
  - vale a **última** tentativa. A nova tentativa reabre **só as questões erradas** (o app pergunta `atividade_situacao_tentativas`), e cada uma acertada vale o que `penalty_retry_pct` do professor deixa;
  - a segunda chance da loja **espera a tentativa grátis acabar**: `fn_loja_checa_limite` devolve `tem_tentativa_livre` antes de a compra ser consumida;
  - o cronômetro é ligado pelo perfil (`fn_cronometro_ligado`, mesma lista de `TIMER_PROFILES` do mobile), e o aluno ou a IA podem desligá-lo (`aluno_cronometro.origem`, RPC `aluno_definir_cronometro`);
  - **o tempo não mexe na nota, só no XP**: os eventos `atividade_no_tempo_70/80/90` pagam 10 pontos cada, são cumulativos, saem uma vez por atividade e só a RPC os grava (`trg_eventos_aluno_bonus_tempo`);
  - duração e tolerância ficam em `app_config` (`cronometro_atividade_padrao_seg`, `cronometro_tolerancia_seg`).

  **Limite conhecido:** a pontuação ainda é a que o app calcula, porque o gabarito
  continua no aparelho. A RPC só limita os valores. A escrita direta do app em
  `atividade_aluno` é fechada pela fase 5 (`20261102_04`, item abaixo).
- **E-mail sai do banco por um Google Apps Script** (`20261101_14`, no lugar da
  Brevo). Isso vale para o contato do app, o contato do site e o aviso de conta
  inativa:
  - todos passam por `fn_email_apps_script`, que lê URL e segredo do Vault e faz o `net.http_post`;
  - o código do script fica em `scripts/apps-script-email/`;
  - **um 2xx não prova envio.** O pg_net segue o 302 do Apps Script, e tanto o sucesso quanto o erro do script chegam como 200. Quem decide é `fn_email_apps_script_aceito`, que exige `"ok": true` no corpo. Uma regra que confie só no código HTTP começaria a contar o prazo de exclusão de quem nunca foi avisado.
- **`atividade_aluno`: só o servidor conclui e grava nota** (`20261102_04`, #136, fase 5).
  O app marca visita e "em andamento" e mais nada. Conclusão, nota, acerto, progresso e
  tempo saem de RPC ou gatilho `SECURITY DEFINER` (`atividade_responder_tentativa`,
  `avaliar_entrega`, o recálculo por resposta). Mais duas regras:
  - `questao_aluno` recusa a resposta do cliente depois do prazo efetivo (`prazo_expirado`),
    exceto na revisão pedida pelo professor;
  - `atividade_concluida`/`_acertada`/`_revisada` vindos do cliente exigem a atividade concluída.

  As três guardas decidem por `current_user`, não pelas claims. Por isso **função nova que
  escreva nessas tabelas precisa ser `SECURITY DEFINER`**, ou será tratada como o aluno. No
  UPDATE, a coluna nova de `atividade_aluno` nasce protegida; no INSERT, entra na lista da
  migration (o e2e reclama).
- `ia_uso_llm` — uso de modelo por chamada (`20261105_02`): prompt, provedor, modelo, tokens,
  tokens de cache e `fim` (motivo de parada). Sem aluno e sem texto, sem policy por decisão (só a API).
  Traz também `latencia_ms`, e `fim` vale `erro:<tipo>` ou `prazo_total` quando a chamada falha: cobre
  tudo o que a API chama. **Não grave o microservice aqui:** ele já mede em `usoDoModelo.ts` e o uso
  chega ao alvo da fila por `uso_do_modelo.py`, então contaria em dobro. Gravar nunca derruba nem atrasa
  a resposta (`app/services/uso_llm.py`).
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
  **Horário e texto da revisão diária são do banco** (`20261102_01`): o job
  `notificacoes_recalcular_rotinas` (pg_cron, diário) põe a rotina 30 min antes
  do horário habitual (`notificacoes_horario_preferido`, dias distintos em
  `aluno_sessoes_app`) e troca o texto pelo modelo do perfil com o tópico em
  andamento. `hora_origem = 'aluno'` nunca é sobrescrita. A sugestão da IA
  traz `horario_sugerido`, e o gatilho de promoção decide o horário, sempre
  fora do silêncio no fuso do aluno.
  **Para quem e quando é do banco também** (#149, `20261102_18`): a matriz de
  Monterrat (`notificacoes_config.perfil_pesos_<tipo>`) barra tipo pelo perfil
  dominante, o silêncio do aluno barra pelo tipo, e `notificacoes_rank_varrer`
  (pg_cron) gera `rank`/`amigo_rank`, nomeando amigo só dentro do corte visível do
  rank. Em modo foco (explícito, `aluno_modo_foco`, ou atenção recente que a API
  grava em `aluno_estado_atencao`), nada é entregue: a pendente vira
  `gatilho = 'fim_foco'` e, na saída, colapsa por tipo, sob o teto diário.
  **Texto da IA só sai se a guarda de hoje o aprovou** (`20261102_24`). A guarda
  de `agente_notificacao` (#827) roda na geração, mas a sugestão espera na fila;
  o texto de 01/11, com "hipótese" e `[MOCK]`, saiu em 02/11. A API grava
  `contexto.texto_guarda` (`TEXTO_GUARDA_VERSAO`, também no aviso da intervenção),
  e `notificacoes_entregar` suprime a sugestão `origem = 'ciclo'` abaixo de
  `texto_guarda_versao_minima`. Endureceu a guarda? Suba as duas.
  **`novo_material` e `sequencia` também saem do banco** (`20261102_21`), por gatilhos que
  entram por `notificacoes_enfileirar_evento`. O de `novo_material` fica em
  `conteudo_personalizado` e avisa quando o tópico termina de gerar para o perfil
  dominante do aluno. O aviso sai **uma vez por aluno × tópico**
  (`notificacoes_material_pronto`), então regerar não é novidade. Turma retida pelo estudo
  e matrícula com menos de 24 h ficam sem aviso, e a turma recebe um aviso por dia. O de
  `sequencia` fica em `aluno_atividade_diaria` e avisa só nos marcos (`sequencia_marcos`),
  no instante em que o dia passa de `sequencia_minimo_min`. Os dois gatilhos nunca derrubam
  a geração nem o heartbeat.
- **Notificações do professor — também no banco** (`20261102_17`). `professor_notificacoes` é a caixa
  do console (sino no cabeçalho), **separada** das quatro tabelas do aluno acima: uma linha por assunto
  (`dedupe_key` única por professor), com `contagem` e `lida_em`, que volta a nulo quando o assunto se
  repete. Quem grava são gatilhos `SECURITY DEFINER` (recomendação da IA em `intervencoes`, dissertação
  em `questao_aluno`, job de geração `failed`/`partial`, evento `encerrado`), e **nunca derrubam a
  transação de quem os causa** (`EXCEPTION WHEN OTHERS` → `WARNING`). O cliente só lê e muda `lida_em`
  (GRANT por coluna, sem policy de INSERT). Risco de reprovação **não** notifica: é calculado na hora,
  não há evento de banco para ligar um gatilho.
- **Painel técnico (#21, `20261102_22`) — só o dono, e a API fica de fora.** `painel_tecnico(horas)` agrega
  fila, erro e latência por formato e os quatro gatilhos do §11 (`ok`/`alerta`/`sem_dado`), com o **mesmo
  SLO da #14** (`app_config.personalizacao_kpi_slo`). Confere `app_e_dono()` antes de qualquer leitura e só
  agrega (nenhum `aluno_id`, nenhum texto de erro). Duas regras de honestidade: **o que o banco não mediu é
  `sem_dado`, nunca `ok`** (o que a tela não entende também), e o gatilho de custo é um **proxy**
  (execuções por alvo), porque tokens e custo em dinheiro não são gravados. A divergência de progresso é o
  resultado das invariantes (`metricas_invariante_resultado`). Disponibilidade = quando cada worker mexeu
  por último; o banco não enxerga a API. O aviso ao dono sai pelo sino (`20261102_23`): o `pg_cron`
  chama `painel_tecnico` (**a mesma conta da aba**, com o e-mail do dono posto nas claims só dentro da
  transação, por uma função sem EXECUTE para cliente) e grava **um aviso por gatilho em `alerta` por dia**
  em `professor_notificacoes`; `sem_dado` não avisa.

- **Missões sugeridas pela IA (#151, `20261102_20`) — a IA propõe, o banco decide o que entra, o
  professor aprova.** Reaproveita `missoes` (`origem = 'ia'`, `aprovacao = 'pendente'`); o `CHECK`
  `missoes_ia_exige_aprovacao` impede uma missão `ia` com `nao_requer`, então nada chega ao aluno sem
  decisão (a policy `missoes_aluno_sel` só entrega `ativa` + `nao_requer`/`aprovada`). O pedido é do
  professor, **nunca automático**: `missao_ia_pedir` grava em `missoes_ia_pedidos` e o worker da API
  (`app/services/missoes_ia.py`, fila no banco como `alteracao_professor`) atende quando puder. Padrão,
  faixa e teto estão em **`app_config`** (`missao_ia_padrao`/`_min`/`_max`/`_pedidos_por_dia`, privadas),
  não em constante. A API não escreve em tabela: passa o que o modelo devolveu a `fn_missao_ia_registrar`,
  que descarta métrica fora do catálogo (`fn_missao_ia_catalogo`, **o único lugar** com a chave de
  parâmetro de cada métrica; a chave errada não dá erro e a missão fecha na hora para todos), alvo
  não inteiro ou acima do teto, link/e-mail e título repetido (inclusive recusado). `missoes_ia_log` é só
  de acréscimo: proposta, aprovação e recusa com o motivo; a taxa de aprovação sai dele e **não realimenta
  o prompt**. Fora de escopo: editar antes de aprovar (`trg_missoes_guarda` congela o texto da missão que
  não é do professor, em silêncio), missão de entrega e prazo.
  
- **`boss_falas` — a IA escreve, o professor pode tirar do ar** (`20261102_19`). Nome e falas do boss
  são gerados em lote por conteúdo × perfil e o app os mostra ao aluno (inclusive menor) direto. O
  professor lê no editor de conteúdo e liga/desliga (`ativa`; **só** essa coluna tem GRANT de UPDATE: o
  texto é validado pela API e não se edita pelo console). Quem esconde a fala desligada do aluno é a
  **policy de leitura dele**, não o app, então build antigo também obedece. A API religa ao reescrever a
  linha: texto novo é texto que ninguém leu.
- **Eventos de turma abrem e encerram no horário pelo banco (#141).**
  `pg_cron` roda `fn_eventos_classe_varrer()` a cada minuto (job
  `trailup_eventos_classe_varredura`, migração `20261025_04`): encerra e apura
  todo evento `aberto` com `fim` vencido e abre o `rascunho` marcado com
  `abrir_no_inicio` quando o `inicio` chega. Os miolos sem sessão
  (`fn_evento_classe_abrir_agora` / `_encerrar_agora`) travam a linha e decidem
  pelo estado — clique e cron ao mesmo tempo não creditam duas vezes; as RPCs
  do console só conferem a posse e delegam. Nada com relógio na API.
- `notificacoes_config` (parâmetros do motor, uma linha por chave),
  `expo_tokens` (push token por aparelho — tabela que **já existia**; a
  `notificacoes_dispositivos` que eu havia criado foi descartada em
  `20260826_07` por duplicá-la), `aluno_sessoes_app` (histórico de login) e
  `aluno_atividade_diaria` (tempo de uso por dia).
- `pesquisa_arquivo` — **arquivo da pesquisa no R2** (`20261104_02`, #17). O R2 em `pesquisa/` é a
  base da pesquisa: cada sessão, lote e evento de quem consentiu pesquisa
  (`aluno_finalidade_permitida(aluno, 'pesquisa')`) é copiado para lá pela Edge Function
  `pesquisa-arquivar`, que o pg_cron dispara a cada 10 min. Arquivar não tem modelo, então não passa
  pela API. Duas regras que não se negociam:
  - **prazo nunca apaga o arquivo.** A retenção só tira do Postgres a telemetria de quem consentiu
    depois que a cópia existe (`pesquisa_arquivo_pode_sair`, no `filtro` das políticas), e nada de
    `pesquisa/` entra na fila de exclusão por prazo nem no ciclo de vida do R2;
  - **pedido do aluno apaga — e a pesquisa fica com a cópia anônima** (`20261104_03`). O
    `BEFORE DELETE` em `alunos` transforma cada objeto de quem consentia num pedido em
    `pesquisa_anonimizacao` (sal aleatório por exclusão + perfil dominante); o identificável só vai
    para a `retencao_fila_externa` **depois** que a Edge Function grava a cópia em
    `pesquisa/anonimo/`, ou quando o pedido passa de 7 dias. Não tente segurar a exclusão pela
    fila externa: item "ainda referenciado" é marcado como processado e nunca mais volta.
    Revogar o consentimento de pesquisa apaga o identificável **sem** cópia anônima.

  `telemetria/` (o payload que a API tira do Postgres) **não** é o arquivo: é armazenamento primário
  e segue o prazo. Sem FK para turma de propósito — apagar a turma apaga a telemetria em cascata, e o
  arquivo tem de sobreviver a isso.

  **Agregado de pesquisa só conta quem consentiu** (`20261104_04`): `estudo_indicadores_janela`
  (logo `metricas_estudo_coortes`) e `metricas_perfil_formato` filtram a população por
  `vw_alunos_pesquisa_elegiveis`. Os painéis de engajamento do professor
  (`metricas_engajamento_turma`, `_coortes_turma`) **não** filtram, de propósito: são a turma dele, e
  o número tem de bater com a lista. Agregado de pesquisa novo usa a view; a ingestão não muda.
- `personalizacao_item_progresso` — progresso por item (merge: percentual/acertos = máx, tempo = soma).
- `aluno_perfil`, `perfil` — perfis BrainHex e afinidades.

## Guardrails dos chats (mentor do aluno e Lumi do professor)

Os dois recebem `historico` do cliente a cada pergunta, e a conversa não é gravada. Esse texto entra
limpo e limitado (`app/schemas/entrada_chat.py`). O mentor **corta** em vez de recusar, porque o app
instalado não limita o campo; a Lumi recusa com 422, porque o console já limita.

**Fala da IA só conta assinada** (`app/services/assinatura_chat.py`): a resposta sai com um HMAC preso
ao usuário e ao chat, com chave derivada do `supabase_jwt_secret`. Fala da IA sem assinatura válida
fica de fora nos dois chats. App que ainda não assina continua sendo respondido, só sem as falas
anteriores do Guardião; `personalizacao.chat.falas_sem_assinatura` no log mostra quantos são.

> **O cliente devolve o texto intacto.** O mobile ajusta o tom do `reply` para mostrar
> (`normalizeMentorReplyTone`), então guarda o original em `falaAssinada`
> (`mobile/src/components/ia/historicoDoGuia.ts`). Devolver o texto da tela invalida a assinatura em
> silêncio: a fala só some do contexto.

**Latência:** repetir só vale quando o modelo respondeu mal (schema, guardrail, resposta cortada).
`ProvedorIndisponivelError` e recusa vão direto ao fallback, e o juiz de grounding fora do ar também:
resposta que ninguém conferiu não chega ao aluno (`GuardrailViolation.definitiva`). `chat_prazo_total_seconds` limita a
resposta inteira, juiz e rodízio de chaves inclusive: um 503 percorre 4 chaves × 6 modelos, e sem o
teto o console desistia aos 75 s.

> **Resposta cortada parseia.** O `JsonOutputParser` do LangChain conserta JSON truncado, então
> `{"resposta": "A turma foi bem e o proximo pa` vira um dict válido, sem erro. Por isso
> `ainvoke_structured` confere o motivo de parada **também no sucesso**. A origem do motivo muda por
> caminho: callback (`response_metadata`), exceção do SDK da OpenAI no `json_schema`, `llm_output` na
> entrada recusada pelo Gemini e `incomplete_details` no RAG. Ao mexer, teste com o cliente de verdade
> e só a rede falsa (`test_guardrails_de_entrada.py`): chamar o callback direto esconde tudo isso.
>
> `RespostaBloqueadaError` não tem retry em `gerar_validado` (a mesma entrada seria recusada de novo);
> `RespostaCortadaError` tem, pedindo resposta mais curta. A Lumi passa por `gerar_validado` sem juiz de
> modelo, para não gastar cota: `checar_refs_existem` barra aluno inventado de graça. Sem resposta
> válida ela responde 503; não existe resposta de reserva com número de turma.

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

> **`telemetria_lotes.via` diz por onde o lote chegou** (`api` ou `direta`, `20261029_01`):
> o gatilho `trg_telemetria_lote_via` a preenche pelo papel de quem escreve (claims
> `authenticated` = mobile direto no Supabase; sem claims = API). `fallback_motivo`
> (`sem_url`, `rede`, `timeout`, `http_4xx`, `http_5xx`, `sem_sessao`, `desconhecido`)
> é o app quem manda e **nunca é obrigatória**: build antigo grava direto sem ela,
> e recusar o lote perderia telemetria — a falta só aparece na invariante I18.
> Linhas anteriores à migration ficam com as duas colunas nulas, de propósito.
>
> `via` diz por onde o lote chegou, **não quem o mandou**: qualquer API ligada ao
> banco de produção grava `api`, inclusive uma subida na máquina de alguém. Quem
> mandou está em `payload->'cliente'` (`app_version`, `build_profile` do
> `eas.json`, `ambiente`, `dev`, `plataforma`, `api_host`), carimbado no envio
> pelos dois caminhos (`mobile/src/services/telemetriaCliente.core.ts`). Lote de
> build anterior vem sem ele, e `cliente` inválido vira ausente: nunca custa o lote.

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
> `atividade_aluno` é **tempo ativo** (`trailup_tempo_telemetria_min`, soma de
> `active_sec` / 60 por escopo). A **conta** é uma só, mas três lugares a
> gravam, todos na `20261030_01`: o gatilho da telemetria
> (`trailup_sync_tempo_da_telemetria`, `trg_tme_sync_tempo_*`), que depois
> recalcula a matrícula onde o tempo do tópico mudou, e as duas RPCs do
> cronômetro (`trailup_registrar_sessao_estudo` e
> `trailup_registrar_intervalo_estudo`), quando criam ou tocam a linha. Mudar a
> conta é mudar os três. Nenhum cliente escreve essa coluna. `estudo_sessoes` (e `estudo_intervalos`) é presença e sessões, não
> tempo de estudo; `tempo_direto_min` é livro-caixa e não entra na conta. A
> `20260921_01` tinha decidido o contrário (tempo = sessões do cronômetro); a
> D-1 da spec de métricas reverteu. Medido no aluno de QA: tempo ativo 7,68 min,
> material aberto (`dwell_sec`) 35,63, sessões do cronômetro 68,40, e o que a
> coluna mostrava, 45,04 (17,90 de `tempo_direto_min`).

> O histórico em `aluno_mental_state_history` **é lido de volta** (isto já foi
> descrito aqui como lacuna aberta; não é mais). `memoria_aluno.ler_memoria`
> chama `MentalStateHistoryRepository.listar_por_aluno` e
> `state_builder.build_initial_state` põe o resultado no estado inicial do
> grafo. **Só chega aos nós porque `memoria_aluno` está declarada em
> `TrailUpState`**: chave fora do schema é descartada em silêncio na entrada
> do LangGraph, e até a #64 foi o que aconteceu — todo nó lia `None`. Quem usa:
> `agente_ui` (tema de suporte), `agente_intervencao` (grava em `intervencoes`
> com escopo aluno e, se for o caso, sugere notificação em `notificacoes_ia`) e
> `agente_cronometro` (#136: desliga o cronômetro das atividades por 3 das
> últimas 5 tentativas cronometradas fora do tempo, lidas em
> `desempenho_recente.tentativas`, e não lê o histórico; só desliga, e a escolha
> do aluno vence — o UPSERT confere `origem <> 'aluno'` na própria escrita).
> Fora do grafo, `professor_risco_reprovacao_turma` lê a mesma tabela
> (`20261102_10`).
>
> **O que a tabela guarda é estado de estudo, não emoção** (DAT-45, desde
> 02/11): `analysis_runner` grava um registro por ciclo, `abandono`,
> `dificuldade` ou `sem_alerta` (`app/services/estado_de_estudo.py`). Antes ela
> receberia o `mentalState` do `ai_patch` (`anxious` saído de nota baixa), mas
> nenhum caminho de produção o gravava, e a tabela estava vazia. Não volte a
> gravar emoção inferida aqui: a intervenção diria ao professor algo que ninguém
> mediu. O nome da tabela ficou por compatibilidade.
>
> Quatro detalhes que não são óbvios:
>
> - **`sem_alerta` também é gravado.** Sem ele, a janela pularia os ciclos sem
>   problema e juntaria alertas de semanas diferentes.
> - **A leitura é uma janela, não o histórico.** `listar_por_aluno` vem com
>   `limit=_JANELA_RECORRENCIA` (5). Recorrência é 3 dos **últimos 5** registros
>   com o mesmo alerta (`dificuldade` ou `abandono`) — não "3 vezes desde
>   sempre". Aumentar a janela muda o significado do sinal, não só a
>   sensibilidade.
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

> **O executor do grafo não grava o perfil do aluno** (02/11). O `agente_perfil`
> continua inferindo e o `perfil_update` fica no estado (a trilha e o resumo em
> `iaDescricao` o leem), mas `aluno_perfil` e o modo do aluno
> (`alunos.modooperacao_id`/`modo_resposta`) só mudam pelo quiz e pelo próprio
> aluno. A regra de reserva só soma: um Seeker com acerto baixo vira Survivor em
> 3 ciclos e não volta. E `aluno_perfil` decide a missão do dia, as coortes por
> perfil do estudo (#13) e os alvos da personalização. O modo `imediato` trocaria
> a ordem da trilha. Até o #805 o executor nunca rodava em produção; quando passou
> a rodar, a gravação de perfil (`modoresposta` sem aspas) derrubou todo ciclo.
>
> **Cada escrita do executor vai num SAVEPOINT** (`_aplicar`): a que falha volta
> sozinha, fica no log (`executor.escrita_falhou`, só a primeira linha do erro,
> sem os parâmetros) e em `acoes_aplicadas` como `falhou:<ação>`, e o ciclo segue.
> A exceção é `MateriaisRepository.salvar`, que dá `commit()` no fim e por isso
> roda fora de savepoint. Escrita nova no executor entra por `_aplicar`.

## Convenções

- **Encoding: UTF-8 sem BOM, sempre.** Já houve mojibake (UTF-8 salvo como
  Windows-1252) commitado em `frontend`/`brainhex-navigator`. Nunca gravar texto
  PT-BR em outra codificação. `index.html` deve ter `lang="pt-BR"` + `notranslate`
  (tradução automática do navegador quebra o React — `removeChild`).
- **Telemetria é transversal:** qualquer correção em personalização deve manter o
  fluxo de coleta e a realimentação por ciclo intactos.
- **Não quebrar o existente:** os 7 perfis, o grafo LangGraph, os endpoints e os
  schemas JSONB são pontos de extensão — corrigir/estender, não reescrever.
- **Um ícone, um significado.** O mesmo ícone (ou arte) não pode representar duas
  coisas diferentes no app: o aluno aprende "medalha = conquista" e passa a ler
  errado tudo que reaproveita a medalha. Já aconteceu: o botão de missões da
  Trilha saiu com a medalha das conquistas no Conqueror e no Achiever, o rosto do
  guia (que marca "Você parou aqui") no Socializer e a bússola do mapa no Seeker.
  Antes de escolher ícone para uma coisa nova, procure o nome dele em
  `mobile/src` e `frontend/src`; se já tiver dono com outro sentido, escolha
  outro. Repetir é certo só quando o sentido é o mesmo — ícones de **estado**
  (check = concluído, cadeado = bloqueado, atualizar, fechar). Os ícones das
  missões estão em `mobile/src/components/missoes/variantesDoRastreador.ts`, e o
  teste ao lado falha se algum deles aparecer em outro arquivo do app. Vale também
  para nome na interface: "Campanha" já é o avanço na turma (métricas do perfil) e
  "Desafio" já é a métrica de atividades e o título da Ember — por isso as folhas
  de missões do Conqueror e do Daredevil não usam essas palavras.
- **RLS é a autorização, não defesa extra.** `anon` e `authenticated` têm GRANT
  de SELECT/INSERT/UPDATE/DELETE nas 84 tabelas — RLS é a única barreira. A
  posse está implementada (`20260826_08` a `20260826_10`):
  - **anônimo lê exatamente cinco linhas, e nada mais.** Este texto já disse
    "anônimo não lê nada — nem tabela nem view", e é o mesmo erro que o
    parágrafo das views descreve: afirmação categórica errada faz alguém tratar
    a exceção como defeito e "consertá-la".

    A exceção é `app_config`, pela policy `app_config_sel`
    (`USING (publico)`, só `SELECT`, para `anon` e `authenticated`). Hoje são
    cinco chaves públicas, todas parâmetro de UI: `prazo_atraso_fator`,
    `presenca_aula_pontos` e `rank_limite_visivel`, que o cliente precisa antes
    do login, e `cronometro_atividade_padrao_seg` e `cronometro_tolerancia_seg`,
    que o console mostra ao professor (`20261101_15`, #136). O app já mostra a
    duração na tela, e quem decide se a tentativa saiu no tempo é a RPC.

    **O que está `publico = false` é que importa:** `contato_envios_por_hora`,
    `credito_extra_maximo` e `conquista_recompensa_maxima` são tetos
    anti-abuso, e saber o teto ajuda a burlá-lo. Ao acrescentar chave em
    `app_config`, o default é `false` — marcar `publico` é decisão, não
    conveniência.

    Varredura que sustenta isso, de 2026-10-08 (dá para repetir): para cada um
    dos **121** objetos de `public` (tabela, view e matview), contar as linhas
    como `postgres` e como `anon`, dentro de `BEGIN/ROLLBACK`. Dos 49 com dado,
    o único em que `anon` vê linha é `app_config` (3 de 6, antes das duas chaves do cronômetro); 38 devolvem zero
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

  **As credenciais do R2 ficam só nos secrets das Edge Functions** (decisão
  de 02/11, #76). Quem gera arquivo (BrainHexPDF, API) pede a
  `storage-upload-url` uma URL assinada de `PUT`, com a chave de serviço, e
  sobe o arquivo direto no R2. A função só assina `brainhex/` e `fontes/` e
  nunca recebe o arquivo, porque tudo que sai de uma Edge Function conta como
  egress. Repassar o byte por ela, ou copiar do Storage para o R2 depois,
  pagaria a mesma conta que a migração existe para eliminar. O microservice
  faz o mesmo desde 03/11 (`microservice/src/services/r2Upload.ts`) e lê o
  markdown da retomada pelo gateway; antes ele assinava com `R2_*` próprias.
  A API também não tem mais `R2_*` (03/11): o payload bruto da telemetria
  (`telemetria/`, só `PUT`) e a retenção externa (`DELETE`) pedem a URL à mesma
  função, por `app/services/r2_storage.py`. `DELETE` também alcança
  `<uuid do professor>/...`, a fonte do professor que o script de cópia pôs no
  R2; `PUT` ali continua recusado. Quem pede `DELETE` confere o `metodo` da
  resposta: a versão da função anterior a isso ignorava o campo e devolvia URL
  de `PUT`, e um `PUT` vazio no lugar do `DELETE` zeraria o objeto.

  Essa premissa errada já quebrou o console duas vezes no mesmo dia: o deck
  baixado do Storage (corrigido em `htmlDeckSource.ts`) e uma checagem em SQL
  que marcou 100% das gerações novas como `failed` (revertida em
  `20260922_03`).
- **Nada de `SET` de sessão pela porta 6543 do pooler.** A `DATABASE_URL` passa
  pelo Supavisor em modo transação: o backend é compartilhado entre clientes e o
  estado de sessão **não é limpo**. Um `SET default_transaction_read_only = on`
  (ou o mesmo em `server_settings` do asyncpg) num script de medição "só
  leitura" deixou o backend somente leitura para todo mundo. A `20261102_07`
  falhou com `ReadOnlySqlTransaction` e a API ficou em 502 (02/11). Para ler
  produção com segurança, use `BEGIN READ ONLY` (`transaction(readonly=True)`),
  que morre com a transação, ou a porta 5432 (modo sessão). As migrações
  declaram `SET TRANSACTION READ WRITE` (`declara_leitura_e_escrita`), mas o
  resto da API não: com o backend envenenado, toda escrita dela falha.

  Pelo mesmo motivo, **nada de lock de sessão pela 6543**
  (`pg_advisory_lock`/`pg_advisory_unlock`). Cada transação pode cair num
  backend diferente: o `unlock` roda noutro, devolve `false` sem erro, e a trava
  fica presa no primeiro até o pooler reciclá-lo. Foi assim que a trava das
  migrações derrubou duas subidas da API em 02/11 (`statement timeout` em
  `pg_advisory_lock`, das 04:38 às ~04:43, sem migração nenhuma rodando). Use
  `pg_advisory_xact_lock` dentro da transação que precisa da trava, como faz
  `trava_de_migracao`.
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
- **Função usada em índice de expressão roda com o papel de quem escreve.**
  `REVOKE EXECUTE ... FROM authenticated` numa função que aparece em
  `CREATE INDEX ... ((fn(coluna)))` faz todo INSERT do cliente na tabela falhar
  com `permission denied for function` — e a API, que escreve como
  `service_role`, não vê. Foi assim que `trailup_caminho_arquivo` (`20261024_07`,
  índices da `_10`) tirou do professor a criação de conteúdo, mídia, questão e
  card por uma semana (`20261101_07`). Função pura em índice precisa de EXECUTE
  para quem escreve na tabela.

## Fontes de contexto (fora do código)

Antes de supor algo sobre o produto, o TCC ou o histórico, consulte:

- **Segundo cérebro do TCC** — [`docs/segundo-cerebro/`](docs/segundo-cerebro/README.md)
  (vault Obsidian; abra a pasta como vault para os `[[links]]` funcionarem):
  `00-Home` (MOC) · `01-Arquitetura` (mapa do monorepo e deploys) ·
  `02-Timeline` · `03-Glossario` · `04-Drive` (inventário + IDs do Drive) ·
  `05-PRs-Repos` (repos, syncs, análises de PR) · `06-Monografia` (plano de
  capítulos) · `07-Parceiros` (papéis dos bots) · `08-Infra-Supabase` ·
  `09-Testes-Reflect` (Reflect só contra Docker local) · `10-Incidentes`
  (console vazio de 01/10 e drift de migrations).
  O vault **Segundo Cérebro Reuniões** é outra base e não entra no repo.
- **Documentos do TCC** — capítulos consolidados em [`docs/tcc/`](docs/tcc/README.md);
  cópias em texto dos originais do Drive (proposta, UX, TCC 1, monografia,
  relatório técnico) em [`docs/tcc/fontes-drive/`](docs/tcc/fontes-drive/README.md).
  O Drive é a fonte de verdade desses textos.

  > **O projeto desistiu do PRISMA** (02/11). Não descreva a revisão da
  > literatura como "registrada segundo o PRISMA 2020" nem cite fluxograma ou
  > contagem PRISMA em texto novo (resumo, artigo, monografia). A monografia e
  > `docs/rag/avaliacao-documentos.md` ainda falam em PRISMA: é texto anterior à
  > decisão, não precedente. A planilha de 47 documentos continua sendo a base
  > de leitura (24 aprovados entre os 28 já decididos; 19 pendentes) — chame de
  > análise crítica da literatura.
- **Google Drive:**
  [documentação TrailUp (raiz: TCC 1, TCC 2)](https://drive.google.com/drive/folders/1-hMe8qKLGvPTtDZ-b0HlvbSRwQhtZtug) ·
  [Segundo Cérebro](https://drive.google.com/drive/folders/1RiqTibVR9MTl9aYKAWs6g7dM1gSUcNqc) ·
  [espelho do vault (Segundo-Cerebro-TCC-TrailUp)](https://drive.google.com/drive/folders/1WNbaeGg2VS3p8BfCtGlnf_XW29jUZIxW).
- **Sprint** — planejamento e relatórios em [`docs/sprint/`](docs/sprint/); os
  relatórios semanais publicados ficam em
  `https://geisbelly.github.io/TrailUp/sprint/relatorio-semanal-AAAA-Www.html`
  (ex.: [W42](https://geisbelly.github.io/TrailUp/sprint/relatorio-semanal-2026-W42.html)),
  com `-apresentacao.html` e `.pdf` ao lado.
- **Supabase:** projeto **TraiUp**, ref `xrebtkmdewolzmpsdwgh` (plano Free,
  sem PITR nem backup diário baixável). Chaves e `DATABASE_URL` só no `.env`
  — nunca em doc, commit ou chat.
- **Repositórios:** `BitStudioLabs/trail-up` é o canônico (PRs aqui).
  [`Geisbelly/TrailUp`](https://github.com/Geisbelly/TrailUp) é o espelho
  (sync da `main`, CI badge e GitHub Pages dos relatórios) — não abrir trabalho lá.

  **O site no ar sai do espelho, não do Lab.** O Vercel de `trailup.vercel.app`
  publica a `main` do `Geisbelly/TrailUp`. PR mesclado no Lab **não aparece no ar**
  até o espelho receber a `main` do Lab; conferir produção antes disso mostra a
  versão velha. Por isso, **toda vez que a `main` do Lab avançar, abrir o sync no
  espelho na mesma hora**, no formato dos anteriores:
  - remoto `espelho` → `Geisbelly/TrailUp`; branch `sync/lab-<sha curto>` a partir
    de `espelho/main`; `git merge origin/main` (sem rebase, sem force-push);
  - título `sync: Lab main até <sha> (#PRs)`; corpo com os commits trazidos, as
    **migrations novas** (e se produção já as tem), os conflitos e como foram
    resolvidos, e o que foi verificado;
  - o merge é da Geisbelly, como no Lab. Só depois do deploy conferir no ar.

  Migration de PR do Lab costuma ser aplicada em produção antes de chegar ao
  espelho. Enquanto o espelho estiver atrás, o banco está à frente do código no ar;
  quanto mais tempo o sync demora, maior essa janela.

  **E essa janela derruba a API.** A API roda `alembic upgrade head` ao subir
  (`database_migrations_on_startup`, ligado por padrão; `lifespan` de
  `app/main.py`). Se o código publicado não conhece a revisão gravada no banco
  (`Can't locate revision`), ou se a `main` tem duas cabeças (`Multiple head
  revisions`), o `lifespan` aborta e o Traefik devolve 502. Foi assim em 28/10
  (duas cabeças) e em 01/11 (`_10` e depois `_13` aplicadas com o espelho atrás).
  Ver `docs/segundo-cerebro/10-Incidentes/api-fora-por-migration-2026-11-01.md`.
  Então:
  - ao aplicar uma migration em produção, avisar que a API só pode ser reiniciada
    depois que o código dela estiver no espelho, e abrir o sync na mesma hora;
  - depois de todo merge com migration, conferir `alembic heads` na `main`. Duas
    PRs abertas ao mesmo tempo costumam pegar o mesmo número de revisão.
- **Deploys:**
  - **web:** `https://trailup.vercel.app`, publicada do **espelho** (acima). Não usar como alvo de regressão do console.
  - **API:** Dokploy (VPS), em `https://api.trailup.promora.dev.br` (Let's Encrypt, #689). A evidência de 01/11 é que ela também publica do espelho. O `*.traefik.me` tem certificado autoassinado: o fetch do aparelho falha como erro de rede.
  - **local:** `npm run docker:up` (`:8080` / `:8000` / `:3000`).
- **Mais docs do repo:** [`docs/README.md`](docs/README.md) (índice),
  [`docs/MANUAL.md`](docs/MANUAL.md),
  [coleta de métricas](docs/architecture/coleta-de-metricas.md),
  [schema não versionado](docs/architecture/schema-nao-versionado.md),
  [`docs/rag/`](docs/rag/) e `graphify-out/` (abaixo).

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

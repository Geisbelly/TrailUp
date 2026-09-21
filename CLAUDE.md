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
> **O mobile ja fechou o lado dele (`20260916`).** `profileShellTheme.ts` nao
> mistura mais a cor-assinatura no fundo: `THEME_TONES` (`real`/`medieval`/
> `magica`) saiu inteira, e a superficie e uma constante — `Noite.n900/800/700`
> em `mobile/src/styles/identidade.ts`, medida na pasta de identidade do Drive.
> O perfil vira **acento**, e `ensureMinContrast` roda contra `Noite.n700` fixo.
>
> Consequencia medida: o accent de cada perfil virou **um numero**, e dois deles
> ficaram MAIS fieis do que eram — Seeker era clareado de `#17a398` para
> `#1ab5a9` e Socializer de `#f4623a` para `#f68161`; agora os dois chegam
> intactos, porque o chao escuro constante ja da contraste. Backend e frontend
> **continuam calculando os deles** contra superficies proprias: a divergencia
> encolheu de tres pontas para duas, nao acabou.
>
> Dois detalhes que nao sao acidentais:
>
> 1. **Os tokens moram em `identidade.ts`, sem import nenhum.** `GlobalStyle.ts`
>    importa `react-native` por causa de `Platform`, e isso impede o harness de
>    teste do node de carregar. Cor e dado, nao runtime — `GlobalStyle`
>    reexporta para quem ja importava de la.
> 2. **`Aco` (`#527a8e`) e cor de icone e ornamento. Texto nunca.** Da 4,20
>    sobre o fundo e 3,27 sobre a elevada: passa como componente de UI e reprova
>    como texto. E o mesmo vale para o piso de texto da ficha (`#7d8794`, 4,15
>    sobre a elevada) — por isso ele passa por `ensureMinContrast` antes de
>    virar token, em vez de ser copiado cru. Ha teste cobrindo os tres niveis
>    contra as tres superficies (`profileShellTheme.test.ts`).
>
> **A tipografia agora é Jost + Karla, empacotadas.** `expo-font` estava nas
> dependências e nunca era usado: não havia `.ttf` nem `useFonts`, e as famílias
> saíam de `Platform.select` apontando para Georgia/Palatino. Entram por
> `@expo-google-fonts/jost` e `/karla`, carregadas uma vez em `_layout.tsx`.
>
> Três coisas que importam ao mexer aqui:
>
> 1. **As três chaves ornamentais apontavam para a MESMA serifa.** `inikaBold`,
>    `inknutAntiquaMedium` e `poppinsExtraBold` eram todas `ornamentalSerif` —
>    não havia hierarquia de peso, só de tamanho. Por isso mapear as três para
>    `Fontes.titulo` não perde nada, e Jost 600 contra Karla 400 *acrescenta*
>    hierarquia que não existia.
> 2. **O gate libera em `loaded || erro`, nunca só em `loaded`.** Fonte que não
>    carrega faz o React Native cair na do sistema sozinho; travar o app nisso
>    transformaria um defeito cosmético em tela branca.
> 3. **Nome de família errado não quebra nada — e é por isso que é perigoso.**
>    O app sobe inteiro e renderiza na fonte do sistema, calado. As chaves de
>    `FONTES_DA_IDENTIDADE` saem de `Fontes` por propriedade computada, e há
>    teste conferindo os dois lados (`fontes.test.ts`, `globalStyleColors.test.ts`).
>
> O que **não** veio junto: o *tracking* largo da ficha. `letterSpacing` é prop
> de estilo por chamador, não viaja na família — aplicá-lo exige decidir, entre
> os 425 usos, quais são rótulo de seção. É trabalho de escala de tipo, não da
> troca de fonte.
>
> **O inimigo do painel de batalha tem paleta própria, e ela não é a do
> perfil.** O *chrome* de `IABattlePanel` lê `palette.*` normalmente (25 vezes),
> mas as cores do boss vêm de `IAEnemyVisualSpec.palette`, enviada pela IA.
> Isso é deliberado: o boss é o adversário, não o aluno — trocar o tema do app
> não muda o inimigo, e não deve mudar.
>
> **O fallback do mobile é um espelho, e até `20260916` ele não casava com
> nada.** `buildFallbackVisual` decidia por substring (`includes("mech")`,
> `includes("scholar")`, `includes("beast")`) sobre quatro presets, enquanto a
> API manda sete archetypes — `night-stalker`, `fallen-usurper`,
> `arena-tyrant`, `shadow-puppeteer`, `void-entity`, `chaos-saboteur`,
> `toxic-demagogue`. **Nenhum dos sete contém nenhuma das substrings**, então
> todo boss caía no default laranja, qualquer que fosse o perfil. Não aparecia
> porque o caminho só roda quando o patch chega SEM `visual`, e a API sempre
> manda um.
>
> Hoje são duas tabelas — `PRESET_POR_ARCHETYPE` e `BOSS_PRESETS` — copiadas
> **literalmente** de `_PROFILE_PRESETS` e `_PALETTES`, inclusive a falta de
> acento nos rótulos ("Ameaca", "Mente Sombria"). A cópia literal é o ponto: o
> fallback tem de ser indistinguível do que a API manda, senão o boss muda de
> cara conforme o patch trouxe `visual` ou não. Dois testes no lado da API leem
> o `.tsx` e falham se divergir (`test_mobile_casa_os_sete_archetypes`,
> `test_mobile_espelha_paleta_e_rotulo_de_cada_preset`).
>
> Corolário do acento: os rótulos e as falas do boss em
> `behavioral_personalization.py` são **todos sem acento** ("Cada passo seu
> alimenta a perseguicao deste modulo"), e chegam ao aluno assim. É convenção
> do arquivo inteiro, não deslize de uma linha — corrigir é trocar o arquivo
> todo de uma vez, com o espelho do mobile junto, nunca meia dúzia de strings.

> **A arte do combate sai de um catálogo em Python, nunca do LLM.**
> `IAEnemyVisualSpec` (`mobile/src/interfaces/personalizacao/IAContracts.ts`)
> tem `avatarUrl`, `backgroundUrl`, `frameUrl` e `effectUrl`, e `IABattlePanel`
> **renderiza os quatro** — fundo na linha 230, efeito na 231, moldura na 277
> com `resizeMode="stretch"`. Até `20260916` o prompt emitia `null` nos quatro,
> então o painel sempre desenhou o inimigo por preset procedural.
>
> Quem preenche é `app/services/arte_combate.py`: uma tabela `preset -> peça`,
> URL montada sobre `settings.arte_base_url`. O modelo recebe o catálogo no
> payload (`arte_de_combate`) e **pode trocar a cena por outra da lista**, mas
> qualquer URL fora dela é descartada em `sanear_patch`, que roda antes da
> validação. O motivo é concreto: URL inventada dá 404, e `Image` do React
> Native falha **calado** — o aluno vê um buraco onde estaria o boss.
>
> Três coisas que não são acidentais:
>
> 1. **Sem `arte_base_url`, as quatro voltam a `None`.** É o comportamento
>    anterior, não um meio-termo quebrado. Mesma disciplina de `ler_config_r2`.
> 2. **`enemy.avatarUrl` é saneado junto com `visual.avatarUrl`.** O mobile lê
>    `visual?.avatarUrl ?? enemy.avatarUrl`: sanear só um deixa a URL descartada
>    voltar pelo outro lado.
> 3. **A arte vai para o R2, não para o Supabase Storage.** O projeto está em
>    overage de egress e o Storage é 99,9% dele; arte é baixada toda sessão.
>    Sobe com `scripts/subir-arte-de-combate.py`, que tira a lista de arquivos
>    **do catálogo** e recusa rodar se faltar peça.
>
> Preset novo em `_PROFILE_PRESETS` exige entrada em `_ARTE_POR_PRESET` — há
> teste guardando (`test_todo_preset_de_perfil_tem_arte_no_catalogo`), porque
> sem ele o boss do perfil novo nasceria sem imagem e calado.
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
  > **`ativo` não é enfeite: a regeração APOSENTA a linha velha, não a apaga.**
  > A consulta do mobile não filtrava, e o aluno recebia a versão obsoleta junto
  > com a atual, como duplicata. Medido: 48 das 228 linhas inativas, 6 delas no
  > perfil do aluno contra 18 ativas — um terço a mais de card, todo vencido.
  > `ativo = false` casa exatamente com `obsoleto_em` preenchido (48/48), a
  > coluna é NOT NULL com default `true`, e por isso o filtro é `.eq("ativo",
  > true)` e não `.is`.

> **O perfil de um material sai da COLUNA, e a cadeia de reserva termina num
> default perigoso.** `conteudo_personalizado.brainhex_profile_key` é a chave do
> unique `(aluno, tópico, perfil)` e está preenchida em 100% das linhas. Mesmo
> assim ela ficou **fora do SELECT** do mobile por muito tempo, então o elo mais
> autoritativo de `perfilDoRegistro` chegava sempre `undefined` e a decisão caía
> nos fallbacks do `plano` — cuja última saída é `PERFIL_PADRAO = "mastermind"`.
>
> O default não é `null` nem erro: uma linha que perca a origem do perfil é
> arquivada como mastermind, **some para o dono dela e aparece para quem não é**.
> Na base já há uma linha assim (id 3608, `pronto`, coluna `mastermind`, `plano`
> sem chave nenhuma) — hoje ela acerta por sorte, porque o default coincide.
>
> A lógica mora em `utils/perfilDoMaterial.ts`, extraída de
> `TrailupApiProvider.ts` pelo mesmo motivo de `acumuladorLote.ts`: o provider
> importa `@/database/supabase` no topo e não carrega em node, então a regra que
> decide **o que o aluno vê** não tinha teste nenhum.
>
> Ao mexer: a coluna vem primeiro, e ela só serve se estiver no `select()`.
> Cards não têm coluna — a chave deles mora em `metadata`, que já é selecionado.

> **`alunos.perfil_ativo` e a maior afinidade em `aluno_perfil` podem
> discordar.** Medido: o aluno da base tem `perfil_ativo = conqueror` com
> `mastermind=85, conqueror=60` — ou seja, o dominante por afinidade é outro.
> `resolveActiveBrainHexProfile` (`utils/brainHex.ts`) resolve isso preferindo
> `perfil_ativo` **quando ele está entre os dois representativos**, e só cai no
> dominante quando não está. Não é bug, é a regra — mas quem for comparar
> "o perfil do aluno" com `brainhex_profile_key` precisa usar a MESMA função que
> o app usa, e não ler `perfil_ativo` cru nem o `max(afinidade)`.
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
- `telemetria_time_metric_entries` — tempo por escopo, **cinco** desde
  `20260920_01`: `topic`, `content`, `activity`, `question`, `material`. O
  `scope` é guardado por CHECK — escopo novo sem ampliar o CHECK é recusado com
  23514, e o cliente trata erro não-rede caindo no gravador direto, que grava na
  mesma tabela e leva o mesmo 23514: o escopo novo ficaria invisível e calado.

  > **`CREATE OR REPLACE FUNCTION` também não preserva `SET search_path`** — a
  > mesma armadilha que `CREATE OR REPLACE VIEW` tem com `security_invoker`. Foi
  > por isso que `telemetria_resolver_entidade` e `telemetria_id_do_item_key`
  > atravessaram a `20260826_17`, a `20260830_01` e a `20260920_01` sem a
  > cláusula: ela tem de ser **redeclarada a cada replace**, e o linter só a
  > cobra depois.
  >
  > **Mas para acrescentar a cláusula, a ferramenta certa é `ALTER FUNCTION`.**
  > `ALTER FUNCTION f(args) SET search_path TO 'public', 'pg_temp'` muda a
  > configuração **sem tocar no corpo**: medido numa transação revertida sobre
  > 26 funções, `prosrc`, `proacl`, `prosecdef` e `provolatile` ficaram
  > idênticos nas 26, e só `proconfig` mudou. A `20260920_02` usou
  > `CREATE OR REPLACE` nas duas primeiras e teve de provar por md5 que não
  > perdera nada; a `20260920_03` fez as outras 26 por `ALTER` e não teve o que
  > provar. Ao pinar função existente, **não reescreva o corpo**.
  >
  > Cuidado ao conferir: `pg_get_functiondef` sempre emite o corpo entre
  > `$function$`, qualquer que tenha sido a tag do `CREATE`. Comparar o texto
  > cru com o da migração acusa diferença onde não há — normalize a tag (e os
  > comentários) antes de concluir que o corpo divergiu. E note que o próprio
  > `pg_get_functiondef` passa a incluir a linha do `SET`: para comparar corpo,
  > use `prosrc`, que é só o corpo e que `ALTER` não altera.

> **Função com cara de viva que está quebrada há tempo.** `fn_trilha_by_classe`
> (`SECURITY DEFINER`, exposta em `/rest/v1/rpc/`) lê `public.v_trilha_topicos`,
> **que não existe nesta base** — qualquer chamada estoura com 42P01, e não é
> `search_path`: a referência está qualificada. Não há um chamador sequer no
> monorepo (`mobile/src`, `frontend/src`, `api/app`, `docs/**/sql`). Achada ao
> exercitar as funções depois de pinar o caminho — o teste que só lê catálogo
> nunca teria encontrado. É o mesmo padrão de `progressoTrilha.ts` e do fallback
> do rank, agora do lado do banco.
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
- `guilda_desafios` + `guilda_desafio_questoes` + `guilda_desafio_respostas` +
  `desafio_participantes` — a **Arena**. `formato` (`guilda`/`dupla`/`solo`) diz
  quem joga; `modo` (`todos`/`velocidade`/`precisao`) diz como se ganha. O
  acesso é **só por RPC**: as dez tabelas de guilda têm RLS ligada e **zero
  policy**, e `authenticated` lendo direto recebe nada. É deliberado — não crie
  policy aqui, crie RPC `SECURITY DEFINER`, e tire o `anon` dela na mesma
  migração. `guilda_desafio_respostas.tempo_ms` é a **latência da tentativa**
  (questão aparece → aluno confirma), a mesma grandeza de
  `questao_aluno.tempo_gasto_seg`; não é permanência de telemetria, e é ela que
  desempata o modo `velocidade`.
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

> **`active_sec` só passou a medir isso em `20260920`.** O limiar de ócio era
> 15s depois do último toque, e ler não produz toque: quem rola a tela a cada
> 20-40s, quem ouve o áudio do Guardião e quem passa slide caíam todos em
> `idle`. Medido antes da correção: 336s de permanência nos materiais contra
> 146s de ativo — **57% do tempo de estudo descartado** —, e `active_sec` é o
> único insumo de `trailup_tempo_telemetria_min`, que é o único escritor de
> `tempo_gasto_min`. O WPM saía pelo mesmo fator inflado, o suficiente para
> classificar como `skimming` quem lia devagar.
>
> **A correção seguinte foi para 120s, e 120s também estava errado — pelo motivo
> oposto.** Eu amarrei o coletor ao número que o pipeline usa, e até escrevi um
> teste exigindo que fossem iguais. São perguntas diferentes:
>
> | quem | pergunta | número |
> | --- | --- | --- |
> | pipeline | "o aluno travou?" | 120s, classificação de emoção |
> | coletor | "isto conta como tempo de estudo?" | limite de **abandono** |
>
> Ler um enunciado, pensar numa questão e ouvir o Guardião não produzem evento
> nenhum — `trackInteraction` só é chamado por toque, scroll e sinal. Depois de
> 120s parado estudando, o lote inteiro virava ócio, e continuava assim até o
> próximo toque. Medido na base: **784 dos 1003 segundos viraram ócio**, 42 das
> 69 linhas sem um único toque, e lotes seguidos chegando com
> `dwell 64 / active 0`.
>
> Hoje o limite chama-se pelo que de fato detecta — `LIMITE_DE_ABANDONO_MS`, em
> `acumuladorLote.ts` — e vale **10 minutos**. Ele é a rede embaixo, não a
> medida: perder o foco da tela ou ir para segundo plano já zera o contexto
> (`endStudySession`), e o bloqueio automático do aparelho faz isso sozinho em
> poucos minutos.
>
> A repartição virou `repartirTempo`, função pura e testada, com a invariante de
> que `ativo + ocioso` é sempre a duração do intervalo — nenhum segundo some nem
> é contado duas vezes, e `active_sec` é o único insumo de
> `trailup_tempo_telemetria_min`.
>
> Corolário que a mudança de limiar forçou: **regra de ócio em valor absoluto
> contra o ócio de UM lote não sobrevive à troca do intervalo de flush.**
> `idle_sec >= 120` ficou inalcançável quando `BATCH_INTERVAL_MS` caiu de 180s
> para 60s (`buildTimeMetricsSnapshot` apara `idle_sec` pela duração do lote).
> Virou fração da duração, com piso — `_ocio_dominou_o_lote`.

> **`dwell_sec`, `active_sec` e `idle_sec` são o tempo DAQUELE lote**, não um
> acumulado da sessão: `runStudyBatchFlush` troca o acumulador por
> `buildEmptyBatch(...)` a cada flush. Para totalizar, **some as linhas** — é
> o que `trailup_tempo_telemetria_min` faz (`20260830_01`). A imunidade a lote
> duplicado **não** vem da forma da conta; vem da chave única
> `(lote_id, scope, entry_key)`, preenchida pelo trigger
> `telemetria_resolver_entidade`.
>
> **O que NÃO zera no flush é o relógio do ócio.** `buildEmptyBatch` recebe o
> `lastInteractionAtMs` do lote anterior. Ele o zerava para o instante do
> flush, e o limiar de ócio conta a partir dele: cada lote começava com um
> crédito de tempo ativo que o aluno não produziu. Medido, era exatamente isso
> que o número parecia — o material mais lido da base tinha `dwell 68s /
> active 15s`, e 15s era o limiar, não uma medida.
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
> escopos diferentes multiplica o tempo — filtre por `scope` sempre. São
> **cinco** escopos desde `20260920`: `question` entrou embaixo de `activity`.
>
> **Aninhamento inclusivo não é permissão para carimbar o vizinho.** Uma linha
> recebe o id dela e o dos ANCESTRAIS, nunca o de algo mais fino. Isso foi
> violado em dois lugares ao mesmo tempo e o efeito era um só: o contexto de
> estudo carrega uma `itemKey` (a do bloco aberto), o acumulador a repassava
> para a entrada de conteúdo, e aí o gatilho lia `activity:1063` e preenchia
> `atividade_id` numa linha de escopo `content`. Nove linhas assim na base,
> cada uma com a última atividade do lote — um valor sem significado nenhum.
> A guarda existe agora nos dois lados (`itemKeyDoEscopo` no cliente, o teste
> de `scope` no gatilho), porque os apps já publicados continuam mandando a
> chave contaminada.
>
> **E os dois gravadores precisam escrever a MESMA `entry_key`.** O caminho
> direto do mobile sempre mandou a chave do acumulador; a API não mandava a
> coluna e deixava o gatilho derivar `content:<conteudo_id>`. Dois passos
> personalizados do mesmo conteúdo derivam a mesma chave dentro de um lote, e o
> segundo caía no `ON CONFLICT ... DO NOTHING` — o tempo dele sumia, e só pelo
> caminho da API.
>
> Corolário: `tempo_gasto_min` em `topico_aluno`, `conteudo_aluno` e
> `atividade_aluno` é **derivado por trigger** a partir da telemetria. Nenhum
> cliente escreve essa coluna.
>
> **`questao_aluno.tempo_gasto_seg` é a exceção, e é de propósito.** Ela NÃO
> vem do gatilho de telemetria: é a **latência da tentativa** — o intervalo
> entre a questão aparecer e o aluno confirmar —, medida em `QuestionActivity`
> e gravada junto com a resposta. `questao_aluno` é por `(aluno, questão,
> tentativa)`, e espalhar um agregado de lote sobre linhas de tentativa
> escolheria arbitrariamente uma delas. É essa latência, e não a permanência,
> que `trailup_core/tempo.py` modela (R² 0,562 sobre o log).
>
> A coluna, o campo no model e o parâmetro `tempoGastoSeg` de
> `registrarRespostaQuestao` existiam desde sempre, e **nenhum chamador o
> passava**: 35 das 35 linhas da base estavam com NULL, e
> `resolveAtividadeTempoMin` (`utils/classeMetrics.ts`), que soma essa coluna
> como reserva, sempre somou zero.
>
> O escopo `question` da telemetria é a **outra** medida — permanência por
> questão, somada por lote, como já se fazia por conteúdo e por atividade. As
> duas convivem; nenhuma substitui a outra.
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

> **O contexto de estudo tem de VOLTAR, e por muito tempo não voltava.**
> `accumulateContextTime` descarta tudo que chega com `studyState !== "active"`
> — de propósito: contar tempo no menu da trilha inflaria o estudo. Só que
> `endStudySession` zera `currentContextRef` para `EMPTY_STUDY_CONTEXT`, e ela
> roda em **todo** blur de tela e **toda** ida do app para segundo plano.
>
> Na volta, nada reinstalava o contexto: o efeito que chama `updateStudyContext`
> em `trilha/[id].tsx` era o mesmo que emite `content_open`, e o guard que
> impede o sinal de ser reemitido (`lastOpenedSignalRef`) vetava os dois juntos.
> Como as dependências do efeito não mudavam no refoco, ele não rodava, e o
> contexto ficava `idle` até o aluno trocar de bloco.
>
> Medido na base: **127 dos 261 lotes não produziram uma linha sequer de
> métrica**, e são 33,1 dos 46,8 minutos de permanência medidos — 71% do tempo
> de estudo do produto, sem escopo nenhum a que ser atribuído.
>
> Hoje são dois efeitos: o do CONTEXTO, sem guard e com `isScreenFocused` nas
> dependências, e o do SINAL, que mantém o guard. E `beginStudySession`
> **preserva** o bloco quando a sessão volta para o mesmo tópico — sem isso os
> dois pedidos competem no refoco e quem rodasse por último ganhava.
>
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
>
>    **E a dívida acumulou até 74.** A `20260920_04` limpou; o que ela aprendeu:
>
>    - **`FROM PUBLIC, anon` não é redundante.** O `proacl` das expostas era
>      `{=X/postgres, anon=X/postgres, ...}` — o privilégio chega pelos **dois**
>      caminhos, e revogar só de `anon` deixa a função aberta por `PUBLIC`.
>    - **`service_role` não é atingido**, porque tem grant próprio
>      (`service_role=X`). Medido: 0 funções o perderam. Importa porque a API, o
>      microservice e o BrainHexPDF usam SERVICE_ROLE_KEY.
>    - **Revogar não desliga gatilho.** Execução de trigger não consulta
>      EXECUTE. Medido: com o grant revogado, `CREATE TABLE` ainda fez
>      `rls_auto_enable` ligar a RLS, e um INSERT ainda fez
>      `telemetria_resolver_entidade` derivar `entry_key`.
>    - **Alvo por PROPRIEDADE, não por lista.** Lista fixa envelhece na próxima
>      função criada — que é exatamente o defeito de nascença acima. A migração
>      varre o catálogo e termina exigindo que não sobre nenhuma.
>
>    Exceção única: **`fn_auth_email_exists`**. É a só RPC pré-login do monorepo
>    (`CadastroAluno.tsx`, `CadastroProfessor.tsx`), e o custo é enumeração de
>    usuário — ela lê `auth.users` como dono e responde `true`/`false` para
>    qualquer e-mail, sem login. Consciente, não resolvido: mitigar pede rate
>    limit ou uma Edge Function no meio.

> **`SECURITY DEFINER` + `anon` é RLS desligada, e dava para escrever por ela.**
> Medido assumindo a role `anon` numa transação revertida, antes da
> `20260920_04`: `provisionar_estrutura_aluno_classe` aceita qualquer aluno e
> qualquer turma e **inseriu 20 linhas** (4 `topico_aluno` + 4 `conteudo_aluno` +
> 12 `atividade_aluno`) para um aluno **não matriculado** na turma — sem login.
> `social_sao_colegas` confirmou que dois alunos específicos são colegas e
> `social_presenca_turma(32)` devolveu presença, também sem login.
>
> Das 65 alcançáveis por RPC, 46 tinham guarda `auth.uid()` e **degradam para
> vazio** com chamador anônimo (`social_listar_pessoas(32)` → 0 linhas). Esse é
> o modo de falha certo, e é o que separa "exposta" de "explorável": o furo
> estava nas 19 sem guarda nenhuma, 8 delas de escrita.
>
> Ao criar `SECURITY DEFINER` nova: ou ela tem guarda `auth.uid()` no corpo, ou
> ela não é de usuário — e nos dois casos o `anon` sai.

> **Nem todo `event_trigger` é inalcançável.** Função que retorna `trigger` o
> Postgres recusa chamar direto ("trigger functions can only be called as
> triggers"). Presumi que `event_trigger` caísse na mesma regra: **não cai**.
> `rls_auto_enable()` chamada direto por `anon` **executa** — vira no-op, porque
> `pg_event_trigger_ddl_commands()` não devolve linha fora do contexto, mas
> "hoje não faz nada" depende do corpo continuar como está. Ao classificar
> superfície exposta, teste em vez de deduzir pelo tipo de retorno.

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

> **Módulo com cara de vivo que ninguém chama.** Já custou tempo quatro vezes
> nesta área: `services/progressoTrilha.ts` existia desde o commit inicial e
> **nunca** teve um chamador, enquanto as escritas de verdade estavam nos
> models; o fallback do rank rodava no caminho normal fazendo a conta errada;
> `Rank.loadByRankId` / `getPosicaoDoAluno` / `listRankInfosByClasse`
> continuam sem uso externo; e `utils/tempoDaClasse.ts` — `escolherTempoDaClasse`
> e `escolherTempoMedio` — tinha **sete testes passando e zero chamadores**, com
> `profileMetricsViewModel` decidindo a fonte do tempo sozinho, e decidindo o
> contrário (conta local na frente do banco). Antes de corrigir um "gravador" ou
> "calculador", confirme quem o chama — `grep` pelo nome fora do próprio arquivo.
>
> **Teste verde não prova que o módulo roda.** Os sete de `tempoDaClasse`
> passavam o tempo todo. Quem denunciou foi `profileMetricsTempo.test.ts`, que
> testa o CONSUMIDOR: ele falhava havia tempo, e falhava por duas regressões de
> uma vez — a fonte errada e a soma de `session_elapsed_sec`, que o próprio
> `CLAUDE.md` já registrava como corrigida. A correção sobreviveu no documento e
> no teste, não no código; suspeita de merge (`723a5f8`, `abc7675`). Teste de
> unidade guarda a função; só o teste do consumidor guarda a ligação.

> **Este parágrafo já afirmou o contrário, e as duas metades estavam erradas.**
> Ele dizia que "nenhuma linha do monorepo lê ou escreve" as tabelas sociais e
> que `aberturas.social` "não é lido por ninguém". Não vale mais nenhuma das
> duas: existe uma aba Social inteira (`app/(tabs)/social/index.tsx`, quatro
> seções, seis componentes em `components/social/`, oito serviços em
> `services/social/`), e `_layout.tsx:135` usa `aberturas.social` para revelá-la
> — exatamente como faz com `aberturas.rank`. Ao ler uma afirmação de "não tem
> chamador" aqui, **confirme com `grep` antes de agir**: este arquivo sobreviveu
> à entrega que o contradisse.
>
> **O que ERA verdade, e virou a Arena.** O substrato do desafio de guilda
> estava inteiro no banco e sem um chamador sequer: `guilda_desafios` (3
> linhas), `guilda_desafio_questoes` (9), `guilda_desafio_respostas` (**zero**),
> e as RPCs `guilda_desafio_criar` / `guilda_desafio_responder` /
> `guilda_chat_questao_responder`. O `CHECK` de `modo` já aceitava `duelo` e
> `duplo` — num lugar onde elas nunca poderiam funcionar, porque `modo`
> misturava *como se ganha* (`todos`/`velocidade`/`precisao`) com *quem joga*.
>
> A `20260920_05` separou: **`formato` (`guilda`/`dupla`/`solo`) diz quem joga,
> `modo` diz como se ganha**, e `duelo`/`duplo` saíram do CHECK de `modo`. Três
> coisas que valem para quem estender:
>
> 1. **Quem joga sai de `desafio_participantes`, e só de lá.** `guilda_id`
>    aceita NULL e virou rótulo — duelo entre alunos de guildas diferentes não
>    cabia numa coluna obrigatória. A composição **congela na abertura**: quem
>    sair da guilda amanhã continua no placar, quem entrar depois fica de fora.
>    Sem congelar, `guilda_listar` mudaria o placar de uma rodada já respondida.
> 2. **O tipo do evento começa com `desafio_`, nunca com `participacao_`.**
>    `fn_evento_creditado` casa por PREFIXO e devolve o valor que o CHAMADOR
>    mandou; um `participacao_desafio` deixaria o aluno escolher quanto vale a
>    própria vitória. E a referência começa pela **classe**
>    (`classe` / id / `desafio` / uuid), porque
>    `fn_eventos_aluno_resolve_classe_id` não conhece prefixo de desafio e
>    classe nula tira o evento do rank inteiro.
> 3. **Pagar duas vezes é impossível em dois níveis:** o encerramento é
>    `aberto → encerrado` sob `FOR UPDATE`, e a `idempotencia_key` é **derivada**
>    de (desafio, aluno, tipo) por md5 — gerada na hora de reenviar, duplicaria.
>    `desafio_*` não está em `fn_evento_de_conclusao`, então não herda a dedup
>    por referência: é a chave derivada que protege.
>
> `fn_questao_liberada` ganhou a variante `_para(aluno, questão)` com o corpo de
> verdade e passou a delegar. O pool tem de estar liberado para **todos** os
> participantes — sortear pelo que o criador abriu daria ao adversário questão
> que a trilha dele não liberou.
>
> Medido em transação revertida: solo de 3 questões com A acertando tudo e B
> errando tudo encerra sozinho, paga `desafio_participou` (3) e
> `desafio_vencido` (12) com a classe resolvida, e move o rank de pontuação da
> view que o mobile lê de 0 para 15. O rank de percentual e o de tempo **não**
> se mexem, que é o certo: duelo não é progresso de trilha nem tempo de estudo.
>
> Duas armadilhas encontradas ao exercitar, as duas invisíveis no código:
>
> - **`array_length` de array VAZIO devolve NULL, não zero.** A checagem de
>   duplicata virava `NULL IS DISTINCT FROM 0` e matava o formato `guilda`
>   inteiro — ele é o único que não convoca ninguém.
> - **`guilda_listar` devolve `logo_url`, `modo_perfil`, `perfil_alvo` e
>   `convites_enviados`, e `normalizeGuild` descartava os quatro.** A guilda
>   travada num perfil BrainHex aparecia como mista, e `guilda_cancelar_convite`
>   ficava sem chamador — convite feito por engano nunca saía do `pending`,
>   bloqueando um novo convite à mesma pessoa. O default de `limiteMembros` era
>   **4** contra o `BETWEEN 2 AND 10` do banco: escondia 6 vagas e, com elas, o
>   botão de entrar.
>
> **Guilda contra guilda entrou na `20260920_06`, e ela fechou um furo que a
> `20260920_05` tinha deixado.** O cooperativo era DEDUZIDO do placar —
> `arena_encerrar` olhava "integrantes da equipe 2 = 0" e concluía "então é
> treino". Duas consequências, e a segunda é grave:
>
> 1. Uma partida PvP em que o outro lado ainda não aceitou tem equipe 2 vazia e
>    fica **idêntica** a um treino. Guilda contra guilda era indizível.
> 2. **Dava para farmar vitória sozinho.** Medido nesta base: A desafia B em
>    solo, B nunca aceita, A responde as 3 questões certas e chama
>    `arena_encerrar` na mão — `vencedor_equipe = 1`, `desafio_vencido = 12`.
>    Repetível contra qualquer colega, sem a participação dele. `arena_responder`
>    só fecha sozinho quando não sobra `convidado`, mas `arena_encerrar` aceita
>    qualquer participante, e o ramo cooperativo dava a vitória.
>
> Hoje **cooperativo é `formato = 'guilda' AND guilda_rival_id IS NULL`, nunca o
> placar**, e toda disputa exige que os DOIS lados tenham alguém que respondeu.
> Quando não têm, `resultado = 'sem_adversario'`: sem vencedor, sem empate, só
> `desafio_participou` — o mesmo que a pessoa levaria jogando qualquer rodada.
> Medido depois: o mesmo roteiro do farm passou de 15 para **3** pontos.
>
> `resultado` é coluna (`vitoria`/`empate`/`sem_adversario`) porque o cliente
> **não consegue deduzir isso** de `vencedor_equipe`: nulo serve para empate e
> para rodada que não aconteceu, e são coisas diferentes na tela.
>
> **E o placar compara APROVEITAMENTO, não acerto bruto.** Pontuação de equipe é
> soma, então uma guilda de 5 bateria uma de 2 só por ser maior.
> `acertos / (questões × integrantes)`, comparado por multiplicação cruzada
> (`p1 * n2 > p2 * n1`) para não sair do inteiro — é a mesma régua de 50% que o
> ramo cooperativo já usava. Medido: 4 acertos em 2 jogadores (50%) **perde**
> para 3 acertos em 1 jogador (75%). Em solo e dupla os times têm o mesmo
> tamanho por construção, então a ordem não muda; só guilda contra guilda de
> tamanhos diferentes sente. O desempate de `velocidade` virou tempo médio pela
> mesma razão.
>
> **Quem aceita pela guilda rival: cada membro por si.** Não há papel de líder
> no domínio — `criado_por` é quem criou, não quem manda — e deixar uma pessoa
> comprometer a guilda inteira num desafio que paga ponto seria inventar um
> governo que não existe. Cada membro ativo da rival nasce `convidado`; quem não
> aceitar simplesmente não joga, e o aproveitamento normaliza o tamanho de quem
> apareceu. A guilda rival é avisada **no chat dela** — sem isso o único sinal
> seria o convite individual, e guilda parada nunca saberia que foi desafiada.
>
> Ver `docs/superpowers/specs/2026-09-20-arena-guilda-dupla-solo-design.md`.
>
> **`guilda_criar` era ambígua, e não só na chamada posicional.** Ela tinha duas
> assinaturas — 4 argumentos (uma delegação de uma linha) e 7 (o corpo), com as
> três últimas por DEFAULT —, então a de 7 também aceitava 4 e o Postgres não
> conseguia escolher. Medido antes da `20260920_07`, as **duas** formas
> estouravam com 42725:
>
> ```
> guilda_criar(32,'X','y','constellation')              -> is not unique
> guilda_criar(p_classe_id => 32, p_nome => 'X', ...)   -> is not unique
> ```
>
> A segunda é a que o cliente usa (`guildService.ts`). O PostgREST faz a própria
> resolução antes de chegar ao Postgres e pode escolher uma, então não dá para
> afirmar que "Criar guilda" estava quebrado em produção sem exercitar o caminho
> REST — o que dá para afirmar é que a chamada era ambígua no banco e dependia
> de um detalhe de outra camada para funcionar.
>
> A de 4 passava `NULL, 'misto', NULL`, que são exatamente os DEFAULTs da de 7:
> derrubá-la não muda comportamento. Medido depois — a mesma chamada nomeada
> grava `classe=54 ativa=true modo=misto limite=10`, põe o criador como membro e
> aparece em `guilda_listar` com `sou_membro = true`.
>
> Varri o catálogo atrás de outros pares assim: **é o único** no código da
> aplicação. O que mais colide por aridade são funções do `pgvector`
> (`cosine_distance`, `array_to_vector`…), distinguidas por TIPO, e
> `social_listar_pessoas`, cujas versões de 0 e 1 argumento não se sobrepõem.
>
> **Regra: ao dar assinatura nova a uma RPC existente, derrube a antiga na mesma
> migração.** A `20260920_06` já fez isso com `arena_desafio_criar`.
>
> E `guilda_evento_snapshot` segue com **0 linhas**: ele foi desenhado para um
> motor de eventos da turma que ainda não existe, e `desafio_participantes` não
> o substitui — congela a composição de UM desafio, não a da turma.

> **A geração do personalizado estava parada há semanas, e o culpado era a
> string `'None'`.** Medido em `personalizacao_job_targets`: **268 alvos** com a
> mesma falha, a última em 13/09 —
>
> ```
> asyncpg.DataError: invalid input for query argument $1: 'None'
>   (invalid UUID 'None': length must be between 32..36 characters, got 4)
> [SQL: SELECT a.id, ... FROM alunos a WHERE a.id = $1]  [parameters: ('None',)]
> ```
>
> Efeito na ponta: classe 54 com **5 linhas, todas `failed`, todas `seeker`**,
> paradas desde 30-31/08 — ou seja, o aluno abre a trilha e não há material
> personalizado nenhum, para nenhum perfil.
>
> **O detalhe que importa: a guarda já existia.** `fetch_personalizacao_context`
> tem `if aluno_id is None` desde `e4d50ae` (10/09), e as falhas são de 13/09 —
> *depois* dela. Guarda por **identidade não pega texto**: `'None'` tem quatro
> caracteres e não é nulo, então passa batido e o estouro acontece na borda do
> asyncpg, longe de quem cometeu o erro.
>
> Quem convertia era `_prepare`, a **barreira de preparação compartilhada** —
> que roda justamente para o representante de um grupo de targets que dividem a
> mesma preparação, isto é, o caminho da base por perfil, que **não tem dono**.
> Ela fazia `str(target["aluno_id"])` sem guarda, num módulo que já tinha duas
> ocorrências corrigidas e comentadas ao lado.
>
> Por isso a correção não foi a terceira guarda manual: a conversão virou **uma
> só**, `dono_de` / `identificador_de_dono` em `app/core/identidade.py`, que
> trata `'None'`, `'null'`, `'undefined'` e vazio como ausência. Enquanto
> `str(x) if x is not None else None` fosse escrito em cada ponto, ele protegia
> aquele ponto e nada impedia o valor de chegar já convertido de outro lugar.
>
> Três coisas que valem para a próxima:
>
> 1. **Conversão de ausência é regra, não idioma.** Se a mesma linha aparece
>    corrigida em dois lugares com um comentário explicando, o terceiro lugar
>    já existe — só não foi encontrado ainda.
> 2. **A regra tinha TRÊS donos e três versões.** `test_target_sem_dono.py`,
>    `test_personalizacao_jobs_loop.py` e `test_base_sem_aluno_repositorios.py`
>    afirmavam-na cada um do seu jeito, e dois deles estavam **vermelhos havia
>    tempo** — teste vermelho que ninguém lê não protege nada. Hoje a regra de
>    forma tem um dono (`test_target_sem_dono.py`) e o comportamento é provado
>    por execução, não por leitura de fonte
>    (`test_base_sem_dono_nao_vira_string_none.py`).
> 3. **Varredura de fonte que conta comentário mede errado.** A versão anterior
>    da regra casava com a linha comentada que *explica* o defeito. Filtre
>    comentário, e exija que o alvo exista (senão apagar os usos deixa o teste
>    verde sem proteger nada).
>
> `_seed_progress` ganhou precondição explícita em vez de estourar no encode:
> progresso é comportamento, exige dono, e a base por perfil não tem.

> **A alternativa correta morava na primeira posição — e isso é defeito de
> DADO, nenhuma tela conseguiria corrigir.** Medido nas 21 questões de múltipla
> escolha da base, antes da `20260921_03`:
>
> | posição da correta | 1ª | 2ª | 3ª | 4ª |
> | --- | --- | --- | --- | --- |
> | questões | **14** | 7 | **0** | **0** |
>
> Nenhuma questão com a resposta na terceira ou quarta posição: dava para
> gabaritar a trilha inteira sem ler um enunciado. Depois do backfill: 5/8/3/5.
>
> **Por que no banco, e não no gerador.** Escrevem `questoes` TRÊS caminhos — o
> console do professor, a API e o microservice. Corrigir no gerador deixaria os
> outros dois produzindo o mesmo viés. Ordenar não tem modelo de linguagem no
> meio, então pela regra de fronteira é do Postgres: um gatilho `BEFORE INSERT
> OR UPDATE` por onde os três passam.
>
> **O segundo defeito, que estava latente.** Há duas formas de `alternativas` no
> monorepo: a API grava `["texto", ...]` com o gabarito sendo o TEXTO; o console
> grava `[{id, texto, correta}, ...]` com o gabarito sendo a **LETRA**
> (`correct.id`, em `QuestionsManager.tsx`). Medido: as 35 linhas com
> alternativas estão na forma de string — ou seja, **a forma do console nunca
> foi exercitada**. Ela não está quebrada por sorte: `fn_questao_confere` lê
> `v_alts ->> v_i`, que sobre um objeto devolve o JSON inteiro, e o mobile
> renderizaria `[object Object]`. O gatilho normaliza na entrada, o que fecha os
> dois sem exigir mudança simultânea nos três clientes.
>
> Quatro coisas que não são acidentais:
>
> 1. **É ORDENAÇÃO, não embaralhamento — e é isso que a torna idempotente.**
>    Uma permutação aplicada sobre a própria saída embaralha de novo: o console
>    lê a ordem gravada, edita um texto, grava de volta, e a ordem mudaria a cada
>    save. A ordem canônica é `ORDER BY md5(id || '|' || texto)`, derivada do
>    conteúdo. Medido: a segunda passada do backfill alterou **0 linhas**.
> 2. **O gabarito é resolvido ANTES de reordenar, e a ordem das duas linhas é a
>    regra inteira.** A letra que o professor escolheu se refere à ordem que
>    ELE viu; resolver depois faria a letra apontar para a posição nova — outra
>    alternativa vira gabarito, em silêncio, e a questão continua parecendo
>    perfeita.
> 3. **O espelho do gabarito precisou ouvir TODO update.** `UPDATE OF
>    resposta_correta` dispara pelas colunas que a INSTRUÇÃO lista, não pelo que
>    um BEFORE trigger alterou. Como o gatilho reescreve `resposta_correta` num
>    UPDATE que mexeu só em `alternativas`, `questao_gabarito` ficaria com a
>    letra velha, apontando para a posição antiga.
> 4. **V/F e âncoras ficam fora.** O par Verdadeiro/Falso tem ordem semântica;
>    "todas as anteriores" e "nenhuma das alternativas" só fazem sentido no fim
>    — embaralhá-las quebra a QUESTÃO, não o viés.
>
> **O histórico sobreviveu ao reordenamento**, e não por sorte:
> `questao_aluno.resposta` guarda o TEXTO da opção, e o mobile casa por texto
> antes de tentar índice ou letra (`norm(alt) === norm(respostaAnterior)`).
> Medido: todas as respostas gravadas continuam resolvendo para uma posição.
>
> **A terceira perna do "sempre dá erro".** Ao reabrir uma atividade concluída,
> a tela remarcava cada questão chamando `checkResposta` de novo — isto é,
> re-corrigindo contra um gabarito que hoje chega nulo. Toda questão já
> respondida aparecia como errada, sem o aluno ter respondido nada. O veredito
> de questão já respondida é `questao_aluno.correta` (na view,
> `correta_aluno`), que é o registro autoritativo; recorrigir só poderia
> divergir dele. Sem veredito gravado e sem gabarito local, `vereditoDaRevisao`
> devolve `null`: **sem status é melhor que status errado**, porque "errado"
> aqui é uma afirmação sobre o que o aluno fez.
>
> **A QUARTA perna, e ela estava na hora de responder, não só ao reabrir.**
> `checkResposta` tem `if (correto == null) return false` na primeira linha
> útil — ou seja, **falta de gabarito virava reprovação**. É o mesmo defeito
> que o parágrafo acima descreve como corrigido, no caminho vizinho: a
> correção sobreviveu na revisão e não na resposta.
>
> Isso importa porque o único caminho que ainda corrige na tela é o do material
> personalizado, e lá o gabarito **nunca existe**: medido, **0 das 55 linhas**
> de `conteudo_personalizado` têm `resposta_correta` em `plano`, `materiais`
> ou `ai_patch`. Enquanto o pipeline não gerar questão personalizada, o
> caminho é dormente; no dia em que gerar, toda resposta seria reprovada.
> Hoje a decisão passa por `vereditoLocal`, que devolve `null` sem gabarito, e
> `null` **não bloqueia o aluno** — travar a questão faria o oposto do que
> corrigir na tela existe para evitar.
>
> **E o gabarito agora tem preço: acertar, ou errar DUAS vezes** (`20260921_05`).
> `questao_responder` devolvia `resposta_correta` em toda chamada — medido,
> `questao_responder(1065,'COMA')` respondia `{"correta": false,
> "resposta_correta": "UMA"}` na PRIMEIRA tentativa. Errar uma vez entregava a
> resposta, e entregava no **payload**, que a tela não consegue desfazer:
> esconder na interface deixa o valor no tráfego, exatamente o modo de falha
> que a `20260921_01` fechou para a coluna.
>
> Quatro coisas que não são acidentais:
>
> 1. **A regra mora no servidor.** Cliente não esconde o que já recebeu. A
>    tela tem a mesma conta (`deveRevelarGabarito`), mas só para saber o que
>    dizer enquanto espera.
> 2. **Conta ERRO, não tentativa.** `tentativa` cresce também quando o aluno
>    acerta e volta para revisar; usá-la faria a segunda visita a uma questão
>    já acertada parecer o segundo erro. O que a regra pesa é dificuldade, e
>    dificuldade se mede em erro.
> 3. **`gabarito_liberado` é campo próprio, não `resposta_correta IS NOT NULL`.**
>    Questão sem linha em `questao_gabarito` também devolve nulo, e "ainda não"
>    é uma mensagem diferente de "não existe" — sem o campo a tela anunciaria
>    ausência de gabarito para quem só precisa errar mais uma vez.
> 4. **`questao_gabarito_do_aluno` existe por causa do fechar-e-abrir.** O
>    valor só viajava na resposta da RPC; quem errou duas vezes e fechou o app
>    perderia o que conquistou, e pedir de novo por `questao_responder`
>    gravaria uma tentativa falsa. A nova RPC só **lê** o que está gravado e
>    aplica a mesma regra.
>
> Medido depois, com o JWT do aluno, em transação revertida: 1º erro →
> `{erros: 1, gabarito_liberado: false, resposta_correta: null}`; 2º erro →
> `{erros: 2, gabarito_liberado: true, resposta_correta: "UMA"}`; acerto →
> libera na hora. `anon` chamando a nova RPC leva 42501.
>
> **Corolário operacional que custou caro: a `20260921_01` só pode subir junto
> com o app.** Ela tirou o `SELECT` de `questoes.resposta_correta` de
> `authenticated`, e a versão publicada do app corrigia localmente lendo essa
> coluna. Com a migração aplicada e o app antigo em campo, o cliente compara
> contra `null` e **toda** resposta vira erro — foi exatamente o que apareceu
> em produção. Medido: `questao_resposta_correta` chega `<NULL>` na
> `vw_aluno_classe_detalhado` para o aluno, e `SELECT q.*` como
> `authenticated` estoura com `42501: permission denied for table questoes`
> (o grant é coluna a coluna, então `select=*` do PostgREST não passa mais).
> Migração que tira dado do payload é **quebra de contrato com o cliente
> publicado**: ou sai junto com o build, ou fica na gaveta.

> **Sete formatos de questão, e os três novos pedem relação.** A base tinha
> quatro — `multipla` 21, `verdadeiro_falso` 14, `fill_blank` 13, `dissertativa`
> 8 — e nenhum deles exige ligar, ordenar ou separar um subconjunto. Entraram na
> `20260921_04`:
>
> | tipo | `alternativas` | o aluno |
> | --- | --- | --- |
> | `associacao` | `{"termos": [...], "definicoes": [...]}` | liga termo a definição |
> | `ordenacao` | `["passo", ...]` | põe em ordem |
> | `multipla_resposta` | `["a", ...]` | marca **todas** as certas |
>
> **A decisão que estrutura tudo: o par NÃO mora em `alternativas`.** O caminho
> óbvio para "ligar termos" seria guardar pares (`[{"termo": "x", "par": "y"}]`)
> — e isso entrega a resposta, que é exatamente o defeito que a `20260921_01`
> fechou. As duas listas vão soltas, embaralhadas **com sementes diferentes**, e
> o pareamento vive só em `questao_gabarito`.
>
> **Alinhamento por acaso não é vazamento; alinhamento TOTAL é.** Medido sobre
> 200 ids com 5 pares: a média de pares alinhados por posição é **0,915** — casar
> por posição rende o mesmo que chutar, que é a definição de não carregar
> informação. Mas 1 em 200 saiu com os **cinco** alinhados, e nessa a resposta
> inteira fica na tela. Por isso o sal avança **só quando a permutação é a
> identidade**. Recusar mais seria pior: garantir que a posição *i* nunca é o par
> elimina uma opção por linha, e aí a posição passa a carregar informação de
> verdade. Medido depois, 300 ids com 3 pares: 0 ou 1 alinhado, **nenhum** com
> todos.
>
> **O gabarito dos três é JSON.** Separador de texto (`a|c`) quebra na
> alternativa que contém o separador, e não há caractere seguro — uma opção
> legítima pode ter `|`, `;` ou `,`. `fn_questao_resposta_em_lista` aceita JSON e,
> como reserva, o texto separado por barra: cliente antigo e professor digitando
> à mão mandam assim, e recusar seria recusar a resposta certa pela **forma**.
>
> **Ordem importa em um, não importa em dois.** `ordenacao` compara SEQUÊNCIA;
> os outros dois comparam CONJUNTO **com cardinalidade** — sem comparar tamanho,
> o gabarito estaria contido na resposta e marcar TODAS as alternativas passaria.
>
> E reordenar `ordenacao` deixou de ser redução de viés: virou **requisito**. Com
> as alternativas na ordem certa, a tela mostraria a resposta.
>
> Duas regras do lado do cliente:
>
> 1. **`ligarPar` mantém 1:1 nos DOIS lados.** Sem remover o vínculo antigo do
>    termo *e* o da definição, o aluno encosta a mesma definição em dois termos e
>    a resposta sai com mais pares que itens — o banco reprova por cardinalidade
>    e o aluno não entende por quê.
> 2. **`multipla_resposta` NÃO exige marcar o total.** Exigir tantas quantas o
>    gabarito tem contaria ao aluno quantas são certas, que é metade da resposta.
>    Associação e ordenação, ao contrário, só confirmam completas.

> **Reforço visual: o que faltava não era o recurso, era o dado.** Medido: **0
> das 56 questões** têm `midia_url`. A coluna existe, o console tem campo de
> upload (com `handleUploadMedia`) e `QuestionActivity` já renderiza bloco de
> mídia (`buildMediaBlocks`) — o caminho está inteiro e ninguém o usa. É o padrão
> de "módulo com cara de vivo", só que do lado dos dados.
>
> Por isso o reforço que entrou não depende de o professor subir nada: é o do
> **formato**. `identidadeDaQuestao` (`utils/identidadeDaQuestao.ts`) dá a cada
> tipo um selo com ícone + rótulo e uma instrução em imperativo, exibidos
> **antes** do enunciado. Com sete tipos, errar por ter entendido o formato
> errado não mede conhecimento nenhum.
>
> Três regras que valem ao mexer:
>
> 1. **Ícone nunca sozinho, cor nunca sozinha.** O selo traz o rótulo escrito; o
>    número do par em `QuestaoDeRelacao` aparece nos dois lados da ligação; a
>    caixa (não o círculo) é o que diz que dá para marcar mais de uma. Quem não
>    distingue as cores continua conseguindo responder.
> 2. **Tipo irreconhecível devolve `null`, não um palpite.** Selo com o formato
>    errado é pior que selo nenhum: o aluno confia nele e responde no formato que
>    leu. Há teste exigindo rótulos distintos entre os sete — dois formatos com o
>    mesmo rótulo não distinguem nada.
> 3. **Os ícones são `Ionicons`**, a família que a tela já importa. Trazer uma
>    segunda família por causa do selo acrescentaria peso ao bundle para desenhar
>    o mesmo conceito.

> **Um commit de sync apagou trabalho de outras frentes, e parte do estrago
> sobreviveu meses.** `1d7ce67` ("feat: sync TrailUp social store and class
> enrollment", de outro autor) mexeu em **343 arquivos**, com 20.394 deleções.
> Entre elas: as 24 migrações `20260910_*`/`20260911_*`, utilitários do mobile
> (`prazoDaAtividade`, `tempoDaClasse`, `pontuacaoDoAluno`…), o bloco de
> atualização automática de `group_analysis.py`, 85 linhas de
> `repositories/evento.py` — e a reversão inteira do `f3c5066`.
>
> **Quase tudo foi recuperado depois; o que ficou para trás é o perigoso**,
> porque não parece quebrado: 23 das 24 migrações voltaram e os utilitários do
> mobile também, então o repo dá a impressão de estar íntegro.
>
> O sinal de que uma remoção foi **acidental**, e não decidida, é o que sobrou
> em volta dela. No caso do `group_analysis.py` sobraram três coisas apontando
> para o código ausente:
>
> - o **teste** (`test_resumo_da_turma_automatico.py`), que importava as três
>   funções e derrubava a **coleta** inteira do pytest — ou seja, nenhum dos
>   1201 testes da API rodava no CI;
> - as **configurações** (`classe_perfil_summary_refresh_enabled: bool = True`,
>   `classe_perfil_summary_interval_min: int = 15`), intactas em `settings.py`;
> - este próprio `CLAUDE.md`, que descreve o laço como decisão de arquitetura
>   viva ("o laço ficou na API, chamando o mesmo `upsert_summary` do endpoint").
>
> Remoção deliberada teria levado as três junto. Por isso a restauração foi das
> **funções E da ligação** no `main.py`: restaurar só as funções deixaria o
> padrão de "módulo com cara de vivo que ninguém chama" que este arquivo
> documenta, e ainda deixaria a arquitetura descrita aqui sem implementação.
>
> **A quebra do CI escondia-se atrás do filtro de caminhos.** O job `api` só roda
> quando o `dorny/paths-filter` vê mudança em `api/`, então um merge sem conteúdo
> deixa a run verde com o job **pulado**. A quebra existia desde `1d7ce67` e só
> reaparecia quando alguém tocava na API.
>
> **Este parágrafo já disse que `evento.py` era irrestaurável, e a conclusão
> estava errada — por eu ter olhado só metade.** Restaurar o código consertava
> `test_referencias_orfas` e quebrava `test_evento_referencia`, e eu li isso
> como duas regras contraditórias pedindo decisão de design.
>
> O que faltou olhar: **o sync reverteu o TESTE junto**. A versão pré-sync
> chama-se `test_a_referencia_declarada_vence_o_tipo_do_evento` e diz, no
> próprio docstring, que a regra antiga (o prefixo sai do TIPO) estava errada —
> trocar `content:12` por `atividade:12` inventa uma atividade que pode não
> existir, a view não resolve classe nenhuma e os pontos morrem ali. Medido:
> **66 ids de referência órfãos**, 4 deles conteúdo do próprio aluno com o
> prefixo trocado por esse caminho. A view passou a resolver pela FORMA da
> referência em `20260910_06` — a migração que está **aplicada**.
>
> Ou seja: não havia conflito. O teste que estava na `main` era a regra
> superada, trazida de volta pelo mesmo commit que apagou o código. Restaurar os
> dois lados junto fecha a questão.
>
> **Recuperação parcial é a armadilha desta área.** `723a5f8` ("merge: main sem
> perder o que o commit de sync apagou") já tinha devolvido
> `test_referencias_orfas.py` inteiro — e deixado para trás `evento.py` e
> `test_evento_referencia.py`. Um teste restaurado afirmando sobre uma constante
> que ninguém restaurou falha de um jeito que parece defeito do teste.
>
> Regra ao recuperar código perdido em merge: **restaure o código E os testes
> que o acompanham, do mesmo ponto da história**. Se o teste que resiste é
> anterior ao código que você está restaurando, ele provavelmente também foi
> revertido — confira antes de concluir que há conflito de design. E sempre
> compare a lista de FAILED antes e depois: trocar uma falha por outra é
> resultado, não conserto.

> **O mesmo sync tinha revertido três correções com impacto medido, e todas
> voltaram.** Varrendo as 8 falhas que sobravam no CI, as 8 vieram de
> `1d7ce67`:
>
> - **`finalize_job` não varria os alvos.** `claim_next_job` reivindica job
>   `pending`, `partial` ou `processing` — `failed` e `completed` não entram em
>   nenhuma. Então alvo deixado em `pending`/`processing` quando o job termina
>   **nunca mais é tocado**: nem worker, nem retentativa. Medido: 2 alvos
>   parados havia duas semanas, e o tópico 128 repetindo com 6 alvos por vez.
>   `partial` de propósito **não** varre — é o estado que a retomada reivindica.
> - **A consulta de retomada era erro de sintaxe.**
>   `media_snapshot_select.replace("media_snapshot", "j.media_snapshot")`
>   trocava as DUAS ocorrências e gerava `j.media_snapshot AS j.media_snapshot`.
>   `AS j.media_snapshot` não compila, então `list_resumable_jobs_by_payload`
>   **nunca rodou** — e é ela que faz a retomada reaproveitar um ciclo aberto.
>   Com ela quebrada, toda retentativa recomeçava do zero. O parâmetro `alias`
>   sempre existiu na expressão e não era usado ali.
> - **`await self.session.commit()` antes de `result.mappings().first()`.** Um
>   `execute` novo na mesma sessão fecha o cursor anterior; a leitura vinha
>   vazia.
>
> Ao reverter o efeito do sync num arquivo que você também alterou, use
> `git apply -R -3` (merge de três vias) em vez de `git checkout <commit> --`:
> o checkout apagaria o seu trabalho. O conflito aparece exatamente onde os dois
> se encontram, e aí a escolha é consciente.

> Lacuna real ainda aberta: `MentalStateHistoryRepository.listar_por_aluno`
> (`api/app/repositories/mental_state.py`) só é exercitado em teste — o
> histórico em `aluno_mental_state_history` é **gravado** a cada ciclo
> (`analysis_runner.py`) mas **nunca lido de volta** por nenhum nó do grafo ou
> serviço para influenciar decisões (ex.: detectar frustração recorrente ao
> longo de vários ciclos). É plumbing write-only até alguém decidir o que fazer
> com a leitura.

> **O app não tinha error boundary nenhum, e por isso erro de render virava
> tela branca.** `componentDidCatch`, `getDerivedStateFromError` e
> `ErrorBoundary` não apareciam em lugar algum de `mobile/src` — conferido por
> `grep`. Em desenvolvimento o LogBox mostra o erro; na versão **publicada** ele
> não roda, e o que sobrava era uma tela sem informação nenhuma: não dava para
> saber se foi dado que não chegou, componente que estourou ou navegação que foi
> para lugar nenhum.
>
> O expo-router usa o export chamado **`ErrorBoundary`** do arquivo de rota como
> boundary daquele segmento (`useScreens.js` embrulha em `<Try catch={...}>`).
> Hoje há dois: um na raiz (`app/_layout.tsx`), que pega o que não tiver um mais
> próximo, e um em `app/(tabs)/trilha/[id].tsx`, porque é lá que a tela branca
> foi relatada — e o `retry` do expo-router re-renderiza **só aquela rota**, sem
> o aluno perder a sessão nem a posição na trilha.
>
> Três coisas que não são acidentais em `components/TelaDeErro.tsx`:
>
> 1. **Ela não importa contexto, tema, serviço nem dependência nova.** Um
>    boundary que dependesse de `SessaoContext` ou de `getProfileShellPalette`
>    pode quebrar exatamente quando é chamado — e boundary que quebra volta a
>    ser tela branca. As cores são literais.
> 2. **O texto é `selectable`, e não há botão "copiar".** Copiar exigiria
>    `expo-clipboard`, que **não está instalado**; instalar pacote para a tela
>    de emergência funcionar é o acoplamento que o item 1 evita.
> 3. **A montagem do texto mora em `utils/detalhesDoErro.ts`**, sem import de
>    `react-native`, porque é a parte que precisa de teste: nem tudo o que é
>    lançado é `Error` (dá para `throw "texto"`), e a tela de erro estourar
>    lendo `.name` de uma string a devolveria para a tela branca — agora por
>    culpa dela mesma. Um caso que só o teste pegou: `String(new Error(""))`
>    devolve `"Error"`, que não é vazio e não diz nada, então `mensagemDoErro`
>    sai no ramo de `Error` mesmo com mensagem vazia.

> **O gabarito chegava ao aluno, e o problema não era a tela — era o DADO.**
> Medido assumindo a role `authenticated` com o JWT do aluno, antes da
> `20260921_01`:
>
> ```
> SELECT id, enunciado, resposta_correta FROM questoes;
> 1061 | Um sistema distribuido e percebido... | Verdadeiro
> 1062 | Qual categoria da Taxonomia de Flynn  | SISD
> ```
>
> Com a chave pública do app, qualquer cliente HTTP baixava o gabarito das
> turmas em que o aluno está matriculado. E o app **corrigia localmente**
> (`QuestionActivity` lia `questao.resposta_correta`), então a resposta
> precisava estar no payload: enquanto isso fosse verdade, não havia como
> fechar.
>
> **Tirar da view era cosmético.** `vw_aluno_classe_detalhado` é
> `security_invoker = on` — lê `questoes` COMO O ALUNO —, e **RLS é por LINHA,
> não por coluna**: com as duas policies de leitura que ele tem, a linha vem
> inteira. Bastava consultar a tabela direto.
>
> Hoje o gabarito vive em **`questao_gabarito`**, cuja RLS só deixa o professor
> DONO da turma ler. O aluno não tem policy ali: não vê linha, então não há
> coluna a vazar.
>
> Quatro coisas que não são acidentais:
>
> 1. **`REVOKE` de COLUNA não anula `GRANT` de TABELA.** Privilégio de coluna é
>    **aditivo**: `authenticated` tinha `SELECT` na tabela inteira, que já
>    implica todas as colunas, e um `REVOKE SELECT (resposta_correta)` por cima
>    não tira nada. A guarda da própria migração reprovou a primeira tentativa
>    exatamente assim. A forma certa é derrubar o `SELECT` da tabela e conceder
>    **coluna a coluna** — com uma guarda que recusa coluna nova sem grant, para
>    que quem acrescentar campo decida se ele é público.
> 2. **As ESCRITAS não mudaram em lugar nenhum.** Um gatilho em `questoes`
>    espelha `resposta_correta` para a tabela protegida a cada INSERT/UPDATE.
>    Console do professor, API e pipeline continuam gravando onde sempre
>    gravaram; só as LEITURAS mudaram de lugar — eram três no console, e viraram
>    uma chamada a `anexarGabarito`.
> 3. **Aluno e professor são a MESMA role (`authenticated`)**, e privilégio de
>    coluna não distingue os dois. É por isso que a separação tem de ser por
>    POSSE — ou seja, por RLS numa tabela onde a linha É o gabarito.
> 4. **A correção subiu junto, obrigatoriamente.** Tirar a coluna sem mover a
>    correção faria o cliente comparar contra NULL e marcar **toda** resposta
>    como errada. `questao_responder` corrige, grava a tentativa e devolve o
>    gabarito — mas só DEPOIS de responder, que é quando a tela precisa dele.
>
> **E a correção do servidor precisou ser tão tolerante quanto a do cliente.**
> Comparação ingênua reprovaria resposta certa em três casos que
> `QuestionActivity` aceitava: letra (`A`) e índice (`1`) contra um gabarito
> gravado como o texto da opção; verdadeiro/falso em várias grafias; acento e
> caixa. `fn_questao_confere` cobre os três, e `fn_texto_comparavel` usa
> **tabela explícita de acentos** — não `normalize("NFD")` com range de
> combining marks, que é invisível no arquivo.
>
> Exercitado contra as quatro questões reais da base, por todos os caminhos
> (literal, maiúscula, espaços, letra, índice): todas verdadeiras; errada e
> vazia, falsas. E as guardas medidas: sem matrícula → `questao_sem_permissao`,
> sem sessão → `questao_sem_sessao`.
>
> **Dissertativa ficou de fora de propósito.** Não há comparação de texto que
> decida pergunta aberta; o cliente segue validando por IA, agora julgando pelo
> enunciado em vez do gabarito. Mover essa validação para o servidor é trabalho
> próprio — e até lá a qualidade da correção dissertativa é menor.

> **E o material PERSONALIZADO continua corrigindo na tela — de propósito, e há
> guarda.** Mandar toda questão para `questao_responder` parecia a leitura certa
> da regra, e quebrava duas coisas de uma vez:
>
> 1. **A questão inventada não existe em `questoes`.** Quando o plano não traz
>    id, `stableNegativeId` (`utils/personalization.ts`) dá a ela um id
>    **negativo**. A RPC responde `questao_inexistente`, e a tela trata erro de
>    correção **abortando a resposta**: a questão ficaria impossível de
>    responder — não erra, não acerta, não registra.
> 2. **A que herda o id é uma REESCRITA.** `_enriquecer_questao` preserva o
>    `item.id` da semente (que vem de `buscar_questoes_topico`), então o id é
>    real e a RPC acharia a linha. Só que `fn_questao_confere` aceita letra e
>    índice, e a versão personalizada reordena e reescreve as alternativas: a
>    "A" do aluno não é a "A" do professor. O veredito sairia **errado com cara
>    de certo** — o pior modo de falha dos três.
>
> Há ainda um motivo de contabilidade: `questao_responder` grava em
> `questao_aluno`, e progresso de personalizado é de
> `personalizacao_item_progresso`. Registrar nos dois creditaria o percurso do
> professor por trabalho feito no personalizado.
>
> A decisão mora em `utils/correcaoDaQuestao.ts` (`servidorCorrige`), fora da
> tela porque `QuestionActivity` importa `react-native` e não carrega no harness
> do node — mesmo motivo de `acumuladorLote.ts` e `perfilDoMaterial.ts`. E o
> gabarito exibido passou a ter **duas fontes com ordem**: a do servidor primeiro
> (única que existe para questão do professor), a do payload só quando
> `servidorCorrige` é falso — sem essa ordem a tela anunciaria "sem gabarito"
> antes de o servidor responder.
>
> **Dívida que fica, e é dormente:** para a questão personalizada a resposta
> ainda viaja no JSONB que o aluno lê. Medido na base hoje —
> `conteudo_personalizado` tem 55 linhas e **zero** com `resposta_correta` em
> `plano`, `materiais` ou `ai_patch`; a única que casa "quiz" casa dentro de
> `_geracao_falhas`. Ou seja, o caminho existe no código
> (`_normalize_personalized_activities` emite `resposta_correta`) e nunca
> produziu dado. Fechar exige o gabarito do personalizado sair do JSONB para
> uma tabela com RLS, como `questao_gabarito` fez com o do professor.

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

> **Ele NAO e versionado, e e' por isso que as regras abaixo dizem "when ...
> exists".** Clone novo nao tem grafo nenhum ate alguem rodar `graphify update .`
> -- que e' local, AST-only e sem custo de API.
>
> Medido antes da remocao: **1.497 arquivos, 5.654.310 linhas, 262 MB**. Isso e'
> 32x todo o `mobile/src` (173k linhas) e 34x a API (167k). E **94% estava nos 80
> arquivos de snapshot datado**: cada `graphify update .` cria uma pasta nova com
> um `graph.json` inteiro (~300 mil linhas), entao o custo era cumulativo e nunca
> baixava.
>
> O dano nao era disco -- era **revisao**. Um PR de redesign visual chegou a
> `+838.493 / -116.545` em 3000+ arquivos, com o conflito de verdade em 20. Diff
> que ninguem consegue ler nao e revisado, e ai o que entra junto passa sem
> olhar. Para comparacao, 19 commits de Arena + gabarito + tres formatos novos de
> questao + telemetria + RLS couberam em **12.792 linhas**.
>
> A regra do `.gitignore` antes mantinha a raiz rastreada de proposito; hoje
> ignora `graphify-out/` inteiro. **Nao reverta isso para "facilitar" o grafo num
> clone novo** -- regerar leva um comando.
>
> O historico continua pesado: `git rm --cached` tira do futuro, nao do passado.
> Enxugar de vez pede reescrita de historico (`git filter-repo`), que muda todos
> os hashes e obriga todo mundo a reclonar -- decisao da equipe, nao efeito
> colateral de um commit.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

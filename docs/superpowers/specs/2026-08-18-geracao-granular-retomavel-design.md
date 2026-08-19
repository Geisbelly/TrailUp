# Geração granular e retomável de conteúdo personalizado (por bloco/parte/perfil)

Data: 2026-08-18
Status: aprovado para plano de implementação

## Contexto e problema

O pipeline de personalização (API Python orquestra, `microservice/` gera mídia
— ver `CLAUDE.md`) hoje trata cada ciclo de geração (`tópico × perfil`) como
uma unidade atômica, tudo-ou-nada:

1. `POST /personalizar` (`api/app/api/v1/personalizacao.py::personalizar()`)
   enriquece o conteúdo do professor (`enrich_content_blocks`, custa LLM),
   gera cards, cria um registro `conteudo_personalizado` com um novo
   `ciclo_id`, e dispara `disparar_brainhex_async` como uma task assíncrona
   fire-and-forget direto para o `microservice`.
2. O `microservice` (`runPipeline` em `server.ts`) chama
   `processMediaWithGemini` (síntese de markdown+roteiro+slides por bloco,
   já em lotes de 1 bloco por chamada — ver `consolidateBlockBatchGenerations`
   e o comentário "Lotes sempre tem exatamente 1 bloco hoje"), depois re-quebra
   o markdown consolidado em "partes de entrega" por tamanho de caractere
   (`splitProcessedContentIntoParts`, limite de upload do Storage), e para
   cada parte dispara TTS (`generateLongNaturalAudio`) e renderização de
   apresentação via BrainHexPDF (`renderAndUploadPresentationViaBrainHexPdf`)
   em paralelo.
3. `archiveMultiPartToSupabase` persiste tudo de uma vez em
   `conteudo_personalizado.materiais` (JSONB). Se **qualquer** media_kind não
   atingir "completed" em todas as partes, `runPipeline` lança erro e
   `markPersonalizacaoFailed` marca o registro inteiro como `failed`.

**O bug relatado:** na próxima chamada de `/personalizar` para o mesmo
tópico/perfil/aluno, a checagem de reuso
(`buscar_mais_recente_por_perfil` + filtro `status in {"pronto",
"processando_midias"}`) **não** reconhece um registro `failed` como
reaproveitável. Um novo `ciclo_id` é criado do zero: novo enriquecimento
(LLM), novos cards, nova síntese Gemini completa — mesmo que áudio e
markdown já tivessem sido gerados com sucesso na tentativa anterior e só a
apresentação tivesse falhado. Cada falha parcial vira reinício total, e cada
reinício total volta a pagar o custo de LLM de tudo, inclusive do que já
funcionava.

Esse bug foi exposto de forma consistente porque a causa raiz imediata das
apresentações não sendo geradas era uma lacuna de configuração local
(`BRAINHEXPDF_API_URL`/`BRAINHEXPDF_API_SECRET` ausentes no `.env` do
`microservice`, e `../BrainHexPDF` sem `.env` algum) — já corrigida nesta
sessão. Mas o desperdício de tokens por reinício total é um problema de
arquitetura independente da causa da falha, e persiste para qualquer falha
futura (rate limit do Gemini, timeout de rede, etc.).

## Objetivo

Quando uma geração falha parcialmente, uma nova tentativa para o mesmo
`source_hash` deve **retomar de onde parou**: reaproveitar tudo que já foi
gerado com sucesso e regenerar apenas o que falta ou falhou — com
granularidade de bloco (para as etapas caras de LLM) e de parte de entrega
(para áudio/apresentação), sempre escopado por perfil BrainHex.

Fora de escopo (decisão explícita): compartilhamento de conteúdo já gerado
entre **alunos diferentes** do mesmo perfil. Esse mecanismo já existe hoje
(`buscar_mais_recente_por_perfil` não filtra por `aluno_id`) e não está
comprovadamente quebrado — não entra nesta rodada.

## Arquitetura

### Duas fases com dependência explícita

- **Fase A — por bloco.** Para cada bloco de conteúdo do professor (a mesma
  unidade que `content_enrichment.py` já usa, `id: "bloco-{index:02d}"`,
  estável entre tentativas enquanto o `source_hash` não mudar — o índice vem
  da mesma lista ordenada de blocos-base que alimenta o hash):
  `enriquecimento` (Python, LLM) → `capitulo` (microservice, Gemini:
  markdown + audioScript + slides daquele bloco). Cada etapa é uma unidade
  independente, já é assim internamente hoje (lotes de 1 bloco por chamada
  Gemini) — falta só expor isso como estado persistido e retomável.
- **Fase B — por parte de entrega.** Só começa quando **todos** os blocos da
  Fase A de um ciclo (tópico×perfil) estão `completed`. Nesse momento o
  markdown consolidado (juntando os capítulos de todos os blocos, na ordem)
  é resplitado em partes por `splitProcessedContentIntoParts` (inalterado —
  contrato de entrega ao mobile não muda), e cada parte gera dois targets
  independentes: `audio` (TTS) e `apresentacao` (BrainHexPDF).

A Fase B não pode começar antes da Fase A terminar porque o resplitamento em
partes opera sobre o markdown **consolidado** de todos os blocos — não é uma
limitação artificial, é como `splitProcessedContentIntoParts` já funciona
hoje (agrupa seções por tamanho de caractere, cruzando fronteiras de bloco
livremente).

```
ciclo (personalizacao_jobs, kind=media_generation)
├─ Fase A (por bloco, paralelizável)
│   ├─ target: bloco-01 × enriquecimento
│   ├─ target: bloco-01 × capitulo      (depende do enriquecimento do bloco-01)
│   ├─ target: bloco-02 × enriquecimento
│   ├─ target: bloco-02 × capitulo
│   └─ ...
├─ [worker cria Fase B quando TODOS os targets de capitulo == completed]
└─ Fase B (por parte, paralelizável)
    ├─ target: parte-01 × audio
    ├─ target: parte-01 × apresentacao
    ├─ target: parte-02 × audio
    └─ ...
```

### Um único caminho para on-demand e em lote

Hoje existem dois caminhos que convergem para o mesmo pipeline monolítico do
microservice: `personalizar()` (aluno abre o tópico pela primeira vez, fire-
and-forget direto) e `personalizacao_jobs_loop()` (professor dispara
class-delta/full-sync/etc., via fila). Só o primeiro tem checagem de reuso
(frágil, tudo-ou-nada). Com este desenho, **os dois passam a enfileirar
targets granulares** na mesma fila. A retomada deixa de ser uma checagem
especial em `personalizar()` e passa a ser uma propriedade natural do worker
(ele já pula targets `completed`/`skipped`). Latência adicional do polling
(`personalizacao_job_poll_sec = 5`, hoje) é irrelevante frente aos minutos
que a geração real leva.

## Modelo de dados

### `personalizacao_jobs` (sem mudança de schema)

Reaproveitado como o "ciclo" de geração. Novo `kind` (`"media_generation"`,
ao lado dos existentes `enrollment`/`class-delta`/`class-theme`/
`student-cleanup`/`full-sync`). `status` já suporta `partial` — passa a ser
usado de fato: `processing` enquanto há targets pendentes, `partial` quando
parou com sucesso parcial (ex.: erro definitivo em 1 bloco após esgotar
retries) e `completed` só quando 100% dos targets terminam `completed` ou
`skipped`. `payload` (JSONB, já existe) carrega `ciclo_id`/`source_hash`/
`brainhex_profile_key` para o worker montar o `generation_key` sem re-buscar
o registro pai a cada target.

### `personalizacao_job_targets` (migration nova)

Colunas adicionadas:

```sql
ALTER TABLE personalizacao_job_targets
  ADD COLUMN media_kind text NULL,   -- 'enriquecimento' | 'capitulo' | 'audio' | 'apresentacao'
  ADD COLUMN block_id text NULL,     -- ex.: 'bloco-01' — usado por enriquecimento/capitulo
  ADD COLUMN part_ordem int NULL,    -- ex.: 1 — usado por audio/apresentacao
  ADD CONSTRAINT ck_job_targets_media_key CHECK (
    (media_kind IN ('enriquecimento', 'capitulo') AND block_id IS NOT NULL AND part_ordem IS NULL)
    OR (media_kind IN ('audio', 'apresentacao') AND part_ordem IS NOT NULL AND block_id IS NULL)
    OR media_kind IS NULL  -- targets legados (aluno×tópico) continuam válidos
  );
```

A unique constraint atual (`uq_job_target_aluno_topico`, `job_id, aluno_id,
topico_id`) impede múltiplos targets por aluno+tópico dentro do mesmo job —
incompatível com múltiplos blocos/partes no mesmo ciclo. Substituída por:

```sql
ALTER TABLE personalizacao_job_targets
  DROP CONSTRAINT uq_job_target_aluno_topico,
  ADD CONSTRAINT uq_job_target_unidade UNIQUE (
    job_id, aluno_id, topico_id, media_kind, block_id, part_ordem
  );
```

(`NULL` é distinto em unicidade Postgres, então targets legados com
`media_kind IS NULL` continuam únicos por `job_id, aluno_id, topico_id` como
hoje, sem colidir com os novos.)

### Cache do capítulo por bloco (tabela nova)

O resultado da Fase A (markdown + audioScript + slides de cada bloco) precisa
persistir em algum lugar consultável antes da Fase B rodar — e **não** dentro
de `conteudo_personalizado.materiais`, que já foi enxugado de propósito por
já ter chegado perto do teto de `statement_timeout` do merge em tópicos com
muitos blocos (ver histórico do `mergePersonalizacaoMateriais`). Nova tabela,
uma linha por bloco:

```sql
CREATE TABLE personalizacao_blocos_gerados (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES personalizacao_jobs(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  enriched_payload JSONB,   -- resultado do target de enriquecimento
  markdown TEXT,            -- resultado do target de capitulo
  audio_script TEXT,
  slides JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, block_id)
);
```

Uma linha por bloco, sem coluna de `status` própria — a origem da verdade
sobre o que já rodou e o que falta continua sendo exclusivamente
`personalizacao_job_targets` (os targets `enriquecimento` e `capitulo` desse
`block_id`, no mesmo `job_id`). Esta tabela é só o **conteúdo** produzido por
esses targets quando terminam `completed`; nunca duas fontes de verdade para
o mesmo status. Ciclo de vida atrelado ao `personalizacao_jobs` pai
(`ON DELETE CASCADE`) — não é histórico permanente, é o estado de trabalho da
Fase A daquele ciclo. Consultada pelo worker antes de montar o markdown
consolidado que alimenta a Fase B, e pelo endpoint `/api/v1/generate/block`
para saber se o enriquecimento daquele bloco já está disponível (via
`enriched_payload IS NOT NULL`) antes de precisar buscá-lo de outro lugar.

Áudio e apresentação continuam usando exatamente o formato já existente em
`materiais.<kind>.partes[]` (`MaterialPart`: `ordem, titulo, arquivo_url,
storage_path`) — sem tabela nova. A única mudança é **ler esse array de
volta** antes de re-disparar TTS/BrainHexPDF para uma parte, em vez de
ignorá-lo como hoje.

## Componentes e fluxo

### Python — orquestração (`api/app/services/personalizacao_jobs.py`)

- `personalizar()` deixa de enriquecer/gerar cards/disparar inline. Passa a:
  1. Buscar/criar o `personalizacao_jobs` do ciclo (`kind=media_generation`,
     chaveado por `classe_id, topico_id, conteudo_id, aluno_id,
     brainhex_profile_key, source_hash` — reaproveita o job existente sempre
     que seu `status != 'completed'` para a mesma chave, em vez de sempre
     criar um novo. Isso inclui jobs `failed`: o job é reaberto para
     `processing` e seus targets `failed` com retries ainda disponíveis
     voltam para `pending` — ver semântica de status abaixo).
  2. Se não houver targets de Fase A ainda, criar um `enriquecimento` +
     `capitulo` por bloco (`pending`).
  3. Retornar imediatamente (o worker processa em background, como hoje —
     UX do aluno não muda, só a origem do disparo).
- Worker (`personalizacao_jobs_loop`) ganha um handler para
  `kind=media_generation`: processa targets pendentes/retry na ordem (Fase A
  completa antes de criar Fase B — ver acima), chamando os novos endpoints
  granulares do microservice, e finaliza o job (`completed`/`partial`/
  `failed`) segundo o estado agregado dos targets.
- Reuso de enriquecimento: como cada bloco tem seu próprio target de
  `enriquecimento` com resultado persistido em
  `personalizacao_blocos_gerados.enriched_payload`, uma nova tentativa pula
  direto os blocos cujo target de enriquecimento já está `completed` — sem
  chamar o LLM de enriquecimento de novo para eles.
- Cards (`gerar_cards_direto`) continuam fora da granularidade por bloco
  (não são custo dominante e não fazem parte do problema relatado); seguem
  gerados uma vez por ciclo, na criação do job, como hoje.

### Microservice — endpoints granulares novos (`server.ts`)

Todos atrás de `requireSecret`, seguindo o padrão dos endpoints
`/api/v1/regenerate/*` já existentes:

- `POST /api/v1/generate/block` — gera 1 capítulo (markdown+audioScript+
  slides) de 1 bloco já enriquecido. Extração direta do corpo do loop
  `mapWithConcurrency` que já existe dentro de `processMediaWithGemini`
  (hoje só acessível como parte do lote inteiro).
- `POST /api/v1/generate/part-audio` — TTS de 1 parte de entrega. Wrapper
  HTTP sobre `generateLongNaturalAudio`/`generateLongConversationalAudio`
  (já existem, só não são endpoints).
- `POST /api/v1/generate/part-presentation` — render+upload de 1 parte via
  BrainHexPDF. Wrapper HTTP sobre `renderAndUploadPresentationViaBrainHexPdf`
  + o upload que hoje vive dentro de `archiveMultiPartToSupabase`.

Cada endpoint faz upload no Storage (quando aplicável) e devolve o resultado
para o worker persistir — a persistência final em
`conteudo_personalizado.materiais` continua sendo responsabilidade do
Python via as mesmas funções de merge (`mergePersonalizacaoMateriais`
equivalente, ou o merge é feito pelo microservice endpoint mesmo, a decidir
no plano) para não duplicar a lógica de agregação `partes[]` que já existe.

## Tratamento de erros e retry

- Cada target usa as colunas já existentes (`status`, `attempts`,
  `last_error`) e o backoff já existente (`_compute_failure_backoff_sec`).
  Sem lógica de retry nova — reaproveita o que a fila já faz para
  `class-delta`/`full-sync`.
- Falha definitiva (esgotou retries) em um target de bloco não derruba os
  outros blocos — eles continuam. O job pai fecha como `partial` quando pelo
  menos 1 target falhou definitivamente e o resto terminou (sucesso ou
  `skipped`) — nunca `failed` nesse cenário, porque `partial` já é modelado
  no diagrama de estados existente (`6.1`) como reabrível
  (`partial → processing`): uma tentativa futura pode reabrir o job e tentar
  de novo só os targets que ainda têm retry disponível.
- `status = 'failed'` (terminal, sem retry automático) fica reservado para
  quando **nenhum** target da Fase A concluiu (nada aproveitável ainda) ou
  para um erro que impede o job inteiro de prosseguir (ex.: `source_hash`
  do payload inconsistente). Mesmo um job `failed` continua sendo reaberto
  por uma nova chamada de `personalizar()` (ver seção Python acima) — a
  diferença de `partial` é só semântica/UI, não de reusabilidade.
- Falha em Fase B (áudio ou apresentação de 1 parte) não invalida a Fase A
  nem as outras partes — mesma filosofia.
- `conteudo_personalizado.status` (o registro visível ao mobile/console)
  passa a refletir o agregado dos targets do job em vez do "tudo-ou-nada" de
  hoje: `pronto` só com job `completed`; `processando_midias` com job
  `processing`; um novo tratamento para `partial` (a decidir no plano —
  provavelmente expõe o que já está pronto e sinaliza pendência, em vez de
  aparecer como `failed` genérico).

## Testes

- Migration: teste de coexistência de targets legados (`media_kind IS NULL`)
  e novos na mesma tabela, sem violar a unique constraint.
- Python: dado um job `media_generation` com alguns targets `completed` e um
  `failed` (retries esgotados), uma nova chamada a `personalizar()` com o
  mesmo `source_hash` NÃO cria um novo job/ciclo — reaproveita o existente e
  só redespacha o target `failed` elegível a retry.
- Python: Fase B só é criada depois que 100% dos targets de `capitulo` do
  ciclo estão `completed` — teste cobrindo o caso de 1 bloco ainda pendente
  (Fase B não deve existir ainda).
- Microservice: os 3 endpoints granulares novos, cada um testado
  isoladamente (contrato de request/response, e que persistem/retornam
  exatamente o que `processMediaWithGemini`/TTS/BrainHexPDF client já
  produzem hoje — sem mudança de comportamento da geração em si, só de
  como é invocada).
- Regressão: teste ponta-a-ponta simulando falha só na apresentação de 1
  parte — confirma que enriquecimento, capítulos e áudio NÃO são
  re-executados na retentativa (via contagem de chamadas mockadas ao
  Gemini/TTS).

## Riscos e casos de borda

- **Estabilidade do `block_id` entre tentativas.** Depende de
  `content_enrichment.py` continuar atribuindo `id: "bloco-{index:02d}"` pela
  mesma lista ordenada de blocos-base que já alimenta o `_build_source_hash`.
  Se a ordem/composição dessa lista mudar sem o `source_hash` mudar junto, o
  cache por bloco erra silenciosamente (não bate o `block_id`, reprocessa do
  zero — degrada para o comportamento atual, não corrompe dados). Não é um
  risco novo introduzido por este desenho, mas fica mais visível.
- **Jobs `media_generation` órfãos.** Reaproveita o mecanismo de recovery já
  existente para jobs travados (heartbeat/stale threshold no microservice já
  existe para o pipeline atual; o job Python-side precisa de um threshold
  equivalente — a fila já tem esse conceito para outros `kind`).
- **Migração de dados em voo.** Ciclos `failed` que já existem no banco antes
  desta mudança não têm targets granulares — tratados como legado: uma nova
  tentativa sobre eles simplesmente cria um job `media_generation` novo do
  zero (mesmo comportamento de hoje), sem tentar retroativamente
  reconstruir granularidade que nunca existiu.

## Fora de escopo (explícito)

- Compartilhamento de geração entre alunos diferentes do mesmo perfil
  (`buscar_mais_recente_por_perfil` já faz isso hoje, presumidamente
  funcional — não investigado nem alterado aqui).
- Mudar o contrato de entrega ao mobile (partes de áudio/apresentação
  continuam exatamente como estão).
- Granularidade de bloco para áudio/apresentação (avaliado e descartado —
  exigiria mudar o contrato de entrega ao mobile).

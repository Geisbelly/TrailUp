# Design: BrainHexPDF grava a apresentação direto no banco

Data: 2026-08-16
Status: aprovado para plano de implementação

## Contexto

Hoje (`docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`,
já implementado) o `microservice/` chama `POST /api/v1/render-and-store` no
BrainHexPDF, que gera o deck (Gemini), renderiza o HTML completo e sobe o
arquivo no Supabase Storage — mas devolve só `{ success, url }` pro
microservice. É o microservice quem junta esse resultado com
`audio`/`markdown` (que ele mesmo gera) num único objeto `updates` e chama a
RPC `merge_personalizacao_materiais_v2` (grava em
`conteudo_personalizado.materiais`), seguido de um upsert em
`materiais_gerados` (histórico, `saveMateriaisGerados`).

Decisão do usuário: o BrainHexPDF passa a gravar o resultado da apresentação
diretamente no banco (mesma RPC e mesma tabela de histórico que o
microservice já usa hoje para si mesmo), em vez de só devolver a resposta
HTTP pro microservice decidir o que persistir.

## Por que isso é seguro (verificado antes de desenhar)

- `merge_personalizacao_materiais_v2` já faz merge **parcial por chave** —
  chamar com `p_updates = { apresentacao: {...} }` não pisa em `audio`/
  `markdown` gravados separadamente pelo microservice. O status agregado
  (`pronto`/`processando_midias`) é recomputado dentro da própria função SQL,
  então não importa qual dos dois serviços chamou por último.
- O upsert em `materiais_gerados` que o microservice já faz pra si mesmo
  (`saveMateriaisGerados`, `supabaseService.ts:386-442`) usa
  `.upsert(rows, { onConflict: "personalizacao_id,tipo,generation_key" })` —
  **atômico via `ON CONFLICT`**, diferente do caminho Python
  (`resolver_ids_por_tipo_recente` + `UPDATE ... WHERE id=`) que causou a
  race condition corrigida hoje (PR #75 do TrailUp). Replicar esse MESMO
  padrão de upsert no BrainHexPDF para `tipo='apresentacao'` não introduz uma
  superfície de concorrência nova — é o padrão seguro já em uso.
- BrainHexPDF já tem `SUPABASE_SERVICE_ROLE_KEY` (usa pra subir no Storage) —
  a mesma credencial serve pra chamar a RPC e fazer o upsert. **Nenhuma env
  var nova.**

## Decisão de design: sem duplicar constantes de versão

`buildPresentationMaterialMetadata`/`buildPresentationVersionMetadata`
(`microservice/server.ts:96-116`, `src/constants/pipelineVersions.ts:39-47`)
montam `metadata.{engine,schema,design_system,media_pipeline_version}` a
partir de constantes do microservice (`PRESENTATION_ENGINE_VERSION` etc.).
Duplicar essas constantes dentro do BrainHexPDF reproduziria exatamente o
bug já corrigido em produção (PR #68, mismatch de `MEDIA_PIPELINE_VERSION`
entre repositórios). **O microservice continua a única fonte dessas
constantes** — ele calcula o objeto de metadata de versão e manda pronto no
corpo da requisição; o BrainHexPDF só usa o que recebeu, nunca hardcoda.

## Arquitetura (mudança)

```
microservice/                                    BrainHexPDF
  gera audio+markdown, sobe no Storage
  chama mergePersonalizacaoMateriais
    com updates = { audio, markdown }             ← apresentacao SAI daqui
  chama POST /api/v1/render-and-store  ────────►  gera deck (Gemini)
    body: { ...campos atuais,                     renderiza HTML
             personalizacaoId, cicloId,            sobe HTML no Storage
             sourceHash,                           valida generationKey ==
             presentationVersionMetadata }           `${cicloId}:${sourceHash}`
                                                    chama merge_personalizacao_
                                                      materiais_v2 com
                                                      p_updates={apresentacao:{...}}
                                                    SELECT aluno_id/conteudo_id
                                                      (mesma checagem de
                                                      geração obsoleta)
                                                    upsert materiais_gerados
                                                      (tipo='apresentacao')
                                                  ◄──  { success, url, dbWritten }
  loga resultado (não persiste mais nada
    pra apresentacao)
```

## Caminho de falha — ponto crítico

Duas falhas são categoricamente diferentes e precisam de tratamento
diferente, para não reintroduzir o bug de "fica pendente pra sempre
silenciosamente" corrigido nesta mesma sessão (PR #76, `personalizacao_jobs`):

1. **BrainHexPDF recebe a requisição mas falha durante geração/upload**
   (Gemini quota, JSON truncado, erro do Storage). Nesse caso, **o próprio
   BrainHexPDF** chama a RPC com `p_updates.apresentacao.metadata.status =
   "failed"` (mesma forma que `buildPresentationMaterialMetadata` monta hoje
   pro caso de falha) — grava o estado de falha, não só retorna erro HTTP.
   Responde ao microservice `{ success: false, stage, error, dbWritten: true }`.

2. **A chamada HTTP em si falha** (timeout, conexão recusada, DNS, 5xx sem
   corpo JSON válido) — nesse caso o BrainHexPDF pode não ter processado nada,
   então **o microservice mantém seu fallback atual**: chama
   `mergePersonalizacaoMateriais` só com a chave `apresentacao` marcada como
   falha (reaproveitando `buildPresentationMaterialMetadata`), exatamente
   como qualquer outra falha de mídia obrigatória hoje. Isso é o
   `catch`/timeout já existente em `renderAndUploadPresentationViaBrainHexPdf`
   (`brainHexPdfClient.ts:93-99`) — só muda o que ele aciona depois.

Ou seja: **falha tratada, o BrainHexPDF grava. Falha de transporte, o
microservice grava o fallback.** Nunca os dois, nunca nenhum dos dois.

## Mudanças no BrainHexPDF

### Request (`POST /api/v1/render-and-store`) — campos novos

```ts
{
  // ...campos já existentes (targetProfile, topic, sourceText, bucket, storagePath)
  personalizacaoId: number;
  cicloId: string;
  sourceHash: string;
  presentationVersionMetadata: {
    engine: string;
    schema: string;
    design_system: string;
    media_pipeline_version: string;
  };
}
```

### Novo módulo `src/services/materialsPersistence.ts`

Isolado do handler HTTP pra ser testável sem subir o Express nem o Vite.

```ts
export interface GenerationFence {
  personalizacaoId: number;
  cicloId: string;
  sourceHash: string;
}

export interface PresentationVersionMetadata {
  engine: string;
  schema: string;
  design_system: string;
  media_pipeline_version: string;
}

export interface PersistApresentacaoParams {
  fence: GenerationFence;
  versionMetadata: PresentationVersionMetadata;
  bucket: string;
  storagePath: string;
  presentationUrl: string | null; // null = falha
  failure: { stage: string; error: string } | null;
}

export interface SupabaseClientLike {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(cols: string): { eq(col: string, val: unknown): { eq(col: string, val: unknown): { eq(col: string, val: unknown): { maybeSingle(): Promise<{ data: any; error: any }> } } } };
    upsert(rows: unknown[], opts: { onConflict: string }): Promise<{ error: { message: string } | null }>;
  };
}

export function generationKeyFor(fence: GenerationFence): string; // `${cicloId}:${sourceHash}`

export async function persistApresentacaoResult(
  client: SupabaseClientLike,
  params: PersistApresentacaoParams,
): Promise<{ dbWritten: boolean; error?: string }>;
```

`persistApresentacaoResult`:
1. Monta `metadata` = `{ status: presentationUrl ? "completed" : "failed", media_kind: "apresentacao", ...versionMetadata, generation_key, updated_at: new Date().toISOString(), ...(presentationUrl ? {bucket} : {}), ...(failure ? {error_stage: failure.stage, error: failure.error} : {}) }`.
2. Chama `client.rpc('merge_personalizacao_materiais_v2', { p_id: fence.personalizacaoId, p_updates: { apresentacao: { payload: { slides: [], abertura: '', tema_visual: null }, metadata, arquivo_url: presentationUrl, storage_path: presentationUrl ? storagePath : null, ...(presentationUrl ? {bucket} : {}) } }, p_ciclo_id: fence.cicloId, p_source_hash: fence.sourceHash })`.
   - `error` no retorno da RPC → retorna `{ dbWritten: false, error }`, **não lança** (o handler HTTP decide o status da resposta).
3. Se a RPC deu certo: `SELECT aluno_id, conteudo_id FROM conteudo_personalizado WHERE id=:id AND ciclo_id=:ciclo AND source_hash=:hash .maybeSingle()`. Se não achar linha (geração obsoleta — outro ciclo já rodou por cima), loga e retorna `{ dbWritten: true }` sem tentar o upsert de histórico (mesmo comportamento de "ignorou generation stale" do `saveMateriaisGerados` atual).
4. Se achou: `upsert` em `materiais_gerados` com uma linha `{ aluno_id, conteudo_id, personalizacao_id, tipo: 'apresentacao', payload, arquivo_url, storage_path, metadata }`, `onConflict: 'personalizacao_id,tipo,generation_key'`.
5. Retorna `{ dbWritten: true }` (mesmo se o upsert de histórico falhar — a gravação principal em `conteudo_personalizado` já aconteceu; loga o erro do histórico mas não derruba a resposta).

### `server.ts` — handler `/api/v1/render-and-store`

- Valida `generationKeyFor(fence) `consistente (mesma checagem que
  `mergePersonalizacaoMateriais` já faz hoje: se o request não trouxer
  `cicloId`/`sourceHash`/`personalizacaoId` válidos, `400`).
- Depois de gerar deck + subir HTML (sucesso) **ou** capturar a falha
  (catch existente), chama `persistApresentacaoResult` com o resultado (URL
  ou falha) antes de responder.
- Resposta ganha o campo `dbWritten: boolean` (novo), pra o microservice
  saber que não precisa de fallback.

### Cliente Supabase

Reusa o client já instanciado no `server.ts` (`createClient(SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY)`), passado como argumento pro módulo novo — sem
instanciar um segundo client.

## Mudanças no microservice

### `brainHexPdfClient.ts`

- `RenderAndUploadPresentationParams` ganha `personalizacaoId`, `fence`
  (`GenerationFence`, já existe o tipo), e `versionMetadata` (monta com
  `buildPresentationVersionMetadata(fence.generationKey)`, já existente).
- Corpo da requisição inclui os campos novos.
- `RenderAndUploadPresentationResult` ganha `dbWritten: boolean`.
- **No `catch` do timeout/erro de rede** (linhas 93-99, falha de
  transporte): comportamento inalterado — continua devolvendo
  `{ presentationUrl: null, failure: {...} }`. `dbWritten` fica `false`
  nesse caminho (default).

### `server.ts` (`archiveToSupabase` / pontos de chamada, linhas ~187-269 e ~380-476)

- `updates` (objeto passado pra `mergePersonalizacaoMateriais`) **não inclui
  mais `apresentacao`** — só `audio`/`markdown`.
- `tipos` passado pra `saveMateriaisGerados` **não inclui mais
  `'apresentacao'`**.
- Novo: se `presentationResult.dbWritten === false` (falha de transporte, o
  BrainHexPDF não teve chance de gravar nada), chama
  `mergePersonalizacaoMateriais` **de novo**, só com
  `{ apresentacao: {..., via buildPresentationMaterialMetadata} }` — o
  fallback descrito acima. Se `dbWritten === true`, pula esse merge extra
  (BrainHexPDF já gravou, sucesso ou falha).

## Testes

BrainHexPDF hoje não tem infraestrutura de teste nenhuma. Introduzir,
mirando exatamente o padrão já usado no `microservice/` (`node:test` +
`node:assert/strict`, rodado via `tsx`):

- `package.json`: novo script `"test": "node --import tsx --test src/services/materialsPersistence.test.ts"` (lista explícita de arquivos, mesmo padrão do `microservice/package.json`).
- Nova dependência de dev: `tsx` (BrainHexPDF já tem `tsx` como dependência direta, usado pelo `dev` script — reaproveita).
- `src/services/materialsPersistence.test.ts`, com um fake `SupabaseClientLike` (objeto plano, sem mock library — mesmo estilo de `RecordingSession`/fakes já usados no `microservice/`/`api/`):
  - `generationKeyFor` monta `${cicloId}:${sourceHash}` corretamente.
  - Sucesso: `rpc` chamado com `p_updates.apresentacao.metadata.status === "completed"`, `arquivo_url` preenchido.
  - Falha (`presentationUrl: null`, `failure` presente): `rpc` chamado com `status === "failed"`, `error_stage`/`error` presentes, `arquivo_url: null`.
  - RPC retorna erro → `persistApresentacaoResult` retorna `{ dbWritten: false, error }`, **não lança**.
  - `SELECT` não encontra linha (geração obsoleta) → retorna `{ dbWritten: true }` sem chamar `upsert` (capturado via flag no fake).
  - `upsert` chamado com `onConflict: "personalizacao_id,tipo,generation_key"` e uma única linha com `tipo: "apresentacao"`.
- `microservice/src/services/brainHexPdfClient.test.ts` (já existe): novos casos —
  - Corpo da requisição inclui `personalizacaoId`/`cicloId`/`sourceHash`/`presentationVersionMetadata`.
  - Resposta com `dbWritten: true` → `RenderAndUploadPresentationResult.dbWritten === true`.
  - Timeout/erro de rede → `dbWritten === false` (mantido).
- `microservice/server.test.ts` (ou onde `archiveToSupabase`/pontos de chamada já são testados hoje): novo caso — `dbWritten: false` dispara o merge de fallback só pra `apresentacao`; `dbWritten: true` não dispara. Cobrir os 3 call sites (`archiveToSupabase`, `archiveMultiPartToSupabase`, `retryApresentacaoOnly`) mandando `ordem`/`totalPartes` corretos.
- `computeAggregatedApresentacaoEntry` (função pura, duplicada TS↔TS conforme addendum) ganha seu PRÓPRIO arquivo de teste em cada lado (`materialsPersistence.test.ts` no BrainHexPDF, `materialsMerge.test.ts` no microservice — já existe, adicionar casos):
  - 1 parte de 1 (`totalPartes: 1`): sem `partes[]` na saída, comportamento idêntico ao caso single-shot.
  - Parte 1 de 2 chega OK, parte 2 ainda não chegou (`currentPartes` só tem ordem 1): `mergedPartes` preserva a parte 1, `status` fica no valor atual do banco (não vira "completed" cedo).
  - Parte 2 de 2 chega depois, ambas OK: `mergedPartes` tem as 2 ordenadas, `status: "completed"`, `arquivo_url` = o da ordem 1.
  - Uma das partes falha (`failed: true`): `status: "failed"` mesmo com as outras partes OK.
  - Retry de uma parte já existente (mesma `ordem` chega de novo): substitui a entrada antiga em `mergedPartes`, não duplica.

## Addendum: os 3 pontos de chamada (não só o single-shot)

Descoberto durante o planejamento: `renderAndUploadPresentationViaBrainHexPdf`
é chamado em 3 lugares do `microservice/server.ts`, não 1:

1. `archiveToSupabase` (linha 118) — single-shot, sem conceito de `partes[]`.
   Coberto pelas seções acima sem alteração.
2. `archiveMultiPartToSupabase` (linha 309) — **loop sequencial** (`for...of`,
   não `Promise.all`) sobre `parts`, uma chamada por parte, agregando em
   `apresentacao.partes: MaterialPart[]` (`{ ordem, titulo, arquivo_url,
   storage_path }`, `supabaseService.ts:100-105`). É o caminho usado pelo
   `runPipeline` principal (linha 891) — **o mais usado de fato**.
3. `retryApresentacaoOnly` (linha 660) — mesma lógica de loop+agregação de
   `archiveMultiPartToSupabase` (o loop já trata 1 parte ou N de forma
   uniforme), usado no retry de "só a apresentação falhou" (PR #70).

Como as chamadas são sequenciais (não concorrentes) dentro do MESMO job, um
read-modify-write no BrainHexPDF é seguro — não há duas partes escrevendo ao
mesmo tempo. Mas cada chamada HTTP agora é isolada (BrainHexPDF não vê as
outras partes do lote) e precisa preservar as partes já gravadas por
chamadas anteriores.

### Campos novos no request (além dos já listados)

```ts
{
  // ...campos já existentes + os do design principal (personalizacaoId,
  // cicloId, sourceHash, presentationVersionMetadata)
  ordem: number;        // 1-based, posição desta parte no lote
  totalPartes: number;  // tamanho do lote (1 = caminho single-shot/archiveToSupabase)
}
```

`archiveToSupabase` sempre manda `ordem: 1, totalPartes: 1`.

### `MaterialPart` ganha um campo opcional

`supabaseService.ts:100-105` — aditivo, JSONB antigo sem o campo continua
válido:

```ts
export interface MaterialPart {
  ordem: number;
  titulo: string;
  arquivo_url: string | null;
  storage_path: string | null;
  failed?: boolean; // NOVO — permite recomputar status agregado sem
                     // reconstruir mensagens de erro de partes antigas
}
```

### `persistApresentacaoResult` — lógica de agregação (substitui a versão do design principal)

1. Se `totalPartes === 1`: comportamento igual ao já descrito acima (sem
   `partes[]` no `p_updates.apresentacao`) — é exatamente o caso
   `archiveToSupabase`.
2. Se `totalPartes > 1`:
   a. `SELECT materiais FROM conteudo_personalizado WHERE id=:id AND
      ciclo_id=:ciclo AND source_hash=:hash .maybeSingle()` (mesma checagem
      de geração obsoleta — se não achar, loga e retorna `{dbWritten: true}`
      sem escrever nada, igual ao caso single-shot).
   b. `currentPartes = materiais?.apresentacao?.partes ?? []` (array vazio
      se essa é a primeira parte a chegar).
   c. Monta a entrada desta parte: `{ ordem, titulo, arquivo_url:
      presentationUrl, storage_path: presentationUrl ? storagePath : null,
      failed: presentationUrl === null }`. `titulo` vem no request (novo
      campo, igual ao `part.titulo` que o microservice já tinha).
   d. `mergedPartes = [...currentPartes.filter(p => p.ordem !== ordem),
      novaParte].sort((a, b) => a.ordem - b.ordem)`.
   e. `allDone = mergedPartes.length === totalPartes` (todas as partes já
      chegaram) `&& mergedPartes.every(p => !p.failed)`.
   f. `status`: `"completed"` se `allDone`; `"failed"` se qualquer parte em
      `mergedPartes` tem `failed: true`; senão (ainda faltam partes, nenhuma
      falhou ainda) mantém o status atual do banco
      (`materiais?.apresentacao?.metadata?.status ?? "pending"`) — evita
      marcar "completed" prematuramente antes de todas as partes chegarem, e
      evita regredir um "completed" anterior se esta chamada for um retry
      isolado de uma parte específica.
   g. `arquivo_url`/`storage_path` no nível da entrada = os da PRIMEIRA
      parte de `mergedPartes` (`mergedPartes[0]`), igual à convenção atual
      (`presentationParts[0]`).
   h. `p_updates.apresentacao = { payload: { slides: [], tema_visual: null },
      metadata: { status, media_kind: "apresentacao", ...versionMetadata,
      generation_key, updated_at, ...(status==="failed" ? {error_stage:
      failure?.stage ?? "render", error: failure?.error ?? "parte falhou"}
      : {}), ...(mergedPartes[0]?.arquivo_url ? {bucket} : {}) },
      arquivo_url: mergedPartes[0]?.arquivo_url ?? null, storage_path:
      mergedPartes[0]?.storage_path ?? null, partes: mergedPartes }`.
   i. Chama a RPC com esse `p_updates`, upsert em `materiais_gerados` igual
      ao caso single-shot (mas com o `payload`/`arquivo_url` agregados
      acima, não só desta parte).

Simplificação deliberada (YAGNI): a mensagem de erro exposta em
`metadata.error` é da chamada MAIS RECENTE que falhou, não necessariamente a
cronologicamente primeira (o código atual guarda `firstPresentationFailure`
porque tudo roda numa função só; distribuído entre chamadas HTTP isoladas,
manter "a primeira" exigiria persistir esse dado extra sem benefício real —
é só texto de diagnóstico pro professor, não afeta o `status` agregado).

### Mudança nos 3 call sites do microservice

- `archiveToSupabase`: manda `ordem: 1, totalPartes: 1` no request.
- `archiveMultiPartToSupabase` e `retryApresentacaoOnly`: dentro do loop
  `for (const part of parts)`, mandam `ordem: part.ordem, totalPartes:
  parts.length`. Removem inteiramente a montagem local de
  `presentationParts`/`firstPresentationFailure`/a entrada `apresentacao` em
  `updates` — essa chave não é mais construída pelo microservice nesses 2
  pontos.
- Fallback (`dbWritten === false`, falha de transporte): o microservice
  precisa da MESMA lógica de agregação de `partes[]` (passo "2" acima) do
  seu lado, pois ele é quem grava quando o BrainHexPDF não teve chance de
  gravar nada. Extrair essa lógica como função pura duplicada
  deliberadamente entre `microservice/src/lib/materialsMerge.ts` (TS) e o
  módulo novo do BrainHexPDF (TS) — mesmo padrão de duplicação consciente já
  usado hoje entre `materialsMerge.ts` e a função PL/pgSQL
  `merge_personalizacao_materiais_v2` (comentário em
  `materialsMerge.ts:1-6`: "se a lógica mudar aqui, atualize a [outra
  cópia]"). Nome sugerido: `computeAggregatedApresentacaoEntry(currentPartes,
  novaParte, totalPartes, versionMetadata, generationKey)`.

## Fora de escopo

- Mudar o formato de `materiais.apresentacao.payload` (`slides`, `abertura`,
  `tema_visual`) — continua igual.
- Qualquer coisa relacionada às features novas de UI trazidas no PR #5
  (`InteractiveVisualRenderer`, `KnowledgeGraphModal` etc.) — puramente
  frontend, sem relação com este design.
- Autenticação do endpoint (`requireSecret`) — já existe, sem mudança.

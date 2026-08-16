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
- `microservice/server.test.ts` (ou onde `archiveToSupabase`/pontos de chamada já são testados hoje): novo caso — `dbWritten: false` dispara o merge de fallback só pra `apresentacao`; `dbWritten: true` não dispara.

## Fora de escopo

- Mudar o formato de `materiais.apresentacao.payload` (`slides`, `abertura`,
  `tema_visual`) — continua igual.
- Qualquer coisa relacionada às features novas de UI trazidas no PR #5
  (`InteractiveVisualRenderer`, `KnowledgeGraphModal` etc.) — puramente
  frontend, sem relação com este design.
- Autenticação do endpoint (`requireSecret`) — já existe, sem mudança.

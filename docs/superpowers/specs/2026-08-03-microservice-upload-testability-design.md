# Testabilidade do pipeline de upload no microservice

## Contexto

Investigando um protótipo externo em busca de funcionalidades a portar,
concluí que não há nada de novo a trazer dele (TTS de diálogo duplo e
cascata de fallback Gemini/OpenAI já existem, mais maduros, no monorepo
real; a UI do protótipo não tem lugar arquitetural equivalente no produto
real). O que sobrou de real e vale corrigir é a testabilidade do próprio
pipeline de upload do microservice, descoberta durante essa investigação.

Hoje, `getClient()` em `microservice/src/services/supabaseService.ts` lê
`process.env.SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` e instancia
`createClient()` do `@supabase/supabase-js` diretamente dentro da função,
sem nenhum ponto de injeção. `archiveMultiPartToSupabase` e
`archiveToSupabase` (em `microservice/server.ts`) não são exportadas.
`microservice/src/testSetup.ts` zera deliberadamente as credenciais
Supabase antes de qualquer teste (nunca herdar credenciais reais) — o que
também significa que hoje é literalmente impossível testar `uploadBuffer`
sem mockar o módulo `@supabase/supabase-js` inteiro. `server.test.ts`
sempre substitui o job runner inteiro por um fake (via
`AppOptions.personalizacaoJobRunner`, o único ponto de DI que existe hoje),
nunca chegando dentro da lógica de path/upload de verdade.

## Escopo cirúrgico

Só o caminho de upload em si: `getClient`/`uploadBuffer` em
`supabaseService.ts`, e `archiveMultiPartToSupabase`/`archiveToSupabase` em
`server.ts`. As outras 5 funções de `supabaseService.ts` que também chamam
`getClient()` internamente (`startJobHeartbeat`, `recoverStaleJobs`,
`markPersonalizacaoFailed`, `saveMateriaisGerados`, `tryRpc`) lidam com
fencing de geração e merges atômicos via RPC — lógica de integridade de
dados crítica, fora de escopo. Elas se beneficiam automaticamente do mesmo
ponto de injeção (item 1 abaixo) sem precisar de nenhuma mudança de
assinatura, porque todas passam por `getClient()`.

## Mudança 1 — Ponto de injeção único em `getClient()`

Em `microservice/src/services/supabaseService.ts`, adiciona um override
testável (mesmo padrão já usado em `contentGenerationService.ts` com
`resetGeminiContentGenerationCircuit()` — uma função de override/reset
exportada, sem mudar assinatura de quem consome):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

let clientOverride: SupabaseClient | null = null;

/**
 * Escape hatch só para testes: injeta um client fake, ignorando process.env.
 * Chame com `null` para restaurar o comportamento normal (ler process.env).
 */
export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  clientOverride = client;
}

function getClient(): SupabaseClient {
  if (clientOverride) return clientOverride;
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key);
}
```

Nenhuma outra linha de `supabaseService.ts` muda — todas as funções que já
chamam `getClient()` internamente continuam exatamente como estão, mas
passam a ser testáveis por transitividade.

## Mudança 2 — Exportar as funções de arquivamento em `server.ts`

`archiveMultiPartToSupabase` e `archiveToSupabase` (hoje `async function`
de módulo, sem `export`) passam a ser exportadas, sem nenhuma outra mudança
de assinatura ou comportamento — só visibilidade, para importação direta em
teste.

## Mudança 3 — Testes novos

- `microservice/src/services/supabaseService.test.ts` (já existe, cobre só
  funções puras hoje) ganha testes para `uploadBuffer` usando
  `setSupabaseClientForTesting()` com um client fake em memória:
  - Caminho de sucesso: client fake retorna `{ error: null }` no upload e
    uma public URL fixa em `getPublicUrl` → `uploadBuffer` retorna essa URL.
  - Caminho de erro: client fake retorna `{ error: { message: "..." } }`
    no upload → `uploadBuffer` lança um erro cuja mensagem inclui o
    `storagePath` passado.
  - Verifica que `bucket`, `storagePath`, `contentType` e `upsert: true`
    chegam exatamente como passados ao client fake (via spy/closure que
    guarda os argumentos recebidos).
- Novo arquivo `microservice/server.archive.test.ts` — importa
  `archiveMultiPartToSupabase`/`archiveToSupabase` diretamente de
  `server.ts`, usa `setSupabaseClientForTesting()` com o mesmo client fake:
  - Confirma que os paths de áudio/markdown/apresentação são montados com
    os segmentos certos: `{storagePath}/audio/material-{refId}{suffix}.{ext}`,
    `{storagePath}/markdown/material-{refId}{suffix}.md`,
    `{storagePath}/apresentacao/material-{refId}{suffix}.html` — com
    sufixo `-parte-NN` (padded 2 dígitos) só quando `parts.length > 1`, e
    sem sufixo quando há só 1 parte.
  - Confirma que a extensão/mime do áudio depende de `mp3Base64` vs
    `wavBase64` (mp3+audio/mpeg quando `mp3Base64` presente, senão
    wav+audio/wav).
  - Confirma que uma falha de upload em UMA parte (client fake lança erro
    só para aquele path específico) não impede as demais partes de serem
    tentadas — o código já captura erro por-parte com `try/catch`
    individual; o teste fixa esse comportamento existente como contrato.
  - Confirma que o retorno agrega `audioMp3Url`/`markdownUrl` a partir da
    primeira parte, como já acontece hoje.
- Todo teste novo chama `setSupabaseClientForTesting(null)` num hook de
  cleanup (`afterEach`/`finally`) para não vazar o override entre testes.

## Fora de escopo

- Não refatorar `startJobHeartbeat`/`recoverStaleJobs`/`markPersonalizacaoFailed`/
  `saveMateriaisGerados`/`tryRpc` além de se beneficiarem automaticamente do
  novo ponto de injeção — nenhuma mudança de assinatura ou comportamento
  nelas.
- Não mudar a lógica de negócio de `archiveMultiPartToSupabase`/
  `archiveToSupabase` — só exportar.
- Não portar nada do protótipo `remix-trailup-brainhex-converter` (TTS
  dialogado e cascata de fallback já existem de forma mais madura; UI sem
  lugar arquitetural equivalente).
- Não tocar `renderAndUploadPresentation` (chamada por
  `archiveMultiPartToSupabase`) além de deixá-la se beneficiar do mesmo
  ponto de injeção — sem mudança de assinatura.

## Teste de aceitação

- Suíte completa do microservice (`*.test.ts`) passa, incluindo os testes
  novos de `uploadBuffer` e `archiveMultiPartToSupabase`/`archiveToSupabase`
  exercitando a lógica real de path/upload com um client fake — sem
  depender de credenciais Supabase reais nem mockar o módulo
  `@supabase/supabase-js` inteiro.
- `npx tsc --noEmit` limpo.

# Design: BrainHexPDF como motor de apresentação

Data: 2026-08-15
Status: aprovado para plano de implementação

## Contexto

O `microservice/` (api-brainhex) já migrou a geração de apresentação de PDF
(Puppeteer, removido em 2026-07-30 por instabilidade em produção) para HTML
direto (`PRESENTATION_ENGINE_VERSION = "html-direct-v1"`), com um motor
clássico (`slideTemplate.ts` + `slideAssetGenerator.ts`, imagens via OpenAI/
Gemini) e um motor "imersivo" (HTML por slide via Gemini, dentro de
`geminiService.ts`).

Existe um repositório externo, `../BrainHexPDF` (Google AI Studio, Node/
Express + React/Vite), que gera um "deck" de apresentação via Gemini com um
schema de slide mais rico (quiz, boss battle, timeline, certificate, bento,
decision branch etc.) e paleta/tema por perfil BrainHex já mapeados. Hoje
esse repositório:

- Gera o deck (JSON estruturado) no servidor via Gemini — isso já funciona
  como serviço HTTP.
- Renderiza esse deck em HTML completo (`generateInteractiveHtml`) e exporta
  PDF via `html2canvas`+`jsPDF` — **mas só no frontend/browser**. O servidor
  (`server.ts`) nunca importa essas funções de renderização.
- Sabe subir arquivo cru no Supabase Storage (rotas `/api/supabase/*`), mas
  não escreve na tabela `conteudo_personalizado` nem conhece o contrato de
  merge/versionamento (`generation_key`, `merge_personalizacao_materiais_v2`)
  que o microservice atual usa.
- Não tem autenticação em nenhuma rota (nenhum header validado de fato).
- Roda na porta 3000 por padrão — colide com o microservice atual.

Decisão do usuário: usar o BrainHexPDF como o motor de geração de
apresentação (deck + render HTML), substituindo por completo os motores
clássico e imersivo do microservice atual, que serão removidos.

## Decisões fixas (validadas com o usuário)

1. **Serviço HTTP separado.** BrainHexPDF roda como processo próprio (porta
   e deploy próprios), chamado pelo microservice atual via HTTP — não é
   portado/copiado para dentro do `microservice/`.
2. **Microservice atual mantém a escrita em `conteudo_personalizado`.**
   BrainHexPDF só gera o deck, renderiza o HTML e sobe o arquivo cru no
   Supabase Storage, devolvendo `url`/`storage_path`. O merge JSONB
   (`materiais.apresentacao`, `generation_key`, versionamento) continua
   inteiramente no microservice atual (`mergePersonalizacaoMateriais`), sem
   duplicar essa lógica em outro repositório.
3. **Corte seco, sem fallback.** Os motores clássico e imersivo de
   apresentação são removidos do microservice atual. Se a chamada ao
   BrainHexPDF falhar/der timeout, a apresentação inteira falha e é marcada
   como erro (`markPersonalizacaoFailed`), igual ao comportamento já
   existente para qualquer falha de mídia obrigatória.
4. **Divisão em partes continua no microservice atual.** O BrainHexPDF não
   sabe nada sobre "partes" — ele recebe um pedaço de conteúdo por chamada e
   devolve um HTML por chamada. A fronteira de cada "parte" é decidida pelo
   microservice, reaproveitando o mesmo agrupamento de `content_blocks` já
   usado hoje para gerar markdown/audioScript em lotes (`partitionContentBlocks`
   / `CONTENT_GENERATION_BLOCK_BATCH_SIZE`), evitando introduzir uma segunda
   lógica de particionamento.
5. **Fora de escopo:** o caminho legado Python (`api/app/services/
   slides_pdf.py`, ReportLab), usado apenas pelo fallback do agente LangGraph
   (`MultiOutputPipeline`) fora do fluxo principal via microservice, não é
   alterado.

## Arquitetura

```
API Python (personalizacao.py)
   │  POST /api/personalizar   (já existe, sem mudança de contrato externo)
   ▼
microservice/ (trailup, porta 3000)
   ├─ gera markdown + audioScript via Gemini (SEM MUDANÇA)
   ├─ particiona a apresentação reaproveitando os lotes de content_blocks
   │  já usados para markdown/audio — cada lote vira 1 "parte"
   ├─ para cada parte:
   │     POST BrainHexPDF /api/v1/render-and-store   (NOVO endpoint)
   │        BrainHexPDF (porta 3002):
   │          1. gera deck (Gemini, já existe — DECK_RESPONSE_SCHEMA)
   │          2. renderiza HTML completo (generateInteractiveHtml,
   │             já existe, hoje só usada no frontend — função pura,
   │             portável para o server sem alteração)
   │          3. sobe o HTML no Supabase Storage (service role key)
   │        ⇐ devolve { success, url, storage_path, bucket, slide_count }
   └─ agrega o retorno de todas as partes em
      materiais.apresentacao.partes[] e chama
      merge_personalizacao_materiais_v2 (RPC, SEM MUDANÇA)
```

## Mudanças no BrainHexPDF

### Novo endpoint: `POST /api/v1/render-and-store`

Responsabilidade única: dado conteúdo + perfil, gerar o deck, renderizar em
HTML e devolver onde o arquivo foi salvo no Storage.

Request (payload mínimo — superset compatível com os campos já aceitos por
`/api/v1/generate`):

```ts
{
  targetProfile: string;        // perfil BrainHex em minúsculas (obrigatório)
  topic: string;                 // tema/tópico da parte (ex: content_blocks[0].tema)
  sourceText: string;             // conteúdo serializado da parte (content_blocks daquele lote)
  classe?: string;
  narrativeStyle?: 'rpg-story' | 'practical-technical' | 'balanced';
  slideCount?: number | 'auto';
  bucket: string;                 // ex: "conteudo_aluno"
  storagePath: string;             // path completo do arquivo .html (definido pelo microservice)
}
```

Response (sucesso):

```ts
{ success: true, url: string, storage_path: string, bucket: string, slide_count: number }
```

Response (erro): `{ success: false, stage: string, error: string }` com
status HTTP != 2xx.

### Autenticação (nova — hoje não existe nenhuma)

Middleware `requireSecret`, espelhando o já existente em
`microservice/server.ts:1126-1135` (opt-in via env, header `x-api-secret` ou
`Authorization: Bearer`, comparação estrita, `401` em caso de divergência).
Aplicado só no novo endpoint (as rotas antigas — UI, `/api/generate-deck`
etc. — continuam sem autenticação, fora de escopo mexer nelas).

Novo env: `API_SHARED_SECRET`.

### Renderização

Importar `generateInteractiveHtml` de `src/utils/deckExportUtils.ts`
diretamente no `server.ts` (confirmado: função pura de string, sem
dependência de `document`/`window`/DOM; as referências a APIs de browser
dentro dela estão dentro do template literal que vira `<script>` do HTML
gerado, executado depois no browser do usuário final, não no processo Node
que gera a string).

### Supabase

Novo env `SUPABASE_SERVICE_ROLE_KEY` (hoje só existe `SUPABASE_ANON_KEY`,
usada pelas rotas antigas de Storage). O novo endpoint usa a service role
key para poder gravar no bucket `conteudo_aluno` (mesmo bucket já usado pelo
microservice atual), respeitando bucket/path vindos do request em vez de
usar o bucket default antigo (`trailup-slides`).

### Porta

Porta de dev fixa alterada de 3000 (colide com o microservice atual) para
**3002**.

## Mudanças no microservice (trailup)

### Removido

- `src/lib/slideTemplate.ts` (motor clássico de montagem de HTML)
- `src/lib/slideAssetGenerator.ts` (`generateFullSlideImages`)
- `src/services/openaiImageService.ts` (confirmado: sem outro consumidor
  além do pipeline de slides)
- `src/services/slideIconService.ts`
- Motor imersivo dentro de `geminiService.ts` (`renderImmersiveSlides` e a
  parte de `resolvePresentationRendering` que decide entre os dois motores)
- Geração de `slides[]` dentro de `processMediaWithGemini` (markdown e
  audioScript continuam sendo gerados normalmente — só a parte de slides sai
  do prompt/schema)

### Adicionado

- Função `generatePresentationViaBrainHexPdf(...)`, chamada dentro de
  `runPipeline()` no lugar do trecho removido — monta o request por parte
  (mapeando `content_blocks` da parte para `topic`/`sourceText`/
  `targetProfile`), chama `POST {BRAINHEXPDF_API_URL}/api/v1/render-and-store`
  com header `x-api-secret: {BRAINHEXPDF_API_SECRET}`, recebe `url`/
  `storage_path` de volta.
- Novos envs: `BRAINHEXPDF_API_URL`, `BRAINHEXPDF_API_SECRET`.
- Bump de `PRESENTATION_ENGINE_VERSION` em `src/constants/pipelineVersions.ts`
  (de `"html-direct-v1"` para `"brainhexpdf-v1"`) — usa o mecanismo de
  contrato de versão já existente (checagem em `/api/health` e no payload de
  `/api/personalizar`) para forçar regeneração das apresentações já
  existentes via `source_hash`/`generation_key`.

### Sem mudança

- `mergePersonalizacaoMateriais` (RPC), `markPersonalizacaoFailed`,
  heartbeat, `recoverStaleJobs`, geração de markdown/audioScript,
  `requireSecret` em `/api/personalizar`, contrato de
  `conteudo_personalizado.materiais.apresentacao` (mesma forma — `payload`,
  `metadata`, `arquivo_url`, `storage_path`, `partes[]` — só muda a origem
  do HTML de cada parte e o valor de `metadata.engine`).

## Dev tooling

- `scripts/dev.ps1`: novo serviço `brainhexpdf` (dir `../BrainHexPDF`, porta
  3002).
- `CLAUDE.md`: tabela de serviços do monorepo atualizada para refletir o
  BrainHexPDF como serviço externo consumido pelo microservice (mesmo
  tratamento hoje dado a `../BrainHexPDF`/`../ApiBrainHex` como repositórios
  externos ao monorepo, mas agora com integração ativa em vez de só
  referência).

## Tratamento de erro

Qualquer erro do BrainHexPDF (HTTP != 2xx, timeout, `success: false`) em
qualquer parte faz a apresentação inteira falhar — sem fallback para os
motores removidos. O microservice grava o erro em
`materiais.apresentacao.metadata` (`status: "failed"`, `error_stage`,
`error`) via `markPersonalizacaoFailed`, exatamente como já acontece hoje
para outras falhas de mídia obrigatória.

## Ponto em aberto para a fase de plano

Hoje a divisão em "partes" de markdown/audioScript é decidida organicamente
depois da geração (por heading de nível 2 do markdown já gerado,
`splitProcessedContentIntoParts`), não pelos lotes de `content_blocks`. Ao
reaproveitar os lotes de `content_blocks` como fronteira das partes da
apresentação, os limites de "parte" da apresentação podem não coincidir
exatamente com os limites de "parte" do markdown/audio (que continuam
decididos organicamente). Antes de implementar, verificar em
`mobile/src/components/PersonalizedTopicView.tsx` (e telemetria relacionada)
se o consumo assume alinhamento 1:1 entre partes de tipos de material
diferentes ou se cada tipo é consumido independentemente. Se houver
suposição de alinhamento, a fase de plano precisa decidir entre (a) manter
alinhamento fazendo `splitProcessedContentIntoParts` também decidir a
fronteira usada para as chamadas ao BrainHexPDF, ou (b) confirmar que
partes independentes por tipo de material são aceitáveis.

## Fora de escopo

- Caminho legado Python (`slides_pdf.py`/`MultiOutputPipeline`, ReportLab).
- Remoção ou alteração da UI React/rotas legadas do BrainHexPDF
  (`/api/generate-deck`, `/api/supabase/test|upload|list`, etc.) — continuam
  existindo como estão.
- Autenticação nas rotas antigas do BrainHexPDF (permanece como está: sem
  validação real).

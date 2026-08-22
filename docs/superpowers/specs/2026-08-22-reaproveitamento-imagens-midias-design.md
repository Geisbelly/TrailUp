# Reaproveitamento de imagens entre mídias (D2) — Design

## Contexto

Primeira sub-parte do sub-projeto D (o maior e mais arquitetural de uma
pilha de pedidos sobre personalização/BrainHexPDF — A, B e C já entregues:
[BrainHexPDF#11](https://github.com/Geisbelly/BrainHexPDF/pull/11),
[BrainHexPDF#12](https://github.com/Geisbelly/BrainHexPDF/pull/12)/[TrailUp#92](https://github.com/Geisbelly/TrailUp/pull/92),
[BrainHexPDF#13](https://github.com/Geisbelly/BrainHexPDF/pull/13)).

D foi decomposto em: **D2** (este documento — reaproveitar imagens entre
mídias), D1 (XP de slides com checkpoint), D3 (imagem vinculada a um
segundo específico do áudio) e D4 (ajustes de consumo no mobile que sobrarem
de D1/D3). D2 foi escolhido pra começar por não depender da parte de maior
incerteza técnica de D1 (ponte de comunicação WebView↔app).

Pedido original: imagens de exemplo não deveriam ser exclusivas das
apresentações — deveriam aparecer também em markdown e áudio,
reaproveitando imagens já geradas em vez de gerar uma nova por mídia, com
base no conteúdo/imagens enviados pelo professor.

## Descoberta que definiu o escopo

O markdown (e o roteiro de áudio) são gerados e **persistidos ANTES** da
chamada ao BrainHexPDF (`microservice/server.ts` — o texto do markdown já
pronto é usado como fonte pro deck de slides). Isso significa que as
imagens que o BrainHexPDF gera *para os slides* ainda não existem no
momento em que markdown/áudio são montados — não dá pra "reaproveitar" essas
imagens especificamente sem reordenar todo o pipeline de geração (opção
mais arquitetural, descartada nesta fase por decisão explícita do usuário).

**Escopo confirmado**: markdown e áudio passam a usar as imagens que o
**professor enviou como material de referência** (`fontes_personalizacao`)
— essas já estão disponíveis **antes** de qualquer geração começar, sem
problema de ordem. Geração de imagem por IA continua exclusiva dos slides
por enquanto (sem mudança no BrainHexPDF nesta sub-parte).

## Peças já existentes que este design reaproveita

- `microservice/server.ts:967-974` (`fetchFontesAsFileData` + filtro
  `imageAttachments`) já baixa as imagens do professor em base64 — mesmo
  formato usado hoje só para alimentar o BrainHexPDF. Falta só threadear a
  **URL original** (`fonte.url`, já usada internamente pra download) junto
  com os demais campos, pra poder referenciá-la diretamente no markdown sem
  reupload.
- `LEVEL_2_HEADING_RE` / `splitMarkdownByLevel2Headings`
  (`microservice/src/services/geminiService.ts:1102-1150`) — o markdown E o
  roteiro de áudio já usam o mesmo marcador `## <título>` como fronteira de
  seção/bloco (o do áudio é removido antes da narração, só serve de corte).
  Esses headings são o ponto natural de inserção de imagem no markdown.
- `MaterialEntry.payload?: Record<string, unknown>`
  (`microservice/src/services/supabaseService.ts:108-109`) — campo livre já
  suportado pelo merge/persistência (`mergePersonalizacaoMateriais`), sem
  precisar de migração de schema. É onde a URL da imagem de capa do áudio
  vai morar.
- `audioMp3Url` é **um único arquivo final** (`microservice/server.ts:173`),
  não dividido em partes — confirma que "imagem por segundo específico"
  (D3) é mesmo uma extensão futura separada, não algo que já existe pra
  reaproveitar aqui.

## Design

### 1. Markdown — 1 imagem por seção, round-robin entre as imagens do professor

Depois que o markdown é gerado (texto pronto, com headings `## <título>`
delimitando seções) e antes de ser enviado pro upload/merge: para cada
heading de nível 2 encontrado, se houver pelo menos 1 imagem do professor
disponível, insere `![<título>](<url-da-imagem>)` logo após o heading.

Seleção da imagem por seção: round-robin determinístico entre as imagens
disponíveis, na ordem em que os headings aparecem no documento (seção 1 →
imagem 0, seção 2 → imagem 1, seção 3 → imagem 0 de novo se só houver 2
imagens, etc.) — sem chamada extra ao Gemini, sem custo de IA adicional.
Não há noção de "relevância por assunto" aqui (diferente do
`referenceImageIndex` dos slides, que o próprio modelo escolhe) — é
distribuição simples, suficiente pro objetivo de "usar todas as imagens
enviadas, não deixar nenhuma de fora".

Quando o professor não enviou nenhuma imagem: nenhum heading recebe
imagem — comportamento atual preservado, sem regressão.

**Zero mudança necessária no mobile**: `MarkdownBlock.tsx` usa
`react-native-markdown-display` sem customização de `rules`, que já
renderiza `![]()` como `<Image>` por padrão.

### 2. Áudio — imagem de capa única

A mesma imagem escolhida para a **primeira** seção do markdown (mantém
consistência visual entre as duas mídias do mesmo tópico, sem precisar de
uma segunda lógica de seleção independente) é gravada como
`payload: { capaUrl: <url> }` no `MaterialEntry` do áudio, usando o campo
livre já existente — sem migração de schema.

**Muda no mobile**: `mobile/src/components/funcionais/AudioPlayer.tsx`
precisa de uma prop nova opcional (ex. `capaUrl?: string`) pra exibir essa
imagem de capa, e o componente pai que hoje lê `materiais.audio` e monta a
prop `url` do player precisa também ler `payload.capaUrl` de lá e repassar.

### Fora de escopo (fica pra D3/D4 ou não entra)

- Geração de imagem por IA para markdown/áudio (só imagens do professor
  nesta fase).
- Imagem vinculada a um segundo específico dentro do áudio (D3 — precisa de
  um modelo de dados novo pra pontos de tempo, que hoje não existe em lugar
  nenhum, nem no player nem no `ProcessedContent`).
- Qualquer mudança no BrainHexPDF ou no fluxo de `slideIllustrations.ts`.

## Testes

Mesmo padrão TDD (`node:test`/`node:assert/strict`) já usado no
microservice.

- Nova função pura (ex. `insertImagesIntoMarkdown(markdown, images):
  string`) em `microservice/src/utils/` (ou local equivalente já usado por
  outras funções puras de texto do projeto): cobrir headings múltiplos com
  N imagens (round-robin, incluindo N < número de headings e N > número de
  headings), markdown sem nenhum heading nível 2 (não quebra, retorna sem
  alteração), lista de imagens vazia (retorna markdown sem alteração), e a
  extração da "primeira imagem escolhida" pra reaproveitar como capa do
  áudio.
- `fetchFontesAsFileData`: passa a incluir `url` no retorno, sem quebrar os
  consumidores existentes que só usavam `data`/`mimeType`/`name`.
- Mobile: `AudioPlayer.tsx` — teste (mesmo mecanismo de stub via
  `require.cache` já usado em `PresentationSlidesBlock.test.ts`, se o
  componente tiver lógica não-trivial o suficiente pra justificar; senão,
  cobertura fica só do lado do dado — de onde `capaUrl` é lido e repassado).

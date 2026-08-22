# Reaproveitamento de imagens entre mídias (D2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Markdown e áudio passam a exibir as imagens que o professor enviou como material de referência (não mais exclusivas dos slides), sem gerar imagem nova por mídia.

**Architecture:** `microservice/server.ts`'s `runPipeline` (o fluxo real de produção — `/api/v1/archive` fica fora de escopo, ver Task 4) já baixa as imagens do professor em base64 (`imageAttachments`) antes de qualquer geração de texto/áudio começar — sem problema de ordem, ao contrário das imagens que o BrainHexPDF gera pros slides (essas só existem depois que o markdown já foi persistido). O markdown final recebe `![](url)` logo após cada heading `## <título>` (round-robin entre as imagens disponíveis, sem chamada extra ao Gemini) ANTES de `splitProcessedContentIntoParts` — a divisão em partes já existente cuida do resto sem mudança. O áudio ganha uma imagem de capa única (a mesma da 1ª seção do markdown), gravada no campo livre `MaterialEntry.payload` já existente (sem migração de schema), e propagada até `AudioPlayer.tsx` pela mesma trilha que `payload.roteiro` já percorre hoje (`mobile/src/utils/personalization.ts` → `ContentRenderer.tsx` → `AudioPlayer.tsx`).

Ver spec completa em `docs/superpowers/specs/2026-08-22-reaproveitamento-imagens-midias-design.md`.

**Tech Stack:** TypeScript, `node:test`/`node:assert/strict` (microservice); mobile sem infra de teste de componente RN — mudança de UI simples, sem teste automatizado dedicado (mesmo critério já usado nesta sessão pro `WebContentFrame`/`DocumentBlock`).

**Worktree:** `.worktrees/reaproveitamento-imagens-midias` (branch `feature/reaproveitamento-imagens-midias`, a partir de `origin/main`).

---

### Task 0: baseline de testes do microservice

- [ ] **Step 1: Instalar dependências e rodar a suíte**

Run: `cd microservice && npm install && npm test 2>&1 | tail -15`
Expected: todos os testes passando (baseline limpa antes de qualquer mudança).

---

### Task 1: `insertImagesIntoMarkdown` — inserir imagens após cada heading

**Files:**
- Create: `microservice/src/utils/markdownImages.ts`
- Test: `microservice/src/utils/markdownImages.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `microservice/src/utils/markdownImages.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { insertImagesIntoMarkdown } from "./markdownImages";

test("insere uma imagem apos cada heading de nivel 2, em round-robin", () => {
  const markdown = "## Primeira Seção\n\nTexto 1.\n\n## Segunda Seção\n\nTexto 2.\n\n## Terceira Seção\n\nTexto 3.";
  const images = [{ url: "https://x.test/a.png" }, { url: "https://x.test/b.png" }];

  const result = insertImagesIntoMarkdown(markdown, images);

  assert.match(result, /## Primeira Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/a\.png\)/);
  assert.match(result, /## Segunda Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/b\.png\)/);
  // 3a secao repete a 1a imagem (round-robin com so 2 imagens disponiveis)
  assert.match(result, /## Terceira Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/a\.png\)/);
});

test("sem imagens disponiveis: retorna o markdown sem alteracao", () => {
  const markdown = "## Única Seção\n\nTexto.";
  assert.equal(insertImagesIntoMarkdown(markdown, []), markdown);
});

test("markdown sem nenhum heading de nivel 2: retorna sem alteracao", () => {
  const markdown = "Texto solto, sem headings.\n\nMais texto.";
  const images = [{ url: "https://x.test/a.png" }];
  assert.equal(insertImagesIntoMarkdown(markdown, images), markdown);
});

test("preserva o conteudo original integralmente, so adiciona as linhas de imagem", () => {
  const markdown = "## Seção\n\nParágrafo importante que não pode sumir.";
  const images = [{ url: "https://x.test/a.png" }];

  const result = insertImagesIntoMarkdown(markdown, images);

  assert.match(result, /Parágrafo importante que não pode sumir\./);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd microservice && node --import tsx --test src/utils/markdownImages.test.ts`
Expected: FAIL — o módulo `./markdownImages` não existe ainda.

(Se `tsx` não estiver disponível localmente, usar `npx tsx --test ...` — o microservice já tem `tsx` como dependência de dev, checar `package.json` antes.)

- [ ] **Step 3: Implementar**

Criar `microservice/src/utils/markdownImages.ts`:

```typescript
export interface MarkdownImage {
  url: string;
}

// Mesmo padrao de heading de nivel 2 usado em splitMarkdownByLevel2Headings
// (geminiService.ts) para dividir o markdown em partes/blocos - reaproveita
// o mesmo ponto de fronteira, sem acoplar aos dois modulos diretamente.
const LEVEL_2_HEADING_RE = /^##[ \t]+.+?[ \t]*$/gm;

/**
 * Insere uma imagem logo apos cada heading de nivel 2 (##) do markdown,
 * ciclando (round-robin) entre as imagens disponiveis - sem chamada extra
 * ao Gemini, sem nocao de "relevancia por assunto" (diferente do
 * referenceImageIndex dos slides, que o modelo escolhe). Objetivo e
 * garantir que todas as imagens do professor apareçam em algum lugar do
 * documento, nao deixar nenhuma de fora.
 */
export function insertImagesIntoMarkdown(markdown: string, images: MarkdownImage[]): string {
  if (images.length === 0) return markdown;

  const matches = [...markdown.matchAll(LEVEL_2_HEADING_RE)];
  if (matches.length === 0) return markdown;

  let result = "";
  let cursor = 0;
  matches.forEach((match, i) => {
    const headingEnd = (match.index ?? 0) + match[0].length;
    result += markdown.slice(cursor, headingEnd);
    const image = images[i % images.length];
    result += `\n\n![Imagem de referência](${image.url})`;
    cursor = headingEnd;
  });
  result += markdown.slice(cursor);
  return result;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd microservice && node --import tsx --test src/utils/markdownImages.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add microservice/src/utils/markdownImages.ts microservice/src/utils/markdownImages.test.ts
git commit -m "feat(microservice): adiciona insertImagesIntoMarkdown para distribuir imagens do professor no markdown"
```

---

### Task 2: threadear a URL original das imagens do professor

**Files:**
- Modify: `microservice/server.ts` (`fetchFontesAsFileData`, linhas ~1152-1169; `imageAttachments`, linhas ~972-974)
- Test: nenhum novo (mudança aditiva num tipo de retorno já coberto indiretamente pelos testes de integração existentes do `server.ts`, se houver; verificar rodando a suíte completa no Step 3)

- [ ] **Step 1: Adicionar `url` ao retorno de `fetchFontesAsFileData`**

Em `microservice/server.ts`, localizar:

```typescript
async function fetchFontesAsFileData(
  fontes: FonteItem[]
): Promise<{ data: string; mimeType: string; name: string }[]> {
  const results: { data: string; mimeType: string; name: string }[] = [];
  for (const fonte of fontes) {
    if (!fonte.url) continue;
    try {
      const buffer = await downloadFonteStreamed(fonte.url);
      if (!buffer) continue;
      const base64 = buffer.toString("base64");
      const name   = fonte.url.split("/").pop()?.split("?")[0] ?? "arquivo";
      results.push({ data: base64, mimeType: fonte.mime_type, name });
    } catch (err) {
      log.error("erro ao baixar fonte", { url: fonte.url, err });
    }
  }
  return results;
}
```

Substituir por (acrescenta `url: fonte.url` ao tipo de retorno e ao push):

```typescript
async function fetchFontesAsFileData(
  fontes: FonteItem[]
): Promise<{ data: string; mimeType: string; name: string; url: string }[]> {
  const results: { data: string; mimeType: string; name: string; url: string }[] = [];
  for (const fonte of fontes) {
    if (!fonte.url) continue;
    try {
      const buffer = await downloadFonteStreamed(fonte.url);
      if (!buffer) continue;
      const base64 = buffer.toString("base64");
      const name   = fonte.url.split("/").pop()?.split("?")[0] ?? "arquivo";
      results.push({ data: base64, mimeType: fonte.mime_type, name, url: fonte.url });
    } catch (err) {
      log.error("erro ao baixar fonte", { url: fonte.url, err });
    }
  }
  return results;
}
```

- [ ] **Step 2: Propagar `url` em `imageAttachments`**

Localizar (perto da linha 972-974):

```typescript
  const imageAttachments = filesData
    .filter((f) => f.mimeType.startsWith("image/"))
    .map((f) => ({ data: f.data, mimeType: f.mimeType, name: f.name }));
```

Substituir por:

```typescript
  const imageAttachments = filesData
    .filter((f) => f.mimeType.startsWith("image/"))
    .map((f) => ({ data: f.data, mimeType: f.mimeType, name: f.name, url: f.url }));
```

(`imageAttachments` continua sendo passado como `attachments` pro BrainHexPDF em `renderAndUploadPresentationViaBrainHexPdf` sem nenhuma mudança — `url` é um campo extra que esse consumidor ignora, TypeScript não reclama de propriedade excedente em variável.)

- [ ] **Step 3: Rodar a suíte completa**

Run: `cd microservice && npm test 2>&1 | tail -15`
Expected: todos os testes passando (mudança é só um campo a mais no tipo de retorno, não deveria quebrar nada existente — se algum teste mockar `fetchFontesAsFileData` ou `imageAttachments` com o shape antigo, ajustar o mock pra incluir `url`).

- [ ] **Step 4: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): propaga a URL original das fontes de imagem do professor"
```

---

### Task 3: conectar `insertImagesIntoMarkdown` e a capa do áudio no `runPipeline`

**Files:**
- Modify: `microservice/server.ts` (import no topo; bloco de geração em `runPipeline`, linhas ~977-994; chamada de `archiveMultiPartToSupabase`, linhas ~1076-1086; definição de `archiveMultiPartToSupabase`, linhas ~389-531)

- [ ] **Step 1: Importar a nova função**

No topo de `microservice/server.ts`, junto aos demais imports locais:

```typescript
import { insertImagesIntoMarkdown } from "./src/utils/markdownImages";
```

- [ ] **Step 2: Augmentar o markdown ANTES da divisão em partes**

Em `runPipeline`, localizar:

```typescript
  // 2. Texto + slides via Gemini (multi-arquivo)
  const resultado = await processMediaWithGemini(
    filesData,
    profile,
    contentBlocks,
    presentationPlan,
    guidancePrompt,
  );

  // 3. Divide o resultado JA sintetizado ...
  const parts = splitProcessedContentIntoParts({
    markdown: resultado.markdown,
    audioScript: resultado.audioScript,
    slides: resultado.slides,
  });
```

Inserir a chamada logo após `resultado` ser obtido, antes de `splitProcessedContentIntoParts`:

```typescript
  // 2. Texto + slides via Gemini (multi-arquivo)
  const resultado = await processMediaWithGemini(
    filesData,
    profile,
    contentBlocks,
    presentationPlan,
    guidancePrompt,
  );

  // Distribui as imagens do professor pelo markdown ANTES de dividir em
  // partes - a divisao por heading (## titulo) ja existente cuida do resto
  // sem mudanca, cada parte carrega as imagens que caem dentro da sua
  // fatia. Precisa ser feito aqui (nao depois do BrainHexPDF) porque o
  // markdown ja foi persistido antes da chamada de apresentacao - ver
  // spec, secao "Descoberta que definiu o escopo".
  resultado.markdown = insertImagesIntoMarkdown(resultado.markdown, imageAttachments);

  // 3. Divide o resultado JA sintetizado ...
  const parts = splitProcessedContentIntoParts({
    markdown: resultado.markdown,
    audioScript: resultado.audioScript,
    slides: resultado.slides,
  });
```

- [ ] **Step 3: Passar a URL da capa pra `archiveMultiPartToSupabase`**

Localizar a chamada (linhas ~1076-1086):

```typescript
  const archived = await archiveMultiPartToSupabase({
    storagePath,
    bucket,
    refId,
    parts: partsWithAudio,
    presentationResults,
    presentationTheme: presentationPlan,
    personalizacaoId,
    fence,
    log:              jobLog,
  });
```

Substituir por:

```typescript
  const archived = await archiveMultiPartToSupabase({
    storagePath,
    bucket,
    refId,
    parts: partsWithAudio,
    presentationResults,
    presentationTheme: presentationPlan,
    personalizacaoId,
    fence,
    // Mesma imagem usada na 1a secao do markdown (imageAttachments[0]) -
    // mantem consistencia visual entre as duas midias do mesmo topico, sem
    // precisar de uma segunda logica de selecao independente.
    audioCoverImageUrl: imageAttachments[0]?.url,
    log:              jobLog,
  });
```

- [ ] **Step 4: Aceitar e usar `audioCoverImageUrl` em `archiveMultiPartToSupabase`**

Em `archiveMultiPartToSupabase` (linha ~389), adicionar o parâmetro:

```typescript
export async function archiveMultiPartToSupabase(params: {
  storagePath:     string;
  bucket:          string;
  refId:           string;
  parts:           Array<ContentPart & { mp3Base64: string | null; wavBase64: string | null }>;
  presentationResults: RenderAndUploadPresentationResult[];
  presentationTheme: PresentationDesignPlan;
  personalizacaoId: number | null;
  fence?:           GenerationFence;
  audioCoverImageUrl?: string;
  log?:            Logger;
}): Promise<{
```

E dentro da função, no bloco `if (personalizacaoId !== null)`, adicionar `audioCoverImageUrl` na desestruturação de `params` (linha ~409) e usar no `payload` do áudio (linha ~518):

```typescript
  const { storagePath, bucket, refId, parts, presentationResults, presentationTheme, personalizacaoId, fence, audioCoverImageUrl } = params;
```

```typescript
    const updates: Record<string, MaterialEntry> = {
      audio: {
        payload: {
          roteiro: firstAudioScript,
          ...(audioCoverImageUrl ? { capaUrl: audioCoverImageUrl } : {}),
        },
        metadata: {
```

(o restante do objeto `audio` fica igual)

- [ ] **Step 5: Rodar a suíte completa e o typecheck**

Run: `cd microservice && npm test 2>&1 | tail -15 && npx tsc --noEmit 2>&1 | tail -20`
Expected: todos os testes passando, sem erros novos de tipo.

- [ ] **Step 6: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): conecta insertImagesIntoMarkdown e capa de audio no pipeline de geracao"
```

---

### Task 4: mobile — exibir a capa no `AudioPlayer`

**Files:**
- Modify: `mobile/src/utils/personalization.ts` (linhas ~1087-1130, bloco `if (tipo === "audio")`)
- Modify: `mobile/src/components/ContentRenderer.tsx` (`renderAudio`, linhas ~136-170)
- Modify: `mobile/src/components/funcionais/AudioPlayer.tsx`

- [ ] **Step 1: Ler `payload.capaUrl` em `personalization.ts`**

Em `mobile/src/utils/personalization.ts`, dentro do bloco `if (tipo === "audio")`, localizar a leitura de `roteiro`:

```typescript
    const roteiro = pickString(payload.roteiro, rawObject.roteiro);
```

Logo abaixo, adicionar:

```typescript
    const capaUrl = pickString(payload.capaUrl, rawObject.capaUrl);
```

Localizar o bloco do caminho sem múltiplas partes (linhas ~1122-1134):

```typescript
    if (url && isAudioUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: roteiro ? { ...metadata, fallbackText: roteiro } : metadata,
        },
        key
      );
      return block ? [block] : [];
    }
```

Substituir por:

```typescript
    if (url && isAudioUrl(url)) {
      const audioMetadata = {
        ...metadata,
        ...(roteiro ? { fallbackText: roteiro } : {}),
        ...(capaUrl ? { capaUrl } : {}),
      };
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: (roteiro || capaUrl) ? audioMetadata : metadata,
        },
        key
      );
      return block ? [block] : [];
    }
```

No bloco de múltiplas partes (linhas ~1093-1120), a `parte.ordem === 1` já é o único ponto que recebe `fallbackText` — replicar o mesmo critério pra `capaUrl` (mesma imagem de capa faz sentido só precisar aparecer uma vez, na primeira parte):

```typescript
          const fallbackText = parte.ordem === 1 ? roteiro : undefined;
```

Substituir por:

```typescript
          const fallbackText = parte.ordem === 1 ? roteiro : undefined;
          const parteCapaUrl = parte.ordem === 1 ? capaUrl : undefined;
```

E no `metadata` desse mesmo bloco:

```typescript
              metadata: {
                ...metadata,
                ...(fallbackText ? { fallbackText } : {}),
                parteAtual: parte.ordem,
                totalPartes: audioPartes.length,
                tituloParte: parte.titulo,
              },
```

Substituir por:

```typescript
              metadata: {
                ...metadata,
                ...(fallbackText ? { fallbackText } : {}),
                ...(parteCapaUrl ? { capaUrl: parteCapaUrl } : {}),
                parteAtual: parte.ordem,
                totalPartes: audioPartes.length,
                tituloParte: parte.titulo,
              },
```

- [ ] **Step 2: Ler `metadata.capaUrl` e repassar em `ContentRenderer.tsx`**

Em `mobile/src/components/ContentRenderer.tsx`, na função `renderAudio`, localizar:

```typescript
  const fallbackText = metadata ? readString(metadata, "fallbackText") : null;

  if (!url) return null;

  return (
    <AudioPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
      fallbackText={fallbackText ?? undefined}
    />
  );
```

Substituir por:

```typescript
  const fallbackText = metadata ? readString(metadata, "fallbackText") : null;
  const capaUrl = metadata ? readString(metadata, "capaUrl") : null;

  if (!url) return null;

  return (
    <AudioPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
      fallbackText={fallbackText ?? undefined}
      capaUrl={capaUrl ?? undefined}
    />
  );
```

- [ ] **Step 3: Aceitar e exibir `capaUrl` em `AudioPlayer.tsx`**

Adicionar `Image` aos imports de `react-native` (já importa `View`, `Text`, etc. — acrescentar `Image` à lista) e o campo na interface `Props`:

```typescript
type Props = {
  url: string;
  title?: string;
  bucketHint?: string | null;
  fallbackText?: string;
  capaUrl?: string;
};
```

Na assinatura do componente:

```typescript
export default function AudioPlayer({
  url,
  title = "Áudio",
  bucketHint = "conteudo_aluno",
  fallbackText,
  capaUrl,
}: Props) {
```

No JSX, tanto no branch web (`Platform.OS === "web"`) quanto no branch nativo, adicionar a imagem de capa dentro de `styles.header`, antes de `styles.titleRow` (mesmo trecho aparece duas vezes no arquivo — nas duas branches — aplicar nas duas):

```typescript
      <View style={styles.header}>
        {capaUrl ? (
          <Image source={{ uri: capaUrl }} style={styles.coverImage} accessibilityIgnoresInvertColors />
        ) : null}
        <View style={styles.titleRow}>
```

E adicionar o estilo correspondente em `StyleSheet.create` (junto aos demais, ex. perto de `iconBadge`):

```typescript
  coverImage: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
```

- [ ] **Step 4: Typecheck do mobile**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "AudioPlayer\|ContentRenderer\|personalization.ts"`
Expected: sem erros novos nesses 3 arquivos (o projeto já tem erros de typecheck pré-existentes não relacionados em outros arquivos — mesmo critério usado no sub-projeto B, ver PR #92).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/personalization.ts mobile/src/components/ContentRenderer.tsx mobile/src/components/funcionais/AudioPlayer.tsx
git commit -m "feat(mobile): exibe imagem de capa no AudioPlayer quando o material tiver uma"
```

---

### Fora de escopo desta PR (nota, não é um task)

`/api/v1/archive` (via `archiveToSupabase`, não `archiveMultiPartToSupabase`) é um endpoint de teste/preview manual que não passa pelo `runPipeline`/`imageAttachments` — não recebe o tratamento de imagens nesta PR. Se esse endpoint for usado em produção de verdade (confirmar antes de assumir que é só teste), abrir um follow-up.

### Encerramento

Após os 4 tasks: rodar `npm test` (microservice) e `npx tsc --noEmit` (microservice e mobile) uma última vez, depois seguir para **superpowers:finishing-a-development-branch** (mesmo padrão do PR #92 — push + PR no TrailUp).

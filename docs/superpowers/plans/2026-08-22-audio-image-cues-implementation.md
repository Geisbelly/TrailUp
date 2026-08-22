# Imagem vinculada a minutagem do áudio (D3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A imagem exibida durante a reprodução do áudio muda conforme a minutagem estimada de cada seção, reaproveitando a mesma imagem já atribuída pelo D2 no markdown daquela seção — **sem nenhuma mudança em como o áudio é gerado, dividido em capítulos ou sintetizado**.

**Architecture:** Duração do áudio final é lida a partir do tamanho em bytes do arquivo já pronto (MP3 CBR 128kbps mono 24kHz ou WAV PCM 24kHz/16-bit/mono — formatos confirmados por leitura direta do código de encoding, não alterados). Minutagem de cada seção é estimada proporcionalmente ao tamanho de texto dela dentro do áudio. Ver spec completa em `docs/superpowers/specs/2026-08-22-audio-image-cues-design.md`.

**Depende do D2** (`feature/reaproveitamento-imagens-midias`, TrailUp#93, ainda não mesclado) — esta branch parte dele, não de `main`.

**Escopo**: só a 1ª parte do áudio (mesma limitação que `capaUrl` já tem no D2).

**Tech Stack:** TypeScript, `node:test`/`node:assert/strict` nos dois lados (microservice e mobile).

**Worktree:** `.worktrees/audio-image-cues` (branch `feature/audio-image-cues`, a partir de `feature/reaproveitamento-imagens-midias`, baseline 254/254 testes no microservice).

---

### Task 1 (microservice): `estimateAudioDurationSec` — duração a partir do arquivo já pronto

**Files:**
- Create: `microservice/src/utils/audioDuration.ts`
- Test: `microservice/src/utils/audioDuration.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { estimateAudioDurationSec } from "./audioDuration";

test("MP3 (CBR 128kbps mono 24kHz): duracao = bytes / 16000", () => {
  const bytes = Buffer.alloc(160_000); // 10 segundos exatos a 16000 bytes/s
  const mp3Base64 = bytes.toString("base64");
  assert.equal(estimateAudioDurationSec(mp3Base64, null), 10);
});

test("WAV (PCM 24kHz/16-bit/mono, header de 44 bytes): desconta o header antes de dividir por 48000", () => {
  const pcmBytes = Buffer.alloc(480_000); // 10 segundos exatos a 48000 bytes/s
  const wavBytes = Buffer.concat([Buffer.alloc(44), pcmBytes]);
  const wavBase64 = wavBytes.toString("base64");
  assert.equal(estimateAudioDurationSec(null, wavBase64), 10);
});

test("prefere mp3Base64 quando os dois estao presentes (mesma prioridade ja usada no resto do pipeline)", () => {
  const mp3Bytes = Buffer.alloc(16_000); // 1 segundo em MP3
  const wavBytes = Buffer.concat([Buffer.alloc(44), Buffer.alloc(480_000)]); // 10s em WAV
  assert.equal(estimateAudioDurationSec(mp3Bytes.toString("base64"), wavBytes.toString("base64")), 1);
});

test("sem mp3Base64 nem wavBase64: retorna null", () => {
  assert.equal(estimateAudioDurationSec(null, null), null);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd microservice && node --import tsx --test src/utils/audioDuration.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
import { WAV_HEADER_BYTES } from "../lib/wav";

// Formatos fixos do pipeline de audio (Mp3Encoder(1, 24000, 128) e
// addWavHeader(pcmBuffer, 24000) em geminiService.ts/src/lib/wav.ts) - NAO
// alterados por este arquivo, so lidos aqui pra calcular duracao a partir
// do tamanho em bytes do arquivo ja pronto, sem decodificar nem tocar o
// audio.
const MP3_BYTES_PER_SECOND = 128_000 / 8; // 128kbps CBR mono 24kHz
const WAV_BYTES_PER_SECOND = 24_000 * 2;  // 24kHz, 16-bit, mono

/**
 * Estima a duracao (em segundos) do audio final a partir do tamanho em
 * bytes do arquivo ja gerado - nao decodifica nem sintetiza nada, so le um
 * numero que ja existe. Mesma prioridade mp3/wav ja usada no resto do
 * pipeline (mp3Base64 ?? wavBase64).
 */
export function estimateAudioDurationSec(mp3Base64: string | null, wavBase64: string | null): number | null {
  if (mp3Base64) {
    const bytes = Buffer.from(mp3Base64, "base64").length;
    return bytes / MP3_BYTES_PER_SECOND;
  }
  if (wavBase64) {
    const bytes = Buffer.from(wavBase64, "base64").length;
    return Math.max(0, bytes - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND;
  }
  return null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd microservice && node --import tsx --test src/utils/audioDuration.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add microservice/src/utils/audioDuration.ts microservice/src/utils/audioDuration.test.ts
git commit -m "feat(microservice): adiciona estimateAudioDurationSec (le tamanho do arquivo ja pronto, sem tocar em sintese)"
```

---

### Task 2 (microservice): `sectionBoundaries` em `splitProcessedContentIntoParts`

**Files:**
- Modify: `microservice/src/services/geminiService.ts` (`ContentPart` interface, linha ~1092; `splitProcessedContentIntoParts`, linha ~1193)
- Test: `microservice/src/services/geminiBlockBatches.test.ts` (já cobre `splitProcessedContentIntoParts` — confirmado por busca; adicionar os novos testes nele, não criar arquivo novo)

- [ ] **Step 1: Escrever os testes que falham**

```typescript
test("splitProcessedContentIntoParts expoe sectionBoundaries com indice global e posicao em caracteres dentro do audioScript da parte", () => {
  const markdown = "## Primeira\n\nTexto da primeira secao.\n\n## Segunda\n\nTexto bem mais longo da segunda secao, com mais caracteres que a primeira.";
  const audioScript = "## Primeira\n\nTexto da primeira secao.\n\n## Segunda\n\nTexto bem mais longo da segunda secao, com mais caracteres que a primeira.";

  const parts = splitProcessedContentIntoParts({ markdown, audioScript, slides: [] }, { targetPartChars: 10_000 });

  assert.equal(parts.length, 1); // as duas secoes cabem numa parte so (bem abaixo de targetPartChars)
  assert.equal(parts[0].sectionBoundaries?.length, 2);
  assert.equal(parts[0].sectionBoundaries?.[0].globalIndex, 0);
  assert.equal(parts[0].sectionBoundaries?.[0].title, "Primeira");
  assert.equal(parts[0].sectionBoundaries?.[0].charStart, 0);
  assert.equal(parts[0].sectionBoundaries?.[1].globalIndex, 1);
  assert.equal(parts[0].sectionBoundaries?.[1].title, "Segunda");
  // a 2a secao comeca depois do texto da 1a + separador "\n\n"
  assert.ok(parts[0].sectionBoundaries![1].charStart > parts[0].sectionBoundaries![0].charEnd);
});

test("splitProcessedContentIntoParts nao muda markdown/audioScript retornados (sectionBoundaries e so bookkeeping aditivo)", () => {
  const markdown = "## Única\n\nConteúdo.";
  const audioScript = "## Única\n\nConteúdo narrado.";

  const parts = splitProcessedContentIntoParts({ markdown, audioScript, slides: [] });

  assert.equal(parts[0].markdown, "## Única\n\nConteúdo.");
  assert.ok(parts[0].audioScript.includes("Conteúdo narrado."));
});

test("sem headings de nivel 2: sectionBoundaries fica vazio", () => {
  const parts = splitProcessedContentIntoParts({ markdown: "Texto solto.", audioScript: "Texto solto.", slides: [] });
  assert.deepEqual(parts[0].sectionBoundaries, []);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd microservice && npm test 2>&1 | grep -A 10 "sectionBoundaries"`
Expected: FAIL — `sectionBoundaries` não existe ainda no retorno.

- [ ] **Step 3: Implementar**

Em `microservice/src/services/geminiService.ts`, adicionar ao `ContentPart` (linha ~1092):

```typescript
export interface ContentPart {
  ordem: number;
  titulo: string;
  markdown: string;
  audioScript: string;
  slides: SlideContent[];
  sectionBoundaries: Array<{ globalIndex: number; title: string; charStart: number; charEnd: number }>;
}
```

No corpo de `splitProcessedContentIntoParts`, no branch `sections.length === 0`:

```typescript
  if (sections.length === 0) {
    return [{
      ordem: 1,
      titulo: "Conteúdo completo",
      markdown: content.markdown.trim(),
      audioScript: stripSectionMarkers(content.audioScript),
      slides: content.slides,
      sectionBoundaries: [],
    }];
  }
```

E no `return groups.map(...)`, calcular `sectionBoundaries` acumulando o comprimento de `audioBySection[i]` (mesmo texto usado pra montar `audioScript` da parte, unido por `"\n\n"`):

```typescript
  return groups.map((indices, partIndex) => {
    const slideCount = slidesPerPart[partIndex];
    const slidesPart = content.slides.slice(slideCursor, slideCursor + slideCount);
    slideCursor += slideCount;

    let cursor = 0;
    const sectionBoundaries = indices.map((i) => {
      const text = audioBySection[i];
      const charStart = cursor;
      const charEnd = cursor + text.length;
      cursor = charEnd + 2; // "\n\n" separador, mesmo usado no .join abaixo
      return { globalIndex: i, title: sections[i].title, charStart, charEnd };
    });

    return {
      ordem: partIndex + 1,
      titulo: sections[indices[0]].title,
      markdown: indices
        .map((i) => `## ${sections[i].title}\n\n${sections[i].body}`)
        .join("\n\n"),
      audioScript: indices.map((i) => audioBySection[i]).join("\n\n"),
      slides: slidesPart,
      sectionBoundaries,
    };
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd microservice && npm test 2>&1 | tail -15`
Expected: todos os testes passando, incluindo os testes JÁ EXISTENTES de `splitProcessedContentIntoParts` (a mudança é só um campo novo aditivo — confirmar que nenhum teste antigo quebrou por causa do novo campo obrigatório no tipo `ContentPart`; se algum teste antigo construir um `ContentPart` manualmente sem `sectionBoundaries`, ajustar esse teste também).

- [ ] **Step 5: Commit**

```bash
git add microservice/src/services/geminiService.ts microservice/src/services/geminiBlockBatches.test.ts
git commit -m "feat(microservice): expoe sectionBoundaries em splitProcessedContentIntoParts (bookkeeping de texto, sem tocar em audio)"
```

---

### Task 3 (microservice): `computeImageCues`

**Files:**
- Create: `microservice/src/utils/audioImageCues.ts`
- Test: `microservice/src/utils/audioImageCues.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { computeImageCues } from "./audioImageCues";

const boundaries = [
  { globalIndex: 0, title: "A", charStart: 0, charEnd: 100 },
  { globalIndex: 1, title: "B", charStart: 102, charEnd: 302 }, // total 300 chars (ate o fim de B)
];

test("calcula minutagem proporcional ao tamanho de texto de cada secao", () => {
  const cues = computeImageCues(boundaries, 30, [{ url: "https://x.test/a.png" }, { url: "https://x.test/b.png" }]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startSec, 0); // charStart 0
  assert.equal(cues[1].startSec, 30 * (102 / 302));
});

test("usa o indice GLOBAL da secao pro round-robin, nao o indice local dentro da parte", () => {
  const boundariesComGapNoInicio = [
    { globalIndex: 3, title: "D", charStart: 0, charEnd: 50 },
    { globalIndex: 4, title: "E", charStart: 52, charEnd: 100 },
  ];
  const images = [{ url: "img0" }, { url: "img1" }, { url: "img2" }, { url: "img3" }, { url: "img4" }];
  const cues = computeImageCues(boundariesComGapNoInicio, 10, images);
  assert.equal(cues[0].imageUrl, "img3"); // globalIndex 3 % 5 = 3
  assert.equal(cues[1].imageUrl, "img4"); // globalIndex 4 % 5 = 4
});

test("sem imagens disponiveis: retorna array vazio", () => {
  assert.deepEqual(computeImageCues(boundaries, 30, []), []);
});

test("sem sectionBoundaries ou sem duracao: retorna array vazio", () => {
  assert.deepEqual(computeImageCues(undefined, 30, [{ url: "x" }]), []);
  assert.deepEqual(computeImageCues(boundaries, null, [{ url: "x" }]), []);
  assert.deepEqual(computeImageCues([], 30, [{ url: "x" }]), []);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd microservice && node --import tsx --test src/utils/audioImageCues.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
export interface SectionBoundary {
  globalIndex: number;
  title: string;
  charStart: number;
  charEnd: number;
}

export interface ImageCue {
  startSec: number;
  imageUrl: string;
}

/**
 * Estima a minutagem de inicio de cada secao proporcionalmente ao tamanho
 * de texto dela dentro do audio (sem nenhum corte real no audio - so
 * matematica sobre a duracao total ja conhecida). Reaproveita o MESMO
 * indice global da secao usado por insertImagesIntoMarkdown (markdownImages.ts)
 * pro round-robin de imagens, garantindo que a imagem exibida no audio pra
 * uma secao seja a mesma ja inserida no markdown daquela secao.
 */
export function computeImageCues(
  sectionBoundaries: SectionBoundary[] | undefined,
  durationSec: number | null,
  images: Array<{ url: string }>,
): ImageCue[] {
  if (!sectionBoundaries || sectionBoundaries.length === 0) return [];
  if (!durationSec || durationSec <= 0) return [];
  if (images.length === 0) return [];

  const totalChars = sectionBoundaries[sectionBoundaries.length - 1].charEnd;
  if (totalChars <= 0) return [];

  return sectionBoundaries.map((boundary) => ({
    startSec: durationSec * (boundary.charStart / totalChars),
    imageUrl: images[boundary.globalIndex % images.length].url,
  }));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd microservice && node --import tsx --test src/utils/audioImageCues.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add microservice/src/utils/audioImageCues.ts microservice/src/utils/audioImageCues.test.ts
git commit -m "feat(microservice): adiciona computeImageCues (minutagem estimada por proporcao de texto)"
```

---

### Task 4 (microservice): conectar em `runPipeline` e `archiveMultiPartToSupabase`

**Files:**
- Modify: `microservice/server.ts` (imports; bloco `partsWithAudio`, linha ~1069-1073; chamada de `archiveMultiPartToSupabase`, linha ~1076-1087; definição de `archiveMultiPartToSupabase`, linha ~389 em diante)

- [ ] **Step 1: Imports**

Junto aos demais imports locais de `server.ts`:

```typescript
import { estimateAudioDurationSec } from "./src/utils/audioDuration";
import { computeImageCues } from "./src/utils/audioImageCues";
```

- [ ] **Step 2: Calcular a duração e os cues logo após `partsWithAudio`**

Localizar:

```typescript
  const partsWithAudio = parts.map((part, index) => ({
    ...part,
    mp3Base64: audioByPart[index]?.mp3Base64 ?? null,
    wavBase64: audioByPart[index]?.wavBase64 ?? null,
  }));
```

Adicionar logo abaixo:

```typescript
  const partsWithAudio = parts.map((part, index) => ({
    ...part,
    mp3Base64: audioByPart[index]?.mp3Base64 ?? null,
    wavBase64: audioByPart[index]?.wavBase64 ?? null,
  }));

  // Minutagem estimada de imagem por secao - so na 1a parte (mesma
  // limitacao ja aceita pelo capaUrl no D2). Le so o tamanho do arquivo ja
  // pronto, nao mexe em como o audio foi gerado/dividido/sintetizado - ver
  // docs/superpowers/specs/2026-08-22-audio-image-cues-design.md.
  const firstPartWithAudio = partsWithAudio[0];
  const firstPartDurationSec = firstPartWithAudio
    ? estimateAudioDurationSec(firstPartWithAudio.mp3Base64, firstPartWithAudio.wavBase64)
    : null;
  const audioImageCues = firstPartWithAudio
    ? computeImageCues(firstPartWithAudio.sectionBoundaries, firstPartDurationSec, imageAttachments)
    : [];
```

- [ ] **Step 3: Passar pro `archiveMultiPartToSupabase`**

Localizar a chamada (já modificada no D2 com `audioCoverImageUrl`):

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
    audioCoverImageUrl: imageAttachments[0]?.url,
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
    audioCoverImageUrl: imageAttachments[0]?.url,
    audioImageCues,
    log:              jobLog,
  });
```

- [ ] **Step 4: Aceitar e usar `audioImageCues` em `archiveMultiPartToSupabase`**

Na assinatura da função:

```typescript
  audioCoverImageUrl?: string;
  audioImageCues?: ImageCue[];
  log?:            Logger;
```

(importar `type { ImageCue }` de `./src/utils/audioImageCues` junto aos demais imports)

Na desestruturação de `params`:

```typescript
  const { storagePath, bucket, refId, parts, presentationResults, presentationTheme, personalizacaoId, fence, audioCoverImageUrl, audioImageCues } = params;
```

No `payload` do áudio:

```typescript
        payload: {
          roteiro: firstAudioScript,
          ...(audioCoverImageUrl ? { capaUrl: audioCoverImageUrl } : {}),
          ...(audioImageCues && audioImageCues.length > 0 ? { imageCues: audioImageCues } : {}),
        },
```

- [ ] **Step 5: Rodar toda a suite e o typecheck**

Run: `cd microservice && npm test 2>&1 | tail -15 && npx tsc --noEmit 2>&1 | tail -20`
Expected: todos os testes passando, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): conecta duracao/cues de imagem no pipeline de audio (D3)"
```

---

### Task 5 (mobile): `parseImageCues`

**Files:**
- Create: `mobile/src/utils/audioImageCues.ts`
- Test: `mobile/src/utils/audioImageCues.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseImageCues } from "./audioImageCues";

test("parseia uma lista valida de cues, ordenada por startSec", () => {
  const raw = [
    { startSec: 30, imageUrl: "https://x.test/b.png" },
    { startSec: 0, imageUrl: "https://x.test/a.png" },
  ];
  assert.deepEqual(parseImageCues(raw), [
    { startSec: 0, imageUrl: "https://x.test/a.png" },
    { startSec: 30, imageUrl: "https://x.test/b.png" },
  ]);
});

test("retorna null quando nao e um array", () => {
  assert.equal(parseImageCues("nao e array"), null);
  assert.equal(parseImageCues(undefined), null);
  assert.equal(parseImageCues(null), null);
});

test("retorna null quando algum item tem startSec ou imageUrl invalidos", () => {
  assert.equal(parseImageCues([{ startSec: "0", imageUrl: "x" }]), null);
  assert.equal(parseImageCues([{ startSec: 0, imageUrl: "" }]), null);
  assert.equal(parseImageCues([{ startSec: 0 }]), null);
});

test("array vazio retorna array vazio", () => {
  assert.deepEqual(parseImageCues([]), []);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd mobile && npx tsx --test src/utils/audioImageCues.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
/**
 * Cue de imagem por minutagem estimada do audio (ver computeImageCues em
 * microservice/src/utils/audioImageCues.ts - minutagem ESTIMADA por
 * proporcao de texto, nao um corte real no audio).
 */
export interface ImageCue {
  startSec: number;
  imageUrl: string;
}

export function parseImageCues(raw: unknown): ImageCue[] | null {
  if (!Array.isArray(raw)) return null;

  const cues: ImageCue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    if (typeof obj.startSec !== "number" || !Number.isFinite(obj.startSec)) return null;
    if (typeof obj.imageUrl !== "string" || !obj.imageUrl.trim()) return null;
    cues.push({ startSec: obj.startSec, imageUrl: obj.imageUrl });
  }

  return cues.sort((a, b) => a.startSec - b.startSec);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd mobile && npx tsx --test src/utils/audioImageCues.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/audioImageCues.ts mobile/src/utils/audioImageCues.test.ts
git commit -m "feat(mobile): adiciona parseImageCues para validar cues de imagem do audio"
```

---

### Task 6 (mobile): ler `imageCues` em `personalization.ts` e repassar até o `AudioPlayer`

**Files:**
- Modify: `mobile/src/utils/personalization.ts` (bloco `if (tipo === "audio")`, mesma região do D2)
- Modify: `mobile/src/components/ContentRenderer.tsx` (`renderAudio`)
- Modify: `mobile/src/components/funcionais/AudioPlayer.tsx`

- [ ] **Step 1: `personalization.ts` — ler `payload.imageCues` (só na parte 1, mesmo critério de `capaUrl`)**

Localizar (mesma região do D2):

```typescript
    const roteiro = pickString(payload.roteiro, rawObject.roteiro);
    const capaUrl = pickString(payload.capaUrl, rawObject.capaUrl);
```

Adicionar:

```typescript
    const roteiro = pickString(payload.roteiro, rawObject.roteiro);
    const capaUrl = pickString(payload.capaUrl, rawObject.capaUrl);
    const imageCues = parseImageCues(payload.imageCues ?? rawObject.imageCues);
```

Import no topo do arquivo:

```typescript
import { parseImageCues } from "@/utils/audioImageCues";
```

No bloco sem múltiplas partes (já modificado no D2):

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

Substituir por:

```typescript
    if (url && isAudioUrl(url)) {
      const audioMetadata = {
        ...metadata,
        ...(roteiro ? { fallbackText: roteiro } : {}),
        ...(capaUrl ? { capaUrl } : {}),
        ...(imageCues && imageCues.length > 0 ? { imageCues } : {}),
      };
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: (roteiro || capaUrl || (imageCues && imageCues.length > 0)) ? audioMetadata : metadata,
        },
        key
      );
      return block ? [block] : [];
    }
```

(no bloco de múltiplas partes, `imageCues` só se aplica à `parte.ordem === 1`, mesmo critério já usado pra `capaUrl`/`fallbackText` no D2 — replicar o mesmo padrão `parteCapaUrl`/`parteImageCues` se quiser cobrir esse caminho também; opcional nesta fase já que o escopo é só a 1ª parte de qualquer forma.)

- [ ] **Step 2: `ContentRenderer.tsx` — ler e repassar**

Localizar (já modificado no D2):

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

Substituir por:

```typescript
  const fallbackText = metadata ? readString(metadata, "fallbackText") : null;
  const capaUrl = metadata ? readString(metadata, "capaUrl") : null;
  const rawImageCues = metadata && Array.isArray((metadata as Record<string, unknown>).imageCues)
    ? (metadata as Record<string, unknown>).imageCues
    : null;
  const imageCues = rawImageCues ? parseImageCues(rawImageCues) : null;

  if (!url) return null;

  return (
    <AudioPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
      fallbackText={fallbackText ?? undefined}
      capaUrl={capaUrl ?? undefined}
      imageCues={imageCues ?? undefined}
    />
  );
```

Import no topo:

```typescript
import { parseImageCues } from "@/utils/audioImageCues";
```

- [ ] **Step 3: `AudioPlayer.tsx` — trocar a imagem exibida conforme a posição de reprodução**

Adicionar import e prop:

```typescript
import { type ImageCue } from "@/utils/audioImageCues";
```

```typescript
type Props = {
  url: string;
  title?: string;
  bucketHint?: string | null;
  fallbackText?: string;
  capaUrl?: string;
  imageCues?: ImageCue[];
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
  imageCues,
}: Props) {
```

Logo após a declaração de `playback` (o `useState<PlaybackState>`), adicionar:

```typescript
  // Troca a imagem exibida conforme a posicao de reproducao cruza os cues
  // (minutagem ESTIMADA por proporcao de texto, ver computeImageCues no
  // microservice - nao e um corte real no audio). Sem cues, cai pra capaUrl
  // estatica (comportamento do D2 preservado).
  const displayedImageUrl = useMemo(() => {
    if (!imageCues || imageCues.length === 0) return capaUrl;
    const positionSec = playback.positionMillis / 1000;
    let selected = imageCues[0].imageUrl;
    for (const cue of imageCues) {
      if (cue.startSec <= positionSec) selected = cue.imageUrl;
      else break;
    }
    return selected;
  }, [imageCues, playback.positionMillis, capaUrl]);
```

Nos dois pontos já modificados pelo D2 (branch web e branch nativo), trocar `capaUrl` por `displayedImageUrl`:

```typescript
          {capaUrl ? (
            <Image source={{ uri: capaUrl }} style={styles.coverImage} accessibilityIgnoresInvertColors />
          ) : null}
```

por (nas duas ocorrências):

```typescript
          {displayedImageUrl ? (
            <Image source={{ uri: displayedImageUrl }} style={styles.coverImage} accessibilityIgnoresInvertColors />
          ) : null}
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "personalization.ts\|ContentRenderer\|AudioPlayer"`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/personalization.ts mobile/src/components/ContentRenderer.tsx mobile/src/components/funcionais/AudioPlayer.tsx
git commit -m "feat(mobile): troca a imagem exibida no audio conforme a minutagem estimada da secao (D3)"
```

---

### Encerramento

Rodar `npm test` (microservice) e typechecks (microservice e mobile) uma última vez. **Verificação manual pendente** (mesmo critério do D1a — não é possível rodar sozinho nesta sessão): abrir um áudio com múltiplas seções no app real e confirmar visualmente que a imagem muda em pontos razoáveis conforme a reprodução avança.

Como esta branch depende do D2 (ainda não mesclado), não mesclar antes do TrailUp#93. Perguntar ao usuário sobre push direto vs. PR quando chegar nesse ponto, dado o padrão misto já usado nesta sessão para trabalho relacionado a áudio/D-sub-projetos.

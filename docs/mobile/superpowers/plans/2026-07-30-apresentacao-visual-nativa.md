# Apresentação: visual nativo no mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o render do material "apresentação" no mobile — hoje bullet points de texto puro via `MarkdownBlock` — por um componente visual nativo que usa a cor/retrato/nome do guardião já disponíveis (`getProfileShellPalette`, `getBrainHexConfig`, `getBrainHexGuideName`), sem alterar o texto em si nem o material "markdown" (separado, intocado).

**Architecture:** Novo tipo de bloco `apresentacao-slides` (1 bloco com array completo de slides, em vez de N blocos de markdown), roteado por `ContentRenderer.tsx` pro componente novo `PresentationSlidesBlock.tsx` — preview inline + `Modal` tela cheia com navegação por toque entre slides. Mesmo padrão já usado por `tipo === "cards"` → `StudyCardsBlock.tsx`.

**Tech Stack:** React Native, TypeScript, `expo-linear-gradient` (já é dependência), `Modal`/`SafeAreaView` do React Native (já usados em outras telas).

**Spec:** `docs/mobile/superpowers/specs/2026-07-30-apresentacao-visual-nativa-design.md`

**Sem test runner:** `mobile/` não tem Jest/Vitest configurado (`package.json` sem script `test`) — confirmado durante o planejamento. Verificação é: `npx tsc --noEmit` (typecheck) após cada task, e verificação manual rodando o app ao final (Task 5).

---

## Task 1: Tipos — `ContentBlockType`, payload e `RichPresentationSlide`

**Files:**
- Modify: `mobile/src/interfaces/componentes_simples/IContentBlock.ts`

- [ ] **Step 1: Adicionar `"apresentacao-slides"` a `ContentBlockType` e o novo tipo `RichPresentationSlide`**

Arquivo atual:
```ts
export type ContentDisplayMode = "pagina" | "rolagem";

export type ContentBlockType =
  | "texto"
  | "markdown"
  | "imagem"
  | "audio"
  | "video"
  | "cards"
  | "pdf"
  | "documento"
  | "apresentacao"
  | "embed"
  | "youtube";

export type ContentBlockPayload =
  | string
  | {
      url?: string | null;
      uri?: string | null;
      src?: string | null;
      html?: string | null;
      markdown?: string | null;
      texto?: string | null;
      legenda?: string | null;
      mimeType?: string | null;
      title?: string | null;
      defaultDisplayMode?: ContentDisplayMode;
      cards?: {
        id?: string | number;
        titulo?: string | null;
        frente?: string | null;
        verso?: string | null;
        descricao?: string | null;
        imagemUrl?: string | null;
      }[];
      metadata?: unknown;
    };

export type ContentBlock = {
  id: string | number;
  tipo: ContentBlockType;
  payload: ContentBlockPayload;
};
```

Substituir pelo conteúdo completo abaixo (adiciona `"apresentacao-slides"` ao union, o tipo `RichPresentationSlide` exportado, e o campo `slides?` no payload):

```ts
export type ContentDisplayMode = "pagina" | "rolagem";

export type ContentBlockType =
  | "texto"
  | "markdown"
  | "imagem"
  | "audio"
  | "video"
  | "cards"
  | "pdf"
  | "documento"
  | "apresentacao"
  | "apresentacao-slides"
  | "embed"
  | "youtube";

export type RichPresentationSlide = {
  title: string;
  points: string[];
  explanation: string | null;
  characterQuote: string | null;
  imagemReferencia: string | null;
  icones: string[];
};

export type ContentBlockPayload =
  | string
  | {
      url?: string | null;
      uri?: string | null;
      src?: string | null;
      html?: string | null;
      markdown?: string | null;
      texto?: string | null;
      legenda?: string | null;
      mimeType?: string | null;
      title?: string | null;
      defaultDisplayMode?: ContentDisplayMode;
      cards?: {
        id?: string | number;
        titulo?: string | null;
        frente?: string | null;
        verso?: string | null;
        descricao?: string | null;
        imagemUrl?: string | null;
      }[];
      slides?: RichPresentationSlide[];
      metadata?: unknown;
    };

export type ContentBlock = {
  id: string | number;
  tipo: ContentBlockType;
  payload: ContentBlockPayload;
};
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: mesmos erros de antes (se houver — projeto pode já ter alguns pré-existentes não relacionados) mais nenhum erro novo relacionado a este arquivo. Se o comando não existir/travar por falta de `tsconfig.json` na raiz esperada, rodar de dentro de `mobile/`.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/interfaces/componentes_simples/IContentBlock.ts
git commit -m "feat(mobile): adiciona tipo apresentacao-slides e RichPresentationSlide"
```

---

## Task 2: `normalizeRichPresentationSlides` + emitir 1 bloco em vez de N

**Files:**
- Modify: `mobile/src/utils/personalization.ts`

- [ ] **Step 1: Adicionar `normalizeRichPresentationSlides` logo depois de `normalizePresentationSlides`**

Localizar (por volta da linha 573-598 do arquivo atual):

```ts
function normalizePresentationSlides(value: unknown) {
  return asArray<any>(value)
    .map((slide, index) => {
      if (typeof slide === "string" && slide.trim()) {
        return {
          title: `Slide ${index + 1}`,
          points: [slide.trim()],
        };
      }

      if (!slide || typeof slide !== "object") return null;

      const title = pickString(slide.titulo, slide.title, `Slide ${index + 1}`);
      const points = normalizeTextList(slide.pontos ?? slide.points ?? slide.bullets ?? slide.topics);
      return title || points.length
        ? {
            title: title ?? `Slide ${index + 1}`,
            points,
          }
        : null;
    })
    .filter(
      (slide): slide is { title: string; points: string[] } =>
        Boolean(slide)
    );
}
```

Logo abaixo dela (sem remover a função existente — outros consumidores podem depender do formato mínimo `{title, points}`), adicionar:

```ts
function normalizeRichPresentationSlides(value: unknown): RichPresentationSlide[] {
  return asArray<any>(value)
    .map((slide, index) => {
      if (typeof slide === "string" && slide.trim()) {
        return {
          title: `Slide ${index + 1}`,
          points: [slide.trim()],
          explanation: null,
          characterQuote: null,
          imagemReferencia: null,
          icones: [],
        };
      }

      if (!slide || typeof slide !== "object") return null;

      const title = pickString(slide.titulo, slide.title, `Slide ${index + 1}`);
      const points = normalizeTextList(slide.pontos ?? slide.points ?? slide.bullets ?? slide.topics);
      if (!title && !points.length) return null;

      return {
        title: title ?? `Slide ${index + 1}`,
        points,
        explanation: pickString(slide.explanation, slide.explicacao),
        characterQuote: pickString(slide.characterQuote, slide.fala_guia),
        imagemReferencia: pickString(slide.imagem_referencia, slide.imagemReferencia),
        icones: normalizeTextList(slide.icones ?? slide.icons),
      };
    })
    .filter((slide): slide is RichPresentationSlide => Boolean(slide));
}
```

- [ ] **Step 2: Importar `RichPresentationSlide` no topo do arquivo**

Localizar (linhas 1-4 do arquivo atual):
```ts
import {
  ContentBlock,
  ContentBlockType,
} from "@/interfaces/componentes_simples/IContentBlock";
```
Trocar por:
```ts
import {
  ContentBlock,
  ContentBlockType,
  RichPresentationSlide,
} from "@/interfaces/componentes_simples/IContentBlock";
```

- [ ] **Step 3: Trocar o branch `hasInlineSlides` de `tipo === "apresentacao"` para emitir 1 bloco em vez de N**

Localizar (dentro do `if (tipo === "apresentacao") { ... }`, por volta das linhas 1182-1273 do arquivo atual):

```ts
  if (tipo === "apresentacao") {
    // Os slides ja vem completos no JSONB (payload.slides); so recorrer ao
    // arquivo no Storage quando nao ha slides inline (evita depender de um
    // export que pode ter falhado mesmo com status "completed").
    const presentationTitle =
      pickString(payload.titulo, title, "Apresentação personalizada") ??
      "Apresentação personalizada";
    const slides = normalizePresentationSlides(payload.slides ?? rawObject.slides);
    const hasInlineSlides = slides.length > 0;

    if (!hasInlineSlides && url && isPdfUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "pdf",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (!hasInlineSlides && url && isDocumentUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "documento",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (!hasInlineSlides && url && isPresentationUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    const blocks: ContentBlock[] = [];

    // Mesmo preferindo os slides inline, nao descartamos a referencia ao
    // arquivo no Storage quando ele existe (ver comentario em "documento"
    // acima — mesma ressalva: sem UI ainda lendo esse campo).
    const aberturaBlock = buildMarkdownContentBlock({
      id: `${key}-abertura`,
      title: presentationTitle,
      lines: [
        pickString(payload.abertura, rawObject.abertura, payload.resumo, rawObject.resumo) ?? "",
      ],
      metadata: url ? { ...metadata, arquivo_url: url } : metadata,
    });
    if (aberturaBlock) blocks.push(aberturaBlock);

    slides.forEach((slide, index) => {
      const slideBlock = buildMarkdownContentBlock({
        id: `${key}-slide-${index + 1}`,
        title: slide.title,
        lines: slide.points,
        metadata: {
          ...metadata,
          sequence: index + 1,
          slideTitle: slide.title,
        },
      });
      if (slideBlock) blocks.push(slideBlock);
    });

    return blocks;
  }
```

Trocar por (mantém os 3 fallbacks de arquivo idênticos — só troca o que acontece quando `hasInlineSlides` é `true`):

```ts
  if (tipo === "apresentacao") {
    // Os slides ja vem completos no JSONB (payload.slides); so recorrer ao
    // arquivo no Storage quando nao ha slides inline (evita depender de um
    // export que pode ter falhado mesmo com status "completed").
    const presentationTitle =
      pickString(payload.titulo, title, "Apresentação personalizada") ??
      "Apresentação personalizada";
    const richSlides = normalizeRichPresentationSlides(payload.slides ?? rawObject.slides);
    const hasInlineSlides = richSlides.length > 0;

    if (!hasInlineSlides && url && isPdfUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "pdf",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (!hasInlineSlides && url && isDocumentUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "documento",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (!hasInlineSlides && url && isPresentationUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (!hasInlineSlides) return [];

    return [
      {
        id: key,
        tipo: "apresentacao-slides",
        payload: {
          title: presentationTitle,
          slides: richSlides,
        },
      },
    ];
  }
```

> Nota: o bloco de "abertura" (resumo/primeira linha do markdown) que existia antes some daqui — ele era um artefato do formato de blocos-de-markdown-por-slide, não um dado que faltava exibir; o título da apresentação já aparece no preview/topo do `PresentationSlidesBlock`. Os `topics`/`explanation`/`characterQuote` de cada slide continuam presentes via `richSlides`.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/personalization.ts
git commit -m "feat(mobile): apresentacao com slides inline vira 1 bloco apresentacao-slides"
```

---

## Task 3: `ContentRenderer.tsx` roteia `apresentacao-slides`

**Files:**
- Modify: `mobile/src/components/ContentRenderer.tsx`

- [ ] **Step 1: Adicionar o case, ao lado do case existente de `"cards"`**

Localizar (por volta da linha 262 do arquivo atual):

```ts
        if (block.tipo === "cards") {
          return (
            <View key={block.id}>
              <StudyCardsBlock payload={block.payload} WebView={resolvedWebView} />
            </View>
          );
        }
```

Adicionar logo depois (antes do `if (block.tipo === "pdf")` seguinte):

```ts
        if (block.tipo === "apresentacao-slides") {
          return (
            <View key={block.id}>
              <PresentationSlidesBlock payload={block.payload} />
            </View>
          );
        }
```

- [ ] **Step 2: Importar o componente novo (criado na Task 4) no topo do arquivo**

Localizar:
```ts
import StudyCardsBlock from "./StudyCardsBlock";
```
Adicionar logo abaixo:
```ts
import PresentationSlidesBlock from "./PresentationSlidesBlock";
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: erro esperado nesse ponto — `PresentationSlidesBlock` ainda não existe (criado na Task 4). Confirmar que o ÚNICO erro novo é "Cannot find module './PresentationSlidesBlock'" (ou equivalente), nada mais.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/ContentRenderer.tsx
git commit -m "feat(mobile): ContentRenderer roteia apresentacao-slides pro componente novo"
```

---

## Task 4: `PresentationSlidesBlock.tsx` — componente novo

**Files:**
- Create: `mobile/src/components/PresentationSlidesBlock.tsx`

- [ ] **Step 1: Criar o arquivo completo**

```tsx
import { RichPresentationSlide } from "@/interfaces/componentes_simples/IContentBlock";
import { getBrainHexConfig, getBrainHexGuideName } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  payload: {
    title?: string | null;
    abertura?: string | null;
    slides?: RichPresentationSlide[];
  };
};

export default function PresentationSlidesBlock({ payload }: Props) {
  const { usuario } = useUsuario();
  const perfilNome = usuario?.perfis?.[0]?.nome ?? null;
  const palette = useMemo(() => getProfileShellPalette(perfilNome), [perfilNome]);
  const brainHexConfig = useMemo(() => getBrainHexConfig(perfilNome ?? undefined), [perfilNome]);
  const guideName = useMemo(() => getBrainHexGuideName(perfilNome), [perfilNome]);

  const slides = payload.slides ?? [];
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;

  const current = slides[index] ?? slides[0];
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;

  const openViewer = () => {
    setIndex(0);
    setVisible(true);
  };

  const goNext = () => {
    if (!isLast) setIndex((value) => value + 1);
  };

  const goPrev = () => {
    if (!isFirst) setIndex((value) => value - 1);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={openViewer}
        style={[
          styles.previewCard,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
        ]}
      >
        <View style={styles.previewHeader}>
          <Text style={[styles.previewLabel, { color: palette.accent }]}>Apresentação</Text>
          <Text style={[styles.previewCount, { color: palette.textMuted }]}>
            {slides.length} {slides.length === 1 ? "slide" : "slides"}
          </Text>
        </View>
        <Text style={[styles.previewTitle, { color: palette.text }]} numberOfLines={2}>
          {payload.title ?? "Apresentação personalizada"}
        </Text>
        {payload.abertura ? (
          <Text style={[styles.previewSubtitle, { color: palette.textMuted }]} numberOfLines={3}>
            {payload.abertura}
          </Text>
        ) : null}
        <View style={[styles.previewButton, { backgroundColor: palette.accent }]}>
          <Ionicons name="play" size={16} color={Color.colorWhite} />
          <Text style={styles.previewButtonText}>Ver apresentação</Text>
        </View>
      </Pressable>

      <Modal visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalRoot}>
          {current.imagemReferencia ? (
            <Image
              source={{ uri: current.imagemReferencia }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[palette.background, palette.surfaceElevated]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          <LinearGradient
            colors={["transparent", "rgba(3,7,13,0.55)", "rgba(3,7,13,0.92)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalTopBar}>
              <View
                style={[
                  styles.guideBadge,
                  { borderColor: palette.accent, backgroundColor: palette.surface },
                ]}
              >
                <Image source={brainHexConfig.image} style={styles.guideImage} />
                <Text style={[styles.guideName, { color: palette.text }]}>{guideName}</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={Color.colorWhite} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.slideTitle}>{current.title}</Text>

              {current.points.length > 0 ? (
                <View style={styles.pointsList}>
                  {current.points.map((point, pointIndex) => (
                    <View key={pointIndex} style={styles.pointRow}>
                      <View style={[styles.pointDot, { backgroundColor: palette.accent }]} />
                      <Text style={styles.pointText}>{point}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {current.explanation ? (
                <Text style={styles.explanationText}>{current.explanation}</Text>
              ) : null}

              {current.characterQuote ? (
                <View
                  style={[
                    styles.quoteBubble,
                    { backgroundColor: palette.accentMuted, borderColor: palette.border },
                  ]}
                >
                  <Text style={[styles.quoteText, { color: palette.text }]}>
                    "{current.characterQuote}"
                  </Text>
                  <Text style={[styles.quoteAuthor, { color: palette.accent }]}>
                    — {guideName}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={goPrev}
                disabled={isFirst}
                style={[styles.navButton, isFirst && styles.navButtonDisabled]}
              >
                <Ionicons name="chevron-back" size={22} color={Color.colorWhite} />
              </Pressable>

              <Text style={styles.progressText}>
                {index + 1} de {slides.length}
              </Text>

              <Pressable
                onPress={goNext}
                disabled={isLast}
                style={[styles.navButton, isLast && styles.navButtonDisabled]}
              >
                <Ionicons name="chevron-forward" size={22} color={Color.colorWhite} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
  },
  previewCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewCount: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  previewTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  previewSubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 14,
    marginTop: 4,
  },
  previewButtonText: {
    color: Color.colorWhite,
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "#03070d",
  },
  modalSafeArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  modalTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  guideBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  guideImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  guideName: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  modalBody: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  slideTitle: {
    color: Color.colorWhite,
    fontFamily: FontFamily.inikaBold,
    fontSize: 26,
    lineHeight: 32,
  },
  pointsList: {
    gap: 8,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pointDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  pointText: {
    flex: 1,
    color: Color.colorWhite,
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  explanationText: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  quoteBubble: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  quoteText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
  quoteAuthor: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  progressText: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: sem erros. Se `Color`/`FontFamily` não tiverem exatamente `colorWhite`/`inikaBold`/`interMedium` (nomes conferidos em `StudyCardsBlock.tsx`, mas checar `mobile/src/styles/GlobalStyle.ts` caso o erro aponte pra isso), ajustar os nomes pros que existirem de fato no arquivo.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/PresentationSlidesBlock.tsx
git commit -m "feat(mobile): PresentationSlidesBlock — visualizador nativo de apresentacao"
```

---

## Task 5: Verificação manual

**Files:** nenhum (só verificação)

- [ ] **Step 1: Typecheck completo do projeto**

Run: `cd mobile && npx tsc --noEmit`
Expected: sem erros novos introduzidos por este plano (erros pré-existentes no projeto, se houver, não são responsabilidade desta mudança).

- [ ] **Step 2: Rodar o app e verificar visualmente**

Run: `cd mobile && npm run start` (ou `npx expo start`), abrir num device/emulador.

Checklist manual:
- Abrir um tópico com apresentação já gerada (`payload.slides` populado) — deve aparecer o card de prévia com título + "Ver apresentação", não mais bullet points de texto puro.
- Tocar em "Ver apresentação" — abre tela cheia, mostra o slide 1 com cor/retrato/nome do guardião do perfil do aluno logado.
- Navegar entre slides (setas anterior/próximo) — título, tópicos, explicação e fala do guia mudam corretamente por slide.
- Testar com um material sem `imagem_referencia` (ou perfil cujo material ainda não tem imagem gerada) — deve cair pro gradiente sólido na cor do perfil, sem imagem quebrada, sem travar.
- Fechar o modal (botão X) — volta pro card de prévia.
- Conferir com pelo menos 2 perfis BrainHex diferentes (cores/retratos diferentes) que a identidade visual muda corretamente.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-review desta plan

- **Cobertura da spec:** Seção 1 (arquitetura) → Tasks 1-3. Seção 2 (visual por slide) → Task 4. Seção 3 (componentes e dados) → Tasks 1, 2, 4. Seção 4 (degradação) → Task 4 (fundo condicional, campos opcionais renderizados condicionalmente). Seção 5 (testes) → Task 5 (manual, sem test runner, conforme já documentado).
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código de todo step está completo e copiável, incluindo o componente inteiro na Task 4.
- **Consistência de tipos:** `RichPresentationSlide` definido uma vez (Task 1, `IContentBlock.ts`), usado sem alteração de forma em `normalizeRichPresentationSlides` (Task 2) e `PresentationSlidesBlock` (Task 4) — mesmos nomes de campo (`imagemReferencia`, não `imagem_referencia`, em todo lugar depois da normalização).
- **Reaproveitamento confirmado:** `getProfileShellPalette`, `getBrainHexConfig`, `getBrainHexGuideName`, `useUsuario`, `Color`/`FontFamily` de `GlobalStyle.ts`, `expo-linear-gradient`, `Modal`/`SafeAreaView` — todos já existentes e usados em outros componentes do mobile (`StudyCardsBlock.tsx`, `QuestionActivity.tsx`, telas de auth), confirmado por leitura direta antes de escrever este plano.

## Retrospectiva (achados durante a execução)

- **Task 1** expôs dois mapeamentos exaustivos que dependiam do union `ContentBlockType` e não foram previstos no plano original: `telemetryMetrics.ts` (`Record<ContentBlockType, number>`, erro de compilação) e `presentationOrder.ts` (`MODE_BASE_PRIORITY` × 4 + `isDocumentType()`, sem erro de compilação mas quebrava a ordenação/priorização em runtime). Corrigidos em commits separados (`6b8f07d`, `f39cfd6`). Uma segunda rodada de revisão achou ainda um terceiro problema mais sutil: `heroFormat` (tipo separado, vem do servidor, nunca contém `"apresentacao-slides"`) precisa de normalização pra continuar batendo com o bloco novo — corrigido em `d828018` (`normalizeBlockType` ganhou o case, e as entradas redundantes adicionadas nos 4 arrays em `f39cfd6` foram removidas, já que a normalização cobre o lookup).
- **Task 2** removeu o campo `abertura`/`resumo` sem substituto — a justificativa original do plano ("artefato do formato antigo, sem perda real") só é verdadeira pro caminho microservice; no fallback Python (`MultiOutputPipeline`) é conteúdo narrativo próprio gerado pela IA. Corrigido em `1e2d7b0`: `abertura?: string | null` adicionado a `ContentBlockPayload` (Task 1) e populado no bloco `apresentacao-slides` (Task 2). O código da Task 4 abaixo já reflete isso (mostrado como subtítulo/gancho no card de prévia).

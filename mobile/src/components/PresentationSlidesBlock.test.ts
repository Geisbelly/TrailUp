import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
// PresentationSlidesBlock.tsx e um componente React Native: importa
// react-native, expo-linear-gradient e @expo/vector-icons diretamente, alem
// de modulos do projeto (@/constants/profileImages, @/context/SessaoContext,
// @/styles/GlobalStyle, @/utils/profileShellTheme) que por sua vez importam
// react-native e/ou fazem require() de assets .png no top-level do modulo.
// Nenhum desses pacotes/arquivos e require()-avel fora do Metro/Jest-RN (o
// codigo fonte usa JSX/Flow sem transpilar e os .png nao sao modulos JS) -
// nao ha infraestrutura de teste de componente RN configurada neste projeto
// (sem Jest/Testing Library), e criar essa infra do zero so para isolar uma
// funcao pura seria overkill. Em vez disso, stubamos essas dependencias via
// require.cache (mesmo truque usado em personalization.multicontent.test.ts
// para @/database/supabase) para conseguir importar o modulo e testar
// isoladamente `normalizePayload`, que nao usa nenhuma delas.
const modulesToStub: Record<string, unknown> = {
  "react-native": {
    Image: () => null,
    Modal: () => null,
    Pressable: () => null,
    SafeAreaView: () => null,
    StyleSheet: { create: (styles: unknown) => styles },
    Text: () => null,
    View: () => null,
  },
  "expo-linear-gradient": { LinearGradient: () => null },
  "@expo/vector-icons": { Ionicons: () => null },
  "@/constants/profileImages": {
    getBrainHexConfig: () => ({ image: null }),
    getBrainHexGuideName: () => null,
  },
  "@/context/SessaoContext": { useUsuario: () => ({ usuario: null }) },
  "@/styles/GlobalStyle": { Color: {}, FontFamily: {} },
  "@/utils/profileShellTheme": { getProfileShellPalette: () => ({}) },
};

for (const [specifier, exports] of Object.entries(modulesToStub)) {
  const resolvedPath = require.resolve(specifier);
  (require.cache as Record<string, unknown>)[resolvedPath] = { exports };
}

const { normalizePayload } = require("./PresentationSlidesBlock") as typeof import("./PresentationSlidesBlock");

test("normalizePayload descarta slides sem conteudo substantivo", () => {
  const result = normalizePayload({
    title: "Deck",
    slides: [
      { title: "Slide 1", points: ["a"] },
      { title: "Slide 2" },
    ],
  } as any);
  assert.equal(result.slides.length, 1);
  assert.equal(result.slides[0].title, "Slide 1");
});

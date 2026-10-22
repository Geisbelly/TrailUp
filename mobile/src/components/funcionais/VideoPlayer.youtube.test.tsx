import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// Link do YouTube não pode chegar ao player nativo do `expo-video`.
//
// Com o `expo-av` isso saía de graça: o `<Video>` só era MONTADO no ramo direto, então o ramo do
// YouTube (iframe na web, WebView no celular) nunca carregava a URL. O `useVideoPlayer` é um
// hook — roda em todo render, mesmo quando a view que ele alimentaria não existe. Passando a URL
// do YouTube, o player baixa uma PÁGINA HTML como se fosse mídia, o `statusChange` vem `error` e
// `failed` fica ligado; `renderPlayer` consulta `failed` ANTES de escolher o iframe, então o
// vídeo do professor some atrás de "Não foi possível reproduzir" sem o ramo do YouTube ter
// errado nada.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

function Host({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}

/** Cada fonte que o `useVideoPlayer` recebeu, na ordem. */
const fontesRecebidas: unknown[] = [];

mockModule("react-native", {
  ActivityIndicator: () => null,
  Linking: { openURL: () => Promise.resolve() },
  Modal: Host,
  Platform: { OS: "ios", select: (opcoes: Record<string, unknown>) => opcoes.ios ?? opcoes.default },
  Pressable: Host,
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  Text: Host,
  View: Host,
});
mockModule("react-native-safe-area-context", { SafeAreaView: Host });
mockModule("react-native-webview", { WebView: () => null });
mockModule("@expo/vector-icons", { Ionicons: () => null });
mockModule("expo-video", {
  VideoView: () => null,
  useVideoPlayer: (fonte: unknown) => {
    fontesRecebidas.push(fonte);
    return { duration: 0, playing: false, addListener: () => ({ remove: () => undefined }) };
  },
});
mockModule("@/context/SessaoContext", { useUsuario: () => ({ usuario: { id: "aluno", perfis: [] } }) });
mockModule("@/utils/profileShellTheme", { getProfileShellPalette: () => ({}) });
mockModule("@/utils/supabaseStorage", { resolveSupabaseStorageUrl: async (u: string) => u });
mockModule("@/utils/contentResume", {
  buildContentResumeKey: () => "chave",
  loadContentResume: async () => null,
  saveContentResume: async () => undefined,
});

const VideoPlayer = require("./VideoPlayer").default;

const ENDERECOS_DO_YOUTUBE = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ",
  "https://www.youtube.com/embed/dQw4w9WgXcQ",
];

for (const endereco of ENDERECOS_DO_YOUTUBE) {
  test(`o player nativo não recebe ${endereco}`, () => {
    fontesRecebidas.length = 0;
    renderToString(<VideoPlayer url={endereco} />);

    assert.ok(fontesRecebidas.length > 0, "useVideoPlayer nem foi chamado — o teste parou de medir");
    for (const fonte of fontesRecebidas) {
      assert.equal(fonte, null, `o player recebeu ${JSON.stringify(fonte)} em vez de null`);
    }
  });
}

test("vídeo direto continua chegando ao player nativo", () => {
  fontesRecebidas.length = 0;
  renderToString(<VideoPlayer url="https://exemplo.test/aula.mp4" />);

  assert.deepEqual(
    fontesRecebidas.at(-1),
    { uri: "https://exemplo.test/aula.mp4" },
    "sem isto a guarda do YouTube teria desligado o player para todo mundo"
  );
});

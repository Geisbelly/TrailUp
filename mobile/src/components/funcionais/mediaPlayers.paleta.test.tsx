import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// Os dois players tem de PINTAR com a paleta do perfil, nao com cor propria. O teste injeta uma
// paleta sentinela: toda cor e' um valor que nao existe no codigo, entao so aparece no HTML se
// tiver vindo da paleta. Uma cor fixa que alguem escreva no componente deixa o campo
// correspondente sem sentinela e derruba o teste.
//
// `paletaPorPerfil.test.ts` cobre o outro lado: que cada um dos 7 perfis gera uma paleta
// distinta e legivel. Juntos: a paleta varia por perfil, e o player usa a paleta.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

const SENTINELA = {
  accent: "#010203",
  accentStrong: "#040506",
  accentSoft: "#070809",
  accentMuted: "#0a0b0c",
  background: "#0d0e0f",
  surface: "#101112",
  surfaceElevated: "#131415",
  border: "#161718",
  borderStrong: "#191a1b",
  text: "#1c1d1e",
  textMuted: "#1f2021",
  textSubtle: "#222324",
  progressTrack: "#252627",
  inactive: "#28292a",
  theme: "medieval",
};

type PropsDeHost = { children?: React.ReactNode; style?: unknown; color?: string };
// O dublê joga estilo e cor de ícone para o HTML: é por eles que o teste enxerga a paleta.
function Host({ children, style, color }: PropsDeHost) {
  return <div data-estilo={JSON.stringify(style ?? null)} data-cor={color}>{children}</div>;
}

mockModule("react-native", {
  ActivityIndicator: Host,
  Image: () => null,
  Linking: { openURL: () => Promise.resolve() },
  Modal: Host,
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  Pressable: Host,
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  Text: Host,
  View: Host,
});
mockModule("react-native-safe-area-context", { SafeAreaView: Host });
mockModule("react-native-webview", { WebView: () => null });
mockModule("@expo/vector-icons", { Ionicons: Host });
mockModule("expo-audio", { createAudioPlayer: () => null, setAudioModeAsync: async () => undefined });
mockModule("expo-video", {
  VideoView: Host,
  useVideoPlayer: () => ({ duration: 0, playing: false, addListener: () => ({ remove: () => undefined }) }),
});
mockModule("@/constants/profileImages", { getBrainHexGuideName: (p?: string | null) => (p ? `Guia de ${p}` : "Guia") });
mockModule("@/context/SessaoContext", { useUsuario: () => ({ usuario: { id: "aluno", perfis: [] } }) });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/utils/profileShellTheme", { getProfileShellPalette: () => SENTINELA });
mockModule("@/utils/supabaseStorage", { resolveSupabaseStorageUrl: async (u: string) => u });
mockModule("@/utils/contentResume", {
  buildContentResumeKey: () => "chave",
  loadContentResume: async () => null,
  saveContentResume: async () => undefined,
});

const AudioPlayer = require("./AudioPlayer").default;
const VideoPlayer = require("./VideoPlayer").default;

const telas: Record<string, string> = {
  audio: renderToString(<AudioPlayer url="https://exemplo.test/aula.mp3" title="Aula" />),
  video: renderToString(<VideoPlayer url="https://exemplo.test/aula.mp4" title="Aula" />),
};

// `accentStrong` e `inactive` nao sao usados por estes dois componentes; cobrar os dois faria o
// teste reprovar por algo que nunca foi defeito.
const ESPERADOS = ["accent", "background", "surface", "border", "text"] as const;

for (const [nome, html] of Object.entries(telas)) {
  test(`o player de ${nome} pinta com a paleta do perfil`, () => {
    for (const campo of ESPERADOS) {
      assert.ok(
        html.includes(SENTINELA[campo]),
        `${nome}: a cor de "${campo}" (${SENTINELA[campo]}) nao chegou a tela — ha cor fixa no lugar`
      );
    }
  });

  test(`o player de ${nome} nao tem cor de marca fixa no lugar da paleta`, () => {
    // Hex de 6 digitos fora da sentinela. As excecoes sao deliberadas e estao no codigo:
    // o vermelho do aviso de erro e o branco/preto da sobreposicao de video sobre a imagem.
    const PERMITIDOS = new Set(["#ffb3b3", "#ffffff", "#000000", "#fff", "#000"]);
    const achados = (html.match(/#[0-9a-fA-F]{3,8}/g) ?? [])
      .map((cor) => cor.toLowerCase())
      .filter((cor) => !Object.values(SENTINELA).includes(cor) && !PERMITIDOS.has(cor));
    assert.deepEqual([...new Set(achados)], [], `${nome}: cor fora da paleta na tela`);
  });
}

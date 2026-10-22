import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// Na web o `AudioPlayer` tinha um ramo próprio que desenhava um `<audio controls>` cru: o aluno
// via a barra cinza do navegador dentro de um card com a cor do perfil BrainHex, enquanto no
// celular via o player do sistema (botão em `palette.accent`, trilho arrastável, tempo, reiniciar).
// Agora a tela é uma só nas duas plataformas, e o `<audio>` ficou escondido atrás do adaptador
// `tocadorDeAudioWeb`. Este teste trava isso: o elemento do HTML não volta para a árvore.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

type PropsDeHost = { children?: React.ReactNode; accessibilityLabel?: string };
// O dublê carrega o rótulo de acessibilidade para o HTML: é por ele que o teste reconhece os
// controles do padrão do sistema sem depender de estilo.
function Host({ children, accessibilityLabel }: PropsDeHost) {
  return <div data-rotulo={accessibilityLabel}>{children}</div>;
}

mockModule("react-native", {
  ActivityIndicator: () => null,
  Image: () => null,
  Linking: { openURL: () => Promise.resolve() },
  Platform: { OS: "web", select: (opcoes: Record<string, unknown>) => opcoes.web ?? opcoes.default },
  Pressable: Host,
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  Text: Host,
  View: Host,
});
mockModule("@expo/vector-icons", { Ionicons: () => null });
mockModule("expo-audio", {
  createAudioPlayer: () => { throw new Error("no ramo web o tocador tem de ser o do HTML"); },
  setAudioModeAsync: async () => undefined,
});
mockModule("@/constants/profileImages", { getBrainHexGuideName: (p?: string | null) => (p ? `Guia de ${p}` : "Guia") });
mockModule("@/context/SessaoContext", { useUsuario: () => ({ usuario: { id: "aluno", perfis: [] } }) });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/utils/profileShellTheme", { getProfileShellPalette: () => ({}) });
mockModule("@/utils/supabaseStorage", { resolveSupabaseStorageUrl: async (u: string) => u });
mockModule("@/utils/contentResume", {
  buildContentResumeKey: () => "chave",
  loadContentResume: async () => null,
  saveContentResume: async () => undefined,
});

const AudioPlayer = require("./AudioPlayer").default;

const html = renderToString(<AudioPlayer url="https://exemplo.test/aula.mp3" title="Aula 1" />);

test("a web nao desenha mais o <audio controls> do navegador", () => {
  assert.ok(!html.includes("<audio"), "o elemento cru voltou para a arvore e quebra o padrao visual");
});

test("a web desenha os controles do padrao do sistema", () => {
  for (const rotulo of ["Reproduzir áudio", "Reiniciar áudio"]) {
    assert.ok(
      html.includes(`data-rotulo="${rotulo}"`),
      `faltou o controle "${rotulo}" — o ramo web voltou a ter tela propria`
    );
  }
});

// --- O guardião que narra ---------------------------------------------------------------
//
// O áudio do material personalizado é TTS do guardião do perfil (`GUARDIAN_VOICE_PROFILES` no
// microservice, espelhado em `_BRAINHEX_GUIDE_PERSONAS` na API). Creditar quem narra é uma
// particularidade de perfil — e só pode aparecer quando existe guardião: áudio enviado pelo
// professor não tem perfil no metadata, e inventar um nome ali seria mentira na tela do aluno.

const comGuardiao = renderToString(
  <AudioPlayer url="https://exemplo.test/aula.mp3" title="Aula 1" perfilDoMaterial="seeker" />
);

test("audio do professor nao credita guardiao nenhum", () => {
  assert.ok(!html.includes("Narrado por"), "sem perfil no material nao ha quem creditar");
});

test("audio personalizado credita o guardiao do perfil DO MATERIAL", () => {
  assert.ok(comGuardiao.includes("Narrado por"), "faltou o credito de narracao");
  assert.ok(
    comGuardiao.includes("Guia de seeker"),
    "creditou outro perfil que nao o do material — a pele da tela nao decide quem narrou"
  );
});

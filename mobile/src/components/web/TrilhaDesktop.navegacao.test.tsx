import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// Clicar num nó da trilha na tela larga tem que abrir o tópico, no mapa, na
// árvore e na lista. Antes o clique só trocava a seleção do painel ao lado, e o
// aluno via o nó "sem abrir". As vistas viram dublês que guardam o callback de
// clique que recebem; o teste chama esse callback como o clique faria.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};
function Host({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}

const pushes: string[] = [];
const cliques: Record<string, (id: string) => void> = {};
let visual: "mapa" | "arvore" | "lista" = "mapa";

const NOS = [
  { id: "10", titulo: "Tópico 10", sequence: 1, locked: false, completed: true },
  { id: "20", titulo: "Tópico 20", sequence: 2, locked: false, completed: false },
  { id: "30", titulo: "Tópico 30", sequence: 3, locked: true, completed: false },
];

mockModule("react-native", {
  View: Host,
  Text: Host,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 1440, height: 900 }),
});
mockModule("@expo/vector-icons", { MaterialCommunityIcons: () => null });
mockModule("@react-navigation/native", { useIsFocused: () => true });
mockModule("expo-router", { router: { push: (href: string) => pushes.push(href) } });
mockModule("@/components/ProfileEmblem", { ProfileEmblem: () => null });
mockModule("@/components/trilhas/ArvoreView", {
  TrilhaArvoreSimple: ({ onSelecionarTopico }: { onSelecionarTopico: (id: string) => void }) => {
    cliques.arvore = onSelecionarTopico;
    return null;
  },
});
mockModule("@/components/trilhas/ListaSimplesView", {
  TrilhaLinearList: ({ onSelecionarTopico }: { onSelecionarTopico: (id: string) => void }) => {
    cliques.lista = onSelecionarTopico;
    return null;
  },
});
mockModule("@/components/web/MapaPaisesDesktop", {
  MapaPaisesDesktop: ({ onSelecionar }: { onSelecionar: (id: string) => void }) => {
    cliques.mapa = onSelecionar;
    return null;
  },
});
mockModule("@/components/trilhas/ModuleHeaderTitle", { ModuleHeaderGuideButton: () => null });
mockModule("@/components/web/PainelTopicoTrilha", { PainelTopicoTrilha: () => null });
mockModule("@/constants/designAssets", { getProfileArtwork: () => null });
mockModule("@/constants/profileImages", { getBrainHexGuideName: () => "Guia" });
mockModule("@/context/IAContext", { useIA: () => ({ pushMentorCue: () => undefined, resolveFeature: () => ({ enabled: false }) }) });
mockModule("@/context/SessaoContext", { useUsuario: () => ({ usuario: { id: "aluno", perfis: [] } }) });
mockModule("@/context/TrilhaContext", {
  useTrilha: () => ({
    classeAtual: { classe_id: 1, resumo: { materia_nome: "Matemática" }, topicos: NOS.map((n) => ({ id: Number(n.id) })) },
    carregando: false,
    erro: null,
    visual,
    mapTheme: null,
    personalizedTopics: {},
    progressoPersonalizado: null,
    perfil: "seeker",
    grafo: { nodes: NOS, edges: [{ from: "20", to: "30" }] },
  }),
});
mockModule("@/hooks/useTrailResume", { useTrailResumeTopic: () => "20" });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/utils/brainHexCapabilities", { getBrainHexProfileCapabilities: () => ({ hasChat: false }) });
mockModule("@/utils/profileShellTheme", { getProfileShellPalette: () => ({}) });
mockModule("@/utils/progressoTrilha", { calcularProgressoTrilha: () => ({ progresso: 0, totalTopicos: 3, concluidos: 1 }) });
mockModule("@/utils/tourTargets", { registrarAlvoTour: () => undefined });
mockModule("@/components/web/fonteCinzel", { FONTE_TITULO_TRILHA: "serif", useFonteCinzel: () => undefined });

const { TrilhaDesktop } = require("./TrilhaDesktop");

for (const modo of ["mapa", "arvore", "lista"] as const) {
  test(`${modo}: clicar num nó liberado abre o tópico; no bloqueado, não`, () => {
    visual = modo;
    pushes.length = 0;
    delete cliques[modo];
    renderToString(<TrilhaDesktop />);
    const clicar = cliques[modo];
    assert.equal(typeof clicar, "function", `a vista ${modo} não recebeu o clique`);

    clicar("20");
    assert.deepEqual(pushes, ["/(tabs)/trilha/20"]);
    clicar("10");
    assert.deepEqual(pushes, ["/(tabs)/trilha/20", "/(tabs)/trilha/10"], "concluído também abre, para revisar");
    clicar("30");
    assert.equal(pushes.length, 2, "nó bloqueado só seleciona; o painel explica o que falta");
  });
}

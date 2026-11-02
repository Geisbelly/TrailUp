import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// A tela de carregamento tem de: anunciar-se como barra de progresso ocupada ao leitor de
// tela, com título e frase no rótulo; falar com a voz do guia quando há perfil; e pintar
// com a paleta AAA daquele perfil (o núcleo puro está coberto em telaCarregamento.test.ts).

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

type PropsDeHost = {
  children?: React.ReactNode;
  style?: unknown;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: unknown;
};
// O dublê joga estilo e acessibilidade para o HTML: é por eles que o teste enxerga a tela.
function Host({ children, style, accessibilityRole, accessibilityLabel, accessibilityState }: PropsDeHost) {
  return (
    <div
      data-estilo={JSON.stringify(style ?? null)}
      data-papel={accessibilityRole}
      data-rotulo={accessibilityLabel}
      data-estado={accessibilityState ? JSON.stringify(accessibilityState) : undefined}
    >
      {children}
    </div>
  );
}

class ValorAnimado {
  constructor(public valor: number) {}
  interpolate() { return this; }
  setValue(v: number) { this.valor = v; }
  stopAnimation() {}
  toJSON() { return this.valor; }
}
const animacao = () => ({ start: () => undefined, stop: () => undefined });

mockModule("react-native", {
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => undefined }),
    announceForAccessibility: () => undefined,
  },
  Animated: { Value: ValorAnimado, View: Host, timing: animacao, loop: animacao },
  Easing: { linear: (t: number) => t },
  // A fonte vira atributo: é assim que o teste vê qual imagem está no medalhão.
  Image: ({ source }: { source?: unknown }) => <i data-fonte={String(source)} />,
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  Text: Host,
  View: Host,
  useWindowDimensions: () => ({ width: 390, height: 780 }),
});
mockModule("expo-linear-gradient", { LinearGradient: () => null });
// O nome do glifo vira atributo: é por ele que o teste vê qual ícone está no medalhão.
const IconeDuble = ({ name, color }: { name: string; color?: string }) => <i data-icone={name} data-cor={color} />;
IconeDuble.glyphMap = {};
mockModule("@expo/vector-icons", { MaterialCommunityIcons: IconeDuble });
mockModule("@/components/HallTheme", { HallBackground: () => null, OrnamentDivider: () => null });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
// No Node toda imagem vira o número 1 (stub-de-imagens): nomes sentinela distinguem as artes.
mockModule("@/constants/designAssets", { designStar: "estrela-da-marca" });
// O hook real só responde depois de montar (efeito), e o renderToString não roda efeitos.
let movimentoReduzido = false;
mockModule("@/hooks/useMovimentoReduzido", { useMovimentoReduzido: () => movimentoReduzido });

const { TelaCarregamento } = require("./TelaCarregamento");
const { LoadingState } = require("../LoadingState");
const nucleo = require("@/utils/telaCarregamento");
const { brainHexConfig } = require("@/constants/profileImages");

const PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"] as const;

const desenhar = (props: Record<string, unknown>) =>
  renderToString(<TelaCarregamento titulo="Carregando trilha" mensagem="Organizando conteúdos." sorteioDaFrase={0} {...props} />);

test("sem perfil: variante neutra, com a mensagem do contexto e sem guia", () => {
  const html = desenhar({ perfil: null });
  assert.match(html, /data-papel="progressbar"/);
  assert.match(html, /data-estado="\{&quot;busy&quot;:true\}"/);
  // Uma frase por parte, sem ponto dobrado ("conteúdos..").
  assert.match(html, /data-rotulo="Carregando trilha\. Organizando conteúdos\."/);
  const pontuado = desenhar({ perfil: null, titulo: "Quase lá." });
  assert.match(pontuado, /data-rotulo="Quase lá\. Organizando conteúdos\."/);
  assert.ok(html.includes(nucleo.FUNDO_DO_SPLASH), "fundo do splash");
  assert.doesNotMatch(html, / · /, "variante neutra não mostra guia");
  assert.match(html, /data-fonte="estrela-da-marca"/);
});

for (const perfil of PERFIS) {
  test(`${perfil}: o guia fala, com a paleta do perfil`, () => {
    const html = desenhar({ perfil });
    const frase = nucleo.escolherFrase(perfil, 0);
    const paleta = nucleo.paletaDoCarregamento(perfil);
    assert.ok(html.includes(nucleo.rotuloDoGuia(perfil)), "rótulo do guia");
    // No medalhão vai o ícone chapado do perfil, na cor de destaque, e nenhuma imagem:
    // nem a estrela, nem o emblema 3D.
    assert.deepEqual([...html.matchAll(/data-icone="([^"]+)"/g)].map((m) => m[1]), [brainHexConfig[perfil].icon]);
    assert.match(html, new RegExp(`data-icone="[^"]+" data-cor="${paleta.destaque}"`));
    assert.equal([...html.matchAll(/data-fonte=/g)].length, 0);
    assert.ok(html.includes(frase), "frase do guia");
    // Com perfil, quem fala é o guia: a mensagem genérica do contexto sai.
    assert.ok(!html.includes("Organizando conteúdos."), "mensagem do contexto não aparece");
    assert.match(html, new RegExp(`data-rotulo="Carregando trilha\\. ${frase.replace(/[.!?]/g, "\\$&")}"`));
    for (const cor of [paleta.fundo, paleta.destaque, paleta.texto, paleta.textoSuave]) {
      assert.ok(html.includes(cor), `${perfil}: ${cor} não chegou à tela`);
    }
  });
}

test("LoadingState leva o perfil da paleta para a tela nova", () => {
  const html = renderToString(<LoadingState title="Carregando trilha" palette={{ profile: "achiever" }} />);
  assert.ok(html.includes("Realizador · Kwame"));
  const neutra = renderToString(<LoadingState title="Preparando sessão" message="Validando suas credenciais..." />);
  assert.ok(neutra.includes("Validando suas credenciais..."));
  assert.ok(neutra.includes(nucleo.FUNDO_DO_SPLASH));
});

test("com movimento reduzido, nada é animado: marcos parados e iguais, halo fixo", () => {
  const estilosDosMarcos = (html: string) =>
    [...html.matchAll(/data-estilo="([^"]*rotate[^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"'));
  try {
    movimentoReduzido = true;
    const parada = desenhar({ perfil: "daredevil" });
    const acesos = estilosDosMarcos(parada).filter((e) => e.includes(`"opacity":${nucleo.INTENSIDADE_PARADA}`));
    assert.equal(acesos.length, nucleo.MARCOS_NA_TRILHA, "todo marco aceso com a mesma intensidade parada");
    for (const e of acesos) assert.match(e, /"scale":1\b/);
    assert.match(parada, /&quot;opacity&quot;:0\.5\}/, "halo com opacidade fixa");
    // Continua dizendo, em texto, que está carregando.
    assert.match(parada, /data-papel="progressbar"/);
  } finally {
    movimentoReduzido = false;
  }
  const animada = desenhar({ perfil: "daredevil" });
  const parados = estilosDosMarcos(animada).filter((e) => e.includes(`"opacity":${nucleo.INTENSIDADE_PARADA}`));
  assert.equal(parados.length, 0, "sem a preferência, os marcos vêm dos valores animados");
});

test("o medalhão usa o ícone chapado do perfil, nunca o retrato do guia nem o emblema 3D", () => {
  const { readFileSync } = require("node:fs");
  const fonte = readFileSync(require.resolve("./TelaCarregamento"), "utf8");
  assert.doesNotMatch(fonte, /guardianFace|guardianFull|guardioes|profileEmblems/);
});

test("fora da transição há uma camada só; neutra e perfil reservam a mesma linha do rótulo", () => {
  const neutra = desenhar({ perfil: null });
  const comPerfil = desenhar({ perfil: "seeker" });
  // Sem transição em andamento, uma arte só no medalhão (uma camada).
  assert.equal([...neutra.matchAll(/data-fonte=|data-icone=/g)].length, 1);
  assert.equal([...comPerfil.matchAll(/data-fonte=|data-icone=/g)].length, 1);
  // A neutra desenha a linha do rótulo vazia, para as duas terem o mesmo layout na troca.
  assert.match(neutra, />\s<\/div>/);
});

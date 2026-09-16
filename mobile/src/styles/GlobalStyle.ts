import { Platform } from "react-native";

import { Noite, Texto } from "./identidade";

const ornamentalSerif =
  Platform.select({
    ios: "Georgia",
    android: "serif",
    web: "Georgia",
    default: "serif",
  }) ?? "serif";

const readableSerif =
  Platform.select({
    ios: "Palatino",
    android: "serif",
    web: "Georgia",
    default: "serif",
  }) ?? "serif";

/* Fonts */
export const FontFamily = {
  inikaBold: ornamentalSerif,
  inknutAntiquaMedium: ornamentalSerif,
  interMedium: readableSerif,
  poppinsExtraBold: ornamentalSerif,
};
// Os tokens da identidade moram em `identidade.ts`, sem dependencia de
// runtime. Reexportados aqui para quem ja importa de `@/styles/GlobalStyle`.
export { Aco, Luz } from "./identidade";
export { Noite, Texto };

/* Font sizes */
export const FontSize = {
  fs_18: 18,
  fs_20: 20,
};
/* Colors */
/**
 * `Color` e' a CAMADA DE COMPATIBILIDADE entre os nomes antigos e a identidade
 * nova. Os nomes ficam; os valores passam a sair de `identidade.ts`.
 *
 * Por que aqui e nao nos chamadores: 32 arquivos importam `Color.*`, e
 * `Color.background` (`#111936`) pintava a pagina da trilha, do ranking, das
 * notificacoes e do topico. Trocar a paleta do PERFIL sem trocar estes nomes
 * deixava o app com o chao antigo — o `profileShellTheme` mudava, e a tela nao.
 *
 * Duas correcoes de contraste que vieram junto, medidas:
 * - `colorSlategray` (`#5d6579`) era usado como TEXTO em 27 lugares e dava
 *   **2,96** sobre o fundo antigo. Reprovava em AA desde antes desta migracao.
 * - `colorBlueviolet100` (`#9747ff`) e' o accent de fallback (`theme?.accent ??`)
 *   e dava 3,36 sobre a superficie elevada. Foi CLAREADO no HSL, nao trocado de
 *   matiz: a regra do repo e' elevar luminosidade, nunca misturar com branco.
 */
export const Color = {
  // --- chao e superficie -------------------------------------------------
  background: Noite.n900,
  colorGray: Noite.n600, // trilho de progresso, ponto numerado
  colorDarkslateblue: Noite.n800,
  colorMidnightblue100: Noite.n700,
  colorMidnightblue200: "rgba(4, 22, 43, 0.91)", // n800 translucido
  colorDarkslategray: Noite.n700,
  colorDarkslategray200: Noite.n700,
  colorDarkslategray100: Noite.n600, // borda

  // --- texto -------------------------------------------------------------
  colorAliceblue: Texto.forte,
  colorAliceblue100: Texto.forte,
  colorAliceblue300: "rgba(201, 210, 223, 0.98)",
  colorAliceblue200: "rgba(201, 210, 223, 0.1)",
  colorAliceblueCinza: "rgba(201, 210, 223, 0.1)",
  colorSlategray: Texto.medio, // era #5d6579: 2,96 de contraste como texto

  // --- accent de fallback ------------------------------------------------
  // Usado onde nao ha tema de perfil disponivel (`theme?.accentColor ?? ...`).
  // Mesma matiz do roxo antigo, luminosidade elevada ate 4,73 sobre a elevada.
  colorBlueviolet100: "#ae70ff",
  colorBlueviolet200: "rgba(174, 112, 255, 0.25)",

  // --- branco puro, intocado ---------------------------------------------
  // Branco da 19,45 sobre o chao novo: nao havia o que corrigir, e trocar
  // mudaria o sentido de quem escolheu branco de proposito.
  colorWhite: "#fff",
  colorWhite70: "#ffffff70",
  colorwhite50: "#ffffff50",
  colorWhite20: "#ffffff20",
  colorWhite25: "#ffffff25",
  colorWhite10: "#ffffff10",
};
/* border radiuses */
export const Border = {
  br_4: 4,
};
/* box shadows */
export const BoxShadow = {
  shadow_drop: "2px 2px 9px rgba(0, 0, 0, 0.27)",
  shadow_drop1: "0px 4px 8px rgba(0, 0, 0, 0.1)",
};

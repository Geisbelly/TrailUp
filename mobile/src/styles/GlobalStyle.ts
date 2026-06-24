import { Platform } from "react-native";

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
/* Font sizes */
export const FontSize = {
  fs_18: 18,
};
/* Colors */
export const Color = {
  colorAliceblue: "#f2f7fa",
  colorBlueviolet100: "#9747ff",
  colorBlueviolet200: "rgba(76, 64, 246, 0.25)",
  colorDarkslateblue: "#191541",
  colorMidnightblue100: "#211d5f",
  colorMidnightblue200: "rgba(28, 24, 77, 0.91)",
  background: "#111936",
  colorDarkslategray: "#292c44",
  colorAliceblueCinza: "rgba(242, 247, 250, 0.1)",
  colorAliceblue100: "#f2f7fa",
  colorAliceblue200: "rgba(242, 247, 250, 0.1)",
  colorAliceblue300: "rgba(242, 247, 250, 0.98)",
  colorDarkslategray100: "#455154",
  colorDarkslategray200: "#292c44",
  colorGray: "#13112e",
  colorSlategray: "#5d6579",
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

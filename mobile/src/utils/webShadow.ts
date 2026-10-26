import tinycolor from "tinycolor2";
// so os tipos -- apagados na compilacao, entao nao pesam no bundle nem
// exigem "react-native" resolvivel no ambiente de teste (node --test puro).
import type { TextStyle, ViewStyle } from "react-native";

// react-native-web avisa no console a cada render quando ve shadowColor/
// shadowOffset/shadowOpacity/shadowRadius (ou textShadowColor/Offset/Radius)
// como props separadas -- ele quer boxShadow/textShadow no formato CSS.
//
// Isso NAO pode virar uma troca cega nos dois sentidos:
// - boxShadow so e reconhecido no nativo (iOS/Android) atras da feature flag
//   enableNativeCSSParsing do React Native (ReactNativeStyleAttributes.js) --
//   nao ha garantia de que esteja ligada neste app.
// - textShadow (a versao unificada) nem existe no registro de estilos do
//   nativo (so textShadowColor/Offset/Radius) -- setar so `textShadow` faria
//   o texto perder a sombra inteira no app.
//
// Por isso os pares abaixo tomam `isWeb` explicito e devolvem os campos
// certos pra cada lado: boxShadow/textShadow na web, as props separadas de
// sempre no nativo -- sem mudar nada pra quem usa iOS/Android. `isWeb` e
// parametro (em vez do helper importar Platform de "react-native") pra este
// arquivo continuar puro e testavel com `node --test` puro, sem bundler.

export type RNBoxShadow = {
  color?: string;
  offset?: { width: number; height: number };
  opacity?: number;
  radius?: number;
};

export function boxShadowFromRN({
  color = "#000",
  offset = { width: 0, height: 0 },
  opacity = 1,
  radius = 0,
}: RNBoxShadow = {}): string {
  const rgba = tinycolor(color).setAlpha(opacity).toRgbString();
  return `${offset.width}px ${offset.height}px ${radius}px ${rgba}`;
}

export type RNBoxShadowStyle =
  | { boxShadow: string }
  | {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
    };

// Cast pra ViewStyle: boxShadow existe de verdade em runtime (react-native-web
// sempre, RN nativo atras da flag), mas os tipos ambientes do RN nao o
// declaram -- sem o cast, todo call site precisaria repetir esse `as`.
export function shadowStyle(shadow: RNBoxShadow = {}, isWeb: boolean): ViewStyle {
  if (isWeb) {
    return { boxShadow: boxShadowFromRN(shadow) } as ViewStyle;
  }

  // No nativo so sai o que foi passado. Preencher default aqui mudaria o
  // visual: shadowOpacity ausente vale 0 no RN (sombra invisivel) e
  // shadowOffset ausente vale {0,-3} no iOS. Um estilo que so tinha
  // shadowOpacity/shadowRadius (cor inline, por exemplo) tem que continuar
  // exatamente assim.
  const nativo: ViewStyle = {};
  if (shadow.color !== undefined) nativo.shadowColor = shadow.color;
  if (shadow.offset !== undefined) nativo.shadowOffset = shadow.offset;
  if (shadow.opacity !== undefined) nativo.shadowOpacity = shadow.opacity;
  if (shadow.radius !== undefined) nativo.shadowRadius = shadow.radius;
  return nativo;
}

export type RNTextShadow = {
  color?: string;
  offset?: { width: number; height: number };
  radius?: number;
};

export function textShadowFromRN({
  color = "#000",
  offset = { width: 0, height: 0 },
  radius = 0,
}: RNTextShadow = {}): string {
  return `${offset.width}px ${offset.height}px ${radius}px ${color}`;
}

export type RNTextShadowStyle =
  | { textShadow: string }
  | {
      textShadowColor: string;
      textShadowOffset: { width: number; height: number };
      textShadowRadius: number;
    };

// Mesmo motivo do cast em shadowStyle: textShadow so existe pros tipos do
// react-native-web, que este projeto nao usa pra type-check (um tsconfig so,
// pra todas as plataformas).
export function textShadowStyle(shadow: RNTextShadow = {}, isWeb: boolean): TextStyle {
  if (isWeb) {
    return { textShadow: textShadowFromRN(shadow) } as TextStyle;
  }

  // Mesmo cuidado do shadowStyle: no nativo so sai o que foi passado.
  const nativo: TextStyle = {};
  if (shadow.color !== undefined) nativo.textShadowColor = shadow.color;
  if (shadow.offset !== undefined) nativo.textShadowOffset = shadow.offset;
  if (shadow.radius !== undefined) nativo.textShadowRadius = shadow.radius;
  return nativo;
}

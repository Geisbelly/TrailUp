import tinycolor from "tinycolor2";

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

export function shadowStyle(shadow: RNBoxShadow = {}, isWeb: boolean): RNBoxShadowStyle {
  if (isWeb) {
    return { boxShadow: boxShadowFromRN(shadow) };
  }

  const { color = "#000", offset = { width: 0, height: 0 }, opacity = 1, radius = 0 } = shadow;
  return {
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
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

export function textShadowStyle(shadow: RNTextShadow = {}, isWeb: boolean): RNTextShadowStyle {
  if (isWeb) {
    return { textShadow: textShadowFromRN(shadow) };
  }

  const { color = "#000", offset = { width: 0, height: 0 }, radius = 0 } = shadow;
  return {
    textShadowColor: color,
    textShadowOffset: offset,
    textShadowRadius: radius,
  };
}

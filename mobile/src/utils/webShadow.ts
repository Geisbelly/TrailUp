import tinycolor from "tinycolor2";

// react-native-web avisa no console a cada render quando ve shadowColor/
// shadowOffset/shadowOpacity/shadowRadius (ou textShadowColor/Offset/Radius)
// como props separadas -- ele quer boxShadow/textShadow no formato CSS.
// Nativo (iOS/Android) continua usando as props separadas normalmente; estes
// helpers so entram no valor calculado que vai pro style, entao o mesmo
// objeto de estilo serve pras duas plataformas.
//
// shadowOpacity do RN multiplica o alpha de shadowColor -- por isso a cor
// passa pelo tinycolor aqui antes de virar rgba(). textShadow do RN nao tem
// um "opacity" separado (o alpha, se houver, ja vem embutido em
// textShadowColor), entao textShadowFromRN so repassa a cor.

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

import React from "react";
import { Image, type ImageProps } from "react-native";

import { useFonteDeImagem } from "@/hooks/useFonteDeImagem";

type Props = ImageProps & {
  /** Mostrado enquanto a URL assinada nao chega (ou se falhar). */
  fallback?: ImageProps["source"];
};

/**
 * <Image> que entende foto/banner privado do Storage (#195): a `source.uri`
 * pode ser a ref `<bucket>/<caminho>` ou uma URL antiga do Storage; o
 * componente assina antes de carregar. Sem fallback, nao desenha nada
 * enquanto espera.
 */
export function ImagemDoStorage({ source, fallback, ...resto }: Props) {
  const fonte = useFonteDeImagem(source);
  const final = fonte ?? fallback;
  if (!final) return null;
  return <Image {...resto} source={final} />;
}

import { Platform, useWindowDimensions } from "react-native";

import { ehDesktopWeb } from "@/utils/desktopWeb";

/** Verdadeiro só na web com largura de computador; acompanha o redimensionamento da janela. */
export function useDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return ehDesktopWeb(Platform.OS, width);
}

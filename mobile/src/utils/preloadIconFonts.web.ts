// @expo/vector-icons carrega cada familia via `Font.loadAsync(font)` sem
// passar `display`, entao o @font-face gerado usa o default do navegador
// (`auto`/FOIT) — em rede lenta isso e o que o Chrome reporta como
// "Slow network is detected... Fallback font will be used" (issue #29).
//
// Pre-carregamos as familias usadas no app aqui, na raiz, com
// `display: "swap"` explicito. `Font.loadAsync` deduplica por nome de
// familia (cache em `loadPromises`), entao a chamada feita por cada
// componente de icone depois so reaproveita esta promise — a regra de
// `font-display` que vale e a desta primeira chamada.
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Font from "expo-font";

const ICON_SETS = [Feather, Ionicons, MaterialCommunityIcons, MaterialIcons] as const;

export function preloadIconFontsWithSwap() {
  for (const IconSet of ICON_SETS) {
    const fontFamily = IconSet.getFontFamily();
    const assetId = (IconSet.font as Record<string, string | number>)[fontFamily];
    void Font.loadAsync({
      [fontFamily]: { uri: assetId, display: Font.FontDisplay.SWAP },
    });
  }
}

import { Redirect } from "expo-router";

import { LojaDesktop } from "@/components/web/LojaDesktop";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

// A Loja só é página na web em tela larga (#346); no celular ela é o modal
// aberto pelo Social, então quem cair aqui fora da tela larga volta ao Perfil.
export default function LojaScreen() {
  const desktop = useDesktopWeb();
  return desktop ? <LojaDesktop /> : <Redirect href="/perfil" />;
}

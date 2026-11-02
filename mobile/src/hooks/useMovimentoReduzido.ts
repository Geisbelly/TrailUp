import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Preferência "Reduzir movimento" do sistema (iOS, Android e, na web,
 * `prefers-reduced-motion`, que o react-native-web consulta por `matchMedia`).
 * Acompanha a troca com o app aberto. Começa em `false` até a resposta chegar.
 */
export function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => vivo && setReduzido(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduzido);
    return () => {
      vivo = false;
      sub?.remove?.();
    };
  }, []);
  return reduzido;
}

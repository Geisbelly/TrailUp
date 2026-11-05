import type { Coletor } from "./coletor";

/** Carregado depois da primeira tela, para não pesar justamente no que ele mede. */
export function ligarVitais(coletor: Coletor): void {
  void import("web-vitals")
    .then(({ onCLS, onINP, onLCP }) => {
      onLCP((m) => coletor.registrarVital("lcp_ms", m.value));
      onINP((m) => coletor.registrarVital("inp_ms", m.value));
      onCLS((m) => coletor.registrarVital("cls", m.value));
    })
    .catch(() => undefined);
}

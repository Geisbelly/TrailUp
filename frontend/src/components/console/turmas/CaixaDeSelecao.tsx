import { useEffect, useRef } from "react";
import type { EstadoDaSelecao } from "./matriculas";

/** Caixa nativa: a única com os três estados (marcada, parcial, vazia) que leitor de tela entende sozinho. */
export function CaixaDeSelecao({ estado, onChange, rotulo, disabled }: { estado: EstadoDaSelecao; onChange: () => void; rotulo: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "parcial";
  }, [estado]);
  return <input ref={ref} type="checkbox" aria-label={rotulo} checked={estado === "todos"} disabled={disabled} onChange={onChange} className="h-4 w-4 cursor-pointer [color-scheme:dark] accent-[hsl(var(--console-violet))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed" />;
}

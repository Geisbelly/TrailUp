import { useEffect, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import type { ChaveDoCatalogo } from "./disponibilidade";
import { N_MINIMO_PADRAO } from "./graficos";

/** O `n_minimo` da linha lida, ou o padrão se ela não veio ou não é um inteiro positivo. */
export function nMinimoDoCatalogo(linhas: unknown[] | null | undefined): number {
  const valor = (linhas?.[0] as { n_minimo?: unknown } | undefined)?.n_minimo;
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0 ? valor : N_MINIMO_PADRAO;
}

/** Lê `metricas_catalogo.n_minimo` da métrica uma vez por carga (só leitura, direto do Supabase). */
export function useNMinimo(chave: ChaveDoCatalogo, recarga: unknown): number {
  const [nMinimo, setNMinimo] = useState(N_MINIMO_PADRAO);

  useEffect(() => {
    let vivo = true;
    void selectView("metricas_catalogo", "n_minimo")
      .eq("chave", chave)
      .then(({ data, error }) => {
        if (vivo) setNMinimo(nMinimoDoCatalogo(error ? null : data));
      });
    return () => {
      vivo = false;
    };
  }, [chave, recarga]);

  return nMinimo;
}

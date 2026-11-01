import { useEffect, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import type { Disponibilidade } from "./disponibilidade";

/** Lê vw_metricas_disponibilidade uma vez por carga do dashboard (só leitura, direto do Supabase). */
export function useDisponibilidade(recarga: unknown): Map<string, Disponibilidade> {
  const [mapa, setMapa] = useState<Map<string, Disponibilidade>>(new Map());

  useEffect(() => {
    let vivo = true;
    void selectView("vw_metricas_disponibilidade", "chave, disponivel, motivo").then(({ data, error }) => {
      if (!vivo) return;
      // Falha ao ler a disponibilidade não esconde os cards: o mapa vazio deixa cada um no próprio
      // estado (ver estadoDoCard). O erro de cada card vem da leitura do próprio card.
      if (error || !data) return setMapa(new Map());
      setMapa(
        new Map(
          (data as { chave: string; disponivel: boolean; motivo: string | null }[]).map((l) => [
            l.chave,
            { disponivel: l.disponivel, motivo: l.motivo },
          ]),
        ),
      );
    });
    return () => {
      vivo = false;
    };
  }, [recarga]);

  return mapa;
}

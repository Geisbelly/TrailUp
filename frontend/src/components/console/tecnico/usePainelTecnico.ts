import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { eMigracaoPendente, eSemPermissao, lerPainel, type PainelTecnico } from "./painelTecnico";

export type EstadoDoPainel =
  | { tipo: "carregando" }
  | { tipo: "pronto" }
  | { tipo: "sem_permissao" }
  | { tipo: "indisponivel" } // migration 20261102_22 ainda não aplicada
  | { tipo: "erro"; detalhe: string };

const INTERVALO_MS = 60_000;

/**
 * Lê o painel técnico direto no Supabase (RPC `painel_tecnico`, só para o dono; nada passa pela API, que é
 * justamente uma das coisas que o painel observa). Relê a cada minuto e ao voltar para a aba: um painel
 * que mostra o estado de uma hora atrás é pior que nenhum. Em erro de leitura mantém o último painel bom
 * e avisa que está desatualizado.
 */
export function usePainelTecnico(horas: number) {
  const [painel, setPainel] = useState<PainelTecnico | null>(null);
  const [estado, setEstado] = useState<EstadoDoPainel>({ tipo: "carregando" });
  const [desatualizado, setDesatualizado] = useState(false);
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    const { data, error } = await supabase.rpc("painel_tecnico" as never, { p_horas: horas } as never);
    if (!request.isCurrent()) return;
    if (error) {
      if (eSemPermissao(error)) return setEstado({ tipo: "sem_permissao" });
      if (eMigracaoPendente(error)) return setEstado({ tipo: "indisponivel" });
      // Já havia um painel bom: mantém e marca como desatualizado, em vez de apagar o que se sabe.
      setDesatualizado(true);
      setEstado((atual) => (atual.tipo === "pronto" ? atual : { tipo: "erro", detalhe: error.message ?? "erro desconhecido" }));
      return;
    }
    const lido = lerPainel(data);
    if (!lido) return setEstado({ tipo: "erro", detalhe: "Resposta inesperada do banco." });
    setPainel(lido);
    setDesatualizado(false);
    setEstado({ tipo: "pronto" });
  }, [horas]);

  useEffect(() => {
    setEstado({ tipo: "carregando" });
    void carregar();
    const timer = window.setInterval(() => void carregar(), INTERVALO_MS);
    const aoVoltar = () => void carregar();
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [carregar]);

  return { painel, estado, desatualizado, recarregar: carregar };
}

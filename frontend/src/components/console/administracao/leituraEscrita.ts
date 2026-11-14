import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";

async function chamar(funcao: string, argumentos: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.rpc(funcao as never, argumentos as never);
  if (error) throw new Error(error.code === "42501" ? "Sem permissão." : error.message || "Falha ao falar com o banco.");
  return data;
}

/** Lê direto do banco, como o painel técnico: a tela não pode cair junto com a API. */
export function useLeitura<T>(funcao: string, argumentos: Record<string, unknown>, ler: (dado: unknown) => T | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());
  const chave = JSON.stringify(argumentos);

  const carregar = useCallback(async () => {
    const pedido = guarda.current.next();
    try {
      const lido = ler(await chamar(funcao, JSON.parse(chave)));
      if (!pedido.isCurrent()) return;
      if (!lido) return setErro("Resposta inesperada do banco.");
      setDados(lido);
      setErro(null);
    } catch (e) {
      if (pedido.isCurrent()) setErro(e instanceof Error ? e.message : "Falha ao ler.");
    }
  }, [funcao, chave, ler]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { dados, erro, carregar };
}

/** Roda uma escrita, relê e avisa. A frase de erro é a do banco. Devolve a resposta, ou null se falhou. */
export function useEscrita(depois: () => Promise<void>) {
  const [ocupado, setOcupado] = useState(false);
  const escrever = useCallback(
    async (funcao: string, argumentos: Record<string, unknown>, sucesso: string | ((resposta: unknown) => string)) => {
      setOcupado(true);
      try {
        const resposta = await chamar(funcao, argumentos);
        await depois();
        toast.success(typeof sucesso === "string" ? sucesso : sucesso(resposta));
        return resposta;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [depois],
  );
  return { ocupado, escrever };
}

export type Escrever = ReturnType<typeof useEscrita>["escrever"];

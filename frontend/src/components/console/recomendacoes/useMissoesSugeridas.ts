import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestGuard } from "@/lib/requestGuard";
import { avisarQueRecomendacoesMudaram } from "./eventoRecomendacoes";
import {
  buscarLimites,
  decidirSugestao,
  listarDecididas,
  listarPedidos,
  listarPendentes,
  pedirMissoes,
} from "./missoesIaApi";
import {
  eMigracaoPendente,
  mensagemDoPedido,
  type LimitesDeMissoesIa,
  type MissaoSugerida,
  type PedidoDeMissoesIa,
} from "./missoesIa";

export type EstadoDasMissoesIa = { tipo: "carregando" } | { tipo: "pronto" } | { tipo: "indisponivel" } | { tipo: "erro"; detalhe: string };

const INTERVALO_ENQUANTO_ESPERA_MS = 8_000;

/**
 * Missões sugeridas pela IA: pedir (RPC do banco), ler e decidir (Supabase direto). Só propor é da
 * API, e ela atende o pedido quando puder; por isso, com um pedido na fila, a tela relê a cada 8 s
 * até ele fechar, e sem pedido na fila não relê nada.
 */
export function useMissoesSugeridas(classIds: number[]) {
  const [limites, setLimites] = useState<LimitesDeMissoesIa | null>(null);
  const [pendentes, setPendentes] = useState<MissaoSugerida[]>([]);
  const [decididas, setDecididas] = useState<MissaoSugerida[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDeMissoesIa[]>([]);
  const [estado, setEstado] = useState<EstadoDasMissoesIa>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setPendentes([]);
      setDecididas([]);
      setPedidos([]);
      setEstado({ tipo: "pronto" });
      return;
    }
    const [lim, pend, dec, ped] = await Promise.all([buscarLimites(), listarPendentes(classIds), listarDecididas(classIds), listarPedidos(classIds)]);
    if (!request.isCurrent()) return;
    const erro = lim.erro ?? pend.erro ?? dec.erro ?? ped.erro;
    if (erro) {
      setEstado(eMigracaoPendente(erro) ? { tipo: "indisponivel" } : { tipo: "erro", detalhe: erro.message ?? "erro desconhecido" });
      return;
    }
    setLimites(lim.limites);
    setPendentes(pend.missoes);
    setDecididas(dec.missoes);
    setPedidos(ped.pedidos);
    setEstado({ tipo: "pronto" });
  }, [classIds]);

  useEffect(() => {
    setEstado({ tipo: "carregando" });
    void carregar();
  }, [carregar]);

  // Enquanto algum pedido espera a IA, relê até ele fechar. Pedido `falhou` ou `concluido` não espera.
  const algumEsperando = pedidos.some((p) => p.status === "pendente");
  useEffect(() => {
    if (!algumEsperando) return;
    const timer = window.setInterval(() => void carregar(), INTERVALO_ENQUANTO_ESPERA_MS);
    return () => window.clearInterval(timer);
  }, [algumEsperando, carregar]);

  const pedir = useCallback(
    async (classeId: number, topicoId: number | null, quantidade: number) => {
      const { erro } = await pedirMissoes({ classeId, topicoId, quantidade });
      if (erro) throw new Error(mensagemDoPedido(erro));
      await carregar();
      avisarQueRecomendacoesMudaram();
    },
    [carregar],
  );

  const decidir = useCallback(
    async (id: number, aprovar: boolean, motivo?: string) => {
      const anterior = pendentes.find((m) => m.id === id);
      if (!anterior) return;
      const decidida: MissaoSugerida = { ...anterior, aprovacao: aprovar ? "aprovada" : "recusada", motivo_recusa: aprovar ? null : (motivo ?? null) };
      setPendentes((atual) => atual.filter((m) => m.id !== id));
      setDecididas((atual) => [decidida, ...atual]);
      try {
        await decidirSugestao(id, aprovar, motivo);
      } catch (e) {
        setPendentes((atual) => [anterior, ...atual]);
        setDecididas((atual) => atual.filter((m) => m.id !== id));
        throw e instanceof Error ? e : new Error("Não foi possível salvar a decisão.");
      }
      avisarQueRecomendacoesMudaram();
    },
    [pendentes],
  );

  return { limites, pendentes, decididas, pedidos, estado, pedir, decidir };
}

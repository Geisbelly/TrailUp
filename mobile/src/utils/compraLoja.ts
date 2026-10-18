// Estados do card e confirmação de compra da Loja na web em tela larga (#346,
// protótipo v4, 12-loja.md §4.3 e §4.4). Função pura.
// Unidade gratuita (dotação) não consulta preço nem saldo — é a regra de
// `loja_comprar` (20260912_04_loja_compra.py).

type ItemLoja = {
  name: string;
  assetKey: string | null;
  price: number;
  state: "available" | "blocked" | "owned" | "unavailable";
  metadata: Record<string, unknown>;
};

export type EstadoCompra = {
  gratis: boolean;
  custo: number;
  /** Moedas que faltam para pagar; 0 quando dá para comprar. */
  falta: number;
  rotulo: string;
  habilitado: boolean;
};

export function gratisRestantes(item: Pick<ItemLoja, "metadata">): number {
  const n = Number(item.metadata?.gratisRestantes ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function estadoCompra(item: ItemLoja, saldo: number): EstadoCompra {
  const gratis = gratisRestantes(item) > 0;
  const custo = gratis ? 0 : Math.max(0, item.price);
  const falta = gratis ? 0 : Math.max(0, custo - saldo);
  if (item.state === "owned") return { gratis, custo, falta: 0, rotulo: "Adquirido", habilitado: false };
  if (item.state === "unavailable") return { gratis, custo, falta: 0, rotulo: "Indisponível", habilitado: false };
  if (item.state === "blocked") return { gratis, custo, falta: 0, rotulo: "Bloqueado", habilitado: false };
  if (gratis) return { gratis, custo, falta, rotulo: "Pegar grátis", habilitado: true };
  if (falta > 0) return { gratis, custo, falta, rotulo: falta === 1 ? "Falta 1 moeda" : `Faltam ${falta} moedas`, habilitado: false };
  return { gratis, custo, falta, rotulo: "Comprar", habilitado: true };
}

const ATE: Record<string, string> = {
  prazo_extra: "até você usar numa atividade com prazo.",
  segunda_chance: "até você refazer uma atividade.",
  troca_formato: "até o próximo material.",
};

export function textoConfirmacao(item: ItemLoja, saldo: number) {
  const { gratis, custo } = estadoCompra(item, saldo);
  const destino = `Fica na sua Bag ${ATE[item.assetKey ?? ""] ?? "até você usar numa questão."}`;
  return {
    titulo: gratis ? `Pegar ${item.name}?` : `Comprar ${item.name}?`,
    descricao: `${destino}\n${gratis ? "Não gasta moedas." : `Saldo: ${saldo} → ${saldo - custo}`}`,
    confirmar: gratis ? "Pegar" : "Comprar",
  };
}

export const avisoCompraFeita = (item: Pick<ItemLoja, "name">) => `${item.name} foi para a sua Bag.`;

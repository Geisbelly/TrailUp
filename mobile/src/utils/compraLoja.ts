// Estados do card e confirmação de compra da Loja (#346, protótipo v4,
// 12-loja.md §4.3 e §4.4). Funções puras.
// O aluno pode comprar várias unidades do mesmo item num pedido. A dotação
// grátis entra primeiro; as pagas seguem o aumento por compra da turma
// (`preco_fator`, 1 = preço fixo). Quem decide é `loja_comprar`
// (20261020_06): aqui é só a estimativa que a tela mostra antes.

import { MAX_POR_PEDIDO, maxQuantidade } from "@/services/loja/storeModel";

type ItemLoja = {
  name: string;
  assetKey: string | null;
  price: number;
  state: "available" | "blocked" | "limit" | "unavailable";
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

function fator(item: Pick<ItemLoja, "metadata">): number {
  const f = Number(item.metadata?.precoFator ?? 1);
  return Number.isFinite(f) && f >= 1 ? f : 1;
}

/** Preço de cada unidade do pedido: grátis primeiro, depois o preço atual com o aumento por compra. */
export function precosDoPedido(item: Pick<ItemLoja, "price" | "metadata">, quantidade: number): number[] {
  const gratis = Math.min(gratisRestantes(item), quantidade);
  const precos: number[] = Array(gratis).fill(0);
  for (let k = 0; k < quantidade - gratis; k++) precos.push(Math.ceil(Math.max(0, item.price) * Math.pow(fator(item), k)));
  return precos;
}

export function limitarQuantidade(item: Pick<ItemLoja, "metadata">, quantidade: number): number {
  const teto = Math.max(1, maxQuantidade(item));
  return Math.min(Math.max(1, Math.floor(quantidade) || 1), teto, MAX_POR_PEDIDO);
}

export function estadoCompra(item: ItemLoja, saldo: number, quantidade = 1): EstadoCompra {
  const precos = precosDoPedido(item, quantidade);
  const custo = precos.reduce((a, b) => a + b, 0);
  const gratis = custo === 0 && gratisRestantes(item) > 0;
  const falta = Math.max(0, custo - saldo);
  if (item.state === "limit") return { gratis, custo, falta: 0, rotulo: "Limite atingido", habilitado: false };
  if (item.state === "unavailable") return { gratis, custo, falta: 0, rotulo: "Indisponível", habilitado: false };
  if (item.state === "blocked") return { gratis, custo, falta: 0, rotulo: "Bloqueado", habilitado: false };
  if (gratis) return { gratis, custo, falta, rotulo: quantidade > 1 ? `Pegar ${quantidade} grátis` : "Pegar grátis", habilitado: true };
  if (falta > 0) return { gratis, custo, falta, rotulo: falta === 1 ? "Falta 1 moeda" : `Faltam ${falta} moedas`, habilitado: false };
  return { gratis, custo, falta, rotulo: quantidade > 1 ? `Comprar ${quantidade}` : "Comprar", habilitado: true };
}

const ATE: Record<string, string> = {
  prazo_extra: "até você usar numa atividade com prazo.",
  segunda_chance: "até você refazer uma atividade.",
  troca_formato: "até o próximo material.",
};

export function textoConfirmacao(item: ItemLoja, saldo: number, quantidade = 1) {
  const { gratis, custo } = estadoCompra(item, saldo, quantidade);
  const nome = quantidade > 1 ? `${quantidade} × ${item.name}` : item.name;
  const destino = `${quantidade > 1 ? "Ficam" : "Fica"} na sua Bag ${ATE[item.assetKey ?? ""] ?? "até você usar numa questão."}`;
  const cadaUso = quantidade > 1 ? "\nCada uso gasta uma unidade." : "";
  return {
    titulo: gratis ? `Pegar ${nome}?` : `Comprar ${nome}?`,
    descricao: `${destino}${cadaUso}\n${gratis ? "Não gasta moedas." : `Saldo: ${saldo} → ${saldo - custo}`}`,
    confirmar: gratis ? "Pegar" : "Comprar",
  };
}

export const avisoCompraFeita = (item: Pick<ItemLoja, "name">, quantidade = 1) =>
  quantidade > 1 ? `${quantidade} × ${item.name} foram para a sua Bag.` : `${item.name} foi para a sua Bag.`;

export function textoNaBag(quantidade: number): string | null {
  if (quantidade <= 0) return null;
  return quantidade === 1 ? "1 na sua Bag" : `${quantidade} na sua Bag`;
}

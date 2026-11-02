// Validacao do pedido de URL de upload para o R2.
//
// As credenciais do R2 ficam SO nos secrets das Edge Functions. Os servicos
// que geram arquivo (BrainHexPDF, API, microservice) pedem aqui uma URL
// assinada de PUT e sobem o arquivo direto no R2. O Supabase so' ve o pedido
// (~200 bytes), nunca o arquivo: o painel conta como egress tudo que sai de uma
// Edge Function, entao repassar o byte por aqui cobraria a mesma conta que a
// migracao existe para eliminar. E' o espelho do `storage-redirect`, que faz o
// mesmo para a leitura.
//
// Puro (sem Deno) para o vitest testar direto.

import { normalizarStoragePath } from "../storage-redirect/caminho.ts";

/**
 * Prefixos que o gateway de leitura serve e que os servicos gravam:
 * `brainhex/<perfil>/classe-N/...` (material gerado) e `fontes/classe-N/...`
 * (fonte da personalizacao). Fora disso a funcao nao assina - nao e' um PUT
 * livre no bucket inteiro (telemetria, por exemplo, tem ciclo de vida proprio
 * em `infra/r2/ciclo-de-vida.json`).
 */
export const PREFIXOS_PERMITIDOS = ["brainhex/", "fontes/"] as const;

/** Comparacao em tempo constante, para nao vazar a chave por tempo de resposta. */
export function mesmaChave(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diferenca = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diferenca |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diferenca === 0;
}

/**
 * So' a chave de servico pede URL de upload. Compara o Bearer com a
 * `SUPABASE_SERVICE_ROLE_KEY` do ambiente da funcao; chave vazia no ambiente
 * nunca autoriza.
 */
export function chamadorAutorizado(authorization: string | null, chaveDeServico: string | undefined): boolean {
  if (!chaveDeServico) return false;
  const prefixo = "Bearer ";
  if (!authorization || !authorization.startsWith(prefixo)) return false;
  return mesmaChave(authorization.slice(prefixo.length).trim(), chaveDeServico);
}

export type Pedido = { caminho: string };

/** `{ path }` valido e dentro dos prefixos permitidos, ou o motivo da recusa. */
export function lerPedido(corpo: unknown): Pedido | { erro: string } {
  const bruto = corpo && typeof corpo === "object" ? (corpo as { path?: unknown }).path : undefined;
  const caminho = normalizarStoragePath(typeof bruto === "string" ? bruto : null);
  if (!caminho) return { erro: "Parametro 'path' ausente ou invalido." };
  if (!PREFIXOS_PERMITIDOS.some((p) => caminho.startsWith(p))) {
    return { erro: `Caminho fora dos prefixos permitidos (${PREFIXOS_PERMITIDOS.join(", ")}).` };
  }
  return { caminho };
}

/** URL de leitura pelo gateway, igual a `urlDoGateway` do microservice. */
export function urlDeLeitura(supabaseUrl: string, caminho: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/storage-redirect?path=${caminho}`;
}

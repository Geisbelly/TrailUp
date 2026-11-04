// Validacao do pedido de URL assinada (upload ou remocao) para o R2.
//
// As credenciais do R2 ficam SO nos secrets das Edge Functions. Os servicos
// que geram arquivo (BrainHexPDF, API, microservice) pedem aqui uma URL
// assinada de PUT e sobem o arquivo direto no R2; a retencao da API pede a de
// DELETE para apagar o que expirou. O Supabase so' ve o pedido
// (~200 bytes), nunca o arquivo: o painel conta como egress tudo que sai de uma
// Edge Function, entao repassar o byte por aqui cobraria a mesma conta que a
// migracao existe para eliminar. E' o espelho do `storage-redirect`, que faz o
// mesmo para a leitura.
//
// Puro (sem Deno) para o vitest testar direto.

import { normalizarStoragePath } from "../storage-redirect/caminho.ts";
import { bucketDoCaminho } from "../storage-redirect/destino.ts";

/**
 * Prefixos que o gateway de leitura serve e que os servicos gravam:
 * `brainhex/<perfil>/classe-N/...` (material gerado) e `fontes/classe-N/...`
 * (fonte da personalizacao). Fora disso a funcao nao assina - nao e' um PUT
 * livre no bucket inteiro (telemetria, por exemplo, tem ciclo de vida proprio
 * em `infra/r2/ciclo-de-vida.json`).
 */
export const PREFIXOS_PERMITIDOS = ["brainhex/", "fontes/"] as const;

/**
 * Payload bruto de telemetria que a API tira do Postgres (#76). Fica fora de
 * `PREFIXOS_PERMITIDOS` porque o gateway nao o serve - ninguem le de volta - e
 * porque aquela lista e' espelhada em `PREFIXOS_DO_R2` da API, que decide o que
 * e' material. O ciclo de vida continua o de `infra/r2/ciclo-de-vida.json`.
 */
export const PREFIXOS_DE_TELEMETRIA = ["telemetria/"] as const;

/**
 * Arquivo da pesquisa (#17, `pesquisa-arquivar`). So' DELETE: quem grava ali e' a propria Edge
 * Function do arquivo, com as credenciais do ambiente, e nunca um servico por esta URL. O DELETE
 * existe para a exclusao a pedido do aluno - a conta apagada poe os objetos dele na fila da
 * retencao, e o worker da API pede aqui a URL para apaga-los.
 */
export const PREFIXOS_DA_PESQUISA = ["pesquisa/"] as const;

/** PUT para gravar; DELETE para a retencao apagar o que expirou. */
export const METODOS = ["PUT", "DELETE"] as const;
export type Metodo = (typeof METODOS)[number];

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

/** O token do `Authorization: Bearer <token>`, ou null. */
export function bearerDe(authorization: string | null): string | null {
  const prefixo = "Bearer ";
  if (!authorization || !authorization.startsWith(prefixo)) return null;
  const token = authorization.slice(prefixo.length).trim();
  return token || null;
}

/**
 * O token e' uma chave de servico DESTE projeto, mesmo sem ser byte a byte a
 * `SUPABASE_SERVICE_ROLE_KEY` injetada na funcao.
 *
 * Medido em 03/11: a chave service_role da API (JWT legado) passava no Auth
 * admin e no REST com 200 e a funcao a recusava com 401. Duas chaves de servico
 * validas podem coexistir - a emitida antes de uma rotacao, a nova
 * `sb_secret_...` -, e a comparacao exata derrubava o upload de quem tinha a
 * outra. Quem decide e' o proprio projeto: o Auth admin so' responde 200 para
 * chave de servico; anon, publishable e JWT de aluno levam 401/403.
 */
export async function chaveDeServicoDoProjeto(
  token: string,
  supabaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const base = supabaseUrl.replace(/\/+$/, "");
  if (!base || !token) return false;
  try {
    const resposta = await fetchImpl(`${base}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: token, Authorization: `Bearer ${token}` },
    });
    await resposta.body?.cancel();
    return resposta.status === 200;
  } catch {
    return false;
  }
}

export type Pedido = { caminho: string; metodo: Metodo };

/**
 * `{ path, metodo? }` valido e dentro dos prefixos permitidos, ou o motivo da
 * recusa. Sem `metodo`, e' PUT - o pedido dos servicos que ja' existiam.
 */
export function lerPedido(corpo: unknown): Pedido | { erro: string } {
  const objeto = corpo && typeof corpo === "object" ? (corpo as { path?: unknown; metodo?: unknown }) : {};
  const caminho = normalizarStoragePath(typeof objeto.path === "string" ? objeto.path : null);
  if (!caminho) return { erro: "Parametro 'path' ausente ou invalido." };
  const metodo = objeto.metodo ?? "PUT";
  if (!METODOS.includes(metodo as Metodo)) {
    return { erro: `Metodo invalido (${METODOS.join(", ")}).` };
  }
  const prefixos = [...PREFIXOS_PERMITIDOS, ...PREFIXOS_DE_TELEMETRIA];
  // DELETE tambem alcanca `<uuid do professor>/...`: a fonte do professor
  // (bucket `conteudos`) que `scripts/copiar-storage-para-r2.ts` copiou para o
  // R2 com essa chave. A exclusao da conta do professor (20261024_07) poe esses
  // caminhos na fila da retencao; sem isto eles nunca sairiam do R2. PUT ali
  // continua recusado: ninguem grava fonte nova nessa pasta pelo R2.
  const fonteDoProfessor = metodo === "DELETE" && bucketDoCaminho(caminho, "") === "conteudos";
  const arquivoDaPesquisa = metodo === "DELETE" && PREFIXOS_DA_PESQUISA.some((p) => caminho.startsWith(p));
  if (!fonteDoProfessor && !arquivoDaPesquisa && !prefixos.some((p) => caminho.startsWith(p))) {
    return { erro: `Caminho fora dos prefixos permitidos (${prefixos.join(", ")}).` };
  }
  return { caminho, metodo: metodo as Metodo };
}

/**
 * URL de leitura pelo gateway, igual a `urlDoGateway` do microservice. `null`
 * para o que o gateway nao serve (telemetria).
 */
export function urlDeLeitura(supabaseUrl: string, caminho: string): string | null {
  if (!PREFIXOS_PERMITIDOS.some((p) => caminho.startsWith(p))) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/storage-redirect?path=${caminho}`;
}

// Escrita e leitura de material no Cloudflare R2 SEM credencial do R2 aqui (#76).
//
// Por que o R2: o egress do Supabase estourou a cota, e 99,9% dele era
// Storage. O R2 nao cobra egress. Ver
// docs/superpowers/specs/2026-08-29-r2-gateway-design.md.
//
// As credenciais do R2 ficam SO nos secrets das Edge Functions do Supabase
// (decisao de 02/11). Este servico pede a `storage-upload-url` uma URL de PUT,
// com a chave de servico que ja' usa para gravar no banco, e sobe o arquivo
// DIRETO no R2: o Supabase so' ve o pedido, nunca o arquivo, entao nao paga
// egress. Para ler (a retomada reaproveita o markdown de partes ja' geradas), o
// caminho e' o mesmo do app: o gateway `storage-redirect`, que responde 302
// para uma URL assinada do R2, ou do Storage para o que e' anterior a migracao.
// O gateway so' aceita link assinado (#632): a chave de servico vai no POST que
// pede o link, e o GET sai sem ela.
//
// E' a mesma coisa que `brainhexpdf/src/services/r2Upload.ts` faz para o deck
// e `api/app/services/storage.py` para o caminho Python. Ate' 03/11 este
// servico assinava sozinho com `R2_*` proprias, a unica copia das credenciais
// fora do Supabase.

export const FUNCAO_DE_UPLOAD = "storage-upload-url";

/**
 * A plataforma respondeu 404: a funcao ainda nao foi publicada (ela nunca
 * responde 404). Quem chama segue o caminho antigo, para que publicar este
 * servico antes da funcao nao derrube a geracao.
 */
export class FuncaoDeUploadNaoPublicada extends Error {}

function baseDoSupabase(): string {
  return (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
}

function chaveDeServico(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
}

/** Ha' `SUPABASE_URL` e chave de servico para falar com as Edge Functions. */
export function gatewayConfigurado(): boolean {
  return Boolean(baseDoSupabase() && chaveDeServico());
}

/**
 * URL do gateway para um caminho. E' o que vai gravado em `arquivo_url`.
 *
 * Devolve `null` sem `SUPABASE_URL` - sem ela nao da' para montar a URL, e
 * gravar uma URL relativa quebraria o app silenciosamente.
 */
export function urlDoGateway(storagePath: string): string | null {
  const base = baseDoSupabase();
  if (!base) return null;
  return `${base}/functions/v1/storage-redirect?path=${storagePath}`;
}

async function detalhe(resposta: Response): Promise<string> {
  return (await resposta.text().catch(() => "")).slice(0, 200);
}

/**
 * Pede a URL assinada ao Supabase e sobe o arquivo nela. Lanca em qualquer
 * falha: a escrita no R2 nao cai em silencio para o Supabase, senao a
 * migracao pareceria pronta com o egress saindo do mesmo lugar.
 */
export async function uploadPeloSupabase(
  storagePath: string,
  data: Buffer,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const base = baseDoSupabase();
  const chave = chaveDeServico();
  if (!base || !chave) {
    throw new Error("[r2] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios para pedir a URL de upload");
  }

  const pedido = await fetchImpl(`${base}/functions/v1/${FUNCAO_DE_UPLOAD}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ path: storagePath }),
  });
  if (pedido.status === 404) {
    throw new FuncaoDeUploadNaoPublicada(`[r2] Edge Function ${FUNCAO_DE_UPLOAD} nao publicada`);
  }
  if (!pedido.ok) {
    throw new Error(`[r2] URL de upload recusada (${storagePath}): ${pedido.status} ${await detalhe(pedido)}`);
  }
  const { url } = (await pedido.json().catch(() => ({}))) as { url?: string };
  if (!url) throw new Error(`[r2] resposta sem url (${storagePath})`);

  const envio = await fetchImpl(url, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: { "Content-Type": contentType },
  });
  if (!envio.ok) {
    throw new Error(`[r2] upload falhou (${storagePath}): ${envio.status} ${await detalhe(envio)}`);
  }
}

/**
 * Caminho de uma URL do gateway DESTE projeto. Qualquer outra URL da' `null`: e'
 * o que impede a chave de servico de pedir link para endereco de fora.
 */
export function caminhoDoGateway(url: string): string | null {
  const base = baseDoSupabase();
  if (!base || !url.startsWith(`${base}/functions/v1/storage-redirect?`)) return null;
  return new URL(url).searchParams.get("path");
}

/**
 * Link assinado para o servico ler um caminho, ou `null` se o gateway nao o
 * conhece. Vence em ate' duas horas: nao se guarda, e nao vai para `arquivo_url`.
 * Lanca se o pedido for recusado.
 */
export async function linkDeLeitura(
  storagePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const base = baseDoSupabase();
  const chave = chaveDeServico();
  if (!base || !chave) return null;
  const pedido = await fetchImpl(`${base}/functions/v1/storage-redirect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [storagePath] }),
  });
  if (!pedido.ok) {
    throw new Error(`[r2] link de leitura recusado (${storagePath}): ${pedido.status} ${await detalhe(pedido)}`);
  }
  const { links } = (await pedido.json().catch(() => ({}))) as { links?: Record<string, string> };
  // Um caminho pedido, um link: a chave da resposta e' o caminho ja' normalizado
  // pelo gateway, que pode nao ser igual ao pedido.
  return Object.values(links ?? {})[0] ?? null;
}

/**
 * URL que o servico consegue baixar: a do gateway deste projeto vira link
 * assinado (`null` se ele nao conhece o caminho) e qualquer outra passa como
 * veio, porque fonte tambem pode ser link externo.
 */
export async function urlParaBaixar(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const caminho = caminhoDoGateway(url);
  return caminho ? linkDeLeitura(caminho, fetchImpl) : url;
}

/**
 * Le um arquivo de texto pelo gateway. 404 vira `null`: o caminho ainda nao
 * esta' em `vw_material_storage_paths`, e quem chama decide o que fazer (a
 * retomada tenta o Storage e, sem nada, regera). Outro erro lanca.
 */
export async function baixarTextoPeloGateway(
  storagePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = await linkDeLeitura(storagePath, fetchImpl);
  if (!url) return null;
  const resposta = await fetchImpl(url, { method: "GET", redirect: "follow" });
  if (resposta.status === 404) return null;
  if (!resposta.ok) {
    throw new Error(`[r2] leitura pelo gateway falhou (${storagePath}): ${resposta.status} ${await detalhe(resposta)}`);
  }
  return await resposta.text();
}

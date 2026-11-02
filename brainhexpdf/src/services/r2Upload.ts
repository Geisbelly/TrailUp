// Upload do deck para o Cloudflare R2, pela URL que o Supabase assina (#76).
//
// Por que o R2: o egress do Supabase estourou a cota, e 99,9% dele era
// Storage. O R2 nao cobra egress. Ver
// docs/superpowers/specs/2026-08-29-r2-gateway-design.md.
//
// As credenciais do R2 ficam SO nos secrets das Edge Functions do Supabase.
// Este servico pede a `storage-upload-url` uma URL de PUT, com a chave de
// servico que ja' usa para gravar no banco, e sobe o deck DIRETO no R2. O
// Supabase so' ve o pedido, nunca o arquivo, entao nao paga egress
// (frontend/supabase/functions/storage-upload-url/).
//
// O deck e' lido pelo gateway (`/functions/v1/storage-redirect?path=...`), que
// devolve o Content-Type real. O proxy /api/v1/decks so' existe porque o
// Storage do Supabase serve .html como text/plain.

export const FUNCAO_DE_UPLOAD = 'storage-upload-url';

/**
 * A plataforma respondeu 404: a funcao ainda nao foi publicada (ela nunca
 * responde 404). Quem chama segue o caminho antigo, para que publicar este
 * servico antes da funcao nao derrube a geracao.
 */
export class FuncaoDeUploadNaoPublicada extends Error {}

function baseDoSupabase(): string {
  return (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
}

/** URL do gateway para um caminho; `null` sem `SUPABASE_URL`. */
export function urlDoGateway(storagePath: string): string | null {
  const base = baseDoSupabase();
  if (!base) return null;
  return `${base}/functions/v1/storage-redirect?path=${storagePath}`;
}

async function detalhe(resposta: Response): Promise<string> {
  return (await resposta.text().catch(() => '')).slice(0, 200);
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
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!base || !chave) {
    throw new Error('[r2] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios para pedir a URL de upload');
  }

  const pedido = await fetchImpl(`${base}/functions/v1/${FUNCAO_DE_UPLOAD}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, 'Content-Type': 'application/json' },
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
    method: 'PUT',
    body: new Uint8Array(data),
    headers: { 'Content-Type': contentType },
  });
  if (!envio.ok) {
    throw new Error(`[r2] upload falhou (${storagePath}): ${envio.status} ${await detalhe(envio)}`);
  }
}

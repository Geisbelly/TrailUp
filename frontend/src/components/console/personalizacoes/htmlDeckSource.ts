// O deck HTML e' lido pelo GATEWAY (supabase/functions/storage-redirect), em
// modo proxy, e injetado via <iframe srcDoc> — nunca por <iframe src>.
//
// Dois motivos, cada um sozinho ja' suficiente:
//
//   1. Content-Type. A URL publica do Supabase serve .html como text/plain
//      (protecao anti-XSS da plataforma, nao configuravel por bucket/objeto):
//      um <iframe src> mostraria o codigo-fonte como texto. srcDoc ignora o
//      Content-Type da origem e sempre interpreta como HTML.
//   2. Onde o arquivo vive. Desde a migracao para o R2 (spec
//      2026-08-29-r2-gateway-design), ESCRITA NOVA VAI SO' PARA O R2 — o
//      Supabase Storage so' guarda o que ja' estava la'. Este modulo baixava
//      direto do Storage (supabase.storage.from(bucket).download(path)), o que
//      passou a dar "objeto nao encontrado" em toda apresentacao gerada depois
//      da migracao, por mais que o arquivo existisse (no R2) e abrisse normal
//      em nova aba. O gateway resolve os dois casos: prefere o R2 e cai no
//      Supabase para o material antigo.
//
// O `proxy=1` existe porque o gateway responde 302 para uma URL assinada do R2,
// e o R2 nao tem CORS configurado: a navegacao direta funciona, mas o fetch()
// daqui seria bloqueado no salto do redirect. Em modo proxy o proprio gateway
// devolve o corpo, com os headers de CORS dele.

const PROXY_PARAM = "proxy";

/** Marca a URL do gateway para ele devolver o corpo em vez de redirecionar.
 *  URL que nao e' do gateway ignora o parametro — entao e' seguro aplicar sem
 *  inspecionar a forma da URL (material antigo aponta direto para o Storage). */
export function comProxyDoGateway(url: string): string {
  const normalizada = url.trim();
  if (!normalizada || /^(?:blob|data):/i.test(normalizada)) return normalizada;
  if (new RegExp(`[?&]${PROXY_PARAM}=1(?:&|#|$)`).test(normalizada)) return normalizada;

  const indiceHash = normalizada.indexOf("#");
  const base = indiceHash >= 0 ? normalizada.slice(0, indiceHash) : normalizada;
  const fragmento = indiceHash >= 0 ? normalizada.slice(indiceHash) : "";
  const separador = base.includes("?")
    ? (base.endsWith("?") || base.endsWith("&") ? "" : "&")
    : "?";
  return `${base}${separador}${PROXY_PARAM}=1${fragmento}`;
}

export async function fetchHtmlDeckSource(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ html: string } | { error: string }> {
  let resposta: Response;
  try {
    resposta = await fetchImpl(comProxyDoGateway(url));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha de rede ao baixar a apresentação." };
  }
  if (!resposta.ok) return { error: `HTTP ${resposta.status}` };

  const html = await resposta.text();
  if (!html.trim()) return { error: "Download vazio." };
  return { html };
}

// Usado pelo botao "Abrir em nova aba" do deck HTML: uma blob URL com mime
// type explicito text/html renderiza corretamente numa aba nova, evitando
// o mesmo problema de Content-Type que a URL publica do Supabase tem.
export function createHtmlBlobUrl(html: string): string {
  const blob = new Blob([html], { type: "text/html" });
  return URL.createObjectURL(blob);
}

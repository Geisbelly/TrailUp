// Supabase serve objetos .html do bucket publico sempre com Content-Type:
// text/plain (protecao anti-XSS da propria plataforma, nao configuravel por
// bucket/objeto) - um <iframe src={urlPublica}> nunca renderiza a
// apresentacao, so mostra o codigo-fonte como texto puro (confirmado
// navegando direto pra URL publica). Por isso o deck HTML e baixado como
// Blob e injetado via <iframe srcDoc>, que ignora o Content-Type original
// da resposta e sempre interpreta o conteudo como HTML.

export interface SupabaseStorageDownloader {
  from(bucket: string): {
    download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  };
}

export async function fetchHtmlDeckSource(
  storage: SupabaseStorageDownloader,
  bucket: string,
  storagePath: string,
): Promise<{ html: string } | { error: string }> {
  const { data, error } = await storage.from(bucket).download(storagePath);
  if (error) return { error: error.message };
  if (!data) return { error: "Download vazio." };
  return { html: await data.text() };
}

// Usado pelo botao "Abrir em nova aba" do deck HTML: uma blob URL com mime
// type explicito text/html renderiza corretamente numa aba nova, evitando
// o mesmo problema de Content-Type que a URL publica do Supabase tem.
export function createHtmlBlobUrl(html: string): string {
  const blob = new Blob([html], { type: "text/html" });
  return URL.createObjectURL(blob);
}

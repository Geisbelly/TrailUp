/**
 * Referencias a arquivos do bucket `conteudos` (material do professor).
 *
 * O bucket e' privado desde a migration 20261024_10: a URL publica antiga
 * (`/storage/v1/object/public/conteudos/...`) da' 400. O console grava o
 * CAMINHO do objeto (`<uuid do professor>/<topico>/<arquivo>`) e assina na hora
 * de exibir, sob o RLS do bucket. Valor gravado antes disso (URL publica ou
 * assinada) continua sendo lido: o caminho dentro dela vale.
 *
 * Nem todo texto sem `http` e' caminho. A trilha gerada pela IA gravava a
 * midia sugerida (PDF, audio, apresentacao) como conteudo do tipo `arquivo`
 * com o ROTEIRO no lugar do arquivo ("Discutir arquiteturas primario-secundario
 * e ..."), e o console assinava a frase como objeto do bucket: 400 do Storage.
 */

const URL_DO_BUCKET = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/conteudos\/([^?#]+)/;

/**
 * O texto tem cara de caminho de objeto, e nao de frase. Pasta nunca tem
 * espaco. Nome com extensao passa mesmo com espaco (upload antigo, sem
 * saneamento), desde que dentro de pasta; sem extensao, so com pasta e sem
 * espaco (`<uuid>/<topico>/<ts>_<nome>`). Quebra de linha, JSON, HTML e frase
 * terminada em pontuacao nunca sao caminho.
 */
export function pareceCaminhoDeArquivo(valor: string | null | undefined): boolean {
  const texto = String(valor ?? "").trim();
  if (!texto || /[\r\n]/.test(texto) || /^[{<[]/.test(texto)) return false;
  if (/^https?:\/\//i.test(texto)) return false;
  const partes = texto.split("/");
  const ultimo = partes.pop() ?? "";
  // Pasta nunca tem espaco (uuid do professor, id do topico, `classes/...`).
  if (partes.some((pasta) => /\s/.test(pasta))) return false;
  if (/\.[a-z0-9]{1,8}$/i.test(ultimo)) return partes.length > 0 || !/\s/.test(ultimo);
  return partes.length > 0 && !/\s/.test(ultimo) && !/[.!?:;,]$/.test(ultimo);
}

/** Caminho do objeto no bucket `conteudos`, ou `null` se o valor e' link externo ou texto. */
export function caminhoNoBucketConteudos(valor: string | null | undefined): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (!/^https?:\/\//i.test(texto)) {
    if (!pareceCaminhoDeArquivo(texto)) return null;
    const caminho = texto.replace(/^\/+/, "").replace(/^conteudos\//, "");
    return caminho || null;
  }
  const achado = URL_DO_BUCKET.exec(texto);
  if (!achado) return null;
  try {
    return decodeURIComponent(achado[1]) || null;
  } catch {
    return achado[1] || null;
  }
}

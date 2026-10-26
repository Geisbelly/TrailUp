/**
 * Referencias a arquivos do bucket `conteudos` (material do professor).
 *
 * O bucket e' privado desde a migration 20261024_10: a URL publica antiga
 * (`/storage/v1/object/public/conteudos/...`) da' 400. O console grava o
 * CAMINHO do objeto (`<uuid do professor>/<topico>/<arquivo>`) e assina na hora
 * de exibir, sob o RLS do bucket. Valor gravado antes disso (URL publica ou
 * assinada) continua sendo lido: o caminho dentro dela vale.
 */

const URL_DO_BUCKET = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/conteudos\/([^?#]+)/;

/** Caminho do objeto no bucket `conteudos`, ou `null` se o valor e' link externo. */
export function caminhoNoBucketConteudos(valor: string | null | undefined): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (!/^https?:\/\//i.test(texto)) {
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

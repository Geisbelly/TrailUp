// A URL do material as vezes chega apontando pro host ERRADO.
//
// Caso real (2026-08-25, log do app): a API monta a URL publica do storage
// como `{base}/storage/v1/object/public/...` a partir de SUPABASE_URL. Com essa
// variavel apontando pro servico interno do deploy, o material saiu gravado
// como http://trailup-microservice-gmgqkw:3000/storage/v1/object/public/... -
// endereco que existe entre containers e nao existe pro celular. No app isso
// aparece como net::ERR_NAME_NOT_RESOLVED, e nenhuma correcao de renderizacao
// resolve: o arquivo nunca chega.
//
// O app, porem, SABE a origem certa (EXPO_PUBLIC_SUPABASE_URL - e a mesma que
// ele usa pra falar com o banco). Entao a URL que veio nao precisa ser
// obedecida: o caminho dentro do bucket e o que importa, e a origem pode ser
// recolocada localmente.
//
// Modulo puro (sem import do cliente Supabase) pra poder ser testado no node.

/** Host que serve storage do Supabase de verdade. */
function mesmaOrigem(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();
}

/**
 * A origem da URL do material bate com a que o app usa? Quando nao bate, a URL
 * nao serve - foi montada com a base errada no servidor.
 */
export function origemDeStorageConfiavel(
  urlOrigin: string | null | undefined,
  appOrigin: string | null | undefined,
): boolean {
  // Sem origem conhecida do app, nao ha base pra desconfiar: mantem o que veio
  // em vez de quebrar o que hoje funciona.
  if (!appOrigin) return true;
  return mesmaOrigem(urlOrigin, appOrigin);
}

/**
 * Recoloca o caminho do bucket na origem do app, em modo publico.
 * Devolve null quando falta informacao pra remontar (ai quem chama mantem a
 * URL original em vez de inventar).
 */
export function reancorarNaOrigemDoApp(params: {
  appOrigin: string | null | undefined;
  bucket: string | null | undefined;
  objectPath: string | null | undefined;
}): string | null {
  const { appOrigin, bucket, objectPath } = params;
  if (!appOrigin || !bucket || !objectPath) return null;

  const caminho = String(objectPath)
    .split("/")
    .filter(Boolean)
    .map((segmento) => encodeURIComponent(segmento))
    .join("/");
  if (!caminho) return null;

  return `${String(appOrigin).replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${caminho}`;
}

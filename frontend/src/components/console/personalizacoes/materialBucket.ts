// Resolve o bucket de Storage de um material.
//
// Por que isto existe em vez de simplesmente ler `material.bucket`: esse campo
// e' gravado de forma INCONSISTENTE. Medido em producao, das quatro
// apresentacoes mais recentes, duas tinham `bucket`/`mime_type` e duas nao:
//
//   3677, 3676 -> arquivo_url, bucket, metadata, mime_type, partes, ...
//   3680, 3675 -> arquivo_url, metadata, partes, payload, storage_path
//
// A consequencia nao e' cosmetica. O console decide entre `HtmlDeckEmbed`
// (baixa o HTML e injeta via iframe.srcDoc) e um `<iframe src>` cru olhando
// justamente `bucket && storagePath`. Sem o bucket ele cai no `<iframe src>`,
// que NUNCA renderiza: o Supabase serve .html de bucket publico como
// text/plain (protecao anti-XSS da plataforma, ver htmlDeckSource.ts). O
// professor via o codigo-fonte da apresentacao como texto -- e com mojibake
// de quebra, porque text/plain sem charset faz o navegador decodificar UTF-8
// como Latin-1.
//
// A URL publica do Supabase sempre carrega o bucket no caminho:
//
//   https://<projeto>.supabase.co/storage/v1/object/public/<bucket>/<path>
//
// Entao da' para derivar quando o campo faltar. Isso conserta tambem as linhas
// JA gravadas sem bucket, coisa que corrigir so a origem (persistApresentacao
// Result no BrainHexPDF) nao faria.

const CAMINHO_PUBLICO = /\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\//;

function textoUtil(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Extrai o bucket de uma URL de Storage do Supabase, ou null se nao for uma. */
export function bucketDaUrlSupabase(url: unknown): string | null {
  const texto = textoUtil(url);
  if (!texto) return null;
  const casou = CAMINHO_PUBLICO.exec(texto);
  if (!casou) return null;
  return decodeURIComponent(casou[1]);
}

/**
 * Bucket do material, preferindo o campo explicito e caindo para a URL.
 *
 * A ordem importa: `material.bucket` e' a fonte declarada, e so quando ela
 * falta vale inferir. As URLs das partes entram por ultimo porque uma parte
 * pode ter falhado (arquivo_url null) enquanto outra tem caminho valido.
 */
export function resolverBucketDoMaterial(
  material: Record<string, unknown> | null | undefined,
): string | null {
  if (!material) return null;

  const declarado = textoUtil(material.bucket);
  if (declarado) return declarado;

  const daUrlDoMaterial = bucketDaUrlSupabase(material.arquivo_url);
  if (daUrlDoMaterial) return daUrlDoMaterial;

  const partes = Array.isArray(material.partes) ? material.partes : [];
  for (const parte of partes) {
    if (!parte || typeof parte !== "object") continue;
    const daParte = bucketDaUrlSupabase((parte as Record<string, unknown>).arquivo_url);
    if (daParte) return daParte;
  }

  return null;
}

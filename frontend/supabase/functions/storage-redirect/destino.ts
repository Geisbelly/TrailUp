// Para onde o gateway manda o cliente.
//
// O material vive em DOIS lugares durante (e depois) da migracao: o Supabase
// Storage, que ja' tinha tudo, e o R2, que recebe as copias. O gateway prefere
// o R2 - que nao cobra egress - e cai no Supabase quando o objeto ainda nao foi
// copiado.
//
// A consequencia disso e' o que torna a migracao segura: o gateway responde
// certo para um arquivo copiado e para um nao copiado, entao **a troca das URLs
// nao precisa esperar a copia terminar**. Sem o fallback, trocar antes de
// copiar deixaria material quebrado no intervalo, e a ordem entre os dois
// passos viraria um ponto de falha.
//
// Nada e' apagado do Supabase: manter as duas copias custa armazenamento
// (o bucket segue em ~712 MB de 1 GB) e nao custa egress, porque depois da
// copia completa nenhuma requisicao cai mais no fallback.

/** Percent-encode por segmento, preservando as barras - igual ao Storage. */
export function codificarCaminho(caminho: string): string {
  return caminho
    .split('/')
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent)
    .join('/');
}

/**
 * URL publica do objeto no Supabase Storage. E' o destino de fallback, e
 * funciona sem assinatura porque os buckets sao publicos.
 */
export function urlPublicaDoSupabase(
  supabaseUrl: string,
  bucket: string,
  caminho: string,
): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${bucket}/${codificarCaminho(caminho)}`;
}

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
// Isto e' um fallback de LEITURA, nao gravacao em dois lugares. Escrita nova vai
// so' para o R2; o que ja' esta' no Supabase fica onde esta'. Gravar nos dois
// dobraria escrita e armazenamento sem resolver nada - o que protege a leitura
// e' este fallback, nao uma segunda copia.
//
// Consequencia: nao ha migracao em massa obrigatoria. O material antigo segue
// servindo do Supabase enquanto o novo nasce no R2, e o egress decai sozinho.

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

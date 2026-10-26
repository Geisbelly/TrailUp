// Para onde o gateway manda o cliente.
//
// O material vive em DOIS lugares durante (e depois) da migracao: o Supabase
// Storage, que ja' tinha tudo, e o R2, que recebe as copias. O gateway prefere
// o R2 - que nao cobra egress - e cai no Supabase quando o objeto ainda nao foi
// copiado. Desde a #195 o fallback e' uma URL ASSINADA do Storage (o bucket
// `conteudo_aluno` passa a ser privado), nunca a publica.
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
 * URL publica do objeto no Supabase Storage. NAO e' mais o destino do
 * fallback: `conteudo_aluno` fecha (#195, 20261024_09) e a URL publica de um
 * bucket privado da' 400. Fica para quem precisa reconhecer/montar a forma
 * antiga (testes, diagnostico).
 */
export function urlPublicaDoSupabase(
  supabaseUrl: string,
  bucket: string,
  caminho: string,
): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${bucket}/${codificarCaminho(caminho)}`;
}

const PREFIXO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

/**
 * Em qual bucket do Supabase o caminho mora. A view do gateway tambem lista
 * fontes do professor, que vivem em `conteudos` sob `<uuid do professor>/...`;
 * o resto (material `brainhex/...`, fontes do aluno `fontes/...`) e' do bucket
 * padrao (`SUPABASE_BUCKET`, hoje `conteudo_aluno`).
 */
export function bucketDoCaminho(caminho: string, bucketPadrao: string): string {
  return PREFIXO_UUID.test(caminho) ? 'conteudos' : bucketPadrao;
}

/**
 * Validade da URL assinada do fallback: cobre o resto da janela em que o 302
 * fica em cache (`max-age`), com folga, e nunca passa de uma janela inteira.
 */
export function validadeDaAssinatura(segundosRestantes: number, janelaSegundos: number): number {
  const folga = 60;
  return Math.min(janelaSegundos + folga, Math.max(1, Math.ceil(segundosRestantes)) + folga);
}

/** Cliente minimo do Storage para assinar (o supabase-js com service role). */
export type AssinadorDoStorage = (
  bucket: string,
  caminho: string,
  segundos: number,
) => Promise<{ signedUrl: string | null; erro: string | null }>;

/**
 * Destino de fallback quando o objeto nao esta' no R2: URL ASSINADA do
 * Storage, de curta duracao, que funciona com o bucket publico ou privado.
 * `null` quando o Storage nao assina (objeto ausente ou erro): o chamador
 * responde 404/502 em vez de mandar o cliente para uma URL morta.
 */
export async function urlAssinadaDoSupabase(
  supabaseUrl: string,
  assinar: AssinadorDoStorage,
  bucket: string,
  caminho: string,
  segundos: number,
): Promise<string | null> {
  const { signedUrl, erro } = await assinar(bucket, caminho, segundos);
  if (erro || !signedUrl) return null;
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  // Versoes antigas do supabase-js devolvem o caminho relativo a /storage/v1.
  const base = supabaseUrl.replace(/\/+$/, '');
  const rel = signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`;
  return rel.startsWith('/storage/v1/') ? `${base}${rel}` : `${base}/storage/v1${rel}`;
}

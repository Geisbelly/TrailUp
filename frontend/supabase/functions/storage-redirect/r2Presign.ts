// Assinatura SigV4 de URL de leitura no Cloudflare R2 (S3-compativel).
//
// Por que assinar em vez de expor o bucket publicamente: ao sair do Supabase
// Storage o objeto deixa de ter RLS. A autorizacao que hoje e' feita pelas
// policies passa a ser feita pela Edge Function, e a URL assinada e' o que
// impede que o link vaze acesso permanente.
//
// Por que a expiracao e' ALINHADA numa janela em vez de "agora + 1h": uma
// assinatura nova a cada chamada produz uma URL nova a cada chamada, e o cache
// do cliente e' chaveado pela URL (ensureCachedNativeContent, no mobile). Sem
// alinhamento, todo acesso viraria download novo - exatamente o custo que a
// migracao para o R2 existe pra eliminar. Com a janela, todas as chamadas
// dentro do mesmo intervalo geram a URL IDENTICA, e o cache volta a acertar.
//
// Usa Web Crypto (crypto.subtle), presente tanto no Deno da Edge Function
// quanto no Node do vitest - por isso este modulo nao importa nada de Deno e
// pode ser testado direto.

const ALGORITMO = 'AWS4-HMAC-SHA256';
const REGIAO = 'auto'; // R2 usa sempre "auto"
const SERVICO = 's3';
const NL = String.fromCharCode(10);

export interface PresignParams {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Caminho do objeto dentro do bucket, sem barra inicial. */
  key: string;
  /** Momento da chamada em ms (injetavel para teste). */
  agoraMs: number;
  /** Tamanho da janela de alinhamento, em segundos. Padrao: 1 hora. */
  janelaSegundos?: number;
  /**
   * Validade contada a partir do INICIO da janela. Precisa ser maior que a
   * janela, senao a URL emitida no fim dela ja nasce vencida.
   */
  validadeSegundos?: number;
  /**
   * Verbo HTTP a assinar. GET serve a leitura (o gateway); PUT e HEAD servem a
   * copia do Storage para o R2 (scripts/copiar-storage-para-r2.ts). O metodo
   * entra na requisicao canonica, entao uma URL assinada para GET nao vale para
   * PUT - o que e' desejavel: a chave de leitura do gateway nao consegue
   * escrever.
   */
  metodo?: 'GET' | 'PUT' | 'HEAD';
}

/** Inicio da janela corrente, em segundos desde a epoca. */
export function inicioDaJanela(agoraMs: number, janelaSegundos: number): number {
  const agoraSeg = Math.floor(agoraMs / 1000);
  return agoraSeg - (agoraSeg % janelaSegundos);
}

function paraAmzDate(segundos: number): { amzDate: string; dataCurta: string } {
  const iso = new Date(segundos * 1000).toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dataCurta: iso.slice(0, 8) };
}

/** Codificacao de caminho do S3: cada segmento percent-encoded, "/" preservado. */
function codificarKey(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) =>
      '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

async function hmac(chave: ArrayBuffer | Uint8Array, mensagem: string): Promise<ArrayBuffer> {
  const material = chave instanceof Uint8Array ? chave : new Uint8Array(chave);
  const k = await crypto.subtle.importKey(
    'raw',
    material as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(mensagem));
}

function paraHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(texto: string): Promise<string> {
  return paraHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

/**
 * Cadeia de derivacao da chave de assinatura do SigV4. Exportada porque e' a
 * parte que erra em silencio: assinatura invalida so' aparece como 403 do R2,
 * em producao. O teste a confere contra o vetor publicado pela AWS.
 */
export async function derivarChaveDeAssinatura(
  secretAccessKey: string,
  dataCurta: string,
  regiao: string,
  servico: string,
): Promise<ArrayBuffer> {
  const kData = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dataCurta);
  const kRegion = await hmac(kData, regiao);
  const kService = await hmac(kRegion, servico);
  return hmac(kService, 'aws4_request');
}

/** Hex de um ArrayBuffer - util para conferir a chave derivada em teste. */
export function bufferParaHex(buf: ArrayBuffer): string {
  return paraHex(buf);
}

/**
 * Devolve a URL assinada. Determinística dentro da mesma janela: os mesmos
 * parametros com `agoraMs` diferentes, porem na mesma janela, produzem
 * exatamente a mesma string. `metodo` decide o verbo assinado (GET por padrao).
 */
export async function presignR2GetUrl(params: PresignParams): Promise<string> {
  const janelaSegundos = params.janelaSegundos ?? 3600;
  const validadeSegundos = params.validadeSegundos ?? janelaSegundos * 2;
  if (validadeSegundos <= janelaSegundos) {
    throw new Error('validadeSegundos precisa ser maior que janelaSegundos, senao a URL vence dentro da propria janela.');
  }

  const inicio = inicioDaJanela(params.agoraMs, janelaSegundos);
  const { amzDate, dataCurta } = paraAmzDate(inicio);

  const host = `${params.accountId}.r2.cloudflarestorage.com`;
  const caminho = `/${params.bucket}/${codificarKey(params.key)}`;
  const escopo = `${dataCurta}/${REGIAO}/${SERVICO}/aws4_request`;

  // Query canonica: ordenada por nome, valores percent-encoded.
  const query = new Map<string, string>([
    ['X-Amz-Algorithm', ALGORITMO],
    ['X-Amz-Credential', `${params.accessKeyId}/${escopo}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(validadeSegundos)],
    ['X-Amz-SignedHeaders', 'host'],
  ]);
  const queryCanonica = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const requisicaoCanonica = [
    params.metodo ?? 'GET',
    caminho,
    queryCanonica,
    `host:${host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join(NL);

  const stringToSign = [ALGORITMO, amzDate, escopo, await sha256Hex(requisicaoCanonica)].join(NL);

  const kSigning = await derivarChaveDeAssinatura(params.secretAccessKey, dataCurta, REGIAO, SERVICO);
  const assinatura = paraHex(await hmac(kSigning, stringToSign));

  return `https://${host}${caminho}?${queryCanonica}&X-Amz-Signature=${assinatura}`;
}

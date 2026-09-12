// Upload de material para o Cloudflare R2.
//
// Por que o R2: o egress do Supabase estourou a cota (6,4 GB de 5 GB) e 99,9%
// dele e' Storage. O R2 nao cobra egress. Ver
// docs/superpowers/specs/2026-08-29-r2-gateway-design.md.
//
// O que este modulo devolve NAO e' a URL do R2, e sim a do gateway
// (`/functions/v1/storage-redirect?path=...`). O gateway decide na hora se
// serve do R2 ou do Supabase, entao o material antigo continua funcionando sem
// migracao em massa e nenhum cliente precisa saber onde o arquivo esta'.
//
// ---------------------------------------------------------------------------
// A assinatura SigV4 abaixo e' uma COPIA de
// `frontend/supabase/functions/storage-redirect/r2Presign.ts`.
//
// Nao e' preguica: o Dockerfile do microservice faz `COPY . .` a partir de
// `microservice/`, entao importar de fora do pacote quebra o build. As duas
// copias precisam andar juntas; ambas tem teste contra o vetor de assinatura
// publicado pela AWS, que e' o que garante que nenhuma das duas se degrade em
// silencio - assinatura errada so' aparece como 403 do R2, em producao.
// ---------------------------------------------------------------------------

import { createHash, createHmac } from "node:crypto";

const ALGORITMO = "AWS4-HMAC-SHA256";
const REGIAO = "auto"; // R2 usa sempre "auto"
const SERVICO = "s3";
const NL = String.fromCharCode(10);

export interface ConfigR2 {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Le a configuracao do ambiente, ou `null` se estiver incompleta. */
export function lerConfigR2(): ConfigR2 | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * URL do gateway para um caminho. E' o que vai gravado em `arquivo_url`.
 *
 * Devolve `null` sem `SUPABASE_URL` - sem ela nao da' para montar a URL, e
 * gravar uma URL relativa quebraria o app silenciosamente.
 */
export function urlDoGateway(storagePath: string): string | null {
  const base = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/functions/v1/storage-redirect?path=${storagePath}`;
}

function hmac(chave: Buffer | string, mensagem: string): Buffer {
  return createHmac("sha256", chave).update(mensagem, "utf8").digest();
}

function sha256Hex(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Cadeia de derivacao da chave de assinatura. Exportada porque e' a parte que
 * erra em silencio; o teste a confere contra o vetor publicado pela AWS.
 */
export function derivarChaveDeAssinatura(
  secretAccessKey: string,
  dataCurta: string,
  regiao: string,
  servico: string,
): Buffer {
  const kData = hmac(`AWS4${secretAccessKey}`, dataCurta);
  const kRegion = hmac(kData, regiao);
  const kService = hmac(kRegion, servico);
  return hmac(kService, "aws4_request");
}

/** Codificacao de caminho do S3: cada segmento percent-encoded, "/" preservado. */
function codificarKey(key: string): string {
  return key
    .split("/")
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join("/");
}

export interface PresignParams extends ConfigR2 {
  key: string;
  metodo: "GET" | "PUT" | "HEAD";
  agoraMs?: number;
  validadeSegundos?: number;
}

/** URL assinada para o objeto. O metodo entra na requisicao canonica. */
export function presignR2(params: PresignParams): string {
  const agora = new Date(params.agoraMs ?? Date.now());
  const amzDate = agora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dataCurta = amzDate.slice(0, 8);
  const validade = params.validadeSegundos ?? 900;

  const host = `${params.accountId}.r2.cloudflarestorage.com`;
  const caminho = `/${params.bucket}/${codificarKey(params.key)}`;
  const escopo = `${dataCurta}/${REGIAO}/${SERVICO}/aws4_request`;

  const queryCanonica = [
    ["X-Amz-Algorithm", ALGORITMO],
    ["X-Amz-Credential", `${params.accessKeyId}/${escopo}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(validade)],
    ["X-Amz-SignedHeaders", "host"],
  ]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const requisicaoCanonica = [
    params.metodo,
    caminho,
    queryCanonica,
    `host:${host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join(NL);

  const stringToSign = [ALGORITMO, amzDate, escopo, sha256Hex(requisicaoCanonica)].join(NL);
  const kSigning = derivarChaveDeAssinatura(params.secretAccessKey, dataCurta, REGIAO, SERVICO);
  const assinatura = hmac(kSigning, stringToSign).toString("hex");

  return `https://${host}${caminho}?${queryCanonica}&X-Amz-Signature=${assinatura}`;
}

/**
 * Sobe o objeto para o R2. Lanca em falha - nunca cai em silencio para o
 * Supabase, senao a migracao pareceria funcionar enquanto o egress continuava
 * saindo do mesmo lugar.
 */
export async function uploadParaR2(
  cfg: ConfigR2,
  storagePath: string,
  data: Buffer,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = presignR2({ ...cfg, key: storagePath, metodo: "PUT" });
  const resposta = await fetchImpl(url, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: { "Content-Type": contentType },
  });

  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => "")).slice(0, 200);
    throw new Error(`[r2] upload falhou (${storagePath}): ${resposta.status} ${detalhe}`);
  }
}

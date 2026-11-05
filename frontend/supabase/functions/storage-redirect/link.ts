// Link curto por sessao do gateway (#632).
//
// Antes, o gateway assinava SEM login qualquer caminho vivo de vw_material_storage_paths: quem tinha
// um link (vazado por print, log ou historico) conseguia uma URL nova enquanto o material existisse.
// Exigir o JWT no cabecalho nao serve - <img src>, audio, iframe e FileSystem.downloadAsync carregam
// a URL pura, sem cabecalho.
//
// Saida: o cliente LOGADO pede ao gateway (POST, com Authorization) links para os caminhos que a RLS
// deixa ele ler. Cada link carrega `u` (quem pediu), `exp` (ate quando vale) e `sig`
// (HMAC-SHA256 do segredo do gateway sobre versao, caminho, u e exp). O GET confere a assinatura e o
// prazo sem precisar de cabecalho nenhum.
//
// O prazo e' arredondado para o fim da janela seguinte: dentro de uma janela todo pedido do mesmo
// aluno para o mesmo caminho gera o MESMO link, o que mantem o cache do navegador e do 302 util.
// O link vale entre uma e duas janelas.
//
// Puro (Web Crypto), sem Deno, para o vitest testar direto.

const VERSAO = "v1";
const TEXTO = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    TEXTO.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", chave, TEXTO.encode(mensagem))));
}

/** Comparacao em tempo constante: nao vaza, pelo tempo de resposta, quantos caracteres bateram. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * `u` dos links pedidos com a chave de servico. API e microservice leem fonte e material sem sessao
 * de usuario, e o `u` do link precisa ser um UUID. Nenhuma conta tem este id: no log, ele separa o
 * que foi leitura de servidor.
 */
export const USUARIO_DO_SERVICO = "00000000-0000-0000-0000-000000000000";

export type Chamador = { tipo: "sessao" | "servico"; usuario: string };

/**
 * Quem pede os links. A sessao vem primeiro de proposito: e' o caso comum, e perguntar antes pela
 * chave de servico custaria a aluno e professor uma ida a mais ao Auth em cada pedido.
 */
export async function identificarChamador(params: {
  usuarioDaSessao: () => Promise<string | null>;
  ehChaveDeServico: () => Promise<boolean>;
}): Promise<Chamador | null> {
  const usuario = await params.usuarioDaSessao();
  if (usuario) return { tipo: "sessao", usuario };
  return (await params.ehChaveDeServico()) ? { tipo: "servico", usuario: USUARIO_DO_SERVICO } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fim da janela SEGUINTE a `agoraS`, em segundos Unix. */
export function expiracaoDoLink(agoraS: number, janelaS: number): number {
  return (Math.floor(agoraS / janelaS) + 2) * janelaS;
}

function mensagem(caminho: string, usuario: string, expira: number): string {
  return `${VERSAO}\n${caminho}\n${usuario.toLowerCase()}\n${expira}`;
}

export async function assinarLink(params: {
  segredo: string;
  caminho: string;
  usuario: string;
  expira: number;
}): Promise<string> {
  return hmac(params.segredo, mensagem(params.caminho, params.usuario, params.expira));
}

/** Monta a URL do link: os parametros de sempre (`path`) mais `u`, `exp` e `sig`. */
export async function montarLink(params: {
  base: string;
  segredo: string;
  caminho: string;
  usuario: string;
  expira: number;
}): Promise<string> {
  const sig = await assinarLink(params);
  const busca = new URLSearchParams({
    path: params.caminho,
    u: params.usuario.toLowerCase(),
    exp: String(params.expira),
    sig,
  });
  return `${params.base.replace(/\/+$/, "")}/functions/v1/storage-redirect?${busca.toString()}`;
}

export type ResultadoDoLink = "sem_assinatura" | "valido" | "vencido" | "invalido";

/**
 * Confere os parametros do GET. `sem_assinatura` e' o link antigo (so' `path`): o chamador decide se
 * ainda aceita (fase de transicao) ou recusa. Parametro pela metade e' `invalido`, nunca
 * `sem_assinatura` - senao bastaria apagar o `sig` para cair no caminho antigo.
 */
export async function conferirLink(params: {
  segredo: string;
  caminho: string;
  busca: URLSearchParams;
  agoraS: number;
  janelaS: number;
}): Promise<ResultadoDoLink> {
  const { busca } = params;
  const usuario = busca.get("u");
  const exp = busca.get("exp");
  const sig = busca.get("sig");
  if (usuario === null && exp === null && sig === null) return "sem_assinatura";
  if (!usuario || !exp || !sig || !UUID.test(usuario) || !/^\d{1,12}$/.test(exp)) return "invalido";

  const expira = Number(exp);
  // Prazo maior que o que o gateway emite (duas janelas) e' link forjado ou relogio adulterado.
  if (expira > params.agoraS + 2 * params.janelaS) return "invalido";
  const esperado = await assinarLink({ segredo: params.segredo, caminho: params.caminho, usuario, expira });
  if (!iguais(esperado, sig)) return "invalido";
  return expira <= params.agoraS ? "vencido" : "valido";
}

/** Pedido de links: lista de caminhos, sem repeticao, no maximo `limite`. */
export function caminhosDoPedido(corpo: unknown, limite: number): string[] | null {
  if (!corpo || typeof corpo !== "object") return null;
  const lista = (corpo as { paths?: unknown }).paths;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > limite) return null;
  if (!lista.every((p) => typeof p === "string")) return null;
  return Array.from(new Set(lista as string[]));
}

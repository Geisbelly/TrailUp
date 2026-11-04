// Link curto por sessao para o gateway de arquivos (#632, fase do app).
// Copia de frontend/src/lib/linkDoGateway.ts: os pacotes nao compartilham codigo. Mudou la, muda aqui.
//
// O gateway `storage-redirect` passou a emitir links assinados para quem esta' logado
// (POST com Authorization; ver supabase/functions/storage-redirect/link.ts). Depois que o app
// tambem pedir e a versao minima for ligada, link SEM assinatura deixa de abrir. Este modulo e' o
// unico lugar do app que conhece isso: recebe a URL que veio do banco e devolve a mesma URL com
// `u`, `exp` e `sig`.
//
// - Junta os pedidos do mesmo instante num POST so' (ate' 200 caminhos).
// - Guarda o link ate' faltar `MARGEM_S` para vencer.
// - Falhou o pedido (rede, gateway antigo, caminho que a RLS nao libera): devolve a URL original.
//   Na transicao o gateway ainda aceita; depois, o erro aparece no proprio material.
// - Mantem os outros parametros da URL (`v=` da revisao, `proxy=1`): a assinatura e' so' do `path`.

const ROTA = "/functions/v1/storage-redirect";
const MARGEM_S = 5 * 60;
const MAX_POR_PEDIDO = 200;

export interface RespostaDeLinks {
  expira_em: number;
  links: Record<string, string>;
}

export type PedirLinks = (caminhos: string[]) => Promise<RespostaDeLinks>;

/** O `path` de uma URL do gateway ainda sem assinatura; `null` para qualquer outra URL. */
export function caminhoParaAssinar(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!parsed.pathname.replace(/\/+$/, "").endsWith(ROTA)) return null;
  if (parsed.searchParams.has("sig")) return null;
  const caminho = parsed.searchParams.get("path");
  return caminho ? caminho : null;
}

/** Copia `u`, `exp` e `sig` do link emitido para a URL original, sem mexer no resto dela. */
export function aplicarAssinatura(original: string, emitido: string): string {
  const destino = new URL(original.trim());
  const origem = new URL(emitido);
  for (const chave of ["u", "exp", "sig"]) {
    const valor = origem.searchParams.get(chave);
    if (valor !== null) destino.searchParams.set(chave, valor);
  }
  return destino.toString();
}

type Resolver = (link: string | null) => void;

interface Guardado {
  link: string;
  expira: number;
}

export function criarAssinador(pedir: PedirLinks, agoraS: () => number = () => Math.floor(Date.now() / 1000)) {
  const guardados = new Map<string, Guardado>();
  let fila: Map<string, Resolver[]> | null = null;

  async function despachar(lote: Map<string, Resolver[]>) {
    const caminhos = Array.from(lote.keys());
    for (let i = 0; i < caminhos.length; i += MAX_POR_PEDIDO) {
      const parte = caminhos.slice(i, i + MAX_POR_PEDIDO);
      let resposta: RespostaDeLinks | null = null;
      try {
        resposta = await pedir(parte);
      } catch {
        resposta = null;
      }
      for (const caminho of parte) {
        const link = resposta?.links?.[caminho] ?? null;
        if (link && resposta) guardados.set(caminho, { link, expira: resposta.expira_em });
        for (const resolver of lote.get(caminho) ?? []) resolver(link);
      }
    }
  }

  function linkDe(caminho: string): Promise<string | null> {
    const guardado = guardados.get(caminho);
    if (guardado && guardado.expira - agoraS() > MARGEM_S) return Promise.resolve(guardado.link);
    return new Promise((resolver) => {
      if (!fila) {
        fila = new Map();
        const lote = fila;
        queueMicrotask(() => {
          fila = null;
          void despachar(lote);
        });
      }
      const espera = fila.get(caminho) ?? [];
      espera.push(resolver);
      fila.set(caminho, espera);
    });
  }

  /** A URL pronta para usar: assinada quando e' do gateway, a original em qualquer outro caso. */
  async function assinar(url: string): Promise<string> {
    const caminho = caminhoParaAssinar(url);
    if (!caminho) return url;
    const link = await linkDe(caminho);
    return link ? aplicarAssinatura(url, link) : url;
  }

  return { assinar };
}

// Troca a ref de foto/banner (`fotoPerfil.ts`) por uma URL assinada curta, com
// cache em memoria ate' perto de expirar. Valores que nao sao ref (URL externa,
// arquivo local recem-escolhido, asset) passam como vieram.

import { refDeImagem, textoDaRef } from "./fotoPerfil";

export const VALIDADE_DA_ASSINATURA_S = 60 * 60;
/** Renova antes de expirar para a imagem nao quebrar no meio da tela. */
const MARGEM_MS = 5 * 60 * 1000;

export type AssinadorDeImagem = (bucket: string, caminho: string, segundos: number) => Promise<string | null>;

type Entrada = { url: string; expiraEm: number };
const cache = new Map<string, Entrada>();
const emVoo = new Map<string, Promise<string | null>>();

export function limparCacheDeImagens(): void {
  cache.clear();
  emVoo.clear();
}

/** URL que pode ir direto pro <Image>, sem esperar assinatura; senao null. */
export function urlDeImagemEmCache(valor: string | null | undefined, agora: number = Date.now()): string | null {
  if (!valor) return null;
  const ref = refDeImagem(valor);
  if (!ref) return valor;
  const entrada = cache.get(textoDaRef(ref));
  return entrada && entrada.expiraEm - MARGEM_MS > agora ? entrada.url : null;
}

export async function resolverUrlDeImagem(
  valor: string | null | undefined,
  assinar: AssinadorDeImagem,
  agora: () => number = Date.now,
): Promise<string | null> {
  if (!valor) return null;
  const ref = refDeImagem(valor);
  if (!ref) return valor;
  const chave = textoDaRef(ref);
  const pronta = urlDeImagemEmCache(chave, agora());
  if (pronta) return pronta;
  const pendente = emVoo.get(chave);
  if (pendente) return pendente;
  const pedido = (async () => {
    try {
      const url = await assinar(ref.bucket, ref.caminho, VALIDADE_DA_ASSINATURA_S);
      if (url) cache.set(chave, { url, expiraEm: agora() + VALIDADE_DA_ASSINATURA_S * 1000 });
      return url;
    } catch {
      return null;
    } finally {
      emVoo.delete(chave);
    }
  })();
  emVoo.set(chave, pedido);
  return pedido;
}

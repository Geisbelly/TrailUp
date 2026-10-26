// Versao minima do app nativo (#195).
//
// `app_config.app_versao_minima` (alembic 20261024_11) nasce VAZIA, isto e',
// desligada. Quem opera liga com a versao do build que ja' assina as URLs dos
// buckets privados ANTES de rodar `trailup_fechar_buckets_privados()`; o app
// abaixo dela mostra a tela de atualizar em vez de abrir com imagens e arquivos
// quebrados. Puro, para rodar no harness do `node --test`.

export const CHAVE_VERSAO_MINIMA = "app_versao_minima";
export const CHAVE_URL_ATUALIZACAO = "app_atualizacao_url";

/** "1.2.3" -> [1, 2, 3]. Aceita "v1.2", sufixo "-beta" e "+build". Invalida -> null. */
export function partesDaVersao(versao: string | null | undefined): number[] | null {
  const limpa = (versao ?? "").trim().replace(/^v/i, "").split(/[-+]/)[0];
  if (!/^\d+(\.\d+){0,3}$/.test(limpa)) return null;
  return limpa.split(".").map((p) => Number(p));
}

/** <0 se a < b, 0 se iguais, >0 se a > b. "1.2" == "1.2.0". */
export function compararVersoes(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * O app precisa ser atualizado? So' quando as DUAS versoes sao validas e a
 * atual e' menor. Minima vazia, nula ou malformada = desligado; versao atual
 * desconhecida tambem nao bloqueia (melhor abrir do que travar o aluno por
 * um dado que faltou). Na web nunca: o site ja' e' sempre o ultimo deploy.
 */
export function precisaAtualizar(params: {
  versaoAtual: string | null | undefined;
  versaoMinima: string | null | undefined;
  plataforma: string;
}): boolean {
  if (params.plataforma === "web") return false;
  const minima = partesDaVersao(params.versaoMinima);
  const atual = partesDaVersao(params.versaoAtual);
  if (!minima || !atual) return false;
  return compararVersoes(atual, minima) < 0;
}

/** So' http(s) vira botao: o valor vem do banco e vai para `Linking.openURL`. */
export function urlDeAtualizacaoSegura(url: string | null | undefined): string | null {
  const limpa = (url ?? "").trim();
  if (!limpa) return null;
  try {
    const u = new URL(limpa);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Linhas de `app_config` -> valores das duas chaves (ausentes = null). */
export function lerConfigDeVersao(
  linhas: readonly { chave?: string | null; valor?: string | null }[] | null | undefined,
): { versaoMinima: string | null; urlAtualizacao: string | null } {
  const mapa = new Map((linhas ?? []).map((l) => [l.chave ?? "", l.valor ?? null]));
  return {
    versaoMinima: mapa.get(CHAVE_VERSAO_MINIMA) ?? null,
    urlAtualizacao: mapa.get(CHAVE_URL_ATUALIZACAO) ?? null,
  };
}

/**
 * Páginas do Tópico: cada questão de uma atividade e cada bloco de um conteúdo (texto, áudio,
 * apresentação...) é uma página. Antes a atividade tinha a própria paginação ("Anterior"/"Próxima")
 * dentro da paginação do tópico, e o conteúdo empilhava todos os blocos numa rolagem só.
 *
 * O ponto de cada página só leva até ela quando ela está liberada:
 * - atividade anterior ainda sem resposta segura tudo o que vem depois (a mesma regra do
 *   "Continuar", que já pedia a atividade respondida);
 * - dentro de uma atividade em aberto, a questão só abre depois da anterior respondida;
 * - página de conteúdo não trava nada.
 */

export type EstadoPagina = "feito" | "atual" | "pendente";

export type PaginaDoTopico = {
  /** Posição do bloco (conteúdo ou atividade) na lista exibida. */
  bloco: number;
  /** Posição dentro do bloco: questão da atividade ou bloco do conteúdo. */
  sub: number;
  estado: EstadoPagina;
  liberada: boolean;
  /** Primeira página do bloco: a barra separa os blocos com um respiro maior. */
  inicioDoBloco: boolean;
};

export type BlocoParaPaginas = {
  tipo: "conteudo" | "atividade";
  /** Quantas páginas o bloco tem (mínimo 1). */
  paginas: number;
  /** Conteúdo visto, ou atividade resolvida sem revisão pendente. */
  feito: boolean;
  /** Atividade resolvida: libera o que vem depois. Conteúdo sempre libera. */
  liberaSeguinte: boolean;
  /** Questões já respondidas da atividade (por posição). Conteúdo ignora. */
  respondidas?: readonly boolean[];
};

export function paginasDoTopico(
  blocos: readonly BlocoParaPaginas[],
  atual: { bloco: number; sub: number } | null
): PaginaDoTopico[] {
  const paginas: PaginaDoTopico[] = [];
  let anterioresLiberam = true;

  blocos.forEach((bloco, b) => {
    const total = Math.max(1, Math.floor(bloco.paginas) || 1);
    for (let s = 0; s < total; s += 1) {
      const ehAtual = atual != null && atual.bloco === b && atual.sub === s;
      let liberada = anterioresLiberam;
      if (liberada && bloco.tipo === "atividade" && !bloco.liberaSeguinte) {
        for (let k = 0; k < s; k += 1) {
          if (!bloco.respondidas?.[k]) {
            liberada = false;
            break;
          }
        }
      }

      let feito: boolean;
      if (bloco.tipo === "atividade") {
        feito = bloco.feito || Boolean(bloco.respondidas?.[s]);
      } else if (atual != null && atual.bloco === b) {
        // Conteúdo aberto: o que ficou para trás nesta visita.
        feito = s < atual.sub;
      } else {
        feito = bloco.feito;
      }

      paginas.push({
        bloco: b,
        sub: s,
        estado: ehAtual ? "atual" : feito ? "feito" : "pendente",
        liberada: liberada || ehAtual,
        inicioDoBloco: s === 0,
      });
    }
    if (bloco.tipo === "atividade" && !bloco.liberaSeguinte) anterioresLiberam = false;
  });

  return paginas;
}

/** Posição (0 a N-1) da página na lista; -1 se não existir. */
export function posicaoDaPagina(
  paginas: readonly PaginaDoTopico[],
  bloco: number,
  sub: number
): number {
  return paginas.findIndex((p) => p.bloco === bloco && p.sub === sub);
}

/** Mantém a posição dentro do bloco entre 0 e a última página dele. */
export function limitarSub(sub: number | null | undefined, paginas: number): number {
  const total = Math.max(1, Math.floor(paginas) || 1);
  const valor = Math.floor(Number(sub ?? 0));
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return Math.min(valor, total - 1);
}

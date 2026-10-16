// Leitura do resultado persistido de um evento encerrado (tabelas `eventos_classe_resultado*`).
// Só regras puras: a tela chama estas funções, o cliente do banco só busca as linhas.

export type LinhaDeResultado = {
  alunoId: string;
  nome: string;
  pontos: number;
  participou: boolean;
  posicao: number | null;
  destaque: boolean;
};

export type LinhaDeGuilda = { guildaId: string; nome: string; pontos: number; membros: number; posicao: number | null };

/** Ordem do placar: quem tem posição primeiro (por posição, depois nome); quem não participou ao fim, por nome. */
export function ordenarResultado(linhas: LinhaDeResultado[]): LinhaDeResultado[] {
  return [...linhas].sort((a, b) => {
    if (a.participou !== b.participou) return a.participou ? -1 : 1;
    if (a.participou && (a.posicao ?? 0) !== (b.posicao ?? 0)) return (a.posicao ?? Infinity) - (b.posicao ?? Infinity);
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export type ResumoDoResultado = {
  total: number;
  participantes: number;
  /** 0–100; turma vazia dá 0. */
  percentualParticipacao: number;
  /** Média de pontos de quem participou (0 se ninguém). */
  mediaDePontos: number;
  /** Participantes com pontos acima da média da turma-participante, em %. */
  percentualAcimaDaMedia: number;
  destaques: LinhaDeResultado[];
};

export function resumirResultado(linhas: LinhaDeResultado[]): ResumoDoResultado {
  const participantes = linhas.filter((l) => l.participou);
  const soma = participantes.reduce((acc, l) => acc + l.pontos, 0);
  const media = participantes.length > 0 ? soma / participantes.length : 0;
  const acima = participantes.filter((l) => l.pontos > media).length;
  return {
    total: linhas.length,
    participantes: participantes.length,
    percentualParticipacao: linhas.length > 0 ? Math.round((participantes.length / linhas.length) * 100) : 0,
    mediaDePontos: Math.round(media * 10) / 10,
    percentualAcimaDaMedia: participantes.length > 0 ? Math.round((acima / participantes.length) * 100) : 0,
    destaques: ordenarResultado(linhas).filter((l) => l.destaque),
  };
}

/**
 * Barra de progresso do placar. Com poucos participantes a normalização pelo primeiro colocado engana
 * (o 1º sempre marca 100% e o 2º pode marcar 12% — armadilha da issue #155), então abaixo do mínimo
 * a tela mostra só os pontos, sem barra.
 */
export const MIN_PARTICIPANTES_PARA_BARRA = 8;

export function larguraDaBarra(pontos: number, maximo: number, participantes: number): number | null {
  if (participantes < MIN_PARTICIPANTES_PARA_BARRA || maximo <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((pontos / maximo) * 100)));
}

export function rotuloDaPosicao(posicao: number | null, participou: boolean): string {
  if (!participou) return "Não participou";
  return posicao ? `${posicao}º` : "—";
}

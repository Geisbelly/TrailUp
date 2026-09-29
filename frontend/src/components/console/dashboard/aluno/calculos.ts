import type { EvolucaoAluno, ProgressoItem } from "./tipos";

// status em personalizacao_item_progresso é text (não o enum status_atividade),
// então não dá para confiar num rótulo só: vale também percentual 100.
export function itemConcluido(item: Pick<ProgressoItem, "status" | "percentual_concluido">): boolean {
  const status = String(item.status ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return status.startsWith("conclu") || Number(item.percentual_concluido ?? 0) >= 100;
}

export type ConsumoTotal = { concluidos: number; total: number; percentual: number | null };

export function consumoTotal(itens: Pick<ProgressoItem, "status" | "percentual_concluido">[]): ConsumoTotal {
  const total = itens.length;
  const concluidos = itens.filter(itemConcluido).length;
  return { concluidos, total, percentual: total === 0 ? null : (concluidos / total) * 100 };
}

export type PontoEvolucao = {
  dia: string;
  rotulo: string;
  acertos: number | null;
  progresso: number | null;
  nota: number | null;
  notaTurma: number | null;
};

const rotuloDoDia = (dia: string) =>
  new Date(`${dia.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Junta a série do aluno com a nota média da turma no mesmo dia (média simples
 * entre os alunos da classe que têm linha naquele dia). Dia só com dado da
 * turma entra com as séries do aluno vazias, para as linhas não inventarem valor.
 */
export function montarSerieEvolucao(doAluno: EvolucaoAluno[], daTurma: EvolucaoAluno[]): PontoEvolucao[] {
  const turmaPorDia = new Map<string, { soma: number; n: number }>();
  for (const linha of daTurma) {
    const dia = linha.dia.slice(0, 10);
    const atual = turmaPorDia.get(dia) ?? { soma: 0, n: 0 };
    atual.soma += Number(linha.nota_media_desempenho ?? 0);
    atual.n += 1;
    turmaPorDia.set(dia, atual);
  }
  const alunoPorDia = new Map(doAluno.map((l) => [l.dia.slice(0, 10), l]));
  const dias = [...new Set([...alunoPorDia.keys(), ...turmaPorDia.keys()])].sort();
  return dias.map((dia) => {
    const a = alunoPorDia.get(dia);
    const t = turmaPorDia.get(dia);
    return {
      dia,
      rotulo: rotuloDoDia(dia),
      acertos: a ? Number(a.taxa_acertos_pct ?? 0) : null,
      progresso: a ? Number(a.progresso_trilha_pct ?? 0) : null,
      nota: a ? Number(a.nota_media_desempenho ?? 0) : null,
      notaTurma: t ? t.soma / t.n : null,
    };
  });
}

// Aba "Recomendações" do console: tudo o que a IA SUGERIU e ainda espera a decisão do professor.
//
// A fonte é `intervencoes` (migration 20260929_01), a mesma da aba Insights. A diferença é o recorte:
// o Insights mostra só o lote mais recente de cada turma, então uma sugestão pendente de um lote
// antigo sumia da tela sem ninguém ter decidido nada. Aqui entra **toda** sugestão pendente, de
// qualquer lote, turma ou escopo. Observação não entra: não há o que aprovar.

import { taxaDeAceitacao, type Insight, type TaxaDeAceitacao } from "../dashboard/insights";

export type FiltroDeEscopo = "tudo" | "turma" | "alunos";

/** Sugestão (não observação) ainda sem decisão e com texto. Mais nova primeiro. */
export function pendentesDeDecisao(linhas: Insight[]): Insight[] {
  return linhas
    .filter((l) => l.natureza === "sugestao" && l.status === "pending" && Boolean(l.texto?.trim()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

/** As já decididas, da decisão mais recente para a mais antiga. */
export function decididas(linhas: Insight[]): Insight[] {
  return linhas
    .filter((l) => l.natureza === "sugestao" && l.status !== "pending" && Boolean(l.resolved_at))
    .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "") || a.id.localeCompare(b.id));
}

export function filtrar(linhas: Insight[], filtro: FiltroDeEscopo, classeId: number | null): Insight[] {
  return linhas.filter((l) => {
    if (classeId !== null && l.classe_id !== classeId) return false;
    if (filtro === "turma") return l.escopo === "turma";
    if (filtro === "alunos") return l.escopo === "aluno";
    return true;
  });
}

export type ContagemPorEscopo = { total: number; turma: number; alunos: number };

export function contarPendentes(linhas: Insight[]): ContagemPorEscopo {
  const pendentes = pendentesDeDecisao(linhas);
  const turma = pendentes.filter((l) => l.escopo === "turma").length;
  return { total: pendentes.length, turma, alunos: pendentes.length - turma };
}

/** Taxa de aceitação das decididas, com a mesma regra e janela do Insights. */
export function aceitacaoDasDecididas(linhas: Insight[], agora: Date): TaxaDeAceitacao {
  return taxaDeAceitacao(linhas, agora);
}

/** "9+" no selo do menu: número grande vira ruído. */
export function rotuloDoSelo(total: number): string | null {
  if (total <= 0) return null;
  return total > 9 ? "9+" : String(total);
}

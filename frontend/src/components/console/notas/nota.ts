import type { LinhaDaFila } from "./fila";

// Validação da nota que o professor digita e os textos do painel de correção.
// (strictNullChecks está desligado no projeto: duas chaves exclusivas, sem união discriminada.)

export type ResultadoDaNota = { ok: boolean; valor: number | null; erro: string | null };

const falha = (erro: string): ResultadoDaNota => ({ ok: false, valor: null, erro });

/** Aceita vírgula decimal, até duas casas; de 0 até a pontuação máxima da atividade. */
export function validarNota(texto: string, maximo: number | null): ResultadoDaNota {
  if (maximo === null || !(maximo > 0)) return falha("Esta atividade não tem pontuação máxima definida.");
  const bruto = texto.trim().replace(",", ".");
  if (!bruto) return falha("Informe a nota.");
  if (!/^\d+(\.\d{1,2})?$/.test(bruto)) return falha("Use um número, com até duas casas decimais.");
  const n = Number(bruto);
  if (n > maximo) return falha(`A nota vai de 0 a ${formatar(maximo)}.`);
  return { ok: true, valor: n, erro: null };
}

export function formatar(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** "Isso soma X pontos…" — a nota vira pontos no rank, e a tela precisa dizer isso (critério da #136). */
export function mensagemDeImpacto(l: Pick<LinhaDaFila, "alunoNome" | "avaliadoEm" | "pontuacaoObtida">, nota: number | null): string {
  if (nota === null) return "Digite a nota para ver o efeito no desempenho do aluno.";
  const pontos = formatar(nota);
  if (l.avaliadoEm && l.pontuacaoObtida !== null) {
    return `Isso troca a sua nota anterior (${formatar(l.pontuacaoObtida)}) por ${pontos} no desempenho de ${l.alunoNome} na turma.`;
  }
  return `Isso soma ${pontos} ${nota === 1 ? "ponto" : "pontos"} ao desempenho de ${l.alunoNome} na turma.`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

/**
 * Tópicos da turma que o aluno ainda não vê (rascunho ou agendado), vindos da RPC
 * `topicos_em_breve` (migration 20261110_10). A RPC devolve SÓ a data de abertura: nada de
 * nome, descrição ou id. O aviso mostra quantos vêm e quando, e nada mais.
 */

export type EmBreve = { abreEm: Date | null };

/** Linhas da RPC → lista. Linha estranha vira "sem data" em vez de sumir: a contagem é o aviso. */
export function lerEmBreve(linhas: unknown): EmBreve[] {
  if (!Array.isArray(linhas)) return [];
  return linhas.map((linha) => {
    const bruto = linha && typeof linha === 'object' ? (linha as { abre_em?: unknown }).abre_em : null;
    if (typeof bruto !== 'string' || !bruto) return { abreEm: null };
    const data = new Date(bruto);
    return { abreEm: Number.isNaN(data.getTime()) ? null : data };
  });
}

const dois = (n: number) => String(n).padStart(2, '0');
const hora = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;
const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Abre hoje às 08:00", "Abre amanhã às 08:00", "Abre 12/11 às 08:00" ou "Em preparação". */
export function rotuloDaAbertura(abreEm: Date | null, agora: Date = new Date()): string {
  if (!abreEm) return 'Em preparação';
  // Passou da hora e a trilha ainda não recarregou: o tópico já está aberto no banco.
  if (abreEm.getTime() <= agora.getTime()) return 'Abrindo agora';
  if (mesmoDia(abreEm, agora)) return `Abre hoje às ${hora(abreEm)}`;
  const amanha = new Date(agora);
  amanha.setDate(agora.getDate() + 1);
  if (mesmoDia(abreEm, amanha)) return `Abre amanhã às ${hora(abreEm)}`;
  return `Abre ${dois(abreEm.getDate())}/${dois(abreEm.getMonth() + 1)} às ${hora(abreEm)}`;
}

export function tituloDoAviso(quantos: number): string {
  return quantos === 1 ? '1 tópico em breve' : `${quantos} tópicos em breve`;
}

/**
 * Daqui a quantos ms a próxima abertura acontece (para recarregar a trilha nessa hora), ou
 * `null` se nenhuma está marcada. Teto de 24 h: timer muito longo no aparelho não é confiável,
 * e o app recarrega a trilha por outros caminhos antes disso.
 */
export function esperaAteAProximaAbertura(lista: EmBreve[], agora: Date = new Date()): number | null {
  const futuras = lista
    .map((item) => item.abreEm?.getTime() ?? NaN)
    .filter((t) => Number.isFinite(t) && t > agora.getTime());
  if (futuras.length === 0) return null;
  const espera = Math.min(...futuras) - agora.getTime();
  return Math.min(espera, 24 * 60 * 60 * 1000);
}

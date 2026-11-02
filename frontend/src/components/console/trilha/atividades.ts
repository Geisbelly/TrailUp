import { ehTipoDeAtividade, ROTULO_DO_TIPO } from "./tiposDeAtividade";

// Tipos antigos que ainda existem em atividades já gravadas e não fazem parte da lista atual.
const ROTULOS_LEGADOS: Record<string, string> = {
  questao: "Múltipla escolha",
  video: "Vídeo",
  texto: "Texto",
};

/** Rótulo legível do tipo da atividade; tipo desconhecido ou vazio não quebra a lista. */
export function rotuloDoTipoDeAtividade(tipo: string | null | undefined): string {
  if (!tipo) return "Atividade";
  if (ehTipoDeAtividade(tipo)) return ROTULO_DO_TIPO[tipo];
  return ROTULOS_LEGADOS[tipo] ?? "Atividade";
}

/** "entrega 12/10/2026" ou null (sem prazo / data inválida). */
export function prazoDaAtividade(dataEntrega: string | null | undefined): string | null {
  if (!dataEntrega) return null;
  const d = new Date(dataEntrega);
  return Number.isNaN(d.getTime()) ? null : `entrega ${d.toLocaleDateString("pt-BR")}`;
}

/** O maior limite que o editor aceita. O banco só exige > 0; acima disso é quase certo erro de digitação. */
export const TENTATIVAS_MAXIMAS = 99;

/**
 * Limite de quem não escolhe: o `DEFAULT` de `atividades.tentativas_max` (`TENTATIVAS_PADRAO` na
 * migration `20261102_08`). Toda atividade tem limite desde então (#136, decisão de 02/11).
 */
export const TENTATIVAS_PADRAO = 3;

/**
 * Campo "Tentativas por aluno" → `atividades.tentativas_max` (#136). Vazio é o padrão.
 * Só inteiro de 1 a `TENTATIVAS_MAXIMAS`: "0" quer dizer que ninguém faz, e não há "ilimitadas".
 */
export function tentativasDoFormulario(texto: string | null | undefined): { valido: boolean; valor: number | null } {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return { valido: true, valor: TENTATIVAS_PADRAO };
  if (!/^\d+$/.test(limpo)) return { valido: false, valor: null };
  const n = Number(limpo);
  if (n < 1 || n > TENTATIVAS_MAXIMAS) return { valido: false, valor: null };
  return { valido: true, valor: n };
}

/** `atividades.tentativas_max` → texto do campo. */
export function tentativasParaFormulario(max: number | null | undefined): string {
  return max == null ? "" : String(max);
}

/** "1 tentativa" ou "3 tentativas", para a lista ao lado do prazo. Sem valor (banco antes da `20261102_08`) é o padrão. */
export function rotuloDasTentativas(max: number | null | undefined): string {
  const n = max ?? TENTATIVAS_PADRAO;
  return n === 1 ? "1 tentativa" : `${n} tentativas`;
}

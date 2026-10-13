import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { PERFIS_EM_ORDEM } from "../dashboard/perfilCores";

export type CriterioChave = "pontuacao" | "tempo" | "acertos";

export const CRITERIOS: { chave: CriterioChave; rotulo: string }[] = [
  { chave: "pontuacao", rotulo: "Pontuação" },
  { chave: "tempo", rotulo: "Tempo" },
  { chave: "acertos", rotulo: "Acertos" },
];

/** Critério vindo do banco é texto livre: o que não for conhecido cai em "pontuacao". */
export function criterioValido(c: string | null | undefined): CriterioChave {
  return CRITERIOS.some((x) => x.chave === c) ? (c as CriterioChave) : "pontuacao";
}

export function rotuloDoCriterio(c: string | null | undefined): string {
  return CRITERIOS.find((x) => x.chave === criterioValido(c))!.rotulo.toLowerCase();
}

export type Posicao = { aluno_id: string; aluno_nome: string; posicao: number | null; pontuacao: number | null };

/**
 * Pódio = as três primeiras linhas já ordenadas pela view. Devolvido na ordem
 * visual do protótipo (2º, 1º, 3º); posição ausente vira `null` para o layout
 * manter a coluna em vez de deslocar os vizinhos.
 */
export function podio(posicoes: Posicao[]): { lugar: 1 | 2 | 3; aluno: Posicao | null }[] {
  const top = posicoes.slice(0, 3);
  return ([2, 1, 3] as const).map((lugar) => ({ lugar, aluno: top[lugar - 1] ?? null }));
}

export const POR_PAGINA = 10;

/** Perfil dominante (maior afinidade) por aluno, na chave BrainHex minúscula. */
export function perfisDominantes(
  linhas: { aluno_id: string | null; afinidade: number | null; perfil: { nome: string } | null }[],
): Map<string, BrainHexProfileKey> {
  const melhor = new Map<string, { chave: BrainHexProfileKey; afinidade: number }>();
  for (const l of linhas) {
    const chave = l.perfil?.nome?.toLowerCase() as BrainHexProfileKey | undefined;
    if (!l.aluno_id || !chave || !PERFIS_EM_ORDEM.includes(chave)) continue;
    const afinidade = Number(l.afinidade ?? 0);
    const atual = melhor.get(l.aluno_id);
    if (!atual || afinidade > atual.afinidade) melhor.set(l.aluno_id, { chave, afinidade });
  }
  return new Map([...melhor].map(([id, v]) => [id, v.chave]));
}

export function formatarPontos(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("pt-BR");
}

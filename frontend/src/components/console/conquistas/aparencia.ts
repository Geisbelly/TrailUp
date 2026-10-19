import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { COR_DO_PERFIL } from "../dashboard/perfilCores";

// Aparência da conquista da turma. Cor LIVRE não existe de propósito (issue #158):
// um seletor aberto deixaria o professor criar uma medalha ilegível no tema escuro,
// e o contraste AAA é regra do projeto. Ou é uma cor desta paleta validada, ou —
// para conquista de perfil — a cor-assinatura oficial daquele perfil.

export const PALETA_DE_CORES = ["#9b5de5", "#4fd1c5", "#e0b34d", "#e2574c", "#5fd99a", "#6fb3e0"] as const;
export const COR_PADRAO = PALETA_DE_CORES[0];

/** Ícones disponíveis (a chave é o que se grava; o desenho fica na tela). Conjunto fixo, sem upload. */
export const ICONES_DA_CONQUISTA = [
  { chave: "trofeu", rotulo: "Troféu" },
  { chave: "estrela", rotulo: "Estrela" },
  { chave: "chama", rotulo: "Chama" },
  { chave: "alvo", rotulo: "Alvo" },
  { chave: "raio", rotulo: "Raio" },
  { chave: "livro", rotulo: "Livro" },
  { chave: "medalha", rotulo: "Medalha" },
  { chave: "foguete", rotulo: "Foguete" },
] as const;

export type IconeChave = (typeof ICONES_DA_CONQUISTA)[number]["chave"];
export const ICONE_PADRAO: IconeChave = "trofeu";

export function iconeValido(chave: unknown): chave is IconeChave {
  return typeof chave === "string" && ICONES_DA_CONQUISTA.some((i) => i.chave === chave);
}

export function corValida(cor: unknown): boolean {
  return typeof cor === "string" && (PALETA_DE_CORES as readonly string[]).includes(cor.toLowerCase());
}

/** Cor efetiva: a do perfil quando a conquista é de um perfil; senão a da paleta (ou a padrão se a escolhida não é válida). */
export function corDaConquista(escolhida: string | null | undefined, perfil: BrainHexProfileKey | null): string {
  if (perfil) return COR_DO_PERFIL[perfil].marca;
  return escolhida && corValida(escolhida) ? escolhida.toLowerCase() : COR_PADRAO;
}

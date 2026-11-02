/**
 * Núcleo puro do esqueleto de carregamento: os blocos que ocupam o lugar do conteúdo
 * enquanto ele chega, para a tela não ficar com buracos nem mostrar "nenhum item"
 * antes da hora. O componente está em `components/carregamento/Esqueleto.tsx`.
 *
 * Fundamentação em docs/superpowers/specs/2026-11-02-tela-de-carregamento-por-perfil-design.md (2.1).
 */
import { ensureMinContrast } from "@/utils/profileShellPalette";
import tinycolor from "tinycolor2";

/** Um ciclo do pulso (some e volta). Devagar de propósito: é espera, não alerta. */
export const PULSO_MS = 1_600;

/** Opacidade do bloco no fundo e no topo do pulso. */
export const OPACIDADE_DO_PULSO = [0.55, 1] as const;

/** Com "Reduzir movimento", o bloco fica parado nesta opacidade. */
export const OPACIDADE_PARADA = 0.8;

/**
 * Contraste mínimo do bloco contra a superfície em que ele está. Não é texto nem
 * controle (WCAG não pede número aqui), mas precisa ser visto: abaixo disso, em
 * telas escuras e com brilho baixo, o esqueleto vira o mesmo buraco que ele substitui.
 */
export const CONTRASTE_DO_BLOCO = 1.4;

/**
 * Cor do bloco sobre `superficie`: a própria superfície com a luminosidade HSL
 * elevada até `CONTRASTE_DO_BLOCO`. Matiz e saturação ficam, então o esqueleto
 * tem a cor do perfil, e nada é misturado com branco.
 */
export function corDoEsqueleto(superficie: string): string {
  const base = tinycolor(superficie);
  if (!base.isValid()) return "#2a3150";
  // O bloco é visto já com a opacidade parada por cima da superfície: o contraste
  // é medido nessa cor composta, não na cor cheia.
  let alvo = CONTRASTE_DO_BLOCO;
  let cor = base.toHexString();
  for (let i = 0; i < 20 && contrasteComposto(cor, superficie, OPACIDADE_PARADA) < CONTRASTE_DO_BLOCO; i += 1) {
    alvo += 0.1;
    cor = ensureMinContrast(base.toHexString(), base, alvo, 0.02, 50);
  }
  return cor;
}

/** Contraste, contra `superficie`, de `cor` desenhada por cima dela com `opacidade`. */
export function contrasteComposto(cor: string, superficie: string, opacidade: number): number {
  const composta = tinycolor.mix(superficie, cor, opacidade * 100);
  return tinycolor.readability(composta, superficie);
}

/** Larguras das linhas de texto falsas: variam para não parecer uma grade. */
export function larguraDaLinha(indice: number, total: number): `${number}%` {
  if (total <= 1) return "70%";
  if (indice === total - 1) return "45%";
  return indice % 2 === 0 ? "92%" : "78%";
}

/**
 * Se a tela deve trocar o conteúdo pelo esqueleto. Só quando ela não tem nada seu para
 * mostrar: nenhum item ainda, ou itens de outra chave (outra turma). Recarregar a mesma
 * chave mantém o conteúdo na tela. Trocá-lo a cada recarga fazia a trilha inteira piscar
 * para o esqueleto e voltar (foco do Perfil, tema da turma em tempo real).
 */
export function esperandoPrimeiraCarga(
  carregando: boolean,
  itensNaTela: number,
  chaveAtual: string | number | null | undefined,
  chaveCarregada: string | number | null | undefined,
): boolean {
  if (!carregando) return false;
  if (itensNaTela === 0) return true;
  return String(chaveAtual ?? "") !== String(chaveCarregada ?? "");
}

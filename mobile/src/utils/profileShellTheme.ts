import { getBrainHexConfig } from "@/constants/profileImages";
import { Noite, Texto } from "@/styles/identidade";
import tinycolor from "tinycolor2";

/**
 * A paleta do app. UMA superficie para os sete perfis; o perfil vira ACENTO.
 *
 * Antes daqui havia tres tabelas de tom (`real`, `medieval`, `magica`) e a
 * cor-assinatura era misturada no fundo, na superficie e na borda: o Socializer
 * estudava num app arroxeado (`#160c16`), o Conqueror num azul (`#04070e`), o
 * Achiever num cinza quente (`#08090a`). Eram sete apps.
 *
 * A identidade nova (pasta do Drive, medida em
 * `docs/superpowers/specs/2026-09-16-identidade-visual-design.md`) diz o
 * contrario: azul-meia-noite para todos, uma luz ambar, e o perfil aparece como
 * acento e ornamento — moldura, emblema, totem, botao, grafico.
 *
 * O ganho nao e' so' estetico. Com a superficie FIXA, o accent de cada perfil
 * vira UM numero, calculavel uma vez. O `CLAUDE.md` registra que backend,
 * frontend e mobile partem da mesma cor-assinatura e calculam variantes
 * diferentes; com o chao constante essa divergencia deixa de ser possivel aqui.
 *
 * Medido contra o chao novo: Seeker, Socializer e Achiever passam em AAA SEM
 * ajuste nenhum — a cor-assinatura oficial sobrevive mais fiel do que sobrevivia
 * com o chao tingido.
 */
export type ProfileShellPalette = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentMuted: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  progressTrack: string;
  inactive: string;
};

/**
 * Contraste minimo de qualquer cor usada como texto, icone ou borda de foco.
 *
 * 4.5 e' AAA para texto grande e fica acima do minimo de 3:1 de componente de
 * UI. A referencia e' sempre `Noite.n700`, a superficie MAIS CLARA em que essas
 * cores aparecem: quem passa ali passa nas outras duas.
 */
export const CONTRASTE_MINIMO = 4.5;

/**
 * Eleva a luminosidade (HSL) de `color` ate atingir `minRatio` de contraste WCAG
 * contra `background`, mantendo matiz E saturacao intactos — ao contrario de
 * misturar com branco (que desatura e deixa a cor "apagada"), aqui só a
 * luminosidade sobe, preservando a identidade/vibração da cor-assinatura do perfil.
 */
function ensureMinContrast(
  color: string,
  background: tinycolor.Instance | string,
  minRatio: number,
  stepL = 0.04,
  maxSteps = 20
): string {
  const hsl = tinycolor(color).toHsl();
  let adjusted = tinycolor(hsl);
  for (let i = 0; i < maxSteps; i += 1) {
    if (tinycolor.readability(adjusted, background) >= minRatio) break;
    if (hsl.l >= 1) break;
    hsl.l = Math.min(1, hsl.l + stepL);
    adjusted = tinycolor(hsl);
  }
  return adjusted.toHexString();
}

/**
 * O piso do texto passa pela MESMA correcao que o accent, em vez de ser um hex
 * escolhido a mao.
 *
 * O valor da ficha de identidade (`#7d8794`) da 5,34 sobre o fundo e **4,15**
 * sobre a superficie elevada: passa onde e' medido e reprova onde e' usado. Sem
 * esta linha, a regra viveria num comentario e quebraria na primeira legenda
 * dentro de um modal.
 */
const TEXTO_FRACO = ensureMinContrast(Texto.fraco, Noite.n700, CONTRASTE_MINIMO);

export function buildProfileShellPaletteFromAccent(
  accentSource?: string | null
): ProfileShellPalette {
  const accentBase = tinycolor(accentSource || "#707c88").isValid()
    ? tinycolor(accentSource || "#707c88").toHexString()
    : "#707c88";

  const accent = ensureMinContrast(accentBase, Noite.n700, CONTRASTE_MINIMO);

  return {
    accent,
    accentStrong: tinycolor(accentBase).darken(8).toHexString(),
    accentSoft: tinycolor(accent).setAlpha(0.18).toRgbString(),
    accentMuted: tinycolor(accent).setAlpha(0.12).toRgbString(),
    background: Noite.n900,
    surface: Noite.n800,
    surfaceElevated: Noite.n700,
    // Divisor e' fio solido de 1px, nao caixa e nao sombra — e' o que a
    // identidade usa. So' `borderStrong` continua tingida de perfil, porque ela
    // marca FOCO, e foco e' onde o perfil deve aparecer.
    border: Noite.n600,
    borderStrong: tinycolor(accent).setAlpha(0.4).toRgbString(),
    text: Texto.forte,
    textMuted: Texto.medio,
    textSubtle: TEXTO_FRACO,
    progressTrack: Noite.n600,
    // Aba inativa e' rotulo pequeno, entao NAO pode ser o `Aco`: ele da 4,20
    // sobre o fundo e 3,27 sobre a elevada — passa como icone e reprova como
    // texto. `Aco` fica reservado para icone e ornamento (ver GlobalStyle).
    inactive: TEXTO_FRACO,
  };
}

export function getProfileShellPalette(profileName?: string | null): ProfileShellPalette {
  const config = getBrainHexConfig(profileName ?? undefined);
  return buildProfileShellPaletteFromAccent(config.color);
}

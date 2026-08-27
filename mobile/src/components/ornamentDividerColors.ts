import tinycolor from "tinycolor2";

export type CoresDoDivisor = {
  /** Linhas e losangos pequenos das pontas. */
  dim: string;
  /** Losangos grandes e a fleur-de-lis do centro. */
  bright: string;
};

/**
 * Cores do divisor ornamental, com a atenuacao ja embutida.
 *
 * O `opacidade` existe para que a tela NAO precise envolver o divisor num
 * `<View style={{ opacity }}>`. No Android, opacidade < 1 promove a View a uma
 * camada de renderizacao propria, e glifos de fonte de icone dentro dela podem
 * sair recortados ate um repaint -- o divisor de rodape do ranking aparecia
 * cortado numa abertura e inteiro na seguinte, sem nada mudar na tela.
 *
 * Multiplicando a opacidade direto na cor, o resultado visual e o mesmo e nao
 * ha camada extra nenhuma.
 */
/**
 * Atenuacao minima que ainda deixa as LINHAS do divisor visiveis.
 *
 * Medido contra o fundo do salao (#0b1020), lembrando que a linha usa 55% do
 * alpha pedido:
 *
 *   opacidade 0.40 -> linha em 1.98:1  (invisivel)
 *   opacidade 0.55 -> linha em 2.67:1  (abaixo do piso de 3:1 para graficos)
 *   opacidade 0.70 -> linha em 3.61:1  (ok)
 *
 * O rodape do ranking vinha com 0.4, e o resultado era o divisor "quebrado":
 * os losangos (mais claros) apareciam como marcas soltas e as duas linhas de
 * 1px desapareciam. Atenuacao abaixo deste piso nao e escolha de design, e
 * elemento que deixa de existir -- entao sobe pro piso.
 */
export const OPACIDADE_MINIMA_VISIVEL = 0.7;

export function coresDoDivisor(color: string, opacidade = 1): CoresDoDivisor {
  const pedida = Math.max(0, Math.min(1, Number.isFinite(opacidade) ? opacidade : 1));
  const fator = Math.max(OPACIDADE_MINIMA_VISIVEL, pedida);
  const base = tinycolor(color);
  // Cor invalida vira branco em vez de derrubar o render do divisor inteiro.
  const segura = base.isValid() ? base : tinycolor("#ffffff");
  const alphaOriginal = segura.getAlpha();

  return {
    dim: segura.clone().setAlpha(0.55 * fator * alphaOriginal).toRgbString(),
    bright: segura
      .clone()
      .lighten(15)
      .setAlpha(fator * alphaOriginal)
      .toRgbString(),
  };
}

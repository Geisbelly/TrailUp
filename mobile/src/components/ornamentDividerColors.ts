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
export function coresDoDivisor(color: string, opacidade = 1): CoresDoDivisor {
  const fator = Math.max(0, Math.min(1, Number.isFinite(opacidade) ? opacidade : 1));
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

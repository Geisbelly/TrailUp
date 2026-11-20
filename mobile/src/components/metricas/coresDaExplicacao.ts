import tinycolor from "tinycolor2";

/**
 * Cores da explicação de uma métrica. Neutras de propósito: o painel do Perfil e o topo da tela usam
 * paletas diferentes (`ThemePalette` e `ProfileShellPalette`), e cada chamador monta o objeto.
 */
export type CoresDaExplicacao = { texto: string; suave: string; fundo: string; borda: string; destaque: string };

// `textMuted` das paletas é o texto com alpha; o contraste que vale é o da cor que aparece sobre o
// fundo, e `tinycolor.readability` ignora o alpha. Achatar aqui deixa o teste medir o que se vê.
function sobre(cor: string, fundo: string): string {
  const c = tinycolor(cor);
  const alpha = c.getAlpha();
  if (alpha >= 1) return c.toHexString();
  return tinycolor.mix(tinycolor(fundo), c.setAlpha(1), alpha * 100).toHexString();
}

export function coresDaExplicacao(cores: CoresDaExplicacao): CoresDaExplicacao {
  const fundo = tinycolor(cores.fundo).setAlpha(1).toHexString();
  return {
    fundo,
    borda: cores.borda,
    texto: sobre(cores.texto, fundo),
    suave: sobre(cores.suave, fundo),
    destaque: sobre(cores.destaque, fundo),
  };
}

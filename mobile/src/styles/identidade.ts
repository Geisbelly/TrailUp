/**
 * Tokens da identidade visual. **Sem import nenhum, de proposito.**
 *
 * Cor e' dado, nao runtime: separar isto de `GlobalStyle.ts` (que importa
 * `react-native` por causa de `Platform`) deixa os tokens carregaveis no
 * harness de teste do node, que e' onde a conta de contraste e' verificada.
 * Ver `profileShellTheme.test.ts`.
 */

/**
 * O chao. Medido na pasta de identidade do Drive (quantizacao e amostragem por
 * regiao), nao estimado a olho — ver
 * `docs/superpowers/specs/2026-09-16-identidade-visual-design.md`.
 *
 * Estes valores sao a camada de UI, que NAO varia por perfil. A arte (cenario,
 * boss, moldura) varia; o chao onde se le, nao.
 */
export const Noite = {
  n950: "#010819", // poco, atras do conteudo
  n900: "#020d1f", // fundo da tela
  n800: "#04162b", // superficie, card
  n700: "#082840", // superficie elevada: modal, item em foco
  n600: "#1a2d3c", // borda solida, divisor, trilho
} as const;

/**
 * A luz: ambar quente, uma fonte so'. E' a unica cor quente da paleta.
 */
export const Luz = {
  l100: "#fef5ae", // nucleo do brilho, faisca
  l200: "#f7e6a6", // destaque quente
  l300: "#e7d189", // ambar de texto e icone
  l400: "#deb35c", // ambar cheio, icone do app
} as const;

/**
 * ARMADILHA: `Aco` e' cor de ICONE e ORNAMENTO. Texto nunca.
 *
 * Medido: 4,20 sobre `Noite.n900` e 3,27 sobre `Noite.n700`. Passa como
 * componente de UI (minimo 3:1) e REPROVA como texto nos dois niveis. E' a cor
 * dos icones na ficha de identidade, e e' bonita — por isso e' facil copia-la
 * para uma legenda e criar texto ilegivel que parece certo.
 */
export const Aco = "#527a8e";

/**
 * Os tres niveis de texto. `fraco` e' o PISO e mesmo ele nao vale cru sobre a
 * superficie elevada (4,15) — quem monta a paleta o corrige em
 * `profileShellTheme`, que e' onde a conta de contraste mora.
 */
export const Texto = {
  forte: "#c9d2df", // 12,75 sobre o fundo · 9,92 sobre a elevada
  medio: "#97a3b4", // 7,61 · 5,92
  fraco: "#7d8794", // 5,34 · 4,15 -> corrigido antes de virar token
} as const;

/**
 * A tipografia da identidade: Jost para titulo/rotulo/numero, Karla para corpo.
 *
 * O app usava serifa (`Georgia`/`Palatino`), heranca do tema medieval, e as
 * TRES chaves ornamentais de `FontFamily` apontavam para a MESMA serifa — ou
 * seja, nao havia hierarquia de peso a preservar, so' tamanho. Trocar por Jost
 * SemiBold no titulo e Karla Regular no corpo DA hierarquia onde nao havia.
 *
 * Nomes de familia carregada, nao caminhos: quem carrega e' `fontes.ts`, uma
 * vez, no layout raiz. Este arquivo continua sem import nenhum de proposito.
 */
export const Fontes = {
  /** Titulo, rotulo em caixa alta, numero grande. */
  titulo: "Jost_600SemiBold",
  /** Corpo de leitura. */
  corpo: "Karla_400Regular",
} as const;

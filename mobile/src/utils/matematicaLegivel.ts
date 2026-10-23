/**
 * LaTeX cru vira texto legível antes de o aluno ler.
 *
 * O gerador entrega fórmulas em LaTeX (`$x$`, `$a \neq 0$`, `$$ax + b = 0$$`) e o
 * `react-native-markdown-display` não renderiza matemática — nem no celular nem na web. O aluno
 * vê os cifrões e as barras invertidas literalmente (#522).
 *
 * ## Por que converter na LEITURA e não só no prompt
 *
 * Instruir o prompt a não usar LaTeX resolve o material futuro; não resolve o que já está
 * gravado em `conteudo_personalizado.materiais`. As duas coisas valem, e esta é a que conserta
 * o aluno de hoje. Também é a única verificável sem rodar geração.
 *
 * ## O cuidado com o cifrão
 *
 * `$` é moeda em português: "R$ 50", "custa $ 10". Converter todo `$...$` destruiria preço.
 * Por isso a regra é restritiva — ver `pareceMatematica`: o conteúdo entre cifrões precisa
 * parecer fórmula, e um `$` precedido de `R` nunca abre fórmula.
 *
 * Quando não dá para ter certeza, o texto fica como está. Mostrar `$x$` é feio; transformar
 * "R$ 1.200" em outra coisa é errado.
 */

/** `\comando` -> símbolo. Só os que aparecem em matemática de ensino médio. */
const SIMBOLOS: readonly (readonly [RegExp, string])[] = [
  [/\\neq\b/g, "≠"],
  [/\\leq\b/g, "≤"],
  [/\\geq\b/g, "≥"],
  [/\\times\b/g, "×"],
  [/\\div\b/g, "÷"],
  [/\\cdot\b/g, "·"],
  [/\\pm\b/g, "±"],
  [/\\infty\b/g, "∞"],
  [/\\pi\b/g, "π"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\theta\b/g, "θ"],
  [/\\Delta\b/g, "Δ"],
  [/\\approx\b/g, "≈"],
  [/\\rightarrow\b/g, "→"],
  [/\\to\b/g, "→"],
];

const EXPOENTES: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

/** O miolo de uma fórmula, sem os comandos de LaTeX. */
export function corpoDaFormula(bruto: string): string {
  let texto = bruto;

  // `\frac{a}{b}` -> `a/b`; `\sqrt{x}` -> `√x`. Um nível de aninhamento basta para o que o
  // gerador produz, e tentar mais sem um parser de verdade erraria calado.
  texto = texto.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2");
  texto = texto.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1");
  texto = texto.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  texto = texto.replace(/\\mathrm\s*\{([^{}]*)\}/g, "$1");

  for (const [padrao, simbolo] of SIMBOLOS) texto = texto.replace(padrao, simbolo);

  // `x^2` e `x^{2}` -> `x²`. Só dígito: `x^{n+1}` não tem sobrescrito em unicode.
  texto = texto.replace(/\^\{?(\d)\}?/g, (_, d: string) => EXPOENTES[d] ?? `^${d}`);

  // `\\` é quebra de linha em LaTeX; vira espaço, não barra na tela.
  texto = texto.replace(/\\\\/g, " ");
  // Chaves que sobraram de comandos que não tratamos não devem aparecer.
  texto = texto.replace(/[{}]/g, "");
  // `\qualquercoisa` que sobrou: tira a barra e deixa a palavra.
  texto = texto.replace(/\\([a-zA-Z]+)/g, "$1");

  return texto.replace(/\s+/g, " ").trim();
}

/**
 * O miolo entre cifrões parece fórmula?
 *
 * Restritivo de propósito: na dúvida, não mexe. Preço mal convertido é pior que LaTeX visível.
 */
export function pareceMatematica(miolo: string): boolean {
  const texto = miolo.trim();
  if (!texto || texto.length > 200) return false;

  // "1.200", "50,00", "1 200" -> dinheiro, não fórmula.
  if (/^[\d.,\s]+$/.test(texto)) return false;

  // Sinal de LaTeX é prova suficiente.
  if (/\\[a-zA-Z]+/.test(texto)) return true;

  // Variável nua: `$x$`, `$y$`, `$x_1$`. É o caso mais comum no texto do gerador, e é seguro —
  // uma letra sozinha entre cifrões nunca é preço.
  if (/^[a-zA-Z](_?[a-zA-Z0-9])?$/.test(texto)) return true;

  // Senão, exige um operador matemático E nenhum espaço duplo (prosa entre cifrões).
  return /[=+\-*/^<>]/.test(texto) && !/\s{2}/.test(texto);
}

/**
 * Troca as fórmulas de um markdown por texto legível.
 *
 * Preserva bloco de código: `$` dentro de ``` é código, não fórmula.
 */
export function matematicaLegivel(markdown: string): string {
  if (typeof markdown !== "string" || !markdown.includes("$")) return markdown;

  // Divide mantendo as cercas de código nos índices ímpares.
  const partes = markdown.split(/(```[\s\S]*?```|`[^`\n]*`)/g);

  return partes
    .map((parte, indice) => {
      if (indice % 2 === 1) return parte; // dentro de código: intocado

      // `$$...$$` primeiro, senão o `$...$` casaria metade dele.
      let texto = parte.replace(/\$\$([\s\S]+?)\$\$/g, (todo, miolo: string) =>
        pareceMatematica(miolo) ? corpoDaFormula(miolo) : todo,
      );

      // `$...$`, nunca quando o cifrão vem depois de R (R$ é moeda).
      texto = texto.replace(/(^|[^R\\])\$([^$\n]+?)\$/g, (todo, antes: string, miolo: string) =>
        pareceMatematica(miolo) ? `${antes}${corpoDaFormula(miolo)}` : todo,
      );

      return texto;
    })
    .join("");
}

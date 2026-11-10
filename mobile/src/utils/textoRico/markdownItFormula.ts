/**
 * Plugin do markdown-it para fórmulas: `$…$` vira o token `formula_inline` e `$$…$$` vira
 * `formula_bloco` (spec A, 08/11). O `MarkdownBlock` desenha os dois com `Formula`.
 *
 * Supõe o texto já passado por `prepararTextoRico`: lá os delimitadores de barra viram cifrão e todo
 * cifrão que não abre fórmula vira `\$`. Então aqui não há heurística de dinheiro: `$` não escapado
 * abre fórmula. `\$` é cifrão literal (regra `escape` do próprio markdown-it), e código, inline ou
 * cercado, chega antes e leva o cifrão junto.
 *
 * `$$` sozinho numa linha (ou abrindo e fechando a mesma linha) é bloco; `$$…$$` no meio de uma
 * frase é fórmula em destaque dentro do parágrafo, com o mesmo token.
 */

const CIFRAO = 0x24;
const BARRA = 0x5c;

/** Procura o `$` (ou `$$`) que fecha, pulando caractere escapado. -1 se não houver. */
function fechamento(texto: string, de: number, duplo: boolean, cruzaLinha: boolean): number {
  for (let i = de; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    if (c === BARRA) {
      i += 1;
      continue;
    }
    if (c === 0x0a && !cruzaLinha) return -1;
    if (c !== CIFRAO) continue;
    if (!duplo) return texto.charCodeAt(i + 1) === CIFRAO ? -1 : i;
    if (texto.charCodeAt(i + 1) === CIFRAO) return i;
  }
  return -1;
}

type EstadoInline = {
  src: string;
  pos: number;
  posMax: number;
  push: (tipo: string, tag: string, nesting: number) => { content: string; markup: string; block: boolean };
};

function formulaInline(state: EstadoInline, silencioso: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== CIFRAO) return false;
  const duplo = state.src.charCodeAt(state.pos + 1) === CIFRAO;
  const inicio = state.pos + (duplo ? 2 : 1);
  const fim = fechamento(state.src.slice(0, state.posMax), inicio, duplo, duplo);
  if (fim < 0) return false;
  const conteudo = state.src.slice(inicio, fim);
  if (conteudo.trim() === "") return false;
  if (!silencioso) {
    const token = state.push(duplo ? "formula_bloco" : "formula_inline", "math", 0);
    token.content = conteudo.trim();
    token.markup = duplo ? "$$" : "$";
    token.block = false;
  }
  state.pos = fim + (duplo ? 2 : 1);
  return true;
}

type EstadoBloco = {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  sCount: number[];
  blkIndent: number;
  line: number;
  push: (tipo: string, tag: string, nesting: number) => {
    content: string;
    markup: string;
    block: boolean;
    map: [number, number] | null;
  };
};

function formulaBloco(state: EstadoBloco, inicial: number, ultima: number, silencioso: boolean): boolean {
  if (state.sCount[inicial] - state.blkIndent >= 4) return false;
  const linha = (n: number) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]).trim();
  const primeira = linha(inicial);
  if (!primeira.startsWith("$$")) return false;

  let conteudo: string;
  let fim = inicial;
  const resto = primeira.slice(2);
  if (resto.endsWith("$$") && resto.length >= 2) {
    // `$$ … $$` numa linha só: tem de fechar no fim, senão é inline no meio de um parágrafo.
    const miolo = resto.slice(0, -2);
    if (fechamento(miolo, 0, true, false) >= 0) return false;
    conteudo = miolo;
  } else {
    const partes = [resto];
    let achou = false;
    for (let n = inicial + 1; n < ultima; n += 1) {
      const atual = linha(n);
      if (atual.endsWith("$$")) {
        partes.push(atual.slice(0, -2));
        fim = n;
        achou = true;
        break;
      }
      partes.push(atual);
    }
    if (!achou) return false;
    conteudo = partes.join("\n");
  }
  if (conteudo.trim() === "") return false;
  if (silencioso) return true;

  const token = state.push("formula_bloco", "math", 0);
  token.content = conteudo.trim();
  token.markup = "$$";
  token.block = true;
  token.map = [inicial, fim + 1];
  state.line = fim + 1;
  return true;
}

type Regras = {
  inline: { ruler: { after: (antes: string, nome: string, regra: never) => void } };
  block: { ruler: { before: (depois: string, nome: string, regra: never, opcoes: { alt: string[] }) => void } };
};

export function markdownItFormula<T>(md: T): T {
  const regras = md as unknown as Regras;
  regras.inline.ruler.after("escape", "formula_inline", formulaInline as never);
  regras.block.ruler.before("fence", "formula_bloco", formulaBloco as never, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  return md;
}

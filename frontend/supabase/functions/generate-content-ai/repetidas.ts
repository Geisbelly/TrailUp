/**
 * Barra pergunta repetida: a que o topico ja tem e a que a propria geracao
 * repetiu.
 *
 * O console manda no pedido os enunciados das questoes e as perguntas dos cards
 * que o topico ja tem (`existentes`). Eles vao para o prompt, para o modelo nao
 * os refazer, e servem de filtro na saida, porque o modelo nem sempre obedece.
 *
 * "Repetida" e o mesmo texto sem caixa, acento e pontuacao, ou, em perguntas de
 * 3 palavras ou mais, 75% das palavras de 3 letras ou mais em comum (Jaccard).
 * Isso pega "O que e normalizacao de dados?" x "O que e a normalizacao dos
 * dados?" e deixa passar "Qual a diferenca entre INNER JOIN e LEFT JOIN?" x
 * "Qual a diferenca entre LEFT JOIN e RIGHT JOIN?" (71%): perguntas diferentes
 * sobre o mesmo conceito nao sao repeticao.
 */

/** Teto do que vai ao prompt: o topico grande nao pode estourar o pedido. */
export const MAX_EXISTENTES = 150;
export const MAX_CHARS_POR_EXISTENTE = 300;
const LIMIAR_PARECIDO = 0.75;
const MIN_PALAVRAS = 3;

export function chaveDoTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function palavras(chave: string): Set<string> {
  return new Set(chave.split(" ").filter((palavra) => palavra.length >= 3));
}

export function parecidos(a: string, b: string): boolean {
  const ka = chaveDoTexto(a);
  const kb = chaveDoTexto(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const pa = palavras(ka);
  const pb = palavras(kb);
  if (pa.size < MIN_PALAVRAS || pb.size < MIN_PALAVRAS) return false;
  let comuns = 0;
  for (const palavra of pa) if (pb.has(palavra)) comuns += 1;
  return comuns / (pa.size + pb.size - comuns) >= LIMIAR_PARECIDO;
}

/** Lista de textos do pedido, limpa e com teto. Qualquer outra coisa vira lista vazia. */
export function textosExistentes(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const item of valor) {
    if (typeof item !== "string") continue;
    const texto = item.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_POR_EXISTENTE);
    const chave = chaveDoTexto(texto);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(texto);
    if (saida.length >= MAX_EXISTENTES) break;
  }
  return saida;
}

export type Existentes = { questoes: string[]; cards: string[] };

export function existentesDoPedido(valor: unknown): Existentes {
  const registro = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return { questoes: textosExistentes(registro.questoes), cards: textosExistentes(registro.cards) };
}

export type FiltroDeRepetidas = {
  /** true se o texto repete um existente ou um ja aceito nesta geracao. */
  repetida(texto: string): boolean;
  /** Marca o texto como aceito, para os seguintes nao o repetirem. */
  registrar(texto: string): void;
  /** repetida() e, se nao for, registrar(). Devolve true quando o item fica. */
  aceitar(texto: string): boolean;
};

export function criarFiltroDeRepetidas(existentes: string[]): FiltroDeRepetidas {
  const vistos = [...existentes];
  const filtro: FiltroDeRepetidas = {
    repetida: (texto) => vistos.some((visto) => parecidos(visto, texto)),
    registrar: (texto) => {
      vistos.push(texto);
    },
    aceitar: (texto) => {
      if (!chaveDoTexto(texto) || filtro.repetida(texto)) return false;
      filtro.registrar(texto);
      return true;
    },
  };
  return filtro;
}

/** Bloco do prompt com o que o topico ja tem. Vazio quando nao ha nada. */
export function blocoDosExistentes(existentes: Existentes): string {
  if (existentes.questoes.length === 0 && existentes.cards.length === 0) return "";
  const linhas = (itens: string[]) => itens.map((item) => `- ${item}`).join("\n");
  const partes = [
    "\nO TOPICO JA TEM ESTAS PERGUNTAS. Nao as repita nem as reescreva com outras palavras: pergunte outra coisa do material.",
  ];
  if (existentes.questoes.length > 0) partes.push(`Questoes que ja existem:\n${linhas(existentes.questoes)}`);
  if (existentes.cards.length > 0) partes.push(`Cards que ja existem (pergunta):\n${linhas(existentes.cards)}`);
  return `${partes.join("\n")}\n`;
}

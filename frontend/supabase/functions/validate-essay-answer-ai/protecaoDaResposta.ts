/**
 * O retorno da correção vai para o ALUNO, que pode tentar de novo (segunda chance). Ele não pode
 * trazer a resposta esperada do professor: copiada, o aluno a colaria na próxima tentativa (07/11).
 *
 * O prompt já proíbe; isto é a conferência depois, sem modelo: pega a cópia literal da resposta
 * esperada (inteira, ou `JANELA_PALAVRAS` palavras seguidas dela) dentro de feedback, pontos e
 * observação. O que o próprio aluno escreveu não conta: repetir a frase dele não revela nada.
 */

export const JANELA_PALAVRAS = 6;
/** Abaixo disto a resposta esperada ("sim", "1/4") cabe em qualquer frase: não dá para casar sozinha. */
export const MIN_CARACTERES = 12;

export const FEEDBACK_PROTEGIDO =
  "Sua resposta foi avaliada. Releia o enunciado e o conteúdo do tópico e confira se você explicou o conceito central com as suas palavras.";
export const PONTO_PROTEGIDO = "Revise o conceito central do tópico e explique com as suas palavras.";

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^0-9a-z/]+/g, " ")
    .trim();
}

/** Trechos da resposta esperada que podem vazar: ela inteira e cada janela de palavras seguidas. */
function trechosDaEsperada(esperada: string): string[] {
  const alvo = normalizar(esperada);
  if (!alvo) return [];
  const trechos: string[] = alvo.length >= MIN_CARACTERES ? [alvo] : [];
  const palavras = alvo.split(" ");
  for (let i = 0; i + JANELA_PALAVRAS <= palavras.length; i += 1) {
    trechos.push(palavras.slice(i, i + JANELA_PALAVRAS).join(" "));
  }
  return trechos;
}

export function revelaRespostaEsperada(texto: string, esperada: string, respostaAluno: string): boolean {
  const fala = ` ${normalizar(texto)} `;
  if (!fala.trim()) return false;
  const doAluno = ` ${normalizar(respostaAluno)} `;
  return trechosDaEsperada(esperada).some((trecho) => fala.includes(` ${trecho} `) && !doAluno.includes(` ${trecho} `));
}

export interface AvaliacaoParaOAluno {
  feedback: string;
  pontos_fortes: string[];
  pontos_melhoria: string[];
  observacao?: string;
  [chave: string]: unknown;
}

/**
 * Troca o que revelaria a resposta esperada por um texto neutro. A nota não muda: ela não diz a
 * resposta. Devolve quantos campos foram trocados (para o log, sem o texto).
 */
export function protegerAvaliacao<T extends AvaliacaoParaOAluno>(
  avaliacao: T,
  esperada: string,
  respostaAluno: string,
): { avaliacao: T; trocados: number } {
  if (!normalizar(esperada)) return { avaliacao, trocados: 0 };
  let trocados = 0;
  const revela = (texto: string) => revelaRespostaEsperada(texto, esperada, respostaAluno);

  const feedback = revela(avaliacao.feedback) ? (trocados++, FEEDBACK_PROTEGIDO) : avaliacao.feedback;
  const limpar = (lista: string[], substituto: string) => {
    const seguros = lista.filter((item) => !revela(item));
    trocados += lista.length - seguros.length;
    return seguros.length > 0 ? seguros : [substituto];
  };
  const pontos_fortes = limpar(avaliacao.pontos_fortes, "Você respondeu ao que o enunciado pede.");
  const pontos_melhoria = limpar(avaliacao.pontos_melhoria, PONTO_PROTEGIDO);

  const resultado: T = { ...avaliacao, feedback, pontos_fortes, pontos_melhoria };
  if (typeof avaliacao.observacao === "string" && revela(avaliacao.observacao)) {
    trocados += 1;
    delete resultado.observacao;
  }
  return { avaliacao: resultado, trocados };
}

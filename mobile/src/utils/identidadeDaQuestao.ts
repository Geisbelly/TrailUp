/**
 * O que a questão pede, dito antes de o aluno responder.
 *
 * Medido na base: **0 das 56 questões** têm `midia_url`. A coluna existe, o
 * console tem campo de upload e o mobile já renderiza bloco de mídia — o
 * caminho está inteiro e ninguém o usa. Ou seja, "pôr reforço visual" não é
 * ligar um recurso desligado: a tela da questão é texto puro, sempre, e
 * depender de o professor subir uma imagem por questão deixaria assim.
 *
 * O reforço que funciona sem pedir nada a ninguém é o do **formato**. Com sete
 * tipos — e três deles novos —, o aluno precisa saber se escolhe uma, marca
 * várias, liga pares ou ordena, e precisa saber isso **antes** de responder.
 * Errar por ter entendido o formato errado não mede conhecimento nenhum.
 *
 * Duas regras que este módulo respeita:
 *
 * 1. **Ícone nunca sozinho.** Ele acompanha um rótulo escrito; quem não
 *    reconhece o símbolo lê a palavra. Mesma disciplina do número do par em
 *    `QuestaoDeRelacao` — cor e forma são reforço, não a informação.
 * 2. **A instrução diz a AÇÃO, não o nome do tipo.** "Marque todas as
 *    corretas" é acionável; "múltipla resposta" é jargão de quem cadastrou.
 */

export type IdentidadeDaQuestao = {
  /** Nome curto do formato, para o selo. */
  rotulo: string;
  /** O que fazer, em imperativo. */
  instrucao: string;
  /** Nome do ícone em `Ionicons` — a família que `QuestionActivity` já usa.
   *  Trazer uma segunda família por causa do selo acrescentaria peso ao
   *  bundle para desenhar o mesmo conceito. */
  icone: string;
};

const POR_TIPO: Record<string, IdentidadeDaQuestao> = {
  multipla: {
    rotulo: "Escolha única",
    instrucao: "Escolha a alternativa correta.",
    icone: "radio-button-on-outline",
  },
  verdadeiro_falso: {
    rotulo: "Verdadeiro ou falso",
    instrucao: "A afirmação acima é verdadeira ou falsa?",
    icone: "checkmark-circle-outline",
  },
  fill_blank: {
    rotulo: "Complete",
    instrucao: "Escreva o que falta na lacuna.",
    icone: "create-outline",
  },
  dissertativa: {
    rotulo: "Resposta escrita",
    instrucao: "Escreva sua resposta com suas palavras.",
    icone: "document-text-outline",
  },
  multipla_resposta: {
    rotulo: "Marque todas",
    instrucao: "Marque TODAS as alternativas corretas — pode ser mais de uma.",
    icone: "checkbox-outline",
  },
  associacao: {
    rotulo: "Ligar termos",
    instrucao: "Ligue cada termo à definição que combina com ele.",
    icone: "git-compare-outline",
  },
  ordenacao: {
    rotulo: "Colocar em ordem",
    instrucao: "Coloque os itens na ordem correta.",
    icone: "swap-vertical-outline",
  },
};

/** Apelidos que o banco, a API e o microservice usam para os mesmos tipos. */
const APELIDOS: Record<string, string> = {
  quiz: "multipla",
  escolha_unica: "multipla",
  true_false: "verdadeiro_falso",
  vf: "verdadeiro_falso",
  lacuna: "fill_blank",
  completar: "fill_blank",
  essay: "dissertativa",
  questao: "dissertativa",
  texto: "dissertativa",
  multiple_response: "multipla_resposta",
  multi_select: "multipla_resposta",
  ligar_termos: "associacao",
  matching: "associacao",
  ordering: "ordenacao",
  sequencia: "ordenacao",
};

function semAcento(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c");
}

/**
 * A identidade do tipo, ou `null` quando não dá para reconhecê-lo.
 *
 * `null` não é falha a esconder: um selo dizendo o formato errado é pior que
 * selo nenhum, porque o aluno confia nele e responde no formato que leu.
 */
export function identidadeDaQuestao(
  tipo: unknown,
  tipoDaAtividade?: unknown
): IdentidadeDaQuestao | null {
  for (const candidato of [tipo, tipoDaAtividade]) {
    const chave = semAcento(candidato);
    if (!chave) continue;
    const alvo = POR_TIPO[chave] ?? POR_TIPO[APELIDOS[chave] ?? ""];
    if (alvo) return alvo;
  }
  return null;
}

/**
 * "Questão 3 de 8" — a posição dentro da atividade.
 *
 * Devolve `null` para atividade de uma questão só: "Questão 1 de 1" ocupa
 * espaço para não dizer nada.
 */
export function posicaoNaAtividade(indice: number, total: number): string | null {
  if (!Number.isInteger(indice) || !Number.isInteger(total)) return null;
  if (total <= 1 || indice < 0 || indice >= total) return null;
  return `Questão ${indice + 1} de ${total}`;
}

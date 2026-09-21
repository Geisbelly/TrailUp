/**
 * Os três formatos que pedem raciocínio de RELAÇÃO.
 *
 * `associacao` (ligar termo a definição), `ordenacao` (pôr em ordem) e
 * `multipla_resposta` (marcar todas as certas). Entraram na `20260921_04`.
 *
 * Esta camada é pura de propósito: `QuestionActivity` importa `react-native` e
 * não carrega no harness do node, e a regra que decide **o que conta como
 * resposta** não pode ficar sem teste — foi assim que `perfilDoMaterial.ts` e
 * `acumuladorLote.ts` saíram de dentro dos seus consumidores.
 *
 * **A resposta viaja como JSON, não como texto separado.** Separador quebra na
 * alternativa que contém o separador, e não existe caractere seguro: uma opção
 * legítima pode ter `|`, `;` ou `,`. O banco aceita a barra como reserva (para
 * cliente antigo), mas quem escreve hoje escreve JSON.
 */

export type FormatoDeRelacao = "associacao" | "ordenacao" | "multipla_resposta";

const FORMATOS: Record<string, FormatoDeRelacao> = {
  associacao: "associacao",
  associacao_termos: "associacao",
  ligar_termos: "associacao",
  matching: "associacao",
  ordenacao: "ordenacao",
  ordering: "ordenacao",
  sequencia: "ordenacao",
  multipla_resposta: "multipla_resposta",
  multiple_response: "multipla_resposta",
  multi_select: "multipla_resposta",
};

/** Sem acento e sem caixa, como `fn_texto_comparavel` faz do lado do banco. */
function chave(valor: unknown): string {
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

/** Devolve o formato de relação, ou `null` para os quatro antigos. */
export function formatoDeRelacao(tipo: unknown): FormatoDeRelacao | null {
  return FORMATOS[chave(tipo)] ?? null;
}

export type ParesDaAssociacao = { termos: string[]; definicoes: string[] };

/**
 * As duas listas de uma associação.
 *
 * Elas chegam **soltas**: o pareamento mora em `questao_gabarito` e o aluno não
 * o recebe. Ler isto esperando pares seria ler um vazamento que não existe.
 */
export function listasDaAssociacao(alternativas: unknown): ParesDaAssociacao {
  const fonte =
    alternativas && typeof alternativas === "object" && !Array.isArray(alternativas)
      ? (alternativas as Record<string, unknown>)
      : {};
  const lista = (valor: unknown): string[] =>
    Array.isArray(valor)
      ? valor.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  return {
    termos: lista(fonte.termos ?? fonte.esquerda ?? fonte.chaves),
    definicoes: lista(fonte.definicoes ?? fonte.direita ?? fonte.valores),
  };
}

/** Itens de `ordenacao` / `multipla_resposta`: array simples de texto. */
export function itensDaLista(alternativas: unknown): string[] {
  return Array.isArray(alternativas)
    ? alternativas.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

/**
 * O que o aluno manda para `questao_responder`.
 *
 * Associação vai como lista de pares `[[termo, definicao], ...]`; os outros
 * dois como lista de textos. A ORDEM só importa em `ordenacao` — o banco
 * compara sequência lá e conjunto nos outros dois —, mas mandamos sempre na
 * ordem em que o aluno montou, porque é ela que a tela exibe de volta.
 */
export function respostaParaOServidor(
  formato: FormatoDeRelacao,
  escolha: string[] | Array<[string, string]>
): string {
  return JSON.stringify(escolha);
}

/**
 * Pode confirmar?
 *
 * Resposta incompleta é recusada **aqui**, não pelo servidor. O banco devolve
 * `false` para conjunto de tamanho diferente, então mandar um par faltando
 * gastaria uma tentativa do aluno num erro que a tela sabia prever.
 */
export function respostaCompleta(params: {
  formato: FormatoDeRelacao;
  totalDeItens: number;
  escolhidos: number;
}): boolean {
  const { formato, totalDeItens, escolhidos } = params;
  if (totalDeItens <= 0) return false;
  if (formato === "multipla_resposta") {
    // Aqui não dá para exigir o total: o aluno não sabe quantas são certas, e
    // exigir todas entregaria a contagem do gabarito. Basta ter marcado algo.
    return escolhidos > 0;
  }
  // Associação e ordenação só fazem sentido completas.
  return escolhidos === totalDeItens;
}

/**
 * Liga (ou desliga) um par, mantendo a relação 1:1.
 *
 * Um termo tem uma definição e uma definição tem um termo. Sem remover os
 * vínculos antigos dos DOIS lados, o aluno encostaria a mesma definição em dois
 * termos e a resposta teria mais pares que itens — que o banco reprova por
 * cardinalidade, com o aluno sem entender por quê.
 */
export function ligarPar(
  pares: Array<[string, string]>,
  termo: string,
  definicao: string
): Array<[string, string]> {
  const jaLigado = pares.some(([t, d]) => t === termo && d === definicao);
  const semConflito = pares.filter(([t, d]) => t !== termo && d !== definicao);
  return jaLigado ? semConflito : [...semConflito, [termo, definicao]];
}

/** Move um item de `ordenacao` uma casa para cima ou para baixo. */
export function moverItem(itens: string[], de: number, direcao: -1 | 1): string[] {
  const para = de + direcao;
  if (de < 0 || de >= itens.length || para < 0 || para >= itens.length) return itens;
  const copia = [...itens];
  [copia[de], copia[para]] = [copia[para], copia[de]];
  return copia;
}

/** Marca/desmarca uma opção de `multipla_resposta`, preservando a ordem. */
export function alternarSelecao(selecionadas: string[], opcao: string): string[] {
  return selecionadas.includes(opcao)
    ? selecionadas.filter((item) => item !== opcao)
    : [...selecionadas, opcao];
}

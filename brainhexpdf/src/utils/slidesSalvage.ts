// Recupera os slides COMPLETOS de uma resposta que veio cortada.
//
// `slideBatchPlanner` parte do princípio de que "quando a resposta trunca, o
// único caminho que muda o resultado é pedir MENOS slides". Isso vale enquanto o
// truncamento for um problema de volume — e o log de produção de 2026-09-28
// mostra que não é sempre:
//
//   [Batch 7-7] resposta truncada: Unterminated string in JSON
//               at position 163073 (line 26 column 160638) — bloco descartado
//
// Um bloco de UM slide truncando, e o corte na **coluna 160638 de uma única
// linha**: o modelo entrou em repetição dentro de um só campo de texto e gastou
// os 32768 tokens de saída ali. `splitBatch` devolve null para count=1, então
// esse slide é descartado e nunca volta — o deck sai com furo.
//
// Mas o texto truncado não é lixo: tudo o que veio ANTES do corte é JSON válido.
// Num bloco de 4 slides que trunca no terceiro, os dois primeiros estão
// fechados e íntegros no buffer. Hoje o `JSON.parse` estoura e os dois vão para
// o lixo junto com o resto — e o bloco é re-pedido inteiro, pagando de novo os
// ~78k tokens de ENTRADA que este código todo existe para evitar.
//
// Esta função varre o array "slides" do texto cru e devolve só os elementos que
// fecharam. Não conserta JSON, não completa campo pela metade, não adivinha:
// elemento incompleto fica de fora.

/**
 * Elementos completos do array `slides` presentes num JSON possivelmente
 * truncado. Devolve `[]` quando não há nada aproveitável — nunca lança.
 */
export function salvarSlidesCompletos(texto: string): unknown[] {
  const inicioDoArray = encontrarInicioDoArrayDeSlides(texto);
  if (inicioDoArray < 0) return [];

  const completos: unknown[] = [];
  let profundidade = 0;
  let inicioDoElemento = -1;
  let dentroDeString = false;
  let escapado = false;

  for (let i = inicioDoArray + 1; i < texto.length; i += 1) {
    const c = texto[i];

    if (dentroDeString) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') dentroDeString = false;
      continue;
    }

    if (c === '"') {
      dentroDeString = true;
      continue;
    }

    if (c === "{" || c === "[") {
      if (profundidade === 0) inicioDoElemento = i;
      profundidade += 1;
      continue;
    }

    if (c === "}" || c === "]") {
      // `]` com profundidade 0 é o fim do próprio array de slides: o que vinha
      // depois dele (outras chaves do deck) não interessa aqui.
      if (profundidade === 0) break;

      profundidade -= 1;
      if (profundidade === 0 && inicioDoElemento >= 0) {
        const bruto = texto.slice(inicioDoElemento, i + 1);
        const elemento = converterOuDescartar(bruto);
        if (elemento !== undefined) completos.push(elemento);
        inicioDoElemento = -1;
      }
      continue;
    }
  }

  return completos;
}

/**
 * Posição do `[` que abre o array `slides`, ou -1.
 *
 * A busca ignora ocorrências dentro de strings porque o prompt e o próprio
 * conteúdo do slide podem conter a palavra — um `"slides"` citado num parágrafo
 * não abre array nenhum.
 */
function encontrarInicioDoArrayDeSlides(texto: string): number {
  const CHAVE = '"slides"';
  let dentroDeString = false;
  let escapado = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];

    if (dentroDeString) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') dentroDeString = false;
      continue;
    }

    if (c !== '"') continue;

    if (texto.startsWith(CHAVE, i)) {
      const abertura = pularAteAberturaDoArray(texto, i + CHAVE.length);
      if (abertura >= 0) return abertura;
      // Era a chave, mas não vinha array depois (texto cortado exatamente aqui).
      return -1;
    }

    dentroDeString = true;
  }

  return -1;
}

/** Aceita apenas `:` e espaços entre a chave e o `[`. */
function pularAteAberturaDoArray(texto: string, desde: number): number {
  let viuDoisPontos = false;

  for (let i = desde; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === ":" && !viuDoisPontos) {
      viuDoisPontos = true;
      continue;
    }
    if (c === " " || c === "\n" || c === "\r" || c === "\t") continue;
    if (c === "[" && viuDoisPontos) return i;
    return -1;
  }

  return -1;
}

/** `undefined` para qualquer coisa que não seja um objeto de slide utilizável. */
function converterOuDescartar(bruto: string): unknown | undefined {
  try {
    const valor = JSON.parse(bruto);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
    return valor;
  } catch {
    return undefined;
  }
}

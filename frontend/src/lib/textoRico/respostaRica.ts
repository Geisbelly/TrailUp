/**
 * Resposta de múltipla escolha em questão rica (spec A, `20261108_03`).
 *
 * O app novo grava a **letra** da alternativa em `questao_aluno.resposta`, não o texto: o banco
 * resolve a letra pela posição em `questoes.alternativas` (`fn_questao_posicao_rica`), porque
 * `\ce{CO}` e `\ce{Co}` empatam na comparação de texto. O app 1.0.x continua gravando o texto. O
 * console mostra a alternativa nos dois casos.
 *
 * Igual a `mobile/src/utils/textoRico/respostaRica.ts`.
 */

export function letraDaAlternativa(indice: number): string {
  return String.fromCharCode(65 + indice);
}

/**
 * O texto da alternativa a mostrar para uma resposta gravada. Texto exato vence (é o que o app
 * antigo gravou); depois, letra dentro da lista. Fora disso, a resposta como veio.
 */
export function alternativaDaResposta(resposta: unknown, alternativas: unknown[]): string | null {
  if (resposta == null) return null;
  const valor = String(resposta).trim();
  if (valor === "") return null;
  const textos = alternativas.map((alt) => String(alt ?? ""));
  const exata = textos.find((alt) => alt.trim() === valor);
  if (exata !== undefined) return exata;
  if (/^[A-Za-z]$/.test(valor)) {
    const indice = valor.toUpperCase().charCodeAt(0) - 65;
    if (indice < textos.length) return textos[indice];
  }
  return valor;
}

/** Alternativas iguais depois de `trim`: na questão rica, a posição passa a ser a única diferença. */
export function alternativasRepetidas(alternativas: string[]): string[] {
  const vistas = new Map<string, number>();
  for (const alt of alternativas) {
    const chave = alt.trim();
    if (chave === "") continue;
    vistas.set(chave, (vistas.get(chave) ?? 0) + 1);
  }
  return [...vistas].filter(([, n]) => n > 1).map(([alt]) => alt);
}

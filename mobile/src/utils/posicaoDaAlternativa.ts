/**
 * A posição de uma resposta (ou do gabarito) entre as alternativas: o texto primeiro, depois a
 * letra (A, B, C...) e por último o índice. Letra e índice só valem quando nenhuma alternativa tem
 * aquele texto: com uma alternativa chamada "B", "B" é ela, e não a 2ª alternativa.
 *
 * É a regra de `fn_questao_posicao_simples` no banco (`20261124_08`). Antes, o app testava texto,
 * índice e letra ao mesmo tempo em cada alternativa, e o gabarito "B" dava como certa a "A e B".
 * Devolve -1 quando nada casa.
 */
export function posicaoDaAlternativa(alternativas: readonly unknown[], valor: unknown): number {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const alvo = norm(valor);
  if (!alvo || alternativas.length === 0) return -1;

  const porTexto = alternativas.findIndex((alt) => norm(alt) !== '' && norm(alt) === alvo);
  if (porTexto >= 0) return porTexto;

  if (/^[a-z]$/.test(alvo)) {
    const pos = alvo.charCodeAt(0) - 97;
    return pos < alternativas.length ? pos : -1;
  }
  if (/^[0-9]{1,4}$/.test(alvo)) {
    const pos = Number(alvo);
    return pos < alternativas.length ? pos : -1;
  }
  return -1;
}

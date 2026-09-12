// Executa tarefas com um teto de simultaneidade.
//
// Existe por causa do prefetch de material personalizado, que era um `for`
// com `await` dentro: 12 arquivos baixados um de cada vez. Como cada arquivo
// paga o gateway `storage-redirect` (~800ms so' para receber o 302) antes do
// download em si (~470ms), o aluno esperava ~15s olhando "Preparando seu
// modulo..." antes do primeiro material aparecer.
//
// Por que teto, e nao `Promise.all` nos 12 de uma vez: numa rede de celular a
// banda e' compartilhada, e disparar tudo junto atrasa TODOS os arquivos em vez
// de entregar os primeiros logo. O gateway tambem responde 429 sob rajada
// sustentada. Com teto, os primeiros materiais chegam cedo e a fila anda.
//
// Modulo puro (sem import de react-native/expo) para rodar no
// `node --import tsx --test`, como `storageOrigin.ts` e `apiBaseUrl.core.ts`.

/**
 * Roda `tarefa` sobre cada item, com no maximo `limite` execucoes ao mesmo
 * tempo. Resolve quando todas terminam.
 *
 * Erro de um item NAO derruba os outros: o laco serial tratava cada material
 * com `try/catch` proprio, e perder um audio nunca impediu o resto de baixar.
 * Manter isso e' o ponto principal de nao usar `Promise.all` cru, que rejeita
 * no primeiro erro e deixa o restante sem espera.
 */
export async function executarComConcorrencia<T>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<unknown>,
  aoFalhar?: (erro: unknown, item: T, indice: number) => void,
): Promise<void> {
  if (itens.length === 0) return;

  // `limite` invalido (0, negativo, NaN) viraria um pool sem nenhum worker, que
  // resolveria na hora sem processar nada -- silenciosamente pior que serial.
  const teto = Math.max(1, Math.min(Math.floor(limite) || 1, itens.length));

  let proximo = 0;

  async function worker() {
    while (true) {
      const indice = proximo;
      proximo += 1;
      if (indice >= itens.length) return;

      const item = itens[indice];
      try {
        await tarefa(item, indice);
      } catch (erro) {
        aoFalhar?.(erro, item, indice);
      }
    }
  }

  await Promise.all(Array.from({ length: teto }, () => worker()));
}

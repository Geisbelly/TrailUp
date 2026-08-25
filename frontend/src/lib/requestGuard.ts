// Coordena requisições assíncronas concorrentes por um token incremental.
// Cada `next()` invalida o `isCurrent()` de todas as chamadas anteriores —
// útil para descartar respostas de uma requisição obsoleta (ex.: usuário
// trocou de seleção antes da anterior responder) sem depender de uma flag
// de cleanup checada só depois do `await`, que não impede os setters do
// próprio corpo assíncrono de rodarem antes dela ser lida.

export interface RequestToken {
  isCurrent(): boolean;
}

export interface RequestGuard {
  next(): RequestToken;
}

export function createRequestGuard(): RequestGuard {
  let currentToken = 0;

  function next(): RequestToken {
    currentToken += 1;
    const token = currentToken;
    return { isCurrent: () => currentToken === token };
  }

  return { next };
}

/**
 * UUID v4, com reserva para ambiente sem `crypto.randomUUID`.
 *
 * `crypto.randomUUID` não existe em todo runtime React Native -- depende da
 * versão do Hermes e do polyfill que o Expo injeta --, então a reserva não é
 * zelo: sem ela, gerar id quebraria em aparelho real enquanto funcionaria no
 * simulador.
 *
 * Esta função vivia copiada em `telemetriaApi` e em `MetricasContext`, e o
 * terceiro uso (a chave de idempotência do evento de pontos) seria a terceira
 * cópia. Duas cópias de uma regra já divergem; três é questão de tempo.
 *
 * A reserva usa `Math.random`, que NÃO é criptográfica -- e não precisa ser.
 * O id aqui serve para identificar uma tentativa de escrita e correlacionar
 * telemetria, não para segredo: colisão é o risco a evitar, e 122 bits
 * aleatórios resolvem isso com folga.
 */
export function gerarUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

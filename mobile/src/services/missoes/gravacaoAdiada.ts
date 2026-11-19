/**
 * Gravação que espera a digitação parar, e que pode ser descarregada na hora.
 *
 * É o rascunho do desafio: cada letra reagenda a gravação, e só o último valor vai ao aparelho.
 * Sair da tela antes da espera (`descarregar`) grava o pendente em vez de perdê-lo; o acerto
 * (`cancelar`) o descarta, para a gravação adiada não recriar o rascunho que o banco mandou apagar.
 *
 * Sem React de propósito, para rodar no `node --test`.
 */
export type GravacaoAdiada<T> = {
  /** Troca o pendente por `valor` e recomeça a espera. */
  agendar: (valor: T) => void;
  /** Grava o pendente agora, se houver. */
  descarregar: () => void;
  /** Descarta o pendente sem gravar. */
  cancelar: () => void;
};

export function criarGravacaoAdiada<T>(gravar: (valor: T) => void, esperaMs: number): GravacaoAdiada<T> {
  let pendente: { valor: T } | null = null;
  let relogio: ReturnType<typeof setTimeout> | null = null;

  const parar = () => {
    if (relogio) clearTimeout(relogio);
    relogio = null;
  };

  const descarregar = () => {
    parar();
    const p = pendente;
    pendente = null;
    if (p) gravar(p.valor);
  };

  return {
    agendar(valor) {
      parar();
      pendente = { valor };
      relogio = setTimeout(descarregar, esperaMs);
    },
    descarregar,
    cancelar() {
      parar();
      pendente = null;
    },
  };
}

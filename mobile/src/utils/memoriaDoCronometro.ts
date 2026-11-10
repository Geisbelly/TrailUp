/**
 * Quanto do cronômetro de cada escopo já foi gasto, enquanto o app está aberto.
 *
 * O `IAHeaderTimer` guardava a contagem só no estado do componente: sair da atividade (outro
 * bloco, outra tela) zerava o chip, e voltar recomeçava da duração cheia. Guardar o **gasto**, e não
 * o que falta, deixa o tempo comprado na loja (`minutos_extras`) somar sem apagar o que já correu.
 *
 * Isto vale quando não há tentativa do servidor (atividade personalizada, banco sem a migration ou
 * sem rede). Com ela, quem manda é o relógio do banco (`segundosRestantes`), que também pausa.
 */

export type MemoriaDoCronometro = {
  /** O que falta no escopo, para uma duração. Escopo novo começa cheio. */
  restante(chave: string, duracaoSeg: number): number;
  /** Registra o que falta agora. */
  guardar(chave: string, duracaoSeg: number, restanteSeg: number): void;
  esquecer(chave: string): void;
};

export function criarMemoriaDoCronometro(limite = 200): MemoriaDoCronometro {
  const gasto = new Map<string, number>();
  return {
    restante(chave, duracaoSeg) {
      return Math.max(0, duracaoSeg - (gasto.get(chave) ?? 0));
    },
    guardar(chave, duracaoSeg, restanteSeg) {
      gasto.delete(chave); // reinsere no fim: o mais antigo sai primeiro
      gasto.set(chave, Math.max(0, duracaoSeg - restanteSeg));
      while (gasto.size > limite) gasto.delete(gasto.keys().next().value as string);
    },
    esquecer(chave) {
      gasto.delete(chave);
    },
  };
}

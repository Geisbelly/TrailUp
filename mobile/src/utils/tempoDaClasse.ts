/**
 * Qual fonte manda no tempo de estudo da classe.
 *
 * O banco manda -- a mesma regra que o percentual já segue em
 * `buildClasseResumoFallback`. `classe_aluno."tempoGastoMin"` é a soma de
 * `topico_aluno.tempo_gasto_min`, derivada da telemetria por gatilho
 * (`20260910_03`, `20260910_09`), e é o número que o rank "Tempo de Estudo" lê.
 *
 * A conta local divergia por **dupla contagem**. Ela fazia
 * `max(soma dos tópicos, soma de conteúdos + soma de atividades)`, e o
 * `CLAUDE.md` registra que os escopos da telemetria são **inclusivos**: o
 * escopo `topic` já conta o mesmo intervalo que `content` e `activity`. Somar
 * conteúdo com atividade multiplica o tempo, e o `max` então escolhia o número
 * inflado sempre que o aluno fez as duas coisas no mesmo tópico -- o caso
 * normal.
 *
 * Medido em produção, classe 32:
 *
 * | fonte                                  | valor  |
 * |----------------------------------------|--------|
 * | soma dos tópicos (= banco = rank)      | 2,26   |
 * | soma de conteúdos                      | 2,30   |
 * | soma de atividades                     | 0,59   |
 * | conteúdos + atividades (o que a tela mostrava) | **2,89** |
 *
 * O `max` local continua existindo como reserva, e a razão dele é legítima: se
 * a escrita em `topico_aluno` falhar, o tempo do tópico fica em zero enquanto
 * os itens têm tempo gravado. Mas isso é reserva, não preferência -- e a ordem
 * estava invertida, como já estava no percentual antes de ser corrigido.
 */

export interface EntradaTempoDaClasse {
  /** `classe_aluno."tempoGastoMin"`, vindo de `vw_aluno_classe_resumo`. */
  doBanco?: number | null;
  /** `academicMetrics.tempoTotalMin` -- a conta local sobre a árvore do cliente. */
  academicoMin: number;
  /** `unificado.tempoMin` -- inclui o progresso personalizado. */
  unificadoMin: number;
  /** A classe tem tópicos/conteúdos/atividades carregados. */
  temEstrutura: boolean;
}

function naoNegativo(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Zero do banco é resposta, não ausência: só `null`/`undefined` cai na reserva. */
function doBancoOuNulo(valor?: number | null): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

export function escolherTempoDaClasse(entrada: EntradaTempoDaClasse): number {
  const banco = doBancoOuNulo(entrada.doBanco);
  if (banco != null) return banco;

  // Reserva: sem número do banco, o máximo local evita que uma escrita falha em
  // `topico_aluno` zere um total que os itens comprovam.
  if (entrada.temEstrutura) {
    return Math.max(naoNegativo(entrada.academicoMin), naoNegativo(entrada.unificadoMin));
  }
  return naoNegativo(entrada.unificadoMin);
}

export interface EntradaTempoMedio {
  doBanco?: number | null;
  localMin: number;
  temAtividades: boolean;
}

/**
 * Média por atividade. Mesma ordem: banco primeiro.
 *
 * Aqui a divergência era menor em minutos e maior em percepção -- a média da
 * classe 32 é 0,06 min, e a tela mostrava "0 min" até `utils/tempoDeEstudo`
 * passar a escrever segundos.
 */
export function escolherTempoMedio(entrada: EntradaTempoMedio): number {
  const banco = doBancoOuNulo(entrada.doBanco);
  if (banco != null) return banco;
  return entrada.temAtividades ? naoNegativo(entrada.localMin) : 0;
}

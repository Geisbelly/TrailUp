// Sinais de risco do aluno, só para o professor (spec de métricas, §6.2 e §7).
//
// Até a F5 o risco somava uma "taxa de abandono" (tópicos não concluídos ÷ tópicos com linha) que
// marcava "crítico" o aluno no meio da trilha, e dois sinais quaisquer viravam "crítico". Agora são
// os três construtos da spec, cada um com fato e data, calculados no banco
// (vw_metricas_engajamento_aluno_classe, migration 20261031_05):
//   - inatividade: 7 dias ou mais sem estudar;
//   - evasão: 30 dias ou mais sem estudar (o mais grave; não repete a inatividade);
//   - estagnação: 14 dias sem avançar num tópico, abaixo da mediana da turma nele.
// "Sem dado" (recusou telemetria, modo restrito, nunca estudou) NÃO é sinal. A nota baixa continua
// como sinal à parte: acerto e nota ficam como estão até a F4b. Nenhum sinal soma com outro para
// virar "crítico": há um nível só, "atenção", até um modelo ser validado (F6).

export const NOTA_MINIMA = 5;
export const DIAS_INATIVO = 7;
export const DIAS_ESTAGNADO = 14;
export const DIAS_EVADIDO = 30;

export type NivelDeRisco = "atencao";
export type Criterio = "inatividade" | "evasao" | "estagnacao" | "nota";
export type Fator = { criterio: Criterio; motivo: string; comparacao: string | null };
export type Risco = { nivel: NivelDeRisco; fatores: Fator[] };

/** O que o banco diz do aluno na turma (datas ISO); null = a view não trouxe linha. */
export type SinaisDoBanco = {
  semDado: boolean;
  ultimaAtividadeEm: string | null;
  inativoDesde: string | null;
  evadidoDesde: string | null;
  estagnadoDesde: string | null;
  estagnadoTopico: string | null;
};

const DIA_MS = 86_400_000;
const inicioDoDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
export const diasDesde = (iso: string, hoje: Date) =>
  Math.max(0, Math.floor((inicioDoDia(hoje) - inicioDoDia(new Date(iso))) / DIA_MS));
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export type EntradaDeRisco = { sinais: SinaisDoBanco | null; nota: number | null };
export type ReferenciaDaTurma = { notaMedia: number | null };

export function avaliarRisco(e: EntradaDeRisco, turma: ReferenciaDaTurma, hoje: Date): Risco | null {
  const fatores: Fator[] = [];
  const s = e.sinais;
  if (s && !s.semDado) {
    if (s.evadidoDesde) {
      fatores.push({
        criterio: "evasao",
        motivo: `Sem estudar há ${diasDesde(s.evadidoDesde, hoje)} dias`,
        comparacao: `última atividade em ${dataCurta(s.evadidoDesde)}`,
      });
    } else if (s.inativoDesde) {
      fatores.push({
        criterio: "inatividade",
        motivo: `${diasDesde(s.inativoDesde, hoje)} dias sem estudar`,
        comparacao: `última atividade em ${dataCurta(s.inativoDesde)}`,
      });
    }
    if (s.estagnadoDesde) {
      const onde = s.estagnadoTopico ? `em ${s.estagnadoTopico}` : "num tópico";
      fatores.push({
        criterio: "estagnacao",
        motivo: `Parado ${onde} há ${diasDesde(s.estagnadoDesde, hoje)} dias`,
        comparacao: "abaixo da mediana da turma nesse tópico",
      });
    }
  }
  if (e.nota !== null && e.nota < NOTA_MINIMA) {
    fatores.push({
      criterio: "nota",
      motivo: `Nota ${e.nota.toFixed(1)}, abaixo de ${NOTA_MINIMA.toFixed(1)}`,
      comparacao: turma.notaMedia === null ? null : `turma: ${turma.notaMedia.toFixed(1)}`,
    });
  }
  return fatores.length === 0 ? null : { nivel: "atencao", fatores };
}

/** Texto do critério da lista "Precisam de atenção". */
export function descricaoDosCriterios(): string {
  return (
    `Critério: ${DIAS_INATIVO} dias sem estudar, ${DIAS_ESTAGNADO} dias parado num tópico abaixo da mediana ` +
    `ou nota abaixo de ${NOTA_MINIMA.toFixed(1)}. Sem dado não conta.`
  );
}

/** Nota que conta para o risco: null quando o aluno ainda não tem nota de verdade. */
export function notaParaRisco(nota: number | null, progressoPct: number): number | null {
  if (nota === null) return null;
  // classe_aluno grava 0 antes de qualquer atividade corrigida; sem progresso
  // nenhum, 0 é "sem nota", não reprovação.
  if (nota === 0 && progressoPct === 0) return null;
  return nota;
}

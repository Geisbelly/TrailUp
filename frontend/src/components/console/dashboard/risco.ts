// Sinais de risco do aluno, só para o professor.
//
// CRÍTICO = faixa "alto" do modelo de evasão do core-trailup (trailup_risco_evasao, migration
// 20261031_08): risco de abandonar nas próximas 4 semanas entre os 10% mais altos. A faixa
// "atencao" do modelo é Atenção. O modelo só decide quando o aluno tem atividade avaliável ao
// alcance (20261101_09: com questões ou pontuação, num tópico iniciado ou com prazo vencido, ou já
// tem nota) e não está numa semana sem evento e sem pendência (20261101_02); fora disso o banco
// decide a faixa pela inatividade (30 dias = alto, 7 = atenção). A taxa antiga (tópicos não concluídos ÷ tópicos com linha) marcava
// "crítico" o aluno no meio da trilha e saiu da conta; o rótulo continua.
//
// Ao lado do modelo, como Atenção, os fatos com data (vw_metricas_engajamento_aluno_classe, 20261031_05):
//   - inatividade: 7 dias ou mais sem estudar;
//   - evasão: 30 dias ou mais sem estudar (não repete a inatividade);
//   - estagnação: 14 dias sem avançar num tópico, abaixo da mediana da turma nele;
//   - nota abaixo de 5,0.
// "Sem dado" (recusou telemetria, modo restrito, nunca estudou) NÃO é sinal. Nenhum fato soma com
// outro para virar crítico: só o modelo marca crítico.

export const NOTA_MINIMA = 5;
export const DIAS_INATIVO = 7;
export const DIAS_ESTAGNADO = 14;
export const DIAS_EVADIDO = 30;

export type NivelDeRisco = "critico" | "atencao";
export type Criterio = "abandono" | "inatividade" | "evasao" | "estagnacao" | "nota";
export type FaixaDoRisco = "alto" | "atencao" | "normal";

/** A faixa que o banco devolve; "sem dados", vazio ou desconhecido = null (sem dado, não "normal"). */
export function faixaDoRisco(valor: string | null | undefined): FaixaDoRisco | null {
  return valor === "alto" || valor === "atencao" || valor === "normal" ? valor : null;
}
/**
 * O que pesou na faixa do modelo de evasão (20261110_01): a entrada que mais subiu o risco, em
 * rótulo. Nunca o score (#195). null = a faixa não veio do modelo, ou nenhuma entrada se destacou.
 */
export type MotivoDoModelo = "entregas_perdidas" | "uso_caiu" | "entrega_atrasada" | "sem_nota" | "nota_baixa";
const MOTIVOS_DO_MODELO: readonly MotivoDoModelo[] = ["entregas_perdidas", "uso_caiu", "entrega_atrasada", "sem_nota", "nota_baixa"];

export function motivoDoModelo(valor: string | null | undefined): MotivoDoModelo | null {
  return MOTIVOS_DO_MODELO.includes(valor as MotivoDoModelo) ? (valor as MotivoDoModelo) : null;
}

/** Como o professor lê cada motivo, depois de "pesou: ". */
export const TEXTO_DO_MOTIVO: Record<MotivoDoModelo, string> = {
  entregas_perdidas: "atividades vencidas sem entrega",
  uso_caiu: "uso do app caiu nesta semana",
  entrega_atrasada: "entregas feitas com atraso",
  sem_nota: "ainda sem nota",
  nota_baixa: "nota baixa",
};

/**
 * Um sinal do aluno. `dias`, `topico` e `motivoDoModelo` são o fato por trás do texto, para a
 * sugestão do que fazer citar o mesmo fato (sugestaoDoRisco.ts).
 */
export type Fator = {
  criterio: Criterio;
  motivo: string;
  comparacao: string | null;
  dias?: number;
  topico?: string | null;
  motivoDoModelo?: MotivoDoModelo | null;
};
export type Risco = { nivel: NivelDeRisco; fatores: Fator[] };

/** O que o banco diz do aluno na turma (datas ISO); null = a view não trouxe linha. */
export type SinaisDoBanco = {
  semDado: boolean;
  ultimaAtividadeEm: string | null;
  inativoDesde: string | null;
  evadidoDesde: string | null;
  estagnadoDesde: string | null;
  estagnadoTopico: string | null;
  /** Faixa do modelo de evasão do core; null = sem dado. */
  riscoFaixa: FaixaDoRisco | null;
  /**
   * Quem decidiu a faixa: o modelo (semana com evento, o domínio em que ele foi medido) ou a regra
   * de inatividade (semana sem evento; 30 dias = alto, 7 = atenção). null = sem dado.
   */
  riscoOrigem: "modelo" | "inatividade" | null;
  /** O que pesou na faixa do modelo (20261110_01); null = sem rótulo ou banco sem a migration. */
  riscoMotivo?: MotivoDoModelo | null;
};

const DIA_MS = 86_400_000;
const inicioDoDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
export const diasDesde = (iso: string, hoje: Date) =>
  Math.max(0, Math.floor((inicioDoDia(hoje) - inicioDoDia(new Date(iso))) / DIA_MS));
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export type EntradaDeRisco = { sinais: SinaisDoBanco | null; nota: number | null };
export type ReferenciaDaTurma = { notaMedia: number | null; taxaAbandonoPct?: number | null };

export function avaliarRisco(e: EntradaDeRisco, turma: ReferenciaDaTurma, hoje: Date): Risco | null {
  const fatores: Fator[] = [];
  const s = e.sinais;
  if (s && !s.semDado) {
    // Faixa vinda da inatividade já aparece como o fato "sem estudar há N dias" abaixo: não repete.
    if ((s.riscoFaixa === "alto" || s.riscoFaixa === "atencao") && s.riscoOrigem !== "inatividade") {
      const turmaTxt =
        turma.taxaAbandonoPct === null || turma.taxaAbandonoPct === undefined
          ? null
          : `turma: ${Math.round(turma.taxaAbandonoPct * 10) / 10}% em risco alto`;
      const pesou = s.riscoMotivo ? `pesou: ${TEXTO_DO_MOTIVO[s.riscoMotivo]}` : null;
      fatores.push({
        criterio: "abandono",
        motivo: s.riscoFaixa === "alto" ? "Risco alto de abandono" : "Risco de abandono em atenção",
        comparacao: [pesou, turmaTxt].filter(Boolean).join(" · ") || null,
        motivoDoModelo: s.riscoMotivo ?? undefined,
      });
    }
    if (s.evadidoDesde) {
      const dias = diasDesde(s.evadidoDesde, hoje);
      fatores.push({
        criterio: "evasao",
        motivo: `Sem estudar há ${dias} dias`,
        comparacao: `última atividade em ${dataCurta(s.evadidoDesde)}`,
        dias,
      });
    } else if (s.inativoDesde) {
      const dias = diasDesde(s.inativoDesde, hoje);
      fatores.push({
        criterio: "inatividade",
        motivo: `${dias} dias sem estudar`,
        comparacao: `última atividade em ${dataCurta(s.inativoDesde)}`,
        dias,
      });
    }
    if (s.estagnadoDesde) {
      const onde = s.estagnadoTopico ? `em ${s.estagnadoTopico}` : "num tópico";
      const dias = diasDesde(s.estagnadoDesde, hoje);
      fatores.push({
        criterio: "estagnacao",
        motivo: `Parado ${onde} há ${dias} dias`,
        comparacao: "abaixo da mediana da turma nesse tópico",
        dias,
        topico: s.estagnadoTopico,
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
  if (fatores.length === 0) return null;
  return { nivel: s?.riscoFaixa === "alto" && !s.semDado ? "critico" : "atencao", fatores };
}

/** Texto do critério da lista "Precisam de atenção". */
export function descricaoDosCriterios(): string {
  return (
    `Crítico: risco alto de abandono no modelo do core. Atenção: risco em atenção, ${DIAS_INATIVO} dias sem ` +
    `estudar, ${DIAS_ESTAGNADO} dias parado num tópico abaixo da mediana ou nota abaixo de ${NOTA_MINIMA.toFixed(1)}. ` +
    "Sem dado não conta."
  );
}

/**
 * Frase da rosca de notas (voltou na F5 com a conta nova): entre os alunos com nota abaixo de 5,0,
 * quantos estão em risco alto de abandono, comparado com a turma.
 */
export function observacaoNotaEAbandono(
  alunos: { nota: number | null; riscoFaixa: FaixaDoRisco | null }[],
  taxaAbandonoDaTurmaPct: number | null,
): string | null {
  const abaixo = alunos.filter((a) => a.nota !== null && a.nota < NOTA_MINIMA && a.riscoFaixa !== null);
  if (abaixo.length === 0 || taxaAbandonoDaTurmaPct === null) return null;
  const emRisco = abaixo.filter((a) => a.riscoFaixa === "alto").length;
  const pct = Math.round((1000 * emRisco) / abaixo.length) / 10;
  const quem = abaixo.length === 1 ? "1 aluno com nota abaixo de 5.0" : `${abaixo.length} alunos com nota abaixo de 5.0`;
  return `${quem}: ${pct}% em risco alto de abandono (turma: ${Math.round(taxaAbandonoDaTurmaPct * 10) / 10}%).`;
}

/**
 * Nota que conta para o risco: null quando o aluno ainda não tem nota. A nota é calculada pelo banco
 * (20261101_10): NULL é sem nota e 0 é zero de verdade (prazo vencido sem entrega, por exemplo).
 */
export function notaParaRisco(nota: number | null): number | null {
  return nota;
}

import { META_ABANDONO_PCT } from "./metas";

// Critérios do protótipo V9 (docs/frontend/redesign-fase-2/01-analise-dashboard.md,
// seção 4.5). "Progresso 20 pontos abaixo do previsto" fica desligado: não há
// fonte de progresso previsto (seção 9, decisão 1).
export const LIMITE_ABANDONO_CRITICO_PCT = 30;
export const NOTA_MINIMA = 5;
export const DIAS_SEM_ATIVIDADE = 7;
/** Janela lida de vw_metricas_sessoes_aluno_dia para achar a última sessão. */
export const JANELA_SESSOES_DIAS = 60;

export type NivelDeRisco = "critico" | "atencao";
export type Criterio = "abandono" | "nota" | "inatividade";
export type Fator = { criterio: Criterio; motivo: string; comparacao: string | null };
export type Risco = { nivel: NivelDeRisco; fatores: Fator[] };

export type Inatividade = { dias: number; peloMenos: boolean };

const DIA_MS = 86_400_000;
const inicioDoDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const diasEntre = (de: string, ate: Date) => Math.max(0, Math.floor((inicioDoDia(ate) - inicioDoDia(new Date(de))) / DIA_MS));

/**
 * Dias desde a última sessão de estudo na turma. Sem sessão na janela, conta da
 * matrícula; se a matrícula for mais antiga que a janela, o número é "pelo menos
 * a janela" (pode ter havido sessão antes dela).
 */
export function inatividade(ultimaSessao: string | null, naTurmaDesde: string | null, hoje: Date): Inatividade | null {
  if (ultimaSessao) return { dias: diasEntre(ultimaSessao, hoje), peloMenos: false };
  if (!naTurmaDesde) return null;
  const desdeMatricula = diasEntre(naTurmaDesde, hoje);
  return desdeMatricula > JANELA_SESSOES_DIAS
    ? { dias: JANELA_SESSOES_DIAS, peloMenos: true }
    : { dias: desdeMatricula, peloMenos: false };
}

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

export type EntradaDeRisco = {
  abandonoPct: number | null;
  nota: number | null;
  inatividade: Inatividade | null;
};

export type ReferenciaDaTurma = { abandonoMedioPct: number | null; notaMedia: number | null };

/**
 * Crítico: abandono acima de 30% ou dois sinais ao mesmo tempo. Atenção: um
 * sinal só (nota abaixo de 5,0 ou 7 dias sem atividade). Mesma leitura dos
 * exemplos do protótipo.
 */
export function avaliarRisco(e: EntradaDeRisco, turma: ReferenciaDaTurma): Risco | null {
  const fatores: Fator[] = [];
  if (e.abandonoPct !== null && e.abandonoPct > LIMITE_ABANDONO_CRITICO_PCT) {
    fatores.push({
      criterio: "abandono",
      motivo: `Abandono em ${pct(e.abandonoPct)}`,
      comparacao: turma.abandonoMedioPct === null ? null : `turma: ${pct(turma.abandonoMedioPct)}`,
    });
  }
  if (e.nota !== null && e.nota < NOTA_MINIMA) {
    fatores.push({
      criterio: "nota",
      motivo: `Nota ${e.nota.toFixed(1)}, abaixo de ${NOTA_MINIMA.toFixed(1)}`,
      comparacao: turma.notaMedia === null ? null : `turma: ${turma.notaMedia.toFixed(1)}`,
    });
  }
  if (e.inatividade && e.inatividade.dias >= DIAS_SEM_ATIVIDADE) {
    fatores.push({
      criterio: "inatividade",
      motivo: `${e.inatividade.peloMenos ? "Mais de " : ""}${e.inatividade.dias} dias sem atividade na turma`,
      comparacao: null,
    });
  }
  if (fatores.length === 0) return null;
  const critico = fatores.some((f) => f.criterio === "abandono") || fatores.length >= 2;
  return { nivel: critico ? "critico" : "atencao", fatores };
}

/** Texto do critério só com o que está ligado (o que tem fonte de dado). */
export function descricaoDosCriterios(ligados: Criterio[]): string {
  const partes: Record<Criterio, string> = {
    abandono: `abandono acima de ${LIMITE_ABANDONO_CRITICO_PCT}%`,
    nota: `nota abaixo de ${NOTA_MINIMA.toFixed(1)}`,
    inatividade: `${DIAS_SEM_ATIVIDADE} dias sem atividade na turma`,
  };
  const lista = ligados.map((c) => partes[c]);
  if (lista.length <= 1) return `Critério: ${lista[0] ?? "nenhum"}`;
  return `Critério: ${lista.slice(0, -1).join(", ")} ou ${lista[lista.length - 1]}`;
}

export type FaixaDeAbandono = "saudavel" | "atencao" | "critico";

export function faixaDoAbandono(pctAbandono: number): FaixaDeAbandono {
  if (pctAbandono > LIMITE_ABANDONO_CRITICO_PCT) return "critico";
  if (pctAbandono > META_ABANDONO_PCT) return "atencao";
  return "saudavel";
}

/**
 * Frase da rosca. O protótipo diz "N alunos na faixa baixa concentram X% do
 * abandono", mas a view não diz onde começa a faixa "baixa" e somar taxas de
 * alunos diferentes não dá "X% do abandono". Usa o limite do critério de nota
 * e compara médias, que é o que o dado sustenta.
 */
export function observacaoNotaEAbandono(
  alunos: { nota: number | null; abandonoPct: number | null }[],
  abandonoMedioDaTurmaPct: number | null,
): string | null {
  const comAbandono = alunos.filter((a) => a.abandonoPct !== null);
  const abaixo = comAbandono.filter((a) => a.nota !== null && a.nota < NOTA_MINIMA);
  if (abaixo.length === 0 || abandonoMedioDaTurmaPct === null) return null;
  const media = abaixo.reduce((s, a) => s + (a.abandonoPct ?? 0), 0) / abaixo.length;
  const quem = abaixo.length === 1 ? "1 aluno com nota abaixo de 5.0 tem" : `${abaixo.length} alunos com nota abaixo de 5.0 têm`;
  return `${quem} abandono médio de ${pct(media)} (turma: ${pct(abandonoMedioDaTurmaPct)}).`;
}

/** Nota que conta para o risco: null quando o aluno ainda não tem nota de verdade. */
export function notaParaRisco(nota: number | null, progressoPct: number): number | null {
  if (nota === null) return null;
  // classe_aluno grava 0 antes de qualquer atividade corrigida; sem progresso
  // nenhum, 0 é "sem nota", não reprovação.
  if (nota === 0 && progressoPct === 0) return null;
  return nota;
}

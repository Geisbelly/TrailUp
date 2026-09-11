/**
 * O histórico de crédito que o professor concedeu ao aluno: presença,
 * participação e atividade em sala.
 *
 * A fonte é `vw_creditos_concedidos`, que roda com `security_invoker = on` --
 * então a RLS de `eventos_aluno` já garante que o aluno só vê as próprias
 * linhas, e esta camada não precisa (nem deve) repetir o filtro.
 *
 * Funções puras, sem Supabase: o que importa verificar aqui é a FORMA da lista
 * -- ordem, rótulo, soma -- e nada disso precisa de rede.
 *
 * ## Por que isto não duplica `agruparHistorico` do console
 *
 * Parece a mesma coisa e não é. Uma concessão vira uma linha POR ALUNO, então
 * o professor precisa juntar a turma num lote só (30 linhas → "30 alunos, 300
 * pontos"). O aluno vê apenas a própria linha de cada concessão: agrupar por
 * `(data, tipo, motivo)` seria identidade. O que ele precisa é do oposto --
 * separar por dia, para a lista ter cabeçalho.
 */

export type TipoDeCredito =
  | "presenca_aula"
  | "participacao_aula"
  | "participacao_extra";

export interface CreditoDoAluno {
  id: number;
  tipo: string;
  valor: number | null;
  motivo: string | null;
  /** `YYYY-MM-DD`, ou nulo quando a referência não trouxe data. */
  data_credito: string | null;
  classe_id: number | null;
}

/** Como o crédito aparece para o aluno. */
export function rotularTipoDeCredito(tipo: string): string {
  if (tipo === "presenca_aula") return "Presença";
  if (tipo === "participacao_aula") return "Participação";
  if (tipo === "participacao_extra") return "Atividade em sala";
  return tipo;
}

/**
 * Ícone do MaterialCommunityIcons por tipo.
 *
 * Fica aqui, e não na tela, porque é a mesma decisão do rótulo: se um tipo novo
 * entrar, os dois precisam mudar juntos.
 */
export function iconeDoCredito(tipo: string): string {
  if (tipo === "presenca_aula") return "calendar-check";
  if (tipo === "participacao_aula") return "hand-back-right-outline";
  if (tipo === "participacao_extra") return "pencil-box-outline";
  return "star-outline";
}

function pontosDe(credito: CreditoDoAluno): number {
  const valor = Number(credito.valor ?? 0);
  return Number.isFinite(valor) ? valor : 0;
}

export function somarPontos(creditos: readonly CreditoDoAluno[]): number {
  return creditos.reduce((total, credito) => total + pontosDe(credito), 0);
}

export interface DiaDeCreditos {
  /** `YYYY-MM-DD`, ou string vazia para as linhas sem data. */
  data: string;
  creditos: CreditoDoAluno[];
  pontos: number;
}

/**
 * Agrupa por dia, do mais recente para o mais antigo.
 *
 * As linhas sem data vão para o FIM, não para o começo. Ordenar string vazia
 * junto com as datas a jogaria para o fim numa comparação decrescente por
 * acidente; deixar isso explícito evita que uma linha defeituosa apareça como
 * se fosse a mais recente.
 */
export function agruparPorDia(
  creditos: readonly CreditoDoAluno[],
): DiaDeCreditos[] {
  const porDia = new Map<string, DiaDeCreditos>();

  for (const credito of creditos) {
    const data = credito.data_credito ?? "";
    const existente = porDia.get(data);

    if (existente) {
      existente.creditos.push(credito);
      existente.pontos += pontosDe(credito);
      continue;
    }

    porDia.set(data, { data, creditos: [credito], pontos: pontosDe(credito) });
  }

  const dias = Array.from(porDia.values());

  dias.sort((a, b) => {
    if (a.data === b.data) return 0;
    if (a.data === "") return 1;
    if (b.data === "") return -1;
    return b.data.localeCompare(a.data);
  });

  // Dentro do dia, o maior crédito primeiro: é o que o aluno quer ver.
  for (const dia of dias) {
    dia.creditos.sort((a, b) => pontosDe(b) - pontosDe(a));
  }

  return dias;
}

/** `2026-09-11` -> `11/09/2026`. Sem data, diz que não sabe. */
export function formatarDia(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Sem data";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * A linha de apoio de cada crédito.
 *
 * O motivo só existe em atividade em sala, e é obrigatório lá -- então a
 * ausência dele em presença não é dado faltando, e repetir o rótulo do tipo
 * seria ruído.
 */
export function descreverCredito(credito: CreditoDoAluno): string {
  const motivo = (credito.motivo ?? "").trim();
  if (motivo) return motivo;
  if (credito.tipo === "presenca_aula") return "Aula registrada pelo professor";
  if (credito.tipo === "participacao_aula") return "Participação em aula";
  return "Crédito do professor";
}

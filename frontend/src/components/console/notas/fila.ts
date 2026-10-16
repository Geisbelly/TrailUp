// Regras da fila de correção da tela Notas. Tudo aqui é função pura sobre as linhas
// que `notas_fila()` devolve (migration 20261016_04), para que a pergunta de produto
// "o que é pendente de correção?" tenha UM lugar para mudar.
//
// DEFINIÇÃO ADOTADA (decisão 1 da análise 05, ainda a confirmar): é pendente toda
// entrega — ou ausência de entrega com prazo vencido — que o professor ainda não
// avaliou. Como a IA já corrige a dissertativa na hora do aluno, "pendente" aqui quer
// dizer "sem revisão do professor", não "sem nota".

export type LinhaDaFila = {
  alunoId: string;
  alunoNome: string;
  atividadeId: number;
  topicoId: number;
  titulo: string;
  enunciado: string;
  gabarito: string | null;
  resposta: string | null;
  entregueEm: string | null;
  prazo: string | null;
  pontuacaoMaxima: number | null;
  pontuacaoObtida: number | null;
  avaliadoEm: string | null;
  feedback: string | null;
};

export type EstadoDaEntrega = "pendente" | "sem_entrega" | "corrigida";
export type FiltroDeStatus = "pendentes" | "corrigidas" | "todas";

const DIA_MS = 86_400_000;

export function estadoDaEntrega(l: LinhaDaFila): EstadoDaEntrega {
  if (l.avaliadoEm) return "corrigida";
  return l.resposta && l.resposta.trim() ? "pendente" : "sem_entrega";
}

/** "Pendentes" inclui quem não entregou: o professor precisa decidir o que fazer com ele. */
export function passaNoFiltro(l: LinhaDaFila, filtro: FiltroDeStatus): boolean {
  const e = estadoDaEntrega(l);
  if (filtro === "todas") return true;
  return filtro === "corrigidas" ? e === "corrigida" : e !== "corrigida";
}

/** Dias de calendário desde a data de referência (entrega, ou prazo quando não houve entrega). */
export function diasDeEspera(l: LinhaDaFila, agora: Date = new Date()): number {
  const ref = l.entregueEm ?? l.prazo;
  if (!ref) return 0;
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return 0;
  const a = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((a - b) / DIA_MS));
}

export function rotuloDeEspera(l: LinhaDaFila, agora: Date = new Date()): string {
  const dias = diasDeEspera(l, agora);
  const quando = dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  return estadoDaEntrega(l) === "sem_entrega" ? `prazo venceu ${quando}` : `entregue ${quando}`;
}

/** Quem espera há mais tempo vem primeiro; corrigidas por último; desempate pelo nome. */
export function ordenarFila(linhas: LinhaDaFila[], agora: Date = new Date()): LinhaDaFila[] {
  return [...linhas].sort((a, b) => {
    const ca = estadoDaEntrega(a) === "corrigida" ? 1 : 0;
    const cb = estadoDaEntrega(b) === "corrigida" ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const d = diasDeEspera(b, agora) - diasDeEspera(a, agora);
    return d !== 0 ? d : a.alunoNome.localeCompare(b.alunoNome, "pt-BR");
  });
}

export type FiltrosDaFila = { topicoId: number | null; status: FiltroDeStatus };

export function filtrarFila(linhas: LinhaDaFila[], f: FiltrosDaFila, agora: Date = new Date()): LinhaDaFila[] {
  return ordenarFila(
    linhas.filter((l) => (f.topicoId === null || l.topicoId === f.topicoId) && passaNoFiltro(l, f.status)),
    agora,
  );
}

export function contarPendentes(linhas: LinhaDaFila[]): number {
  return linhas.filter((l) => estadoDaEntrega(l) !== "corrigida").length;
}

/** Próxima/anterior dentro da lista já filtrada (para corrigir em sequência). */
export function vizinhas(lista: LinhaDaFila[], atual: LinhaDaFila | null): { anterior: LinhaDaFila | null; proxima: LinhaDaFila | null } {
  if (!atual) return { anterior: null, proxima: null };
  const i = lista.findIndex((l) => l.alunoId === atual.alunoId && l.atividadeId === atual.atividadeId);
  if (i < 0) return { anterior: null, proxima: null };
  return { anterior: lista[i - 1] ?? null, proxima: lista[i + 1] ?? null };
}

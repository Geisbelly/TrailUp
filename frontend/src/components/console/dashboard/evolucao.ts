// Série semanal da aba "Evolução" (docs/frontend/redesign-fase-2/01-analise-dashboard.md,
// seção 4.6). Só entra série com histórico de verdade: em
// vw_metricas_evolucao_desempenho_aluno_dia o progresso e a nota são o valor
// atual carimbado em cada dia (conferido no banco), então não viram linha
// aqui. Entregas e acertos saem de eventos_aluno, que tem a data de cada
// resposta.

export const SEMANAS_DA_SERIE = 10;
const DIA_MS = 86_400_000;

export type EventoDeResposta = {
  aluno_id: string;
  tipo: "atividade_acertada" | "atividade_errada" | string;
  referencia: string | null;
  criado_em: string;
};

/** criado_em vem sem fuso (timestamp sem time zone, gravado em UTC). */
const diaUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Segunda-feira da semana do dia, em "aaaa-mm-dd". */
export function segundaDaSemana(iso: string): string {
  const dia = diaUtc(iso);
  const diaDaSemana = new Date(dia).getUTCDay(); // 0 = domingo
  const recuo = (diaDaSemana + 6) % 7;
  return new Date(dia - recuo * DIA_MS).toISOString().slice(0, 10);
}

/** As `n` últimas semanas (segundas), da mais antiga até a de `hoje`. */
export function semanasAte(hoje: Date, n = SEMANAS_DA_SERIE): string[] {
  const atual = segundaDaSemana(hoje.toISOString());
  return Array.from({ length: n }, (_, i) => new Date(diaUtc(atual) - (n - 1 - i) * 7 * DIA_MS).toISOString().slice(0, 10));
}

/** Mesma leitura das referências "atividade:<id>" de eventos_aluno. */
export function idDaAtividade(referencia: string | null): number | null {
  const [prefixo, id] = String(referencia ?? "").split(":");
  return prefixo === "atividade" && /^\d+$/.test(id ?? "") ? Number(id) : null;
}

export type PontoSemanal = { semana: string; rotulo: string; entregas: number; acertosPct: number | null };

const rotuloDaSemana = (segunda: string) => `${segunda.slice(8, 10)}/${segunda.slice(5, 7)}`;

/**
 * Entregas = respostas enviadas (acertadas + erradas) a atividades da turma,
 * por alunos matriculados nela. Acertos = acertadas ÷ respondidas; semana sem
 * resposta fica null (ponto ausente, não zero).
 */
export function serieSemanal(
  eventos: EventoDeResposta[],
  semanas: string[],
  atividadesDaTurma: Set<number>,
  alunosDaTurma: Set<string>,
): PontoSemanal[] {
  const porSemana = new Map(semanas.map((s) => [s, { acertadas: 0, erradas: 0 }]));
  for (const e of eventos) {
    const atividade = idDaAtividade(e.referencia);
    if (atividade === null || !atividadesDaTurma.has(atividade) || !alunosDaTurma.has(e.aluno_id)) continue;
    const semana = porSemana.get(segundaDaSemana(e.criado_em));
    if (!semana) continue;
    if (e.tipo === "atividade_acertada") semana.acertadas++;
    else if (e.tipo === "atividade_errada") semana.erradas++;
  }
  return semanas.map((s) => {
    const { acertadas, erradas } = porSemana.get(s)!;
    const total = acertadas + erradas;
    return { semana: s, rotulo: rotuloDaSemana(s), entregas: total, acertosPct: total === 0 ? null : (acertadas / total) * 100 };
  });
}

export type Delta = { valor: number; texto: string; tom: "bom" | "ruim" | "neutro" };

/** Última semana × anterior. Sem valor em qualquer das duas, não há delta. */
export function deltaDeEntregas(serie: PontoSemanal[]): Delta | null {
  if (serie.length < 2) return null;
  const [anterior, atual] = serie.slice(-2);
  if (anterior.entregas === 0) return null;
  const valor = ((atual.entregas - anterior.entregas) / anterior.entregas) * 100;
  const arred = Math.round(valor);
  return { valor, texto: `${arred > 0 ? "+" : arred < 0 ? "−" : "±"}${Math.abs(arred)}%`, tom: arred > 0 ? "bom" : arred < 0 ? "ruim" : "neutro" };
}

export function deltaDeAcertos(serie: PontoSemanal[]): Delta | null {
  if (serie.length < 2) return null;
  const [anterior, atual] = serie.slice(-2);
  if (anterior.acertosPct === null || atual.acertosPct === null) return null;
  const valor = atual.acertosPct - anterior.acertosPct;
  const arred = Math.round(valor);
  return { valor, texto: `${arred > 0 ? "+" : arred < 0 ? "−" : "±"}${Math.abs(arred)} pts`, tom: arred > 0 ? "bom" : arred < 0 ? "ruim" : "neutro" };
}

export type JobDePersonalizacao = { kind: string; topico_id: number | null; finished_at: string | null };
export type TopicoComData = { id: number; nome: string | null; created_at: string | null };
export type MudancaRelevante = { data: string; etiqueta: "Material" | "Estrutura"; titulo: string; detalhe: string | null };

// kinds reais em personalizacao_jobs usam _ ; o CLAUDE.md cita os nomes curtos com -.
const TITULO_DO_JOB: Record<string, string> = {
  manual_profile_generate: "Material regerado para um perfil",
  manual_profile_generate_all: "Material regerado para todos os perfis",
  class_delta_sync: "Material atualizado depois de mudança na trilha",
  "class-delta": "Material atualizado depois de mudança na trilha",
  class_theme_sync: "Tema da turma aplicado ao material",
  "class-theme": "Tema da turma aplicado ao material",
  student_enrollment: "Material gerado para aluno matriculado",
  enrollment: "Material gerado para aluno matriculado",
  student_cleanup: "Material de aluno removido",
  "student-cleanup": "Material de aluno removido",
  full_sync: "Material de toda a turma sincronizado",
  "full-sync": "Material de toda a turma sincronizado",
};

/**
 * Eventos datados com fonte no banco, sem leitura interpretativa: jobs de
 * personalização concluídos e tópicos criados. Jobs do mesmo tipo e tópico no
 * mesmo dia viram uma linha só ("3 vezes").
 */
export function mudancasRelevantes(jobs: JobDePersonalizacao[], topicos: TopicoComData[], desde: string): MudancaRelevante[] {
  const nomeDoTopico = new Map(topicos.map((t) => [t.id, t.nome?.trim() || `Tópico ${t.id}`]));
  const agrupados = new Map<string, { data: string; kind: string; topico: number | null; vezes: number }>();
  for (const j of jobs) {
    if (!j.finished_at || j.finished_at.slice(0, 10) < desde) continue;
    const data = j.finished_at.slice(0, 10);
    const chave = `${data}|${j.kind}|${j.topico_id ?? ""}`;
    const atual = agrupados.get(chave) ?? { data, kind: j.kind, topico: j.topico_id, vezes: 0 };
    atual.vezes++;
    agrupados.set(chave, atual);
  }
  const deJobs: MudancaRelevante[] = [...agrupados.values()].map((g) => ({
    data: g.data,
    etiqueta: "Material",
    titulo: TITULO_DO_JOB[g.kind] ?? g.kind,
    detalhe: [g.topico !== null ? nomeDoTopico.get(g.topico) ?? `Tópico ${g.topico}` : null, g.vezes > 1 ? `${g.vezes} vezes` : null]
      .filter(Boolean)
      .join(" · ") || null,
  }));
  // Tópicos criados no mesmo dia viram uma linha só (montar a trilha cria
  // vários de uma vez).
  const topicosPorDia = new Map<string, string[]>();
  for (const t of topicos) {
    if (!t.created_at || t.created_at.slice(0, 10) < desde) continue;
    const dia = t.created_at.slice(0, 10);
    topicosPorDia.set(dia, [...(topicosPorDia.get(dia) ?? []), nomeDoTopico.get(t.id) ?? `Tópico ${t.id}`]);
  }
  const deTopicos: MudancaRelevante[] = [...topicosPorDia].map(([data, nomes]) => ({
    data,
    etiqueta: "Estrutura",
    titulo: nomes.length === 1 ? "Tópico criado na trilha" : `${nomes.length} tópicos criados na trilha`,
    detalhe: nomes.join(", "),
  }));
  return [...deJobs, ...deTopicos].sort((a, b) => b.data.localeCompare(a.data) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

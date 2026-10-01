// Métricas por conteúdo da aba "Conteúdo" (docs/frontend/redesign-fase-2/01-analise-dashboard.md,
// seção 4.7). Tudo calculado no cliente a partir de leituras diretas do
// Supabase — sem modelo de linguagem no meio, não passa pela API.

export type ConteudoBase = { id: number; topico_id: number; titulo: string | null; tipo: string | null; ordem: number | null };
export type TopicoBase = { id: number; classe_id: number; nome: string | null };
export type Matricula = { aluno_id: string; classe_id: number };
export type ConteudoAlunoLinha = { aluno_id: string; conteudo_id: number; status: string | null; percentual_concluido: number | null };
export type ProgressoPersonalizadoLinha = { aluno_id: string; classe_id: number | null; item_key: string };
export type VinculoAtividade = { atividade_id: number; conteudo_id: number };
export type AtividadeAlunoLinha = { aluno_id: string; atividade_id: number; status: string | null; acertos_percentual: number | null };

export type MetricaDeConteudo = {
  conteudoId: number;
  titulo: string;
  topico: string;
  classeId: number;
  formato: string | null;
  alunos: number;
  abriram: number;
  concluiram: number;
  /** 100 − média dos acertos nas atividades ligadas, só tentativas concluídas; null sem tentativa. */
  erroPct: number | null;
  tentativas: number;
};

const semAcento = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const concluido = (status: string | null, percentual: number | null) =>
  semAcento(status).startsWith("conclu") || Number(percentual ?? 0) >= 100;

const naoIniciado = (status: string | null) => semAcento(status) === "nao iniciado";

/**
 * Mesma leitura de public.telemetria_id_do_item_key no banco: prefixo exato e
 * o segundo pedaço numérico. "content:192:personalization:…" é o conteúdo 192.
 */
export function idDoConteudoNaChave(itemKey: string): number | null {
  const [prefixo, id] = itemKey.split(":");
  if (prefixo !== "content" || !/^\d+$/.test(id ?? "")) return null;
  return Number(id);
}

export function metricasPorConteudo(dados: {
  conteudos: ConteudoBase[];
  topicos: TopicoBase[];
  matriculas: Matricula[];
  conteudoAluno: ConteudoAlunoLinha[];
  progressoPersonalizado: ProgressoPersonalizadoLinha[];
  vinculos: VinculoAtividade[];
  atividadeAluno: AtividadeAlunoLinha[];
}): MetricaDeConteudo[] {
  const topicoPorId = new Map(dados.topicos.map((t) => [t.id, t]));
  const matriculadosPorTurma = new Map<number, Set<string>>();
  for (const m of dados.matriculas) {
    const turma = matriculadosPorTurma.get(m.classe_id) ?? new Set<string>();
    turma.add(m.aluno_id);
    matriculadosPorTurma.set(m.classe_id, turma);
  }

  const abriu = new Map<number, Set<string>>();
  const concluiu = new Map<number, Set<string>>();
  const marcar = (mapa: Map<number, Set<string>>, conteudoId: number, alunoId: string) => {
    const s = mapa.get(conteudoId) ?? new Set<string>();
    s.add(alunoId);
    mapa.set(conteudoId, s);
  };
  for (const l of dados.conteudoAluno) {
    if (!naoIniciado(l.status) || Number(l.percentual_concluido ?? 0) > 0) marcar(abriu, l.conteudo_id, l.aluno_id);
    if (concluido(l.status, l.percentual_concluido)) marcar(concluiu, l.conteudo_id, l.aluno_id);
  }
  for (const l of dados.progressoPersonalizado) {
    const conteudoId = idDoConteudoNaChave(l.item_key);
    if (conteudoId !== null) marcar(abriu, conteudoId, l.aluno_id);
  }

  const atividadesDoConteudo = new Map<number, Set<number>>();
  for (const v of dados.vinculos) {
    const s = atividadesDoConteudo.get(v.conteudo_id) ?? new Set<number>();
    s.add(v.atividade_id);
    atividadesDoConteudo.set(v.conteudo_id, s);
  }

  return dados.conteudos
    .map((c) => {
      const topico = topicoPorId.get(c.topico_id);
      if (!topico) return null;
      const matriculados = matriculadosPorTurma.get(topico.classe_id) ?? new Set<string>();
      const daTurma = (alunos?: Set<string>) => [...(alunos ?? [])].filter((a) => matriculados.has(a)).length;
      const atividades = atividadesDoConteudo.get(c.id) ?? new Set<number>();
      const acertos = dados.atividadeAluno
        .filter(
          (t) =>
            atividades.has(t.atividade_id) &&
            matriculados.has(t.aluno_id) &&
            concluido(t.status, null) &&
            t.acertos_percentual !== null,
        )
        .map((t) => Number(t.acertos_percentual));
      return {
        conteudoId: c.id,
        titulo: c.titulo?.trim() || `Conteúdo ${c.id}`,
        topico: topico.nome?.trim() || `Tópico ${topico.id}`,
        classeId: topico.classe_id,
        formato: c.tipo,
        alunos: matriculados.size,
        abriram: daTurma(abriu.get(c.id)),
        concluiram: daTurma(concluiu.get(c.id)),
        erroPct: acertos.length === 0 ? null : 100 - acertos.reduce((s, a) => s + a, 0) / acertos.length,
        tentativas: acertos.length,
      };
    })
    .filter((m): m is MetricaDeConteudo => m !== null);
}

/** Erro médio da turma: ponderado pelas tentativas de cada conteúdo. */
export function erroMedio(metricas: MetricaDeConteudo[]): number | null {
  const comErro = metricas.filter((m) => m.erroPct !== null && m.tentativas > 0);
  const tentativas = comErro.reduce((s, m) => s + m.tentativas, 0);
  if (tentativas === 0) return null;
  return comErro.reduce((s, m) => s + (m.erroPct ?? 0) * m.tentativas, 0) / tentativas;
}

export const pctDe = (parte: number, todo: number) => (todo === 0 ? 0 : (parte / todo) * 100);

export type FaixaDeErro = "baixo" | "medio" | "alto";
export const ERRO_ALTO_PCT = 40;
export const ERRO_BAIXO_PCT = 15;

export function faixaDeErro(erro: number): FaixaDeErro {
  if (erro >= ERRO_ALTO_PCT) return "alto";
  if (erro <= ERRO_BAIXO_PCT) return "baixo";
  return "medio";
}

/** Comparação com a média; "na média" dentro de 5 pontos. */
export function comparacaoComMedia(erro: number, media: number | null): string | null {
  if (media === null) return null;
  const arred = (v: number) => `${Math.round(v)}%`;
  if (erro > media + 5) return `pior que a média da turma (${arred(media)})`;
  if (erro < media - 5) return `melhor que a média da turma (${arred(media)})`;
  return `na média da turma (${arred(media)})`;
}

export type Destaques = {
  maisConsumido: MetricaDeConteudo | null;
  maiorDificuldade: MetricaDeConteudo | null;
  maiorConclusao: MetricaDeConteudo | null;
};

/** Empates ficam com o conteúdo de título em ordem alfabética, para o card não trocar sozinho. */
export function destaques(metricas: MetricaDeConteudo[]): Destaques {
  const melhor = (lista: MetricaDeConteudo[], valor: (m: MetricaDeConteudo) => number) =>
    lista.length === 0
      ? null
      : [...lista].sort((a, b) => valor(b) - valor(a) || a.titulo.localeCompare(b.titulo, "pt-BR"))[0];
  const comAlunos = metricas.filter((m) => m.alunos > 0);
  return {
    maisConsumido: melhor(comAlunos.filter((m) => m.abriram > 0), (m) => pctDe(m.abriram, m.alunos)),
    maiorDificuldade: melhor(metricas.filter((m) => m.erroPct !== null), (m) => m.erroPct ?? 0),
    maiorConclusao: melhor(comAlunos.filter((m) => m.concluiram > 0), (m) => pctDe(m.concluiram, m.alunos)),
  };
}

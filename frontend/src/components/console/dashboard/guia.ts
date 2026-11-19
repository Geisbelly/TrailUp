/**
 * Contas da aba Guia (perguntas dos alunos ao Guia, `20261118_01`).
 *
 * O banco guarda o que cada pergunta ERA (intenção, assunto, conceitos, dificuldade), nunca o que o
 * aluno escreveu. As três views já agregam; aqui só se junta com o nome do tópico e do aluno e se
 * ordena para a tela.
 */

/** `vw_chat_guia_turma_topico`. `topico_id` nulo = pergunta feita fora de um tópico (Home, Perfil…). */
export type GuiaTurmaTopico = {
  classe_id: number;
  topico_id: number | null;
  perguntas: number;
  alunos: number;
  duvidas_materia: number;
  pedidos_resposta: number;
  navegacao_app: number;
  alunos_com_dificuldade: number;
  alunos_travados: number;
  ultima_em: string | null;
};

/** `vw_chat_guia_conceitos_turma`. */
export type GuiaConceito = {
  classe_id: number;
  topico_id: number | null;
  conceito: string;
  mencoes: number;
  alunos: number;
  alunos_com_dificuldade: number;
  ultima_em: string | null;
};

/** `vw_chat_guia_aluno_topico`. Só perguntas feitas dentro de um tópico. */
export type GuiaAlunoTopico = {
  classe_id: number;
  aluno_id: string;
  topico_id: number;
  perguntas: number;
  duvidas_materia: number;
  pedidos_resposta: number;
  com_dificuldade: number;
  travado: number;
  primeira_em: string | null;
  ultima_em: string | null;
  tentativas_antes: number;
  acerto_antes_pct: number | null;
  tentativas_depois: number;
  acerto_depois_pct: number | null;
};

export type TopicoDoGuia = { id: number; classe_id: number; nome: string };

/** O PostgREST devolve `bigint` e `numeric` como texto em alguns casos; a tela precisa de número. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function numOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A view não existe neste banco: a `20261118_01` não foi aplicada (42P01 no Postgres, PGRST205 no PostgREST). */
export function viewAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "42P01" || erro.code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(erro.message ?? "");
}

export const FORA_DE_TOPICO = "Fora de um tópico";

export function nomeDoTopico(topicos: Map<number, string>, id: number | null): string {
  if (id === null) return FORA_DE_TOPICO;
  return topicos.get(id) ?? `Tópico ${id}`;
}

export type ResumoDoGuia = {
  /** Todas as perguntas, dentro e fora de tópico. */
  perguntas: number;
  /**
   * Alunos distintos que perguntaram dentro de um tópico. Não é a soma das linhas por tópico (o mesmo
   * aluno pergunta em vários), e quem só perguntou fora de tópico não entra: nenhuma view o identifica.
   */
  alunosEmTopico: number;
  pedidosResposta: number;
  /** Alunos distintos que travaram em algum tópico. */
  alunosTravados: number;
};

export function resumir(porTopico: GuiaTurmaTopico[], porAluno: GuiaAlunoTopico[]): ResumoDoGuia {
  const chave = (a: { classe_id: number; aluno_id: string }) => `${a.classe_id}:${a.aluno_id}`;
  return {
    perguntas: porTopico.reduce((s, l) => s + l.perguntas, 0),
    alunosEmTopico: new Set(porAluno.map(chave)).size,
    pedidosResposta: porTopico.reduce((s, l) => s + l.pedidos_resposta, 0),
    alunosTravados: new Set(porAluno.filter((a) => a.travado > 0).map(chave)).size,
  };
}

/** Onde a sala trava: mais alunos com dificuldade primeiro, depois mais menções, depois mais recente. */
export function conceitosDificeis(linhas: GuiaConceito[], limite = 12): GuiaConceito[] {
  return [...linhas]
    .filter((l) => l.alunos_com_dificuldade > 0)
    .sort(
      (a, b) =>
        b.alunos_com_dificuldade - a.alunos_com_dificuldade ||
        b.mencoes - a.mencoes ||
        (b.ultima_em ?? "").localeCompare(a.ultima_em ?? "") ||
        a.conceito.localeCompare(b.conceito, "pt-BR"),
    )
    .slice(0, limite);
}

/** Tópicos na ordem da trilha; perguntas fora de tópico por último. */
export function topicosNaOrdem(linhas: GuiaTurmaTopico[], ordem: Map<number, number>): GuiaTurmaTopico[] {
  const pos = (id: number | null) => (id === null ? Number.MAX_SAFE_INTEGER : ordem.get(id) ?? Number.MAX_SAFE_INTEGER - 1);
  return [...linhas].sort((a, b) => pos(a.topico_id) - pos(b.topico_id) || a.classe_id - b.classe_id);
}

/** Quem travou primeiro, depois quem mais pediu a resposta, depois quem mais perguntou. */
export function alunosParaOlhar(linhas: GuiaAlunoTopico[]): GuiaAlunoTopico[] {
  return [...linhas].sort(
    (a, b) =>
      b.travado - a.travado ||
      b.pedidos_resposta - a.pedidos_resposta ||
      b.com_dificuldade - a.com_dificuldade ||
      b.perguntas - a.perguntas ||
      (b.ultima_em ?? "").localeCompare(a.ultima_em ?? ""),
  );
}

/**
 * Acerto nas tentativas do tópico antes e depois da primeira conversa. É coincidência no tempo, não
 * efeito do chat: o texto nunca diz "melhorou por causa do Guia".
 */
export function textoAntesDepois(l: Pick<GuiaAlunoTopico, "acerto_antes_pct" | "acerto_depois_pct" | "tentativas_antes" | "tentativas_depois">): string {
  const lado = (pct: number | null, n: number) => (pct === null || n === 0 ? "—" : `${Math.round(pct)}%`);
  return `${lado(l.acerto_antes_pct, l.tentativas_antes)} → ${lado(l.acerto_depois_pct, l.tentativas_depois)}`;
}

export function normalizarTurmaTopico(l: Record<string, unknown>): GuiaTurmaTopico {
  return {
    classe_id: num(l.classe_id),
    topico_id: numOuNulo(l.topico_id),
    perguntas: num(l.perguntas),
    alunos: num(l.alunos),
    duvidas_materia: num(l.duvidas_materia),
    pedidos_resposta: num(l.pedidos_resposta),
    navegacao_app: num(l.navegacao_app),
    alunos_com_dificuldade: num(l.alunos_com_dificuldade),
    alunos_travados: num(l.alunos_travados),
    ultima_em: (l.ultima_em as string | null) ?? null,
  };
}

export function normalizarConceito(l: Record<string, unknown>): GuiaConceito {
  return {
    classe_id: num(l.classe_id),
    topico_id: numOuNulo(l.topico_id),
    conceito: String(l.conceito ?? ""),
    mencoes: num(l.mencoes),
    alunos: num(l.alunos),
    alunos_com_dificuldade: num(l.alunos_com_dificuldade),
    ultima_em: (l.ultima_em as string | null) ?? null,
  };
}

export function normalizarAlunoTopico(l: Record<string, unknown>): GuiaAlunoTopico {
  return {
    classe_id: num(l.classe_id),
    aluno_id: String(l.aluno_id ?? ""),
    topico_id: num(l.topico_id),
    perguntas: num(l.perguntas),
    duvidas_materia: num(l.duvidas_materia),
    pedidos_resposta: num(l.pedidos_resposta),
    com_dificuldade: num(l.com_dificuldade),
    travado: num(l.travado),
    primeira_em: (l.primeira_em as string | null) ?? null,
    ultima_em: (l.ultima_em as string | null) ?? null,
    tentativas_antes: num(l.tentativas_antes),
    acerto_antes_pct: numOuNulo(l.acerto_antes_pct),
    tentativas_depois: num(l.tentativas_depois),
    acerto_depois_pct: numOuNulo(l.acerto_depois_pct),
  };
}

// Aprovação do material personalizado pelo professor (migração 20261110_09).
//
// Todo material que a IA gera ou regera nasce PENDENTE e o aluno não o vê até o professor
// aprovar. Aqui fica só a regra pura (agrupar, contar, escolher o que entra numa decisão);
// ler e decidir é `aprovacaoApi.ts`, e a tela é `AprovacaoPersonalizacoes.tsx`.

export type EstadoAprovacao = "pendente" | "aprovado" | "recusado";
export type Decisao = EstadoAprovacao;

export type RegistroAprovacao = {
  id: number;
  topicoId: number | null;
  conteudoId: number | null;
  /** `null` = material-base do perfil (compartilhado); senão, a adequação de um aluno. */
  alunoId: string | null;
  perfil: string;
  status: string;
  aprovacao: EstadoAprovacao;
  aprovacaoEm: string | null;
  aprovacaoMotivo: string | null;
  /** A versão que o professor está vendo; a decisão é recusada se o material mudou depois. */
  versao: number;
  formatos: string[];
};

export type EstadoDoGrupo = EstadoAprovacao | "misto" | "em_geracao";

export type GrupoAprovacao = {
  chave: string;
  topicoId: number | null;
  perfil: string;
  registros: RegistroAprovacao[];
  pendentes: number;
  aprovados: number;
  recusados: number;
  emGeracao: number;
  estado: EstadoDoGrupo;
};

export type ResumoAprovacao = {
  total: number;
  pendentes: number;
  aprovados: number;
  recusados: number;
  emGeracao: number;
  /** Pendentes que já podem ser aprovados (fora de geração). */
  prontosParaAprovar: number;
};

export type ItemDecisao = { id: number; versao: number };

const ESTADOS: readonly EstadoAprovacao[] = ["pendente", "aprovado", "recusado"];
const ORDEM_DOS_PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];

export function normalizarPerfil(valor: unknown): string {
  return String(valor ?? "").trim().toLowerCase().replace("socialiser", "socializer") || "mastermind";
}

function numeroOuNulo(valor: unknown): number | null {
  const n = Number(valor);
  return valor !== null && valor !== undefined && Number.isFinite(n) ? n : null;
}

export function emGeracao(registro: Pick<RegistroAprovacao, "status">): boolean {
  return registro.status === "processando_midias";
}

export function mapearRegistroAprovacao(bruto: Record<string, unknown>): RegistroAprovacao | null {
  const id = Number(bruto.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const aprovacao = String(bruto.aprovacao ?? "pendente") as EstadoAprovacao;
  return {
    id,
    topicoId: numeroOuNulo(bruto.topico_id),
    conteudoId: numeroOuNulo(bruto.conteudo_id),
    alunoId: typeof bruto.aluno_id === "string" && bruto.aluno_id ? bruto.aluno_id : null,
    perfil: normalizarPerfil(bruto.brainhex_profile_key),
    status: String(bruto.status ?? ""),
    // Estado desconhecido é tratado como pendente: na dúvida, o aluno não vê.
    aprovacao: ESTADOS.includes(aprovacao) ? aprovacao : "pendente",
    aprovacaoEm: typeof bruto.aprovacao_em === "string" ? bruto.aprovacao_em : null,
    aprovacaoMotivo: typeof bruto.aprovacao_motivo === "string" ? bruto.aprovacao_motivo : null,
    versao: Number.isInteger(Number(bruto.conteudo_versao)) ? Number(bruto.conteudo_versao) : 1,
    formatos: Array.isArray(bruto.formatos_gerados)
      ? (bruto.formatos_gerados as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
  };
}

function estadoDoGrupo(g: Omit<GrupoAprovacao, "estado">): EstadoDoGrupo {
  const decididos = g.registros.length - g.emGeracao;
  if (decididos === 0) return "em_geracao";
  if (g.pendentes > 0) return "pendente";
  if (g.recusados === decididos) return "recusado";
  if (g.aprovados === decididos && g.emGeracao === 0) return "aprovado";
  return "misto";
}

/** Tópico × perfil, na ordem dos tópicos da trilha e dos perfis BrainHex. */
export function agruparPorTopicoEPerfil(
  registros: RegistroAprovacao[],
  ordemDosTopicos: number[] = [],
): GrupoAprovacao[] {
  const grupos = new Map<string, Omit<GrupoAprovacao, "estado">>();
  for (const r of registros) {
    const chave = `${r.topicoId ?? "sem-topico"}:${r.perfil}`;
    const g = grupos.get(chave) ?? {
      chave, topicoId: r.topicoId, perfil: r.perfil, registros: [],
      pendentes: 0, aprovados: 0, recusados: 0, emGeracao: 0,
    };
    g.registros.push(r);
    if (emGeracao(r)) g.emGeracao += 1;
    else if (r.aprovacao === "pendente") g.pendentes += 1;
    else if (r.aprovacao === "aprovado") g.aprovados += 1;
    else g.recusados += 1;
    grupos.set(chave, g);
  }
  const posicaoTopico = (id: number | null) => {
    const i = id === null ? -1 : ordemDosTopicos.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const posicaoPerfil = (p: string) => {
    const i = ORDEM_DOS_PERFIS.indexOf(p);
    return i === -1 ? ORDEM_DOS_PERFIS.length : i;
  };
  return [...grupos.values()]
    .map((g) => ({ ...g, registros: [...g.registros].sort((a, b) => a.id - b.id), estado: estadoDoGrupo(g) }))
    .sort(
      (a, b) =>
        posicaoTopico(a.topicoId) - posicaoTopico(b.topicoId) ||
        (a.topicoId ?? 0) - (b.topicoId ?? 0) ||
        posicaoPerfil(a.perfil) - posicaoPerfil(b.perfil) ||
        a.perfil.localeCompare(b.perfil),
    );
}

export function resumir(registros: RegistroAprovacao[]): ResumoAprovacao {
  const resumo: ResumoAprovacao = {
    total: registros.length, pendentes: 0, aprovados: 0, recusados: 0, emGeracao: 0, prontosParaAprovar: 0,
  };
  for (const r of registros) {
    if (emGeracao(r)) resumo.emGeracao += 1;
    if (r.aprovacao === "pendente") {
      resumo.pendentes += 1;
      if (!emGeracao(r)) resumo.prontosParaAprovar += 1;
    } else if (r.aprovacao === "aprovado") resumo.aprovados += 1;
    else resumo.recusados += 1;
  }
  return resumo;
}

/**
 * O que entra numa decisão. Aprovar pega só o que ainda não está aprovado e já terminou de
 * gerar (o banco recusa aprovar material em geração). Recusar e devolver para pendente pegam
 * o que ainda não está naquele estado.
 */
export function itensParaDecidir(registros: RegistroAprovacao[], decisao: Decisao): ItemDecisao[] {
  return registros
    .filter((r) => r.aprovacao !== decisao)
    .filter((r) => decisao !== "aprovado" || !emGeracao(r))
    .map((r) => ({ id: r.id, versao: r.versao }));
}

const VERBO: Record<Decisao, string> = {
  aprovado: "Aprovar",
  recusado: "Recusar",
  pendente: "Voltar para pendente",
};

export function rotuloDaDecisao(decisao: Decisao): string {
  return VERBO[decisao];
}

function materiais(n: number): string {
  return n === 1 ? "1 material" : `${n} materiais`;
}

/** Texto do diálogo de confirmação: diz o que muda para o aluno, não só o que muda no banco. */
export function textoDaConfirmacao(decisao: Decisao, quantidade: number, escopo: string): string {
  if (decisao === "aprovado") {
    return `${materiais(quantidade)} de ${escopo} ${quantidade === 1 ? "ficará disponível" : "ficarão disponíveis"} ` +
      "para os alunos assim que você confirmar. " +
      "Se a IA regerar algum deles depois, ele volta a esperar a sua aprovação.";
  }
  if (decisao === "recusado") {
    return `${materiais(quantidade)} de ${escopo} ${quantidade === 1 ? "deixará" : "deixarão"} de aparecer ` +
      "para os alunos, que voltam a ver o material do professor nesse ponto. Você pode aprovar de novo depois.";
  }
  return `${materiais(quantidade)} de ${escopo} ${quantidade === 1 ? "sairá" : "sairão"} do ar para os alunos ` +
    "e ficará esperando uma nova decisão.";
}

type ErroDoBanco = { code?: unknown; message?: unknown };

/** Os erros que a RPC `personalizacao_decidir` levanta, em português de tela. */
export function mensagemDoErro(erro: unknown): string {
  const { code, message } = (erro ?? {}) as ErroDoBanco;
  if (code === "40001") return "O material mudou depois que você o abriu. A lista foi atualizada: confira de novo antes de decidir.";
  if (code === "42501") return "Você só pode decidir sobre o material das suas turmas.";
  if (code === "22023" && typeof message === "string" && message.includes("geracao")) {
    return "Algum material ainda está sendo gerado. Espere terminar para aprovar.";
  }
  return typeof message === "string" && message ? message : "Não foi possível registrar a decisão.";
}

/**
 * Estado de aprovação de cada perfil no tópico (e conteúdo, se escolhido) da aba "Por perfil".
 * Perfil sem registro não aparece: não há o que aprovar.
 */
export function estadoPorPerfil(
  registros: RegistroAprovacao[],
  topicoId: number | null,
  conteudoId?: number | null,
): Record<string, EstadoDoGrupo> {
  const doRecorte = registros.filter(
    (r) => r.topicoId === topicoId && (conteudoId == null || r.conteudoId === conteudoId),
  );
  return Object.fromEntries(agruparPorTopicoEPerfil(doRecorte).map((g) => [g.perfil, g.estado]));
}

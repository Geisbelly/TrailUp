import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { PERFIS_EM_ORDEM } from "../dashboard/perfilCores";

/**
 * Esta lista TEM de espelhar o `CASE rt.criterio` de `vw_rank_posicoes_por_classe_todas`.
 * A view termina em `ELSE 0`, que não é erro: critério fora do CASE ranqueia a turma inteira
 * em zero, em silêncio — a mesma armadilha do PR #540.
 *
 * `percentual` existe no banco (é o `rank_tipo` 1, "Percentual Concluído") e o mobile já o
 * trata como percentual. `acertos` era oferecido aqui e não existia no CASE (todo ranking de
 * acertos mostrava zero para todos). Os dois ramos entraram na view em `20261021_06`, junto
 * com `ranqueada`; `missoes` entra na fase 7 (`20261021_08`) e `elo` na `20261021_18`. O vocabulário é fechado: o mobile compara contra estes literais.
 */
export type CriterioChave = "pontuacao" | "tempo" | "acertos" | "percentual" | "ranqueada" | "missoes" | "elo";

export const CRITERIOS: { chave: CriterioChave; rotulo: string }[] = [
  { chave: "pontuacao", rotulo: "Pontuação" },
  { chave: "tempo", rotulo: "Tempo" },
  { chave: "acertos", rotulo: "Acertos" },
  { chave: "percentual", rotulo: "Percentual" },
  { chave: "ranqueada", rotulo: "Ranqueada" },
  { chave: "missoes", rotulo: "Missões" },
  { chave: "elo", rotulo: "Elo" },
];

/** Critério vindo do banco é texto livre: o que não for conhecido cai em "pontuacao". */
export function criterioValido(c: string | null | undefined): CriterioChave {
  return CRITERIOS.some((x) => x.chave === c) ? (c as CriterioChave) : "pontuacao";
}

export function rotuloDoCriterio(c: string | null | undefined): string {
  return CRITERIOS.find((x) => x.chave === criterioValido(c))!.rotulo.toLowerCase();
}

export type Posicao = { aluno_id: string; aluno_nome: string; posicao: number | null; pontuacao: number | null };

/**
 * Pódio = as três primeiras linhas já ordenadas pela view. Devolvido na ordem
 * visual do protótipo (2º, 1º, 3º); posição ausente vira `null` para o layout
 * manter a coluna em vez de deslocar os vizinhos.
 */
export function podio(posicoes: Posicao[]): { lugar: 1 | 2 | 3; aluno: Posicao | null }[] {
  const top = posicoes.slice(0, 3);
  return ([2, 1, 3] as const).map((lugar) => ({ lugar, aluno: top[lugar - 1] ?? null }));
}

export const POR_PAGINA = 10;

/** Perfil dominante (maior afinidade) por aluno, na chave BrainHex minúscula. */
export function perfisDominantes(
  linhas: { aluno_id: string | null; afinidade: number | null; perfil: { nome: string } | null }[],
): Map<string, BrainHexProfileKey> {
  const melhor = new Map<string, { chave: BrainHexProfileKey; afinidade: number }>();
  for (const l of linhas) {
    const chave = l.perfil?.nome?.toLowerCase() as BrainHexProfileKey | undefined;
    if (!l.aluno_id || !chave || !PERFIS_EM_ORDEM.includes(chave)) continue;
    const afinidade = Number(l.afinidade ?? 0);
    const atual = melhor.get(l.aluno_id);
    if (!atual || afinidade > atual.afinidade) melhor.set(l.aluno_id, { chave, afinidade });
  }
  return new Map([...melhor].map(([id, v]) => [id, v.chave]));
}

export function formatarPontos(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("pt-BR");
}

// ---------------------------------------------------------------------------
// Criar e editar um ranking (fase 5 de `plano-do-que-falta`).
//
// Três fatos medidos na produção (`20261021_14`, somente leitura) desenham as regras abaixo:
//
// - **"Geral" (sem turma) nunca funcionou.** `ranks_posse_ins` exige `classe_id IN
//   app_classes_do_professor()`, então o INSERT com `classe_id = NULL` dá 42501; e a view
//   `vw_rank_posicoes_por_classe_todas` junta `classe_aluno` por `r.classe_id`, então mesmo que
//   entrasse não teria ninguém. A turma passa a ser obrigatória.
// - **`periodo` era só um nome.** A view não o lia: as posições somavam desde sempre. Com
//   `20261021_16` o ranking ganha janela (`inicio`/`fim`), e a rotação é **manual** (decisão da
//   Geisbelly, 2026-10-20): o professor abre um período novo, o atual fecha com o pódio
//   congelado em `rank_podio_congelado` e vira histórico só de leitura.
// - **Os tipos `ranqueada` (14) e `missoes` (15) existem e nenhuma turma os usa.** O seletor
//   mostra, para cada tipo, o que ele mede — é o que faltava para o professor escolhê-los.
// ---------------------------------------------------------------------------

/**
 * Como cada critério chega ao número da view. `soma` vem de eventos (e é o que acumularia
 * para sempre sem rotação); `estado` é uma foto do progresso atual em `classe_aluno`, que
 * rotação nenhuma reiniciaria.
 */
export const NATUREZA_DO_CRITERIO: Record<CriterioChave, "soma" | "estado"> = {
  pontuacao: "soma",
  ranqueada: "soma",
  missoes: "soma",
  tempo: "estado",
  acertos: "estado",
  percentual: "estado",
  // O rating é o de agora: um período novo guarda o pódio, mas não reinicia o Elo.
  elo: "estado",
};

const O_QUE_MEDE: Record<CriterioChave, string> = {
  pontuacao: "Pontos ganhos na turma: atividades, conteúdos, conquistas e prêmios.",
  ranqueada: "Pontos ganhos e perdidos em desafios ranqueados da arena.",
  missoes: "Quantas missões o aluno cumpriu na turma (diárias e do professor).",
  tempo: "Tempo de estudo registrado na turma, em minutos.",
  acertos: "Percentual de acertos do aluno na turma.",
  percentual: "Quanto da trilha da turma o aluno já concluiu.",
  elo: "Rating Elo dos desafios ranqueados contra adversário: ganhar de quem está acima vale mais. Começa em 1000.",
};

/** O que o tipo mede, para o seletor. A descrição do catálogo vence quando existe. */
export function oQueOTipoMede(tipo: { criterio: string | null; descricao: string | null }): string {
  return tipo.descricao?.trim() || O_QUE_MEDE[criterioValido(tipo.criterio)];
}

/** Aviso do período, por natureza do critério: o que o professor precisa saber antes de criar. */
export function avisoDoPeriodo(criterio: string | null | undefined): string {
  if (criterioValido(criterio) === "elo") {
    return "O Elo é o rating de agora: um período novo guarda o pódio no histórico, mas não reinicia o rating de ninguém.";
  }
  return NATUREZA_DO_CRITERIO[criterioValido(criterio)] === "soma"
    ? "Cada período soma só o que acontece nele. Para recomeçar, use “Novo período”: o atual fecha e o pódio fica no histórico."
    : "Este tipo mostra o progresso atual de cada aluno: um período novo não zera as posições, mas guarda o pódio de agora no histórico.";
}

/**
 * Período sugerido no formato que a produção já usa (`2026.2`): ano e semestre letivo, no
 * fuso de Brasília — às 22h de 30/06 em São Paulo já é 1º/07 em UTC, e a sugestão mudaria de
 * semestre três horas antes.
 */
export function periodoSugerido(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "numeric" }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  return `${ano}.${mes <= 6 ? 1 : 2}`;
}

export const PERIODO_MAX = 40;

export type FormularioDeRanking = { tipo_id: string; classe_id: string; periodo: string };
export type ErrosDoRanking = Partial<Record<keyof FormularioDeRanking, string>>;
export type RankExistente = { id: number; tipo_id: number; classe_id: number | null; periodo: string | null; fim?: string | null };

/** Aberto = período atual (`fim` NULL). Antes da `20261021_16` a coluna não existe: tudo está aberto. */
export const estaAberto = (r: { fim?: string | null }) => !r.fim;

const mesmoPeriodo = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Valida o formulário. Devolve o payload de `ranks` ou os erros por campo.
 *
 * Duplicata (mesmo tipo, turma e período) é recusada: a view calcularia duas listas idênticas,
 * e o professor não teria como saber qual é qual.
 */
export function validarRanking(
  form: FormularioDeRanking,
  existentes: RankExistente[],
  editandoId?: number,
): { ok: true; payload: { tipo_id: number; classe_id: number; periodo: string } } | { ok: false; erros: ErrosDoRanking } {
  const erros: ErrosDoRanking = {};
  const tipo = Number(form.tipo_id);
  const turma = Number(form.classe_id);
  const periodo = form.periodo.trim();

  if (!form.tipo_id || !Number.isInteger(tipo) || tipo <= 0) erros.tipo_id = "Escolha o tipo de ranking.";
  if (!form.classe_id || !Number.isInteger(turma) || turma <= 0) erros.classe_id = "Escolha a turma: o ranking é sempre de uma turma.";
  if (!periodo) erros.periodo = "Dê um nome ao período (ex.: 2026.2).";
  else if (periodo.length > PERIODO_MAX) erros.periodo = `No máximo ${PERIODO_MAX} caracteres.`;

  if (Object.keys(erros).length === 0) {
    const outros = existentes.filter((r) => r.id !== editandoId && r.tipo_id === tipo && r.classe_id === turma);
    // O banco aceita um só período ABERTO por tipo + turma (`ranks_um_periodo_aberto`).
    if (outros.some(estaAberto)) erros.tipo_id = "Esta turma já tem um ranking deste tipo aberto. Para recomeçar, use “Novo período” nele.";
    else if (outros.some((r) => mesmoPeriodo(r.periodo, periodo))) erros.periodo = "Já existe um ranking deste tipo para esta turma neste período.";
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, payload: { tipo_id: tipo, classe_id: turma, periodo } };
}

// ---------------------------------------------------------------------------
// Novo período (rotação manual) e histórico.
// ---------------------------------------------------------------------------

/**
 * Nome sugerido para o período seguinte. Semestre (`2026.2` → `2027.1`, com `.` ou `/`) avança;
 * outro formato cai no semestre corrente. Pula nomes que a turma já usou neste tipo.
 */
export function proximoPeriodo(atual: string | null | undefined, usados: (string | null)[] = [], agora: Date = new Date()): string {
  const avancar = (p: string) => {
    const m = /^(\d{4})([./])([12])$/.exec(p.trim());
    if (!m) return null;
    const ano = Number(m[1]);
    return m[3] === "1" ? `${ano}${m[2]}2` : `${ano + 1}${m[2]}1`;
  };
  const jaUsado = (p: string) => usados.some((u) => mesmoPeriodo(u, p)) || mesmoPeriodo(atual, p);
  let sugestao = avancar(atual ?? "") ?? periodoSugerido(agora);
  for (let i = 0; i < 12 && jaUsado(sugestao); i++) sugestao = avancar(sugestao) ?? `${sugestao} (2)`;
  return sugestao;
}

/** Valida o nome do período novo contra os períodos que este tipo já teve nesta turma. */
export function validarNovoPeriodo(nome: string, usados: (string | null)[]): string | null {
  const periodo = nome.trim();
  if (!periodo) return "Dê um nome ao período novo (ex.: 2027.1).";
  if (periodo.length > PERIODO_MAX) return `No máximo ${PERIODO_MAX} caracteres.`;
  if (usados.some((u) => mesmoPeriodo(u, periodo))) return "Esta turma já teve um período com este nome neste ranking.";
  return null;
}

/** Períodos (abertos e fechados) do mesmo tipo + turma: o que `proximoPeriodo` e a validação consultam. */
export const periodosDoMesmoRanking = (rank: RankExistente, todos: RankExistente[]) =>
  todos.filter((r) => r.tipo_id === rank.tipo_id && r.classe_id === rank.classe_id).map((r) => r.periodo);

/** Abertos na ordem que vieram; fechados do mais recente para o mais antigo. */
export function separarPorPeriodo<T extends RankExistente>(ranks: T[]): { abertos: T[]; historico: T[] } {
  const abertos = ranks.filter(estaAberto);
  const historico = ranks.filter((r) => !estaAberto(r)).sort((a, b) => String(b.fim).localeCompare(String(a.fim)));
  return { abertos, historico };
}

/** Data do fechamento no fuso de Brasília, para o selo do histórico. */
export function dataDoFechamento(fim: string | null | undefined): string {
  if (!fim) return "";
  const d = new Date(fim);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Erro da RPC `fn_rank_novo_periodo` em texto para o professor. */
export function mensagemDoNovoPeriodo(erro: { code?: string | null; message?: string | null } | null | undefined): string {
  switch (erro?.code) {
    case "23505":
      return "Esta turma já teve um período com este nome neste ranking.";
    case "55000":
      return "Este período já foi encerrado. Atualize a página para ver o período atual.";
    case "22023":
      return erro.message || "Nome de período inválido.";
    case "42501":
      return "Você não tem permissão para mudar o período deste ranking.";
    case "PGRST202":
      return "O banco ainda não tem o período manual. Tente de novo depois da atualização.";
    default:
      return "Não foi possível abrir o período novo.";
  }
}

/** Erro de excluir ranking: período encerrado é histórico e o banco recusa (`trg_ranks_guarda`). */
export function mensagemDaExclusao(erro: { code?: string | null } | null | undefined): string {
  return erro?.code === "42501"
    ? "Período encerrado é histórico e não pode ser excluído."
    : "Não foi possível excluir o ranking.";
}

/** Texto da confirmação de excluir: o período aberto sai, os encerrados do mesmo ranking ficam. */
export function detalheDaExclusao(rank: RankExistente, todos: RankExistente[]): string {
  const temHistorico = todos.some((r) => r.id !== rank.id && r.tipo_id === rank.tipo_id && r.classe_id === rank.classe_id && !estaAberto(r));
  return temHistorico
    ? "Sai só o período atual. Os períodos encerrados continuam no histórico, com o pódio congelado. Os eventos dos alunos não são alterados."
    : "As posições deste ranking deixam de ser exibidas. Os eventos dos alunos não são alterados.";
}

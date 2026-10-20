/**
 * A missão como o aluno a vê — a do dia e a do professor, no mesmo lugar.
 *
 * O que ele pode ver é a RLS que decide, e `missoes_aluno_sel` já resolve três coisas:
 *
 *     ativa AND aprovacao IN ('nao_requer','aprovada') AND classe_id IN app_classes_do_aluno()
 *
 * Ou seja: missão inativa, de outra turma, ou **pendente de aprovação** nunca chega aqui. A
 * aprovação da missão de guilda vinda da IA é barrada por policy, não por filtro de tela — e
 * por isso esta tela não tem (nem deve ter) checagem de `aprovacao`.
 *
 * O que a policy **não** filtra, e portanto é trabalho daqui: `origem`, `dia`, a janela e
 * `perfil_alvo`.
 */

export type OrigemDaMissao = "sistema" | "professor";
export type EscopoDaMissao = "aluno" | "turma" | "guilda";
export type StatusDaMissao = "pendente" | "em_andamento" | "concluida";

export type MissaoDoAluno = {
  id: number;
  titulo: string;
  descricao: string;
  progresso: number;
  status: StatusDaMissao;
  criterioRotulo: string;
  origem: OrigemDaMissao;
  escopo: EscopoDaMissao;
  /** `janela_fim`. `null` = sem prazo. */
  prazo: string | null;
  /** O dia da diária. `null` nas do professor — e é isso que muda a ordenação. */
  dia: string | null;
  slot: number | null;
};

export function statusDe(s: string | null | undefined): StatusDaMissao {
  const v = (s ?? "").toLowerCase();
  if (v.includes("conclu")) return "concluida";
  if (v.includes("andamento") || v.includes("progress")) return "em_andamento";
  return "pendente";
}

export function rotuloCriterio(criterio: unknown): string {
  const c = criterio && typeof criterio === "object" ? (criterio as Record<string, unknown>) : null;
  const metrica = String(c?.metrica ?? "");
  if (metrica === "minutos_no_dia") return `${Number(c?.minutos) || "?"} min hoje`;
  if (metrica === "eventos_no_dia") {
    const n = Number(c?.minimo) || "?";
    const ev = String(c?.evento ?? "");
    if (ev.includes("atividade")) return `${n} atividade(s)`;
    if (ev.includes("conteudo")) return `${n} conteúdo(s)`;
    return `${n} ação(ões) na trilha`;
  }
  // As métricas acumuladas do professor. O rótulo sai da chave que `criterioDeMeta` grava.
  if (metrica === "minutos_totais") return `${Number(c?.minutos) || "?"} min no total`;
  if (metrica === "dias_seguidos") return `${Number(c?.dias_seguidos) || "?"} dia(s) seguidos`;
  if (metrica === "topicos_concluidos") return `${Number(c?.minimo) || "?"} tópico(s)`;
  if (metrica === "atividades_concluidas") return `${Number(c?.minimo) || "?"} atividade(s)`;
  if (metrica === "acertos_percentual") return `${Number(c?.percentual) || "?"}% de acerto`;
  if (metrica === "trilha_percentual") return `${Number(c?.percentual) || "?"}% da trilha`;
  if (metrica === "atividade_especifica") return "entregar a atividade";
  return metrica || "missão";
}

/**
 * A missão vale agora?
 *
 * Janela aberta dos dois lados (`null`) é missão sem prazo, que vale sempre. A diária não usa
 * janela para isso — ela é escolhida pelo `dia`, e a janela dela existe para o avaliador
 * (`20261021_05` grava meia-noite a meia-noite de Brasília).
 */
export function vigente(missao: Pick<MissaoDoAluno, "prazo"> & { inicio?: string | null }, agora: Date = new Date()): boolean {
  const t = agora.getTime();
  const inicio = missao.inicio ? Date.parse(missao.inicio) : null;
  const fim = missao.prazo ? Date.parse(missao.prazo) : null;
  if (inicio !== null && Number.isFinite(inicio) && t < inicio) return false;
  if (fim !== null && Number.isFinite(fim) && t > fim) return false;
  return true;
}

/** "até hoje", "até amanhã", "até 25/10" — ou vazio quando não há prazo. */
export function rotuloDoPrazo(prazo: string | null, agora: Date = new Date()): string {
  if (!prazo) return "";
  const t = Date.parse(prazo);
  if (!Number.isFinite(t)) return "";
  const fim = new Date(t);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(fim) - dia(agora)) / 86400000);
  if (dias < 0) return "prazo encerrado";
  if (dias === 0) return "até hoje";
  if (dias === 1) return "até amanhã";
  return `até ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}

/**
 * A ordem da lista.
 *
 * A diária vem primeiro, por `slot` — é o que o aluno abre o app para ver. Depois a do
 * professor, pelo prazo mais próximo.
 *
 * **O cuidado que o plano apontou:** a lista era ordenada por `dia`, e missão de professor
 * **não tem `dia`**. Ordenar por uma chave nula joga todas juntas numa ordem arbitrária que
 * muda a cada carregamento. Daí a desempate explícito por prazo e, no fim, por `id` — para a
 * lista não "dançar" entre dois carregamentos iguais.
 */
export function ordenarMissoes(missoes: MissaoDoAluno[]): MissaoDoAluno[] {
  const peso = (m: MissaoDoAluno) => (m.origem === "sistema" ? 0 : 1);
  return [...missoes].sort((a, b) => {
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    if (a.origem === "sistema") {
      const sa = a.slot ?? 99;
      const sb = b.slot ?? 99;
      if (sa !== sb) return sa - sb;
      return a.id - b.id;
    }
    // Sem prazo vai para o fim: prazo é urgência, e o que não tem urgência pode esperar.
    const pa = a.prazo ? Date.parse(a.prazo) : Number.POSITIVE_INFINITY;
    const pb = b.prazo ? Date.parse(b.prazo) : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

export function rotuloDoEscopo(escopo: EscopoDaMissao): string {
  if (escopo === "guilda") return "da guilda";
  if (escopo === "turma") return "da turma";
  return "";
}

type PerfilComAfinidade = { nome?: string | null; afinidade?: number | null };

/**
 * Os perfis REPRESENTATIVOS do aluno, pela mesma regra do banco.
 *
 * É o `representativos` do laço de missão de `trg_eventos_aluno_after_iud` e, desde
 * `20261021_20`, também o recorte de coorte de `fn_missao_diaria_gerar`:
 *
 *     afinidade >= 20  OU  (afinidade > 0 E está entre os 2 primeiros)
 *     ordem: afinidade DESC, nome ASC
 *
 * O desempate por nome importa: `resolveRepresentativeBrainHexProfiles` (utils/brainHex) usa a
 * mesma regra, mas desempata pela ordem em que as linhas chegaram, e o banco não garante essa
 * ordem entre afinidades iguais. Aqui o desempate é o do SQL, para a tela e o gatilho
 * concordarem sobre qual missão é do aluno.
 */
export function perfisRepresentativos(perfis: PerfilComAfinidade[] | null | undefined): string[] {
  if (!Array.isArray(perfis)) return [];
  return perfis
    .map((p) => ({ nome: (p?.nome ?? "").trim(), af: Number(p?.afinidade ?? 0) || 0 }))
    .filter((p) => p.nome !== "")
    .sort((a, b) => (b.af !== a.af ? b.af - a.af : a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))
    .filter((p, pos) => p.af >= 20 || (p.af > 0 && pos < 2))
    .map((p) => p.nome.toLowerCase());
}

/**
 * O PERFIL DA MISSÃO: o único perfil cujas missões diárias o aluno vê e cumpre.
 *
 * Decisão de produto (20/10): o banco avalia só as missões do perfil ativo. Esta função é a MESMA
 * regra de `fn_perfil_da_missao` (`20261021_20`), que o gerador e os dois gatilhos de missão usam:
 *
 *     o `alunos.perfil_ativo` salvo, se ainda for representativo;
 *     senão o 1º representativo (afinidade DESC, nome ASC);
 *     senão `null`.
 *
 * Determinística e sem estado do app: as entradas são `alunos.perfil_ativo` e `aluno_perfil`, as
 * mesmas do banco. Sem perfis (ainda não carregados, ou nenhum representativo) é `null`, como no
 * banco — e `null` em `montarMissoes` mostra só as missões sem `perfil_alvo`.
 */
export function perfilDaMissao(
  perfis: PerfilComAfinidade[] | null | undefined,
  perfilAtivo?: string | null,
): string | null {
  const ativo = perfilAtivo ? perfilAtivo.trim().toLowerCase() : null;
  const representativos = perfisRepresentativos(perfis);
  if (ativo && representativos.includes(ativo)) return ativo;
  return representativos[0] ?? null;
}

type LinhaMissao = {
  id: number;
  titulo: string | null;
  descricao: string | null;
  criterio: unknown;
  perfil_alvo: string | null;
  dia: string | null;
  slot: number | null;
  origem: string | null;
  escopo: string | null;
  janela_inicio: string | null;
  janela_fim: string | null;
};

type LinhaProgresso = { missao_id: number; status: string | null; progresso: number | null };

export function montarMissoes(
  linhas: LinhaMissao[],
  progresso: LinhaProgresso[],
  opcoes: { perfilAtivo?: string | null; agora?: Date } = {},
): MissaoDoAluno[] {
  const agora = opcoes.agora ?? new Date();
  const porId = new Map<number, LinhaProgresso>();
  for (const p of progresso) porId.set(Number(p.missao_id), p);

  // `undefined` = sem filtro de perfil (chamador antigo). `null` = o aluno não tem perfil da
  // missão: como no banco (`20261021_20`), nenhuma missão com `perfil_alvo` é dele.
  const filtrarPerfil = opcoes.perfilAtivo !== undefined;
  const perfil = opcoes.perfilAtivo ? opcoes.perfilAtivo.trim().toLowerCase() : null;

  const montadas = linhas
    // `perfil_alvo` é da diária por coorte: missão de outro perfil não é minha.
    .filter(
      (m) => !m.perfil_alvo || !filtrarPerfil || (perfil !== null && m.perfil_alvo.toLowerCase() === perfil),
    )
    .map((m): MissaoDoAluno => {
      const p = porId.get(Number(m.id));
      return {
        id: Number(m.id),
        titulo: m.titulo?.trim() || "Missão",
        descricao: m.descricao?.trim() || "",
        progresso: Number(p?.progresso ?? 0),
        status: statusDe(p?.status),
        criterioRotulo: rotuloCriterio(m.criterio),
        origem: m.origem === "professor" ? "professor" : "sistema",
        escopo: m.escopo === "guilda" ? "guilda" : m.escopo === "aluno" ? "aluno" : "turma",
        prazo: m.janela_fim,
        dia: m.dia,
        slot: m.slot === null || m.slot === undefined ? null : Number(m.slot),
      };
    })
    // A do professor só aparece dentro da janela. A diária já vem filtrada pelo `dia`, e a
    // janela dela (meia-noite a meia-noite) seria redundante — mas não atrapalha.
    .filter((m) => (m.origem === "professor" ? vigente({ prazo: m.prazo }, agora) : true));

  return ordenarMissoes(montadas);
}

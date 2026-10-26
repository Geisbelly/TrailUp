import { supabase } from "@/integrations/supabase/client";
import type { PayloadDoEvento, StatusDoEvento } from "./evento";
import type { AlunoNoEvento, PainelDurante, SituacaoDoAluno } from "./durante";
import type { LinhaDeGuilda, LinhaDeResultado } from "./resultado";

// `eventos_classe` e as funções `evento_classe_*` são novas (migrations 20261017_01/02) e não estão
// nos tipos gerados do Supabase, por isso as chamadas passam por `as never`.

export type Evento = {
  id: string;
  classeId: number;
  topicoId: number | null;
  titulo: string;
  descricao: string;
  status: StatusDoEvento;
  inicio: string;
  fim: string;
  modalidadeGuilda: boolean;
  guildaTamanhoMax: number | null;
  pecas: string[];
  /** Ids das missões ligadas (peça "Missões"). */
  missoes: number[];
  pontos: number;
  moedas: number;
  medalhaParticipacao: boolean;
  medalhaDestaque: boolean;
  recompensa: string;
  /** Rascunho agendado: abre sozinho no início (#141). */
  abrirNoInicio: boolean;
};

type LinhaDeEvento = {
  id: string;
  classe_id: number;
  topico_id: number | null;
  titulo: string;
  descricao: string | null;
  status: string;
  inicio: string;
  fim: string;
  modalidade_guilda: boolean;
  guilda_tamanho_max: number | null;
  pecas: unknown;
  pontos: number | null;
  moedas: number | null;
  medalha_participacao: boolean;
  medalha_destaque: boolean;
  recompensa: string | null;
  abrir_no_inicio: boolean | null;
};

const COLUNAS =
  "id, classe_id, topico_id, titulo, descricao, status, inicio, fim, modalidade_guilda, guilda_tamanho_max, pecas, pontos, moedas, medalha_participacao, medalha_destaque, recompensa, abrir_no_inicio";

const STATUS: StatusDoEvento[] = ["rascunho", "aberto", "encerrado"];

export function mapearEvento(l: LinhaDeEvento, missoes: number[] = []): Evento {
  return {
    id: l.id,
    classeId: l.classe_id,
    topicoId: l.topico_id,
    titulo: l.titulo,
    descricao: l.descricao ?? "",
    // Status desconhecido cai em rascunho: é o único que não promete nada ao aluno.
    status: STATUS.includes(l.status as StatusDoEvento) ? (l.status as StatusDoEvento) : "rascunho",
    inicio: l.inicio,
    fim: l.fim,
    modalidadeGuilda: !!l.modalidade_guilda,
    guildaTamanhoMax: l.guilda_tamanho_max,
    pecas: Array.isArray(l.pecas) ? l.pecas.filter((p): p is string => typeof p === "string") : [],
    missoes,
    pontos: Number(l.pontos ?? 0),
    moedas: Number(l.moedas ?? 0),
    medalhaParticipacao: !!l.medalha_participacao,
    medalhaDestaque: !!l.medalha_destaque,
    recompensa: l.recompensa ?? "",
    abrirNoInicio: !!l.abrir_no_inicio,
  };
}

export async function listarEventos(classeId: number): Promise<Evento[]> {
  const { data, error } = await supabase
    .from("eventos_classe" as never)
    .select(COLUNAS)
    .eq("classe_id", classeId)
    .order("inicio", { ascending: false });
  if (error) throw error;
  const linhas = (data ?? []) as unknown as LinhaDeEvento[];
  const ligadas = await listarMissoesLigadas(linhas.map((l) => l.id));
  return linhas.map((l) => mapearEvento(l, ligadas.get(l.id) ?? []));
}

/** Cria (sem `id`) ou atualiza um evento e devolve o id. O status NUNCA vai no payload: só as funções abrir/encerrar o mudam. */
export async function salvarEvento(classeId: number, payload: PayloadDoEvento, id?: string): Promise<string> {
  const tabela = () => supabase.from("eventos_classe" as never);
  if (id) {
    const { error } = await tabela()
      .update(payload as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await tabela()
    .insert({ ...payload, classe_id: classeId } as never)
    .select("id")
    .single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

/** Ligações evento → missões, em lote (uma consulta para a lista toda). */
export async function listarMissoesLigadas(eventoIds: string[]): Promise<Map<string, number[]>> {
  const mapa = new Map<string, number[]>();
  if (eventoIds.length === 0) return mapa;
  const { data, error } = await supabase.from("eventos_classe_missoes" as never).select("evento_id, atividade_id").in("evento_id", eventoIds);
  if (error) throw error;
  for (const l of (data ?? []) as unknown as { evento_id: string; atividade_id: number }[]) {
    mapa.set(l.evento_id, [...(mapa.get(l.evento_id) ?? []), Number(l.atividade_id)]);
  }
  return mapa;
}

/** Troca a lista de missões do evento (só rascunho; o banco confere a posse e que as missões são da turma). */
export async function definirMissoes(eventoId: string, atividadeIds: number[]): Promise<number> {
  const { data, error } = await supabase.rpc("evento_classe_definir_missoes" as never, { p_evento_id: eventoId, p_atividades: atividadeIds } as never);
  if (error) throw error;
  return Number(data ?? 0);
}

export type MissaoDisponivel = { id: number; titulo: string; topicoNome: string };

/** Missões da turma que podem entrar num evento. */
export async function listarMissoesDaTurma(classeId: number): Promise<MissaoDisponivel[]> {
  const { data, error } = await supabase
    .from("atividades")
    .select("id, titulo, topicos!inner(nome, classe_id)")
    .eq("tipo", "missao")
    .eq("topicos.classe_id", classeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { id: number; titulo: string; topicos: { nome: string | null } | { nome: string | null }[] | null }[]).map((a) => {
    const t = Array.isArray(a.topicos) ? a.topicos[0] : a.topicos;
    return { id: a.id, titulo: a.titulo, topicoNome: t?.nome?.trim() || "Sem tópico" };
  });
}

/** Evento já aberto/encerrado: o banco só aceita título e descrição, então só eles vão no UPDATE. */
export async function salvarTextoDoEvento(id: string, titulo: string, descricao: string): Promise<void> {
  const { error } = await supabase
    .from("eventos_classe" as never)
    .update({ titulo, descricao } as never)
    .eq("id", id);
  if (error) throw error;
}

/** Abre o evento; com modalidade de guilda, o banco congela as guildas. Devolve quantas linhas congelou. */
export async function abrirEvento(id: string): Promise<number> {
  const { data, error } = await supabase.rpc("evento_classe_abrir" as never, { p_evento_id: id } as never);
  if (error) throw error;
  return Number((data as { guildas_congeladas?: number } | null)?.guildas_congeladas ?? 0);
}

export async function encerrarEvento(id: string): Promise<void> {
  const { error } = await supabase.rpc("evento_classe_encerrar" as never, { p_evento_id: id } as never);
  if (error) throw error;
}

/** Só rascunho é apagável (a policy do banco recusa o resto, e a linha não some em silêncio — ver `.select`). */
export async function excluirEvento(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("eventos_classe" as never)
    .delete()
    .eq("id", id)
    .eq("status", "rascunho")
    .select("id");
  if (error) throw error;
  if (!data || (data as unknown[]).length === 0) {
    throw new Error("Só um rascunho pode ser excluído.");
  }
}

/** Mensagem curta para o professor a partir do erro do banco (as funções já escrevem em português). */
export function traduzirErroDeEvento(e: unknown, padrao: string): string {
  const msg = (e as { message?: string })?.message?.trim() ?? "";
  if (/permiss|42501/i.test(msg) && !/Depois de aberto|estado do evento/i.test(msg)) return "Você não tem permissão para isso nesta turma.";
  if (/eventos_classe_janela/.test(msg)) return "O fim precisa ser depois do começo.";
  if (/destaque_com_participacao/.test(msg)) return "A medalha de destaque vem sempre junto com a de participação.";
  if (/guilda_com_tamanho/.test(msg)) return "Informe o tamanho da guilda só quando houver modalidade de guilda.";
  return msg && msg.length < 160 ? msg : padrao;
}

export type ResultadoApurado = { alunos: LinhaDeResultado[]; guildas: LinhaDeGuilda[] };

type ResultadoBruto = { aluno_id: string; pontos: number | string | null; participou: boolean; posicao: number | null; destaque: boolean };
type ResultadoGuildaBruto = { guilda_id: string; pontos: number | string | null; membros: number | null; posicao: number | null };

/** Resultado gravado na apuração (ao encerrar). Os nomes vêm de `alunos` e `guildas`; sem nome, rótulo neutro. */
export async function listarResultado(eventoId: string): Promise<ResultadoApurado> {
  const [alunosR, guildasR] = await Promise.all([
    supabase.from("eventos_classe_resultado" as never).select("aluno_id, pontos, participou, posicao, destaque").eq("evento_id", eventoId),
    supabase.from("eventos_classe_resultado_guilda" as never).select("guilda_id, pontos, membros, posicao").eq("evento_id", eventoId),
  ]);
  if (alunosR.error) throw alunosR.error;
  if (guildasR.error) throw guildasR.error;
  const alunos = (alunosR.data ?? []) as unknown as ResultadoBruto[];
  const guildas = (guildasR.data ?? []) as unknown as ResultadoGuildaBruto[];

  const [nomesAlunos, nomesGuildas] = await Promise.all([
    alunos.length > 0 ? supabase.from("alunos").select("id, nome").in("id", alunos.map((a) => a.aluno_id)) : Promise.resolve({ data: [], error: null }),
    guildas.length > 0 ? supabase.from("guildas").select("id, nome").in("id", guildas.map((g) => g.guilda_id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (nomesAlunos.error) throw nomesAlunos.error;
  if (nomesGuildas.error) throw nomesGuildas.error;
  const nomeDoAluno = new Map(((nomesAlunos.data ?? []) as { id: string; nome: string | null }[]).map((a) => [a.id, a.nome]));
  const nomeDaGuilda = new Map(((nomesGuildas.data ?? []) as { id: string; nome: string | null }[]).map((g) => [g.id, g.nome]));

  return {
    alunos: alunos.map((a) => ({
      alunoId: a.aluno_id,
      nome: nomeDoAluno.get(a.aluno_id)?.trim() || "Aluno",
      pontos: Number(a.pontos ?? 0),
      participou: !!a.participou,
      posicao: a.posicao,
      destaque: !!a.destaque,
    })),
    guildas: guildas
      .map((g) => ({ guildaId: g.guilda_id, nome: nomeDaGuilda.get(g.guilda_id)?.trim() || "Guilda", pontos: Number(g.pontos ?? 0), membros: g.membros ?? 0, posicao: g.posicao }))
      .sort((a, b) => (a.posicao ?? Infinity) - (b.posicao ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

const SITUACOES: SituacaoDoAluno[] = ["comecou", "parou", "nao_comecou"];

/** Normaliza o JSON de `evento_classe_durante`; número ou situação fora do esperado vira o valor mais seguro. */
export function mapearDurante(b: Record<string, unknown> | null): PainelDurante {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const mod = (b?.por_modalidade ?? {}) as Record<string, unknown>;
  const alunos = Array.isArray(b?.alunos) ? (b.alunos as Record<string, unknown>[]) : [];
  return {
    total: n(b?.total),
    comecaram: n(b?.comecaram),
    pararam: n(b?.pararam),
    naoComecaram: n(b?.nao_comecaram),
    guildasAtivas: n(b?.guildas_ativas),
    guildasTotal: n(b?.guildas_total),
    porModalidade: { individual: n(mod.individual), guilda: n(mod.guilda) },
    alunos: alunos.map(
      (a): AlunoNoEvento => ({
        alunoId: String(a.aluno_id),
        nome: typeof a.nome === "string" && a.nome.trim() ? a.nome.trim() : "Aluno",
        situacao: SITUACOES.includes(a.situacao as SituacaoDoAluno) ? (a.situacao as SituacaoDoAluno) : "nao_comecou",
      }),
    ),
  };
}

/** Painel "Durante": quem começou, parou e as guildas ativas. Evento em rascunho o banco recusa. */
export async function lerDurante(eventoId: string): Promise<PainelDurante> {
  const { data, error } = await supabase.rpc("evento_classe_durante" as never, { p_evento_id: eventoId } as never);
  if (error) throw error;
  return mapearDurante((data ?? null) as Record<string, unknown> | null);
}

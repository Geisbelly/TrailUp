import { supabase } from "@/integrations/supabase/client";
import type { PayloadDoEvento, StatusDoEvento } from "./evento";

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
  pontos: number;
  moedas: number;
  medalhaParticipacao: boolean;
  medalhaDestaque: boolean;
  recompensa: string;
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
};

const COLUNAS =
  "id, classe_id, topico_id, titulo, descricao, status, inicio, fim, modalidade_guilda, guilda_tamanho_max, pecas, pontos, moedas, medalha_participacao, medalha_destaque, recompensa";

const STATUS: StatusDoEvento[] = ["rascunho", "aberto", "encerrado"];

export function mapearEvento(l: LinhaDeEvento): Evento {
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
    pontos: Number(l.pontos ?? 0),
    moedas: Number(l.moedas ?? 0),
    medalhaParticipacao: !!l.medalha_participacao,
    medalhaDestaque: !!l.medalha_destaque,
    recompensa: l.recompensa ?? "",
  };
}

export async function listarEventos(classeId: number): Promise<Evento[]> {
  const { data, error } = await supabase
    .from("eventos_classe" as never)
    .select(COLUNAS)
    .eq("classe_id", classeId)
    .order("inicio", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as LinhaDeEvento[]).map(mapearEvento);
}

/** Cria (sem `id`) ou atualiza um evento. O status NUNCA vai no payload: só as funções abrir/encerrar o mudam. */
export async function salvarEvento(classeId: number, payload: PayloadDoEvento, id?: string): Promise<void> {
  const tabela = () => supabase.from("eventos_classe" as never);
  if (id) {
    const { error } = await tabela()
      .update(payload as never)
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await tabela().insert({ ...payload, classe_id: classeId } as never);
  if (error) throw error;
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

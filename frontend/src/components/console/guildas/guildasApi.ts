import { supabase } from "@/integrations/supabase/client";
import { TAMANHO_PADRAO, type Formacao, type GuildaDaTurma, type PayloadDaFormacao } from "./formacao";

// `guilda_formacao_da_turma` é nova (migration 20261021_17); as outras duas são de 20260912_07.
// Nenhuma está nos tipos gerados do Supabase com estes nomes de parâmetro, daí o `as never`.

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const numero = (v: unknown, padrao = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
};

export function mapearGuilda(b: Bruto): GuildaDaTurma {
  const membros = Array.isArray(b.membros) ? (b.membros as Bruto[]) : [];
  return {
    id: String(b.id),
    nome: texto(b.nome) ?? "Guilda",
    descricao: texto(b.descricao),
    limite: numero(b.limite_membros, TAMANHO_PADRAO),
    criadaEm: String(b.criada_em ?? ""),
    membros: membros.map((m) => ({ alunoId: String(m.aluno_id), nome: texto(m.nome) ?? "Sem nome", entrouEm: String(m.entrou_em ?? "") })),
  };
}

export function mapearFormacao(b: Bruto, classeId: number): Formacao {
  return {
    classeId: numero(b.classe_id, classeId),
    configurada: b.configurada === true,
    tamanhoMaximo: numero(b.tamanho_maximo, TAMANHO_PADRAO),
    inicio: texto(b.formacao_inicio),
    fim: texto(b.formacao_fim),
    janelaAberta: b.janela_aberta !== false,
    agora: texto(b.agora) ?? new Date().toISOString(),
    alunosNaTurma: numero(b.alunos_na_turma),
    alunosSemGuilda: numero(b.alunos_sem_guilda),
    guildas: (Array.isArray(b.guildas) ? (b.guildas as Bruto[]) : []).map(mapearGuilda),
  };
}

export async function lerFormacao(classeId: number): Promise<Formacao> {
  const { data, error } = await supabase.rpc("guilda_formacao_da_turma" as never, { p_classe_id: classeId } as never);
  if (error) throw error;
  return mapearFormacao((data ?? {}) as Bruto, classeId);
}

export async function salvarFormacao(payload: PayloadDaFormacao): Promise<void> {
  const { error } = await supabase.rpc("guilda_configurar_turma" as never, payload as never);
  if (error) throw error;
}

/** `guilda_atualizar` grava `NULLIF(btrim(descricao), '')`: descrição vazia limpa; emblema nulo mantém. */
export async function renomearGuilda(guildaId: string, nome: string, descricao: string): Promise<void> {
  const { error } = await supabase.rpc("guilda_atualizar" as never, { p_guilda_id: guildaId, p_nome: nome, p_descricao: descricao, p_emblema: null } as never);
  if (error) throw error;
}

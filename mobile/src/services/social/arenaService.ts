import { supabase } from "@/database/supabase";

import {
  normalizarDesafios,
  normalizarRodada,
  type ArenaDesafio,
  type ArenaFormato,
  type ArenaModo,
  type ArenaRodada,
} from "./arenaModel";

async function rpc(nome: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nome, params);
  if (error) throw error;
  return data as unknown;
}

export async function carregarArena(classeId: number): Promise<ArenaDesafio[]> {
  if (!classeId || classeId <= 0) return [];
  return normalizarDesafios(await rpc("arena_listar", { p_classe_id: classeId }));
}

export async function carregarRodada(desafioId: string): Promise<ArenaRodada | null> {
  return normalizarRodada(await rpc("arena_desafio", { p_desafio_id: desafioId }));
}

export type CriarDesafioParams = {
  classeId: number;
  formato: ArenaFormato;
  modo: ArenaModo;
  quantidade: number;
  guildaId?: string | null;
  guildaRivalId?: string | null;
  aliadoId?: string | null;
  adversarios?: readonly string[];
};

export async function criarDesafio(params: CriarDesafioParams) {
  // Os nomes dos parametros sao os da RPC. O banco valida formato x
  // participantes de novo -- a validacao do cliente e para o botao, nao e a
  // autoridade.
  return rpc("arena_desafio_criar", {
    p_classe_id: params.classeId,
    p_formato: params.formato,
    p_modo: params.modo,
    p_quantidade: params.quantidade,
    p_guilda_id: params.guildaId ?? null,
    p_guilda_rival: params.guildaRivalId ?? null,
    p_aliado: params.aliadoId ?? null,
    p_adversarios: params.adversarios?.length ? [...params.adversarios] : null,
  });
}

export const responderConvite = (desafioId: string, aceitar: boolean) =>
  rpc("arena_convite_responder", { p_desafio_id: desafioId, p_aceitar: aceitar });

/**
 * `tempoMs` e a latencia da tentativa -- o intervalo entre a questao aparecer e
 * o aluno confirmar --, a mesma medida que `QuestionActivity` ja grava em
 * `questao_aluno.tempo_gasto_seg`. E o que decide o desempate do modo
 * velocidade; o servidor apara em 10 minutos.
 */
export const responderQuestao = (
  desafioId: string,
  questaoId: number,
  resposta: string,
  tempoMs: number,
) =>
  rpc("arena_responder", {
    p_desafio_id: desafioId,
    p_questao_id: questaoId,
    p_resposta: resposta,
    p_tempo_ms: Math.max(0, Math.round(tempoMs)),
  });

export const encerrarDesafio = (desafioId: string) =>
  rpc("arena_encerrar", { p_desafio_id: desafioId });

/** Mensagens que a tela mostra no lugar do erro cru da RPC. */
export function mensagemDeErroDaArena(erro: unknown): string {
  const texto = String((erro as { message?: unknown })?.message ?? erro ?? "").toLowerCase();
  if (texto.includes("arena_sem_questoes_liberadas")) {
    return "Ninguém desta rodada abriu conteúdo suficiente ainda. Avance na trilha e tente de novo.";
  }
  if (texto.includes("arena_rival_sem_membros")) return "Essa guilda não tem ninguém para jogar.";
  if (texto.includes("arena_rival_invalida")) return "Essa guilda não pode ser a rival.";
  if (texto.includes("arena_participante_bloqueado")) return "Há um bloqueio entre vocês.";
  if (texto.includes("arena_participante_repetido")) return "Cada pessoa só pode entrar uma vez.";
  if (texto.includes("arena_participante_fora_da_turma")) return "Essa pessoa não é da turma.";
  if (texto.includes("arena_formato_invalido")) return "Faltou escolher quem joga.";
  if (texto.includes("arena_convite_indisponivel")) return "Este convite não está mais aberto.";
  if (texto.includes("arena_questao_fora_do_desafio")) return "Essa questão não é desta rodada.";
  if (texto.includes("arena_sem_permissao")) return "Você não faz parte deste desafio.";
  if (texto.includes("arena_desafio_inexistente")) return "Este desafio não existe mais.";
  if (texto.includes("arena_") || (texto.includes("function") && texto.includes("does not exist"))) {
    return "A Arena ainda não foi ativada neste ambiente. A migração do banco precisa ser aplicada.";
  }
  return "Não foi possível concluir a ação.";
}

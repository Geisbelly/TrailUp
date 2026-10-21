import { supabase } from "@/database/supabase";
import { normalizeGuilds, type Guild } from "./guildModel";
import { normalizeJanela, type JanelaDaFormacao } from "./guildWindowModel";
import { normalizeGuildMessages, type GuildMessage, type GuildShareKind } from "./guildChatModel";
import { normalizeDesafio } from "./desafioModel";
import { normalizeArena, type DesafioDaArena } from "./arenaModel";

async function action(name: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as Record<string, unknown>;
}

/**
 * O uuid do aluno logado. Necessário em dois lugares do chat da guilda, e os dois estavam
 * sem ele: o teste de "esta mensagem é minha" comparava `autor_id` com a string literal
 * `"me"` — e `guilda_chat_listar` devolve `m.autor_id`, um uuid, então o teste NUNCA era
 * verdadeiro e nenhuma mensagem própria recebia o balão certo. E o seletor de parceiro da
 * dupla precisa tirar o próprio aluno da lista, porque `guilda_desafio_criar` recusa
 * `p_aliado = auth.uid()`.
 */
export async function alunoAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function carregarGuildas(classeId: number): Promise<Guild[]> {
  const { data, error } = await supabase.rpc("guilda_listar", { p_classe_id: classeId });
  if (error) throw error;
  return normalizeGuilds(data);
}
/**
 * A janela de formação da turma (`guilda_janela_da_turma`, `20261021_17`). Banco sem a função ainda
 * (PGRST202) ou qualquer outra falha devolve null: a tela de guildas continua funcionando sem o aviso,
 * e o banco segue barrando o que estiver fora da janela.
 */
export async function carregarJanelaDaFormacao(classeId: number): Promise<JanelaDaFormacao | null> {
  if (!(classeId > 0)) return null;
  const { data, error } = await supabase.rpc("guilda_janela_da_turma", { p_classe_id: classeId });
  if (error) {
    console.warn("[Guildas] Janela de formação indisponível:", error.message);
    return null;
  }
  return normalizeJanela(data);
}
export const criarGuilda = (classeId: number, nome: string, descricao?: string, emblema?: string, logoUrl?: string, modoPerfil: "misto" | "perfil" = "misto", perfilAlvo?: string) => action("guilda_criar", { p_classe_id: classeId, p_nome: nome, p_descricao: descricao ?? null, p_emblema: emblema ?? "constellation", p_logo_url: logoUrl ?? null, p_modo_perfil: modoPerfil, p_perfil_alvo: perfilAlvo ?? null });
export const atualizarGuilda = (guildaId: string, nome: string, descricao?: string, emblema?: string, logoUrl?: string, modoPerfil: "misto" | "perfil" = "misto", perfilAlvo?: string) => action("guilda_atualizar_config", { p_guilda_id: guildaId, p_nome: nome, p_descricao: descricao ?? null, p_emblema: emblema ?? null, p_logo_url: logoUrl ?? null, p_modo_perfil: modoPerfil, p_perfil_alvo: perfilAlvo ?? null });
export const convidarParaGuilda = (guildaId: string, alunoId: string) => action("guilda_convidar", { p_guilda_id: guildaId, p_convidado_id: alunoId });
export const aceitarConviteGuilda = (conviteId: string) => action("guilda_aceitar_convite", { p_convite_id: conviteId });
export const recusarConviteGuilda = (conviteId: string) => action("guilda_recusar_convite", { p_convite_id: conviteId });
/**
 * Cancela um convite que EU enviei. `guilda_cancelar_convite` exige
 * `convidante_id = auth.uid() AND status = 'pending'`, e é exatamente o recorte que
 * `guilda_listar` devolve em `convites_enviados` — então a tela não precisa filtrar de novo.
 */
export const cancelarConviteGuilda = (conviteId: string) => action("guilda_cancelar_convite", { p_convite_id: conviteId });
export const entrarGuilda = (guildaId: string) => action("guilda_entrar", { p_guilda_id: guildaId });
export const sairGuilda = (guildaId: string) => action("guilda_sair", { p_guilda_id: guildaId });
export const dissolverGuilda = (guildaId: string) => action("guilda_dissolver", { p_guilda_id: guildaId });

export async function carregarMensagensGuilda(guildaId: string, limite = 100): Promise<GuildMessage[]> {
  const { data, error } = await supabase.rpc("guilda_chat_listar", { p_guilda_id: guildaId, p_limite: limite });
  if (error) throw error;
  return normalizeGuildMessages(data);
}

export async function enviarMensagemGuilda(guildaId: string, texto: string) {
  return action("guilda_chat_enviar", { p_guilda_id: guildaId, p_tipo: "text", p_texto: texto.trim(), p_conteudo: {} });
}

export async function compartilharNaGuilda(guildaId: string, tipo: GuildShareKind, id: number, titulo: string) {
  return action("guilda_chat_enviar", { p_guilda_id: guildaId, p_tipo: tipo, p_texto: titulo, p_conteudo: { id, titulo } });
}
export async function responderQuestaoGuilda(mensagemId: string, resposta: string) {
  return action("guilda_chat_questao_responder", { p_mensagem_id: mensagemId, p_resposta: resposta });
}
export async function criarDesafioGuilda(
  guildaId: string,
  // `duelo`/`duplo` saíram: `guilda_desafios_modo_check` nunca os aceitou, então pedi-los
  // estourava 23514 no INSERT. A RPC passou a recusá-los antes, em `20261021_11`.
  modo: "todos" | "velocidade" | "precisao" = "todos",
  quantidade = 3,
  dificuldade: "normal" | "dificil" = "normal",
  consequencia: "treino" | "ranqueada" | "evento" = "ranqueada",
  formato: "solo" | "dupla" | "guilda" | "turma" = "guilda",
  aliado: string | null = null,
) {
  return action("guilda_desafio_criar", {
    p_guilda_id: guildaId,
    p_modo: modo,
    p_quantidade: quantidade,
    p_dificuldade: dificuldade,
    p_consequencia: consequencia,
    p_formato: formato,
    // A RPC recusa aliado em formato que não o usa, então não se manda "por garantia".
    ...(formato === "dupla" && aliado ? { p_aliado: aliado } : {}),
  });
}

/**
 * O desafio para a tela de jogo. `arena_desafio` é a única porta: `guilda_desafio_questoes`
 * tem RLS ligada e **nenhuma policy**, então ler a tabela direto devolveria lista vazia em
 * silêncio — e abri-la exporia `resposta_correta` antes de o aluno responder.
 */
export async function carregarDesafio(desafioId: string) {
  const { data, error } = await supabase.rpc("arena_desafio", { p_desafio_id: desafioId });
  if (error) throw error;
  return normalizeDesafio(data);
}

/**
 * Responder desafio da GUILDA (cooperativo, sem equipe 2). `guilda_desafio_responder` cobra
 * `desafio_tentativas_*` — o "menos tentativas" do modo difícil — e acumula o tempo entre
 * tentativas. O retorno traz `tentativas_restantes`, `faltam` e, quando a última resposta do
 * último participante entra, `encerrou` com o resultado. Desafio com adversário é da arena: o
 * banco recusa aqui (`guilda_desafio_e_da_arena`, 20261021_19) e a tela usa `responderNaArena`.
 */
export async function responderDesafio(
  desafioId: string,
  questaoId: number,
  resposta: string,
  tempoMs: number,
) {
  return action("guilda_desafio_responder", {
    p_desafio_id: desafioId,
    p_questao_id: questaoId,
    p_resposta: resposta,
    p_tempo_ms: Math.max(0, Math.round(tempoMs)),
  });
}

// ── Arena (20261021_19): desafio com adversário, que vale Elo ────────────────────────────

/** Os desafios da arena em que estou nesta turma (só os que têm equipe 2). */
export async function carregarArena(classeId: number): Promise<DesafioDaArena[]> {
  const { data, error } = await supabase.rpc("arena_listar", { p_classe_id: classeId });
  if (error) throw error;
  return normalizeArena(data);
}

/** Cria o desafio. Os argumentos saem de `argumentosDeCriacao` (arenaModel). */
export const criarDesafioNaArena = (args: Record<string, unknown>) => action("arena_desafio_criar", args);

export const responderConviteDaArena = (desafioId: string, aceitar: boolean) =>
  action("arena_convite_responder", { p_desafio_id: desafioId, p_aceitar: aceitar });

/**
 * Responder desafio da ARENA. A primeira resposta vale (`registrada: false` quando já havia
 * uma) e a partida fecha sozinha quando todo aceito respondeu tudo e ninguém está convidado;
 * é aí que o Elo mexe. O retorno é só `{ correta, registrada }`: o resultado vem de recarregar.
 */
export async function responderNaArena(desafioId: string, questaoId: number, resposta: string, tempoMs: number) {
  return action("arena_responder", {
    p_desafio_id: desafioId,
    p_questao_id: questaoId,
    p_resposta: resposta,
    p_tempo_ms: Math.max(0, Math.round(tempoMs)),
  });
}

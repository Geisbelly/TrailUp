/**
 * Tentativas de atividade pelo relógio do servidor (#136, `20261101_13`).
 *
 * `garantirTentativa` é chamado quando a atividade abre: o início que vale é o
 * do banco. `responderTentativa` grava a resposta: o banco recusa prazo vencido e
 * tentativas esgotadas, decide se foi no tempo e grava `atividade_aluno` (vale a
 * última tentativa). A pontuação continua sendo a que o app calcula; o banco só a
 * limita.
 *
 * Sem as RPCs no banco (local sem a migration), as duas devolvem `null`. Abrir
 * segue sem relógio do servidor; concluir falha, porque desde a `20261102_04` o
 * banco recusa a conclusão gravada direto pelo app.
 */

import { supabase } from "@/database/supabase";

import {
  TentativaRecusada,
  aplicarRelogio,
  guardarRetorno,
  pausarNoAparelho,
  retomarNoAparelho,
  lerRetorno,
  lerSituacao,
  lerTentativa,
  motivoDoErro,
  type RetornoTentativa,
  type SituacaoTentativas,
  type TentativaAberta,
} from "./tentativasAtividade.core";

export { MENSAGEM_DA_RECUSA, TentativaRecusada, segundosRestantes } from "./tentativasAtividade.core";
export type { RetornoTentativa, SituacaoTentativas, TentativaAberta } from "./tentativasAtividade.core";

// Uma por atividade. O banco também devolve a aberta, então perder este mapa (app
// reaberto) não zera o relógio: a próxima chamada recebe a mesma tentativa.
const abertas = new Map<number, TentativaAberta>();
const emAndamento = new Map<number, Promise<TentativaAberta | null>>();

function falha(erro: { message?: unknown; code?: unknown } | null): null {
  const motivo = motivoDoErro(erro);
  if (motivo === "rpc_indisponivel") return null;
  if (motivo) throw new TentativaRecusada(motivo);
  throw Object.assign(new Error(String(erro?.message ?? "Falha ao falar com o servidor.")), { cause: erro });
}

export function tentativaAberta(atividadeId: number): TentativaAberta | null {
  return abertas.get(atividadeId) ?? null;
}

export function garantirTentativa(atividadeId: number): Promise<TentativaAberta | null> {
  const aberta = abertas.get(atividadeId);
  if (aberta) return Promise.resolve(aberta);
  const pendente = emAndamento.get(atividadeId);
  if (pendente) return pendente;

  const pedido = (async () => {
    const { data, error } = await supabase.rpc("atividade_iniciar_tentativa", { p_atividade: atividadeId });
    if (error) return falha(error);
    const tentativa = lerTentativa(data, Date.now());
    if (tentativa) abertas.set(atividadeId, tentativa);
    return tentativa;
  })().finally(() => emAndamento.delete(atividadeId));

  emAndamento.set(atividadeId, pedido);
  return pedido;
}

/**
 * O aluno saiu da atividade (outro bloco, outra tela, app em segundo plano): o relógio para
 * (`20261110_05`). Para no aparelho na hora e avisa o banco, que desconta a pausa do "no tempo".
 * Falha de rede não volta para quem chama: a tela já parou, e o banco recebe a retomada depois.
 */
export function pausarTentativa(atividadeId: number): TentativaAberta | null {
  return mudarRelogio(atividadeId, pausarNoAparelho, (id) => supabase.rpc("atividade_pausar_tentativa", { p_tentativa: id }));
}

/** O aluno voltou: o relógio continua de onde parou, no aparelho e no banco. */
export function retomarTentativa(atividadeId: number): TentativaAberta | null {
  return mudarRelogio(atividadeId, retomarNoAparelho, (id) => supabase.rpc("atividade_retomar_tentativa", { p_tentativa: id }));
}

const ouvintesDoRelogio = new Set<(atividadeId: number, tentativa: TentativaAberta) => void>();

/** Avisa quando o relógio de uma tentativa muda (pausa, retomada, resposta do banco). */
export function ouvirRelogio(ouvinte: (atividadeId: number, tentativa: TentativaAberta) => void): () => void {
  ouvintesDoRelogio.add(ouvinte);
  return () => {
    ouvintesDoRelogio.delete(ouvinte);
  };
}

function publicar(atividadeId: number, tentativa: TentativaAberta) {
  abertas.set(atividadeId, tentativa);
  for (const ouvinte of ouvintesDoRelogio) ouvinte(atividadeId, tentativa);
}

function mudarRelogio(
  atividadeId: number,
  noAparelho: (t: TentativaAberta, agoraLocalMs: number) => TentativaAberta,
  // A chamada vem pronta, com o nome LITERAL da RPC: `test_rpc_chamada_tem_migracao` só confere
  // a migration do que consegue ler, e uma RPC com o nome numa variável é um ponto cego para ele.
  chamarBanco: (tentativaId: TentativaAberta["tentativaId"]) => PromiseLike<{ data: unknown; error: unknown }>,
): TentativaAberta | null {
  const atual = abertas.get(atividadeId);
  if (!atual || !atual.cronometrada || atual.limiteSeg == null) return atual ?? null;
  const local = noAparelho(atual, Date.now());
  if (local === atual) return atual;
  publicar(atividadeId, local);
  void chamarBanco(atual.tentativaId).then(
    ({ data, error }) => {
      // Sem a RPC (banco sem a migration) ou recusa: fica a conta do aparelho.
      if (error) return;
      const vigente = abertas.get(atividadeId);
      if (!vigente || vigente.tentativaId !== atual.tentativaId) return;
      // Chegou fora de ordem (o aluno já saiu ou voltou de novo): a do aparelho é mais nova.
      if (Boolean(vigente.pausadaEm) !== Boolean(local.pausadaEm)) return;
      publicar(atividadeId, aplicarRelogio(vigente, data, Date.now()));
    },
    () => {},
  );
  return local;
}

export async function responderTentativa(
  atividadeId: number,
  resposta: {
    acertosPercentual: number;
    pontuacaoObtida: number | null;
    avaliacaoMetadata: Record<string, unknown> | null;
  }
): Promise<RetornoTentativa | null> {
  // Se a abertura falhou (rede), a tentativa começa agora. O banco ainda decide
  // prazo e tentativas; só o "no tempo" fica a favor do aluno nesse caso raro.
  const tentativa = await garantirTentativa(atividadeId);
  if (!tentativa) return null;

  const { data, error } = await supabase.rpc("atividade_responder_tentativa", {
    p_tentativa: tentativa.tentativaId,
    p_acertos_percentual: resposta.acertosPercentual,
    p_pontuacao_obtida: resposta.pontuacaoObtida,
    p_avaliacao_metadata: resposta.avaliacaoMetadata,
  });
  if (error) {
    // Respondida ou perdida: a próxima abertura pede outra ao banco.
    if (/tentativa_(ja_respondida|nao_encontrada)/.test(String(error.message ?? ""))) abertas.delete(atividadeId);
    return falha(error);
  }
  abertas.delete(atividadeId);
  const retorno = lerRetorno(data);
  // A tela que respondeu mostra o veredito do servidor (no tempo, bônus) ao aluno.
  if (retorno) guardarRetorno(atividadeId, retorno, Date.now());
  return retorno;
}

/**
 * Quantas tentativas a atividade dá e quantas sobram (`atividade_situacao_tentativas`,
 * `20261102_08`). `null` sem a RPC no banco ou em falha de rede: a tela só deixa de
 * oferecer a próxima tentativa.
 */
export async function situacaoDasTentativas(atividadeId: number): Promise<SituacaoTentativas | null> {
  const { data, error } = await supabase.rpc("atividade_situacao_tentativas", { p_atividade: atividadeId });
  if (error) return null;
  return lerSituacao(data);
}

/** O interruptor do aluno (`aluno_definir_cronometro`). Devolve o que ficou gravado. */
export async function definirCronometro(ligado: boolean): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("aluno_definir_cronometro", { p_ligado: ligado });
  if (error) return falha(error);
  // Tentativa aberta guardou a escolha antiga; a próxima atividade já usa a nova.
  return typeof data === "boolean" ? data : ligado;
}

/** A escolha gravada do aluno; `null` = sem escolha, vale o perfil. */
export async function lerCronometro(alunoId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("aluno_cronometro")
    .select("ligado")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  if (error) return null;
  return typeof data?.ligado === "boolean" ? data.ligado : null;
}

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { AiTopico } from "./proposta";

/**
 * Rascunho da trilha gerada pela IA (`trilha_rascunho`, migration 20261110_08):
 * uma linha por turma com o pedido feito à IA e a proposta como está.
 *
 * O diálogo grava sozinho depois do esqueleto e de cada tópico, ajuste ou
 * remoção, e apaga a linha quando a trilha é aplicada. Um erro no meio
 * (cota, 504, aba recarregada, diálogo fechado) não joga mais fora o que já
 * foi gerado: ao abrir de novo, o professor retoma e gera só o que faltou.
 *
 * Direto no Supabase: a RLS (`trilha_rascunho_professor_all`) só deixa o dono
 * da turma ler e escrever. Rascunho é proteção, nunca obstáculo: nenhuma
 * função daqui lança. Se a tabela ainda não existir (migration não aplicada)
 * ou a rede falhar, a geração segue como antes, só sem rascunho.
 */

export type RascunhoDaTrilha = {
  /** O corpo enviado à IA: descrição, quantidade, nomes, ementa, fontes em texto. */
  pedido: Record<string, unknown>;
  topicos: AiTopico[];
  /** Quando foi gravado pela última vez (ISO), para o professor reconhecer o rascunho. */
  atualizadoEm: string | null;
};

const ehRegistro = (valor: unknown): valor is Record<string, unknown> =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const ehTopico = (valor: unknown): valor is AiTopico =>
  ehRegistro(valor) &&
  typeof valor.nome === "string" &&
  typeof valor.ordem === "number" &&
  Array.isArray(valor.conteudos) &&
  Array.isArray(valor.depende) &&
  Array.isArray(valor.next);

/**
 * Lê a linha do banco. Qualquer coisa fora do formato (linha antiga, JSON
 * mexido à mão) vira "sem rascunho" em vez de quebrar o diálogo.
 */
export function lerLinhaDoRascunho(linha: unknown): RascunhoDaTrilha | null {
  if (!ehRegistro(linha)) return null;
  const { pedido, topicos, updated_at: atualizadoEm } = linha;
  if (!ehRegistro(pedido) || !Array.isArray(topicos) || topicos.length === 0) return null;
  if (!topicos.every(ehTopico)) return null;
  return { pedido, topicos, atualizadoEm: typeof atualizadoEm === "string" ? atualizadoEm : null };
}

export async function carregarRascunho(classeId: number): Promise<RascunhoDaTrilha | null> {
  try {
    const { data, error } = await supabase
      .from("trilha_rascunho")
      .select("pedido, topicos, updated_at")
      .eq("classe_id", classeId)
      .maybeSingle();
    if (error) {
      console.warn("Rascunho da trilha indisponível:", error.message);
      return null;
    }
    return lerLinhaDoRascunho(data);
  } catch (erro) {
    console.warn("Rascunho da trilha indisponível:", erro);
    return null;
  }
}

export async function salvarRascunho(
  classeId: number,
  rascunho: { pedido: Record<string, unknown>; topicos: AiTopico[] },
): Promise<boolean> {
  try {
    const { error } = await supabase.from("trilha_rascunho").upsert(
      { classe_id: classeId, pedido: rascunho.pedido as Json, topicos: rascunho.topicos as unknown as Json },
      { onConflict: "classe_id" },
    );
    if (error) {
      console.warn("Não foi possível salvar o rascunho da trilha:", error.message);
      return false;
    }
    return true;
  } catch (erro) {
    console.warn("Não foi possível salvar o rascunho da trilha:", erro);
    return false;
  }
}

export async function apagarRascunho(classeId: number): Promise<void> {
  try {
    const { error } = await supabase.from("trilha_rascunho").delete().eq("classe_id", classeId);
    if (error) console.warn("Não foi possível apagar o rascunho da trilha:", error.message);
  } catch (erro) {
    console.warn("Não foi possível apagar o rascunho da trilha:", erro);
  }
}

/**
 * Grava em fila, um por vez, e só o estado mais novo. Dois tópicos que
 * terminam juntos disparam dois saves; sem a fila, o mais velho podia chegar
 * por último e apagar o tópico que o outro tinha acabado de gravar.
 */
export function criarGravador<T>(salvar: (valor: T) => Promise<unknown>) {
  let pendente: { valor: T } | null = null;
  let emVoo: Promise<void> | null = null;

  const drenar = async () => {
    while (pendente) {
      const { valor } = pendente;
      pendente = null;
      try {
        await salvar(valor);
      } catch (erro) {
        console.warn("Falha ao gravar o rascunho:", erro);
      }
    }
    emVoo = null;
  };

  return {
    agendar(valor: T): Promise<void> {
      pendente = { valor };
      if (!emVoo) emVoo = drenar();
      return emVoo;
    },
    /** Descarta o que ainda não foi enviado (o que está em voo termina). */
    cancelar() {
      pendente = null;
    },
    /** Espera a fila esvaziar. */
    esperar(): Promise<void> {
      return emVoo ?? Promise.resolve();
    },
  };
}

/** "há 5 min", "às 14:32 de 10/11": para o professor reconhecer o rascunho. */
export function quandoFoiSalvo(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const minutos = Math.round((agora.getTime() - data.getTime()) / 60000);
  if (minutos < 1) return "há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia = data.toDateString() === agora.toDateString();
  return mesmoDia ? `hoje às ${hora}` : `em ${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

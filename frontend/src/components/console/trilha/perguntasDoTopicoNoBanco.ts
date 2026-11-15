import { supabase } from "@/integrations/supabase/client";
import { MAX_EXISTENTES } from "../../../../supabase/functions/generate-content-ai/repetidas.ts";
import { juntarExistentes, type Existentes } from "./perguntasExistentes";

const SEM_EXISTENTES: Existentes = { questoes: [], cards: [] };

/**
 * Questões e cards que o tópico já tem no banco. Falha de leitura devolve
 * vazio: a sugestão sai do mesmo jeito, só sem esse filtro (a função ainda
 * tira as repetidas de dentro do próprio pacote).
 */
export async function perguntasDoTopicoNoBanco(topicoId: number): Promise<Existentes> {
  const [questoes, cards] = await Promise.all([
    supabase
      .from("questoes")
      .select("enunciado, atividades!inner(topico_id)")
      .eq("atividades.topico_id", topicoId)
      .limit(MAX_EXISTENTES),
    supabase
      .from("cards")
      .select("titulo, conteudos!inner(topico_id)")
      .eq("conteudos.topico_id", topicoId)
      .limit(MAX_EXISTENTES),
  ]);
  if (questoes.error || cards.error) {
    console.warn("[ia] perguntas do tópico não foram lidas; a sugestão sai sem esse filtro", questoes.error ?? cards.error);
    return SEM_EXISTENTES;
  }
  return juntarExistentes({
    questoes: ((questoes.data ?? []) as Array<{ enunciado: string | null }>).map((q) => q.enunciado ?? ""),
    cards: ((cards.data ?? []) as Array<{ titulo: string | null }>).map((c) => c.titulo ?? ""),
  });
}

import { supabase } from "@/integrations/supabase/client";
import { normalizeOptionalPositiveScore } from "@/lib/question-score";
import type { Atividade, AtividadeConteudo, CardItem, Conteudo, Materia, Classe, Topico, Questao } from "./types";

// ===== Fetchers =======================================================
export async function fetchClassesAndMaterias(professorId: string | undefined) {
  const [{ data: classesData, error: classesError }, { data: materiasData, error: materiasError }] = await Promise.all([
    supabase
      .from("classe")
      .select("id, descricao, materia_id")
      .eq("professor_id", professorId ?? "")
      .order("created_at", { ascending: false }),
    supabase.from("materia").select("id, nome, descricao").order("nome"),
  ]);
  if (classesError) throw classesError;
  if (materiasError) throw materiasError;
  return { classes: (classesData as Classe[]) ?? [], materias: (materiasData as Materia[]) ?? [] };
}

export async function fetchTopicsByClasses(classIds: number[]) {
  if (classIds.length === 0) return [] as Topico[];
  const { data, error } = await supabase
    .from("topicos")
    .select("id, classe_id, nome, descricao, ordem, next, depende, created_at")
    .in("classe_id", classIds)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data as Topico[]) ?? [];
}

export async function fetchContents(topicId: number) {
  const { data, error } = await supabase
    .from("conteudos")
    .select("id, titulo, tipo, ordem, conteudo, metadata")
    .eq("topico_id", topicId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data as Conteudo[]) ?? [];
}

export async function fetchActivities(topicId: number) {
  const { data, error } = await supabase
    .from("atividades")
    .select("id, topico_id, titulo, descricao, tipo, data_entrega")
    .eq("topico_id", topicId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Atividade[]) ?? [];
}

export async function fetchActivityLinks(topicId: number) {
  const { data, error } = await supabase
    .from("atividade_conteudos")
    .select("atividade_id, conteudo_id, atividades!inner(topico_id)")
    .eq("atividades.topico_id", topicId);
  if (error) throw error;
  return (data as AtividadeConteudo[] | null) ?? [];
}

export async function fetchCards(topicId: number) {
  const { data: contentRows, error: contentError } = await supabase
    .from("conteudos")
    .select("id")
    .eq("topico_id", topicId);
  if (contentError) throw contentError;

  const contentIds = (contentRows ?? []).map((row: { id: number }) => row.id);
  if (contentIds.length === 0) return [];

  const idsFilter = contentIds.join(",");
  const { data, error } = await supabase
    .from("cards")
    .select("id, conteudo_id, conteudo_origem_id, titulo, descricao, imagem_url")
    .or(`conteudo_id.in.(${idsFilter}),conteudo_origem_id.in.(${idsFilter})`)
    .order("id", { ascending: true });
  if (error) throw error;

  const dedup = new Map<number, CardItem>();
  for (const card of ((data as CardItem[] | null) ?? [])) {
    dedup.set(card.id, card);
  }
  return Array.from(dedup.values());
}

export async function fetchQuestions(atividadeId: number) {
  const { data, error } = await supabase
    .from("questoes")
    .select("id, atividade_id, enunciado, tipo, alternativas, resposta_correta, nota_estabelecida, midia_url")
    .eq("atividade_id", atividadeId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Questao[]) ?? [];
}

// ===== Mutations ======================================================
export async function createClassWithMateria(params: {
  descricao: string;
  materia_id?: string;
  newMateria?: { nome: string; descricao: string };
  professorId?: string;
}) {
  const { descricao, materia_id, newMateria, professorId } = params;
  let materiaId: number | null = materia_id ? parseInt(materia_id, 10) : null;

  if (!materiaId && newMateria?.nome) {
    const { data: materia, error: materiaError } = await supabase
      .from("materia")
      .insert({ nome: newMateria.nome, descricao: newMateria.descricao })
      .select("id")
      .single();
    if (materiaError) throw materiaError;
    materiaId = materia?.id ?? null;
  }

  const { data, error } = await supabase
    .from("classe")
    .insert({ descricao, materia_id: materiaId, professor_id: professorId })
    .select("id, descricao")
    .single();
  if (error) throw error;
  return data as { id: number; descricao: string };
}

export async function createContent(params: { topico_id: number; titulo: string; tipo: string; conteudo: string; ordem: number }) {
  const { data, error } = await supabase
    .from("conteudos")
    .insert(params)
    .select("id, titulo, tipo, ordem, conteudo")
    .single();
  if (error) throw error;
  return data as Conteudo;
}

export async function saveActivity(params: {
  id?: number;
  topico_id: number;
  titulo: string;
  descricao: string;
  tipo?: string | null;
  data_entrega?: string | null;
}) {
  if (params.id) {
    const { error } = await supabase
      .from("atividades")
      .update({
        titulo: params.titulo,
        descricao: params.descricao,
        tipo: params.tipo || null,
        data_entrega: params.data_entrega || null,
      })
      .eq("id", params.id);
    if (error) throw error;
    return params.id;
  }

  const { data, error } = await supabase
    .from("atividades")
    .insert({
      topico_id: params.topico_id,
      titulo: params.titulo,
      descricao: params.descricao,
      tipo: params.tipo || null,
      data_entrega: params.data_entrega || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function deleteActivity(id: number) {
  const { error } = await supabase.from("atividades").delete().eq("id", id);
  if (error) throw error;
}

export async function saveQuestion(params: {
  id?: number;
  atividade_id: number;
  enunciado: string;
  tipo: string;
  alternativas?: string[] | null;
  resposta_correta?: string | null;
  nota_estabelecida?: number | null;
  midia_url?: string | null;
}) {
  if (params.id) {
    const { error } = await supabase
      .from("questoes")
      .update({
        enunciado: params.enunciado,
        tipo: params.tipo,
        alternativas: params.alternativas ?? null,
        resposta_correta: params.resposta_correta ?? null,
        nota_estabelecida: normalizeOptionalPositiveScore(params.nota_estabelecida),
        midia_url: params.midia_url ?? null,
      })
      .eq("id", params.id);
    if (error) throw error;
    return params.id;
  }
  const { data, error } = await supabase
    .from("questoes")
    .insert({
      atividade_id: params.atividade_id,
      enunciado: params.enunciado,
      tipo: params.tipo,
      alternativas: params.alternativas ?? null,
      resposta_correta: params.resposta_correta ?? null,
      nota_estabelecida: normalizeOptionalPositiveScore(params.nota_estabelecida),
      midia_url: params.midia_url ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function deleteQuestion(id: number) {
  const { error } = await supabase.from("questoes").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleActivityLinkApi(conteudoId: number, atividadeId: number, link: boolean) {
  if (link) {
    const { error } = await supabase.from("atividade_conteudos").insert({ atividade_id: atividadeId, conteudo_id: conteudoId });
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("atividade_conteudos")
    .delete()
    .match({ atividade_id: atividadeId, conteudo_id: conteudoId });
  if (error) throw error;
}

export async function saveCard(params: {
  id?: number;
  conteudo_id?: string | number | null;
  conteudo_origem_id?: string | number | null;
  titulo: string;
  descricao?: string;
  imagem_url?: string;
}) {
  if (params.id) {
    const { error } = await supabase
      .from("cards")
      .update({
        conteudo_id: params.conteudo_id ? Number(params.conteudo_id) : null,
        conteudo_origem_id: params.conteudo_origem_id ? Number(params.conteudo_origem_id) : null,
        titulo: params.titulo,
        descricao: params.descricao || null,
        imagem_url: params.imagem_url || null,
      })
      .eq("id", params.id);
    if (error) throw error;
    return params.id;
  }
  const { data, error } = await supabase
    .from("cards")
    .insert({
      conteudo_id: params.conteudo_id ? Number(params.conteudo_id) : null,
      conteudo_origem_id: params.conteudo_origem_id ? Number(params.conteudo_origem_id) : null,
      titulo: params.titulo,
      descricao: params.descricao || null,
      imagem_url: params.imagem_url || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function deleteCard(id: number) {
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) throw error;
}

type NormalizedActivityType = "quiz" | "true_false" | "fill_blank" | "essay";
type NormalizedQuestionType = "multipla" | "verdadeiro_falso" | "fill_blank" | "dissertativa";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeActivityType(value: string | null | undefined): NormalizedActivityType {
  const raw = (value || "").trim().toLowerCase();
  if (raw === "quiz" || raw === "multipla" || raw === "multipla_escolha") return "quiz";
  if (raw === "true_false" || raw === "verdadeiro_falso" || raw === "vf") return "true_false";
  if (raw === "fill_blank" || raw === "lacuna" || raw === "completar") return "fill_blank";
  if (raw === "essay" || raw === "dissertativa" || raw === "questao" || raw === "texto") return "essay";
  return "essay";
}

function questionTypeFromActivityType(type: NormalizedActivityType): NormalizedQuestionType {
  if (type === "quiz") return "multipla";
  if (type === "true_false") return "verdadeiro_falso";
  if (type === "fill_blank") return "fill_blank";
  return "dissertativa";
}

function normalizeAlternatives(
  questionType: NormalizedQuestionType,
  alternativas: string[] | null,
  respostaCorreta: string
): { alternativas: string[] | null; respostaCorreta: string } {
  if (questionType === "verdadeiro_falso") {
    const resposta = ["Verdadeiro", "Falso"].includes(respostaCorreta) ? respostaCorreta : "Verdadeiro";
    return { alternativas: ["Verdadeiro", "Falso"], respostaCorreta: resposta };
  }

  if (questionType === "multipla") {
    const base = (Array.isArray(alternativas) ? alternativas : [])
      .map((alt) => normalizeWhitespace(String(alt)))
      .filter(Boolean);
    const dedup = Array.from(new Set(base));
    const answer = normalizeWhitespace(respostaCorreta);
    if (answer && !dedup.includes(answer)) dedup.unshift(answer);
    while (dedup.length < 2) dedup.push(`Alternativa ${dedup.length + 1}`);
    return {
      alternativas: dedup.slice(0, 4),
      respostaCorreta: answer || dedup[0],
    };
  }

  return {
    alternativas: null,
    respostaCorreta: normalizeWhitespace(respostaCorreta) || "Resposta aberta",
  };
}

/** Salva sugestoes da IA em lote para reduzir round-trips (cards + atividades + questoes + vinculos). */
export async function saveAiSuggestionsBatch(params: {
  topico_id: number;
  conteudo_id: number;
  cards: Array<{ titulo: string; descricao: string }>;
  atividades: Array<{
    titulo: string;
    enunciado: string;
    tipo: string;
    alternativas: string[] | null;
    resposta_correta: string;
    nota_estabelecida?: number | null;
  }>;
}) {
  const cardsPayload = params.cards
    .map((card) => ({
      conteudo_id: params.conteudo_id,
      conteudo_origem_id: null,
      titulo: normalizeWhitespace(card.titulo || "") || null,
      descricao: normalizeWhitespace(card.descricao || "") || null,
      imagem_url: null,
    }))
    .filter((card) => Boolean(card.titulo && card.descricao));
  const uniqueCards = Array.from(
    new Map(
      cardsPayload.map((card) => [
        `${String(card.titulo).toLowerCase()}|${String(card.descricao).toLowerCase()}`,
        card,
      ])
    ).values()
  );

  const normalizedActivities = params.atividades
    .map((atividade) => ({
      titulo: normalizeWhitespace(atividade.titulo || ""),
      enunciado: normalizeWhitespace(atividade.enunciado || ""),
      activityType: normalizeActivityType(atividade.tipo),
      respostaRaw: normalizeWhitespace(atividade.resposta_correta || ""),
      alternativasRaw: atividade.alternativas ?? null,
      notaEstabelecida: normalizeOptionalPositiveScore(atividade.nota_estabelecida),
    }))
    .map((atividade) => {
      const questionType = questionTypeFromActivityType(atividade.activityType);
      const normalizedQuestion = normalizeAlternatives(
        questionType,
        atividade.alternativasRaw,
        atividade.respostaRaw
      );
      return {
        titulo: atividade.titulo,
        enunciado: atividade.enunciado,
        activityType: atividade.activityType,
        questionType,
        alternativas: normalizedQuestion.alternativas,
        resposta_correta: normalizedQuestion.respostaCorreta,
        nota_estabelecida: atividade.notaEstabelecida,
      };
    })
    .filter((atividade) => Boolean(atividade.titulo && atividade.enunciado && atividade.resposta_correta));
  const uniqueActivities = Array.from(
    new Map(
      normalizedActivities.map((atividade) => [
        `${atividade.titulo.toLowerCase()}|${atividade.enunciado.toLowerCase()}|${atividade.questionType}|${atividade.resposta_correta.toLowerCase()}`,
        atividade,
      ])
    ).values()
  );

  if (uniqueCards.length > 0) {
    const { error: cardsError } = await supabase.from("cards").insert(uniqueCards);
    if (cardsError) throw cardsError;
  }

  if (uniqueActivities.length === 0) {
    return {
      cardsCreated: uniqueCards.length,
      activitiesCreated: 0,
      questionsCreated: 0,
      linksCreated: 0,
    };
  }

  const { data: activityRows, error: activitiesError } = await supabase
    .from("atividades")
    .insert(
      uniqueActivities.map((atividade) => ({
        topico_id: params.topico_id,
        titulo: atividade.titulo,
        descricao: atividade.enunciado,
        tipo: atividade.activityType,
      }))
    )
    .select("id");
  if (activitiesError) throw activitiesError;

  const createdActivities = (activityRows as Array<{ id: number }> | null) ?? [];
  const activityIds = createdActivities.map((row) => row.id);
  if (activityIds.length === 0) {
    return {
      cardsCreated: uniqueCards.length,
      activitiesCreated: 0,
      questionsCreated: 0,
      linksCreated: 0,
    };
  }

  const questionRows = activityIds.map((activityId, index) => {
    const atividade = uniqueActivities[index];
    return {
      atividade_id: activityId,
      enunciado: atividade?.enunciado ?? "",
      tipo: atividade?.questionType ?? "dissertativa",
      alternativas: atividade?.alternativas ?? null,
      resposta_correta: atividade?.resposta_correta ?? "",
      nota_estabelecida: normalizeOptionalPositiveScore(atividade?.nota_estabelecida),
    };
  });

  const linkRows = activityIds.map((activityId) => ({
    atividade_id: activityId,
    conteudo_id: params.conteudo_id,
  }));

  const [{ error: questionsError }, { error: linksError }] = await Promise.all([
    supabase.from("questoes").insert(questionRows),
    supabase.from("atividade_conteudos").insert(linkRows),
  ]);
  if (questionsError) throw questionsError;
  if (linksError) throw linksError;

  return {
    cardsCreated: uniqueCards.length,
    activitiesCreated: activityIds.length,
    questionsCreated: questionRows.length,
    linksCreated: linkRows.length,
  };
}

export async function deleteContent(id: number) {
  const { error } = await supabase.from("conteudos").delete().eq("id", id);
  if (error) throw error;
}

/** Persiste nova ordem dos conteúdos após drag-and-drop */
export async function updateContentOrder(updates: { id: number; ordem: number }[]) {
  const results = await Promise.all(
    updates.map((u) => supabase.from("conteudos").update({ ordem: u.ordem }).eq("id", u.id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/** Atualiza metadata de um conteúdo existente */
export async function updateContentMetadata(
  id: number,
  metadata: { files?: Array<{ path: string; name: string; size: number }> }
) {
  const { error } = await supabase.from("conteudos").update({ metadata }).eq("id", id);
  if (error) throw error;
}

/** Atualiza conteudo e/ou metadata de um registro existente */
export async function updateContent(
  id: number,
  patch: {
    conteudo?: string;
    metadata?: { files?: Array<{ path: string; name: string; size: number }> } | null;
  }
) {
  const { error } = await supabase.from("conteudos").update(patch).eq("id", id);
  if (error) throw error;
}

/** Insere registros em fontes_personalizacao após confirmação da trilha */
export async function insertFontesPersonalizacao(
  fontes: Array<{
    classe_id: number;
    topico_id: number;
    conteudo_id: number;
    tipo: string;
    storage_path: string;
    mime_type: string;
    nome_arquivo: string;
  }>
) {
  if (fontes.length === 0) return;
  const { error } = await supabase.from("fontes_personalizacao").insert(fontes);
  if (error) throw error;
}

// Normalização do tipo de atividade e escolha do renderizador, sem React Native:
// ficam aqui para poderem ser testados em node. ActivityRenderer.tsx re-exporta.

export function normalizeActivityType(value: unknown) {
  const tipo = String(value ?? '').trim().toLowerCase();

  if (!tipo) return "quiz";

  if (
    [
      "dissertativa",
      "aberta",
      "texto_livre",
      "ensaio",
      "essay",
      "questao_aberta",
      "questao aberta",
      "open",
      "open_ended",
      "open-ended",
      "open_text",
      "open text",
    ].includes(tipo)
  ) {
    return "essay";
  }

  if (
    [
      'true_false',
      'true or false',
      'true_or_false',
      'truefalse',
      'verdadeiro_falso',
      'verdadeiro ou falso',
      'verdadeiro/falso',
      'booleano',
    ].includes(tipo)
  ) {
    return 'true_false';
  }

  if (
    [
      'fill_blank',
      'fili_blank',
      'fill in the blank',
      'fill-in-the-blank',
      'fillblank',
      'completar_lacuna',
      'completar lacuna',
      'lacuna',
    ].includes(tipo)
  ) {
    return 'fill_blank';
  }

  if (
    [
      "multipla_escolha",
      "multipla escolha",
      "multiple_choice",
      "multi_select",
      "multiselect",
      "checkbox",
      "marcar",
      "escolha",
      "pergunta",
      "questao_objetiva",
      "questao objetiva",
      "objetiva",
      "quiz",
      "questao",
    ].includes(tipo)
  ) {
    return "quiz";
  }

  return tipo;
}

export type ActivityRendererKey = "question" | "video" | "texto";

const RENDERER_BY_TYPE: Record<string, ActivityRendererKey> = {
  questao: "question",
  quiz: "question",
  true_false: "question",
  fill_blank: "question",
  essay: "question",
  video: "video",
  texto: "texto",
};

/**
 * Qual renderizador abre a atividade. Tipo que não está na lista (ex.: 'missao')
 * cai em "question" quando há questões, e em `undefined` (nada a mostrar) quando
 * não há — é o que mantém a missão funcionando no app sem nenhuma alteração.
 */
export function activityRendererKey(tipo: string, hasQuestoes: boolean): ActivityRendererKey | undefined {
  return RENDERER_BY_TYPE[tipo] ?? (hasQuestoes ? "question" : undefined);
}

const artworkByType = {
  simples: "steps",
  tempo: "bolt",
  dias: "calendar",
  acertos: "completion",
  tempo_total: "deadline",
  exploracao: "map",
  brainhex_achiever_colecionador: "chest",
  brainhex_achiever_sequencia: "calendar",
  brainhex_achiever_mestre: "trophy",
  brainhex_mastermind_estrategista: "hint",
  brainhex_mastermind_analista: "book",
  brainhex_mastermind_plano: "compass",
} as const;

export function achievementArtKey(type?: string | null) {
  const key = type?.trim().toLowerCase() ?? "";
  if (key in artworkByType)
    return artworkByType[key as keyof typeof artworkByType];
  if (key.startsWith("brainhex_seeker_")) return "map";
  if (key.startsWith("brainhex_survivor_"))
    return key.endsWith("_jornada") ? "deadline" : "retry";
  if (key.startsWith("brainhex_daredevil_")) return "bolt";
  if (key.startsWith("brainhex_conqueror_"))
    return key.endsWith("_soberania") ? "trophy" : "gold";
  if (key.startsWith("brainhex_socializer_")) return "community";
  return "gold";
}

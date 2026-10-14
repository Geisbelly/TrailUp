/**
 * As regras numéricas da batalha, fora do `IAContext.tsx` para poderem ser
 * lidas pelo dimensionamento do boss (`vidaDoBoss.ts`) e testadas no runner de
 * node — aquele arquivo importa `AppState` e não carrega lá.
 *
 * Ficar em dois lugares seria pior do que parece: `vidaDoBoss` calcula o teto
 * de dano que a trilha consegue entregar a partir DESTES números. Se a cópia
 * divergir, o boss nasce com mais vida do que o tópico inteiro é capaz de
 * tirar — e fica invencível sem erro nenhum.
 */
export type BattleDifficultyKey = "easy" | "medium" | "hard";

export type BattleDifficultyRule = {
  hpMax: number;
  shieldMax: number;
  damage: {
    contentComplete: number;
    activityCorrect: number;
    activityComplete: number;
    min: number;
    max: number;
  };
};

export const BATTLE_DIFFICULTY_RULES: Record<BattleDifficultyKey, BattleDifficultyRule> = {
  easy: {
    hpMax: 120,
    shieldMax: 24,
    damage: {
      contentComplete: 8,
      activityCorrect: 14,
      activityComplete: 18,
      min: 4,
      max: 24,
    },
  },
  medium: {
    hpMax: 180,
    shieldMax: 36,
    damage: {
      contentComplete: 12,
      activityCorrect: 18,
      activityComplete: 24,
      min: 6,
      max: 36,
    },
  },
  hard: {
    hpMax: 260,
    shieldMax: 52,
    damage: {
      contentComplete: 16,
      activityCorrect: 24,
      activityComplete: 32,
      min: 8,
      max: 52,
    },
  },
};

export function normalizeBattleDifficulty(input: unknown): BattleDifficultyKey {
  const normalized = String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  if (["facil", "easy", "beginner", "iniciante"].includes(normalized)) {
    return "easy";
  }
  if (["dificil", "hard", "avancado", "advanced"].includes(normalized)) {
    return "hard";
  }
  return "medium";
}


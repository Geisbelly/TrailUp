import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";

const PROFILE_ACCENTS: Record<string, string> = {
  seeker: "#36c5f0", survivor: "#7d9b50", daredevil: "#e14d2a",
  mastermind: "#4c40f6", conqueror: "#1e4fd6", socializer: "rgb(244, 98, 58)",
  achiever: "rgb(201, 162, 39)",
};

export function resolveStoreAccent(profileName?: string | null, configured?: string | null) {
  if (configured) return configured;
  const normalized = normalizeBrainHexProfile(profileName);
  return normalized ? PROFILE_ACCENTS[normalized] ?? "#c9a227" : "#c9a227";
}
export function resolveStoreIcon(profileName?: string | null, configured?: string | null) {
  return configured || (normalizeBrainHexProfile(profileName) ? "storefront" : "storefront-outline");
}
export function resolveStoreChest(configured?: string | null) { return configured || "treasure-chest"; }

export type StoreIconKind = "deadline" | "retry" | "hint" | "format";

export function storeIconKind(effect: string | null | undefined): StoreIconKind {
  if (effect === "prazo_extra") return "deadline";
  if (effect === "segunda_chance") return "retry";
  if (effect === "troca_formato") return "format";
  return "hint";
}

export function purchaseErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") return "Não foi possível concluir a compra.";
  const response = result as { ok?: unknown; erro?: unknown };
  if (response.ok === true) return null;
  switch (response.erro) {
    case "saldo_insuficiente": return "Saldo insuficiente para este item.";
    case "item_indisponivel": return "Este item não está disponível nesta turma.";
    case "sem_sessao": return "Sua sessão expirou. Entre novamente para comprar.";
    case "idempotencia": return "Esta compra já está sendo processada.";
    default: return "Não foi possível concluir a compra.";
  }
}

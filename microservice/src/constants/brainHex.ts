export type BrainHexProfile =
  | "seeker"      // Explorador/Buscador
  | "survivor"    // Sobrevivente
  | "daredevil"   // Aventureiro/Ousado
  | "mastermind"  // Mestre/Estrategista
  | "conqueror"   // Conquistador
  | "socializer"  // Socializador
  | "achiever";   // Realizador

export interface BrainHexConfig {
  color:     string;
  label:     string;
  guideName: string;
}

export const BRAIN_HEX_CONFIG: Record<BrainHexProfile, BrainHexConfig> = {
  seeker:     { color: "#a78c07", label: "Explorador",   guideName: "Orion" },
  survivor:   { color: "#720101", label: "Sobrevivente", guideName: "Valka" },
  daredevil:  { color: "#1b6b1b", label: "Aventureiro",  guideName: "Rexa"  },
  mastermind: { color: "#707c88", label: "Estrategista", guideName: "Atena" },
  conqueror:  { color: "#01808b", label: "Conquistador", guideName: "Drako" },
  socializer: { color: "#6d15be", label: "Socializador", guideName: "Luma"  },
  achiever:   { color: "#ad6002", label: "Realizador",   guideName: "Auri"  },
};

export const PROFILES = Object.keys(BRAIN_HEX_CONFIG) as BrainHexProfile[];

import { 
  Map, 
  Shield, 
  Sword, 
  Brain, 
  Crown, 
  Drama, 
  Box, 
  Compass, 
  Telescope, 
  Crosshair, 
  Skull, 
  ChevronRight, 
  Gem,
  LucideIcon
} from 'lucide-react';

export type BrainHexProfile =
  | "seeker" // Explorador/Buscador
  | "survivor" // Sobrevivente
  | "daredevil" // Aventureiro/Ousado
  | "mastermind" // Mestre/Estrategista
  | "conqueror" // Conquistador
  | "socializer" // Socializador
  | "achiever"; // Realizador

export interface BrainHexConfig {
  color: string;
  icon: LucideIcon;
  iconFocus: LucideIcon;
  label: string;
  guideName: string;
  gradient: string;
  description: string;
  /** Segundo guardião — só o Socializador tem hoje. Presença deste campo é o gatilho
   * para o áudio virar diálogo (2 vozes) em vez de narração solo. */
  secondaryGuideName?: string;
}

export const BRAIN_HEX_CONFIG: Record<BrainHexProfile, BrainHexConfig> = {
  seeker: {
    color: "#17a398",
    icon: Map,
    iconFocus: Telescope,
    label: "Explorador",
    guideName: "Amara",
    gradient: "from-teal-900/40 to-black",
    description: "Ama descobrir novos caminhos e segredos escondidos.",
  },
  survivor: {
    color: "#4e5a66",
    icon: Shield,
    iconFocus: Crosshair,
    label: "Sobrevivente",
    guideName: "Kenji",
    gradient: "from-slate-800/40 to-black",
    description: "Foca em superar desafios e proteger o que conquistou.",
  },
  daredevil: {
    color: "#d7263d",
    icon: Sword,
    iconFocus: Skull,
    label: "Aventureiro",
    guideName: "Ember",
    gradient: "from-red-900/40 to-black",
    description: "Vive pela adrenalina e riscos calculados.",
  },
  mastermind: {
    color: "#5b3fd9",
    icon: Compass,
    iconFocus: Brain,
    label: "Estrategista",
    guideName: "Idris",
    gradient: "from-indigo-900/40 to-black",
    description: "Resolve problemas complexos com lógica e sabedoria.",
  },
  conqueror: {
    color: "#1e4fd6",
    icon: Crown,
    iconFocus: ChevronRight,
    label: "Conquistador",
    guideName: "Amina",
    gradient: "from-blue-900/40 to-black",
    description: "Busca poder, influência e vitórias gloriosas.",
  },
  socializer: {
    color: "#f4623a",
    icon: Drama,
    iconFocus: Gem,
    label: "Socializador",
    guideName: "Mateo",
    gradient: "from-orange-900/40 to-black",
    description: "Valoriza conexões e histórias compartilhadas.",
    secondaryGuideName: "Zuri",
  },
  achiever: {
    color: "#c9a227",
    icon: Box,
    iconFocus: Gem,
    label: "Realizador",
    guideName: "Kwame",
    gradient: "from-amber-900/40 to-black",
    description: "Adora completar coleções e atingir metas.",
  },
};

export const PROFILES = Object.keys(BRAIN_HEX_CONFIG) as BrainHexProfile[];

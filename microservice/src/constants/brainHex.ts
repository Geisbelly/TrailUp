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
}

export const BRAIN_HEX_CONFIG: Record<BrainHexProfile, BrainHexConfig> = {
  seeker: {
    color: "#a78c07",
    icon: Map,
    iconFocus: Telescope,
    label: "Explorador",
    guideName: "Orion",
    gradient: "from-yellow-600/20 to-amber-900/20",
    description: "Ama descobrir novos caminhos e segredos escondidos.",
  },
  survivor: {
    color: "#720101",
    icon: Shield,
    iconFocus: Crosshair,
    label: "Sobrevivente",
    guideName: "Valka",
    gradient: "from-red-900/40 to-black",
    description: "Foca em superar desafios e proteger o que conquistou.",
  },
  daredevil: {
    color: "#1b6b1b",
    icon: Sword,
    iconFocus: Skull,
    label: "Aventureiro",
    guideName: "Rexa",
    gradient: "from-green-900/40 to-black",
    description: "Vive pela adrenalina e riscos calculados.",
  },
  mastermind: {
    color: "#707c88",
    icon: Compass,
    iconFocus: Brain,
    label: "Estrategista",
    guideName: "Atena",
    gradient: "from-slate-700/40 to-slate-900/40",
    description: "Resolve problemas complexos com lógica e sabedoria.",
  },
  conqueror: {
    color: "#01808b",
    icon: Crown,
    iconFocus: ChevronRight,
    label: "Conquistador",
    guideName: "Drako",
    gradient: "from-teal-900/40 to-black",
    description: "Busca poder, influência e vitórias gloriosas.",
  },
  socializer: {
    color: "#6d15be",
    icon: Drama,
    iconFocus: Gem,
    label: "Socializador",
    guideName: "Luma",
    gradient: "from-purple-900/40 to-black",
    description: "Valoriza conexões e histórias compartilhadas.",
  },
  achiever: {
    color: "#ad6002",
    icon: Box,
    iconFocus: Gem,
    label: "Realizador",
    guideName: "Auri",
    gradient: "from-orange-900/40 to-black",
    description: "Adora completar coleções e atingir metas.",
  },
};

export const PROFILES = Object.keys(BRAIN_HEX_CONFIG) as BrainHexProfile[];

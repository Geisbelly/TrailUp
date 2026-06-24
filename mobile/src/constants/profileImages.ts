//@/constants/profileImages.ts
import { ImageSourcePropType } from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

export const bannerImages: ImageSourcePropType[] = [
  require("@/assets/imgPerfil/bfae835207e72c1686f15699fd2f14c86998f251.png"), //0
  require("@/assets/ImagensReferencia/arte_filter.png"), //1
  require("@/assets/ImagensReferencia/cacador_filter.png"), //2
  require("@/assets/ImagensReferencia/chapeu_filter.png"), //3
  require("@/assets/ImagensReferencia/coracao_filter.png"), //4
  require("@/assets/ImagensReferencia/coroa_filter.png"), //5
  require("@/assets/ImagensReferencia/coruja_filter.png"), //6
  require("@/assets/ImagensReferencia/espada_filter.png"), //7
  require("@/assets/ImagensReferencia/gato_filter.png"), //8
  require("@/assets/ImagensReferencia/rosa_dos_ventos_filter.png"), //9
  require("@/assets/ImagensReferencia/rosa_dos_ventos_filter2.png"), //10
  require("@/assets/images/icon_start.png"), //11
  require("@/assets/images/splash-icon.png"), //12
  require("@/assets/ImagensReferencia/rosa_dos_ventos.png"), //13
  require("@/assets/ImagensReferencia/arte.png"), //14
  require("@/assets/ImagensReferencia/cacador.png"), //15
  require("@/assets/ImagensReferencia/chapeu.png"), //16
  require("@/assets/ImagensReferencia/coracao.png"), //17
  require("@/assets/ImagensReferencia/coroa.png"), //18
  require("@/assets/ImagensReferencia/coruja.png"), //19
  require("@/assets/ImagensReferencia/espada.png"), //20
  require("@/assets/ImagensReferencia/gato.png"), //21
  require("@/assets/ImagensReferencia/rosa_dos_ventos.png"), //22
];

export const avatarImages: ImageSourcePropType[] = [
  require("@/assets/imgPerfil/img_perfil.png"),
  require("@/assets/images/icon.png"),
  require("@/assets/images/react-logo.png"),
];

// Tipos de perfil BrainHex
export type BrainHexProfile =
  | "seeker" // Explorador/Buscador
  | "survivor" // Sobrevivente
  | "daredevil" // Aventureiro/Ousado
  | "mastermind" // Mestre/Estrategista
  | "conqueror" // Conquistador
  | "socializer" // Socializador
  | "achiever"; // Realizador

const profileAliases: Record<string, BrainHexProfile> = {
  seeker: "seeker",
  explorador: "seeker",
  buscador: "seeker",
  survivor: "survivor",
  sobrevivente: "survivor",
  daredevil: "daredevil",
  aventureiro: "daredevil",
  ousado: "daredevil",
  mastermind: "mastermind",
  estrategista: "mastermind",
  mestre: "mastermind",
  conqueror: "conqueror",
  conquistador: "conqueror",
  socializer: "socializer",
  socialiser: "socializer",
  socializador: "socializer",
  achiever: "achiever",
  realizador: "achiever",
};

export function normalizeBrainHexProfile(
  profileName?: string | null,
): BrainHexProfile | null {
  const normalized = String(profileName ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  return profileAliases[normalized] ?? null;
}

// Mapeamento de perfis BrainHex para índices de imagens com filtro
export const brainHexImageMap: Record<BrainHexProfile, number> = {
  seeker: 9, // rosa_dos_ventos_filter (explorador)
  survivor: 2, // cacador_filter (sobrevivente)
  daredevil: 7, // espada_filter (ousado/aventureiro)
  mastermind: 6, // coruja_filter (sabedoria/estratégia)
  conqueror: 5, // coroa_filter (conquistador/rei)
  socializer: 4, // coracao_filter (social/relacionamentos)
  achiever: 1, // arte_filter (realização/criação)
};

/**
 * Retorna a imagem com filtro correspondente ao perfil BrainHex do usuário
 * @param profile - Perfil BrainHex do usuário
 * @returns ImageSourcePropType da imagem com filtro
 */
export const getProfileImage = (
  profile: BrainHexProfile,
): ImageSourcePropType => {
  const imageIndex = brainHexImageMap[profile];
  return bannerImages[imageIndex];
};

/**
 * Retorna a imagem com filtro baseada em uma string de perfil (case-insensitive)
 * @param profileString - String do perfil (ex: "seeker", "MASTERMIND")
 * @returns ImageSourcePropType ou undefined se perfil inválido
 */
export const getProfileImageByString = (
  profileString: string,
): ImageSourcePropType | undefined => {
  const normalizedProfile = normalizeBrainHexProfile(profileString);

  if (normalizedProfile) {
    return getProfileImage(normalizedProfile);
  }

  return undefined;
};

/**
 * Retorna o índice da imagem com filtro para um perfil
 * @param profile - Perfil BrainHex
 * @returns Índice do array bannerImages
 */
export const getProfileImageIndex = (profile: BrainHexProfile): number => {
  return brainHexImageMap[profile];
};

// Funções existentes
export const pickRandom = <T>(arr: T[]): T | undefined => {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

export const pickBySeed = <T>(
  seed: string | undefined | null,
  arr: T[],
): T | undefined => {
  if (!arr.length) return undefined;
  if (!seed) return pickRandom(arr);
  const index = Math.abs(hashString(seed)) % arr.length;
  return arr[index];
};

// ...

export const brainHexConfig: Record<
  string,
  {
    color: string;
    // Atualize a tipagem para o novo mapa de glifos
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    icon_focus: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    imagemIndex: number;
    image: ImageSourcePropType;
  }
> = {
  seeker: {
    color: "rgb(167, 140, 7)",
    icon: "map", // Mapa do tesouro
    icon_focus: "telescope", // Observação/Exploração
    label: "Explorador",
    imagemIndex: 9,
    image: bannerImages[9],
  },
  survivor: {
    color: "#720101",
    icon: "shield-outline", // Escudo/Defesa
    icon_focus: "sword-cross", // Luta/Sobrevivência
    label: "Sobrevivente",
    imagemIndex: 2,
    image: bannerImages[2],
  },
  daredevil: {
    color: "#1b6b1b",
    icon: "sword-cross", // Luta/Ação
    icon_focus: "skull", // Velocidade/Risco
    label: "Aventureiro",
    imagemIndex: 7,
    image: bannerImages[7],
  },
  mastermind: {
    color: "#707c88ff",
    icon: "chess-knight", // Estratégia
    icon_focus: "brain", // Intelecto
    label: "Estrategista",
    imagemIndex: 6,
    image: bannerImages[6],
  },
  conqueror: {
    color: "#01808bff",
    icon: "crown-outline", // Liderança/Vitória
    icon_focus: "fencing", // Força bruta
    label: "Conquistador",
    imagemIndex: 5,
    image: bannerImages[5],
  },
  socializer: {
    color: "rgb(109, 21, 190)",
    icon: "drama-masks", // Comunidade
    icon_focus: "redhat", // Comunicação
    label: "Socializador",
    imagemIndex: 4,
    image: bannerImages[4],
  },
  achiever: {
    color: "rgb(173, 96, 2)",
    icon: "cube-outline", // Conquista clássica
    icon_focus: "diamond-stone", // Tesouro/Riqueza
    label: "Realizador",
    imagemIndex: 1,
    image: bannerImages[1],
  },
};

export const getBrainHexConfig = (profileName?: string) => {
  const normalized = normalizeBrainHexProfile(profileName);
  return (
    brainHexConfig[normalized ?? "mastermind"] || brainHexConfig.mastermind
  );
};

export const brainHexGuideNames: Record<BrainHexProfile, string> = {
  seeker: "Orion",
  survivor: "Valka",
  daredevil: "Rexa",
  mastermind: "Atena",
  conqueror: "Drako",
  socializer: "Luma",
  achiever: "Auri",
};

export const getBrainHexGuideName = (profileName?: string | null): string => {
  const normalized = normalizeBrainHexProfile(profileName);
  return (
    brainHexGuideNames[normalized ?? "mastermind"] ??
    brainHexGuideNames.mastermind
  );
};

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

/**
 * Rosto do guardião de cada perfil.
 *
 * A arte de **corpo inteiro** fica em `mobile/src/assets/guardioes/`, e o que
 * está aqui são recortes de rosto gerados a partir dela por
 * `scripts/gerar-rostos-guardioes.py`: todos os slots que mostram o guia no app
 * são avatares — o maior tem 72pt —, e uma figura de corpo inteiro nesse tamanho
 * vira um pontinho irreconhecível.
 *
 * ATENÇÃO à pasta de origem. `microservice/src/assets/guardioes/` também tem a
 * arte e o CLAUDE.md a trata como fonte da verdade dos perfis — mas isso vale
 * para as CONSTANTES (cor-assinatura, nome do guia), não para os arquivos de
 * imagem: a cópia de lá ficou 2 dias atrás (2026-07-25 contra 2026-07-27) numa
 * versão anterior da arte, em que o Sobrevivente era vermelho em vez do
 * cinza-chumbo da cor-assinatura dele. Recortes gerados de lá saíram com as
 * cores erradas (corrigido em 2026-08-26).
 *
 * Divergência ainda aberta: o microservice usa a própria cópia para compor
 * slides/apresentações, então o material gerado continua com a arte antiga até
 * alguém propagar os arquivos novos para lá.
 *
 * O Socializador usa o par (Mateo e Zuri): é o único perfil com dois guardiões,
 * e é o que faz o áudio dele ser diálogo em vez de narração solo. Mostrar só um
 * contradiria o material que o aluno recebe.
 */
export const guardianFaceImages: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require("@/assets/guardioes/rosto/seeker.png"),
  survivor: require("@/assets/guardioes/rosto/survivor.png"),
  daredevil: require("@/assets/guardioes/rosto/daredevil.png"),
  mastermind: require("@/assets/guardioes/rosto/mastermind.png"),
  conqueror: require("@/assets/guardioes/rosto/conqueror.png"),
  socializer: require("@/assets/guardioes/rosto/socializer-duo.png"),
  achiever: require("@/assets/guardioes/rosto/achiever.png"),
};

export const getGuardianFaceImage = (
  profileName?: string | null,
): ImageSourcePropType => {
  const normalized = normalizeBrainHexProfile(profileName);
  return guardianFaceImages[normalized ?? "mastermind"];
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
    color: "rgb(23, 163, 152)",
    icon: "map", // Mapa do tesouro
    icon_focus: "telescope", // Observação/Exploração
    label: "Explorador",
    imagemIndex: 9,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.seeker,
  },
  survivor: {
    color: "#4e5a66",
    icon: "shield-outline", // Escudo/Defesa
    icon_focus: "sword-cross", // Luta/Sobrevivência
    label: "Sobrevivente",
    imagemIndex: 2,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.survivor,
  },
  daredevil: {
    color: "#d7263d",
    icon: "sword-cross", // Luta/Ação
    icon_focus: "skull", // Velocidade/Risco
    label: "Aventureiro",
    imagemIndex: 7,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.daredevil,
  },
  mastermind: {
    color: "#5b3fd9ff",
    icon: "chess-knight", // Estratégia
    icon_focus: "brain", // Intelecto
    label: "Estrategista",
    imagemIndex: 6,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.mastermind,
  },
  conqueror: {
    color: "#1e4fd6ff",
    icon: "crown-outline", // Liderança/Vitória
    icon_focus: "fencing", // Força bruta
    label: "Conquistador",
    imagemIndex: 5,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.conqueror,
  },
  socializer: {
    color: "rgb(244, 98, 58)",
    icon: "drama-masks", // Comunidade
    icon_focus: "redhat", // Comunicação
    label: "Socializador",
    imagemIndex: 4,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.socializer,
  },
  achiever: {
    color: "rgb(201, 162, 39)",
    icon: "cube-outline", // Conquista clássica
    icon_focus: "diamond-stone", // Tesouro/Riqueza
    label: "Realizador",
    imagemIndex: 1,
    // imagemIndex continua apontando pro simbolo do perfil (usado em banner);
    // `image` agora e o guardiao, que e quem o aluno reconhece como guia.
    image: guardianFaceImages.achiever,
  },
};

export const getBrainHexConfig = (profileName?: string) => {
  const normalized = normalizeBrainHexProfile(profileName);
  return (
    brainHexConfig[normalized ?? "mastermind"] || brainHexConfig.mastermind
  );
};

export const brainHexGuideNames: Record<BrainHexProfile, string> = {
  seeker: "Amara",
  survivor: "Kenji",
  daredevil: "Ember",
  mastermind: "Idris",
  conqueror: "Amina",
  socializer: "Mateo",
  achiever: "Kwame",
};

export const getBrainHexGuideName = (profileName?: string | null): string => {
  const normalized = normalizeBrainHexProfile(profileName);
  return (
    brainHexGuideNames[normalized ?? "mastermind"] ??
    brainHexGuideNames.mastermind
  );
};

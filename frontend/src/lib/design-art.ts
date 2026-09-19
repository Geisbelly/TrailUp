import star from "@/assets/design/trailup-star.png";
import landscape from "@/assets/design/world-mastermind.webp";
import trail from "@/assets/design/trail-mastermind.webp";
import dawn from "@/assets/design/journey-dawn.webp";
import forest from "@/assets/design/journey-forest.webp";
import lanterns from "@/assets/design/journey-lanterns.webp";
import map from "@/assets/design/object-map.png";
import book from "@/assets/design/object-book.png";
import trophy from "@/assets/design/object-trophy.png";
import community from "@/assets/design/object-community.png";
import compass from "@/assets/design/object-compass.png";
import chest from "@/assets/design/object-chest.png";
import seekerWorld from "@/assets/design/world-seeker.webp";
import survivorWorld from "@/assets/design/world-survivor.webp";
import daredevilWorld from "@/assets/design/world-daredevil.webp";
import conquerorWorld from "@/assets/design/world-conqueror.webp";
import socializerWorld from "@/assets/design/world-socializer.webp";
import achieverWorld from "@/assets/design/world-achiever.webp";
import seekerEmblem from "@/assets/design/emblem-seeker.png";
import survivorEmblem from "@/assets/design/emblem-survivor.png";
import daredevilEmblem from "@/assets/design/emblem-daredevil.png";
import mastermindEmblem from "@/assets/design/emblem-mastermind.png";
import conquerorEmblem from "@/assets/design/emblem-conqueror.png";
import socializerEmblem from "@/assets/design/emblem-socializer.png";
import achieverEmblem from "@/assets/design/emblem-achiever.png";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import seekerGuide from "@/assets/design/seeker.png";
import survivorGuide from "@/assets/design/survivor.png";
import daredevilGuide from "@/assets/design/daredevil.png";
import mastermindGuide from "@/assets/design/mastermind.png";
import conquerorGuide from "@/assets/design/conqueror.png";
import socializerGuide from "@/assets/design/socializer-duo.png";
import achieverGuide from "@/assets/design/achiever.png";
import seekerScene from "@/assets/design/guide-world-seeker.webp";
import survivorScene from "@/assets/design/guide-world-survivor.webp";
import daredevilScene from "@/assets/design/guide-world-daredevil.webp";
import mastermindScene from "@/assets/design/guide-world-mastermind.webp";
import conquerorScene from "@/assets/design/guide-world-conqueror.webp";
import socializerScene from "@/assets/design/guide-world-socializer.webp";
import achieverScene from "@/assets/design/guide-world-achiever.webp";

// Optimized copies of the user's Downloads/Design artwork, also used in mobile.
export const DESIGN_ART = { star, landscape, trail, dawn, forest, lanterns, map, book, trophy, community, compass, chest };

type GuideGrounding = {
  width: number;
  height: number;
  baseline: number;
  contacts: { x: number; y: number; width: number }[];
};

// Sole coordinates in the original PNGs, excluding transparent bottom padding.
const GUIDE_GROUNDING: Record<BrainHexProfileKey, GuideGrounding> = {
  seeker: { width: 640, height: 748, baseline: 745, contacts: [{ x: 170, y: 731, width: 66 }, { x: 401, y: 744, width: 94 }] },
  survivor: { width: 640, height: 748, baseline: 735, contacts: [{ x: 225, y: 734, width: 88 }, { x: 425, y: 731, width: 124 }] },
  daredevil: { width: 640, height: 748, baseline: 743, contacts: [{ x: 514, y: 740, width: 114 }] },
  mastermind: { width: 640, height: 748, baseline: 748, contacts: [{ x: 248, y: 743, width: 90 }, { x: 375, y: 733, width: 128 }] },
  conqueror: { width: 640, height: 747, baseline: 738, contacts: [{ x: 249, y: 733, width: 74 }, { x: 478, y: 734, width: 90 }] },
  socializer: { width: 640, height: 632, baseline: 632, contacts: [{ x: 166, y: 629, width: 86 }, { x: 245, y: 613, width: 88 }, { x: 415, y: 625, width: 86 }, { x: 556, y: 631, width: 90 }] },
  achiever: { width: 640, height: 748, baseline: 744, contacts: [{ x: 245, y: 732, width: 132 }, { x: 529, y: 742, width: 136 }] },
};

type ProfileWorld = {
  key: BrainHexProfileKey;
  label: string;
  title: string;
  description: string;
  color: string;
  world: string;
  emblem: string;
  guide: { name: string; title: string; art: string; scene: string; floor: number; grounding: GuideGrounding };
};

export const PROFILE_WORLDS: ProfileWorld[] = [
  { key: "seeker", label: "Explorador", title: "A curiosidade abre caminhos.", description: "Para quem encontra uma nova pergunta em cada descoberta e aprende explorando possibilidades.", color: "#17a398", world: seekerWorld, emblem: seekerEmblem, guide: { name: "Amara", title: "A Guardiã das Runas", art: seekerGuide, scene: seekerScene, floor: 20, grounding: GUIDE_GROUNDING.seeker } },
  { key: "survivor", label: "Desafiador", title: "Cada desafio, um passo adiante.", description: "Para quem observa, se prepara e encontra na persistência uma maneira de superar o que parecia difícil.", color: "#4e5a66", world: survivorWorld, emblem: survivorEmblem, guide: { name: "Kenji", title: "O Guardião da Montanha", art: survivorGuide, scene: survivorScene, floor: 21, grounding: GUIDE_GROUNDING.survivor } },
  { key: "daredevil", label: "Aventureiro", title: "Aprender também é se lançar.", description: "Para quem prefere experimentar, colocar ideias à prova e transformar tentativas em descobertas.", color: "#d7263d", world: daredevilWorld, emblem: daredevilEmblem, guide: { name: "Ember", title: "A Fênix do Caos", art: daredevilGuide, scene: daredevilScene, floor: 21, grounding: GUIDE_GROUNDING.daredevil } },
  { key: "mastermind", label: "Estrategista", title: "Todo caminho começa com uma ideia.", description: "Para quem busca conexões, entende os porquês e transforma conhecimento em novas estratégias.", color: "#5b3fd9", world: landscape, emblem: mastermindEmblem, guide: { name: "Idris", title: "O Sábio das Constelações", art: mastermindGuide, scene: mastermindScene, floor: 29, grounding: GUIDE_GROUNDING.mastermind } },
  { key: "conqueror", label: "Competidor", title: "Sua próxima conquista espera.", description: "Para quem encontra motivação nos desafios e quer ir além da própria melhor marca.", color: "#1e4fd6", world: conquerorWorld, emblem: conquerorEmblem, guide: { name: "Amina", title: "A Rainha da Tempestade", art: conquerorGuide, scene: conquerorScene, floor: 21, grounding: GUIDE_GROUNDING.conqueror } },
  { key: "socializer", label: "Colaborador", title: "Juntos, a jornada vai mais longe.", description: "Para quem aprende trocando ideias, compartilhando descobertas e construindo com outras pessoas.", color: "#f4623a", world: socializerWorld, emblem: socializerEmblem, guide: { name: "Mateo & Zuri", title: "Os Gêmeos Espíritos da Aurora", art: socializerGuide, scene: socializerScene, floor: 21, grounding: GUIDE_GROUNDING.socializer } },
  { key: "achiever", label: "Realizador", title: "Cada etapa merece ser conquistada.", description: "Para quem gosta de ver o progresso acontecer, completar objetivos e celebrar cada marco do percurso.", color: "#c9a227", world: achieverWorld, emblem: achieverEmblem, guide: { name: "Kwame", title: "O Cavaleiro Solar", art: achieverGuide, scene: achieverScene, floor: 21, grounding: GUIDE_GROUNDING.achiever } },
];

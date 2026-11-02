// Identidade visual de cada perfil BrainHex no deck HTML: emblema, guia,
// nome do estilo visual e motivo de fundo.
//
// - Guia e rotulo: microservice/src/constants/brainHex.ts (fonte oficial).
// - Nome do estilo e motivos: microservice/src/constants/presentationThemes.ts
//   (styleName/motifs de cada perfil), desenhados aqui como padrao SVG.
// - Emblema: o MESMO desenho que o app ja usa para o perfil
//   (mobile/src/constants/profileImages.ts: map, shield-outline, sword-cross,
//   chess-knight, crown-outline, drama-masks, cube-outline), em traco no
//   estilo lucide. "Um icone, um significado": no app a bussola e' o "mapa
//   revelado", entao o Mastermind e' o cavalo de xadrez, como no app, e nao a
//   bussola da lista do microservice. Nenhum desses desenhos e' medalha
//   (conquista) nem rosto de guia ("voce parou aqui").

import { profileKeyOf, type DeckProfileKey } from './deckTheme';

export interface DeckProfileIdentity {
  key: DeckProfileKey;
  label: string;
  guideName: string;
  styleName: string;
  /** Miolo de um <svg viewBox="0 0 24 24"> em traco (stroke=currentColor). */
  emblemPaths: string;
  /** Miolo de um <svg> de ladrilho do motivo de fundo; cor via {{c}}. */
  motifTile: { size: number; body: string };
}

const IDENTITIES: Record<DeckProfileKey, DeckProfileIdentity> = {
  seeker: {
    key: 'seeker',
    label: 'Explorador',
    guideName: 'Amara',
    styleName: 'Atlas das Descobertas',
    emblemPaths:
      '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    // Curvas de nivel e rota pontilhada (mapa topografico).
    motifTile: {
      size: 96,
      body:
        '<path d="M0 30 C24 18 48 42 96 26" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<path d="M0 54 C30 40 60 66 96 50" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<path d="M0 80 C26 70 58 92 96 76" stroke="{{c}}" fill="none" stroke-width="1" stroke-dasharray="2 5"/>',
    },
  },
  survivor: {
    key: 'survivor',
    label: 'Sobrevivente',
    guideName: 'Kenji',
    styleName: 'Manual de Campo',
    emblemPaths:
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    // Grade tatica com marcas de coordenada.
    motifTile: {
      size: 64,
      body:
        '<path d="M0 .5H64M.5 0V64" stroke="{{c}}" stroke-width="1"/>' +
        '<path d="M28 32h8M32 28v8" stroke="{{c}}" stroke-width="1.2"/>',
    },
  },
  daredevil: {
    key: 'daredevil',
    label: 'Aventureiro',
    guideName: 'Ember',
    styleName: 'Código de Impacto',
    emblemPaths:
      '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
    // Linhas de velocidade em diagonal.
    motifTile: {
      size: 48,
      body:
        '<path d="M-4 52 L52 -4" stroke="{{c}}" stroke-width="1.2"/>' +
        '<path d="M20 52 L52 20" stroke="{{c}}" stroke-width="0.8"/>',
    },
  },
  mastermind: {
    key: 'mastermind',
    label: 'Estrategista',
    guideName: 'Idris',
    styleName: 'Blueprint Estratégico',
    // Cavalo de xadrez (chess-knight do app), redesenhado em traco.
    emblemPaths:
      '<path d="M5 21h14"/><path d="M7 21v-2.5h10V21"/><path d="M8.5 18.5c.2-2.7 1.6-4.4 3.6-5.9-1.6.2-3 .8-4.4 1.9L6 13l3.2-5.4-.4-3.1 2.3 1.3c3.6.2 5.9 2.7 5.9 6.7v6"/><path d="M11 8.6h.01"/>',
    // Grade de blueprint com nos conectados.
    motifTile: {
      size: 72,
      body:
        '<path d="M0 .5H72M.5 0V72M0 36.5H72M36.5 0V72" stroke="{{c}}" stroke-width=".6"/>' +
        '<path d="M12 24 L36 36 L58 18" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<circle cx="12" cy="24" r="2" fill="{{c}}"/><circle cx="36" cy="36" r="2" fill="{{c}}"/><circle cx="58" cy="18" r="2" fill="{{c}}"/>',
    },
  },
  conqueror: {
    key: 'conqueror',
    label: 'Conquistador',
    guideName: 'Amina',
    styleName: 'Tratado de Soberania',
    emblemPaths:
      '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    // Arcos monumentais.
    motifTile: {
      size: 80,
      body:
        '<path d="M4 80 V44 A36 36 0 0 1 76 44 V80" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<path d="M20 80 V50 A20 20 0 0 1 60 50 V80" stroke="{{c}}" fill="none" stroke-width=".8"/>',
    },
  },
  socializer: {
    key: 'socializer',
    label: 'Socializador',
    guideName: 'Mateo e Zuri',
    styleName: 'Mosaico de Conexões',
    emblemPaths:
      '<path d="M10 11h.01"/><path d="M14 6h.01"/><path d="M18 6h.01"/><path d="M6.5 13.1h.01"/><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3"/><path d="M17.4 9.9c-.8.8-2 .8-2.8 0"/><path d="M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7"/><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4"/>',
    // Elos circulares sobrepostos.
    motifTile: {
      size: 72,
      body:
        '<circle cx="24" cy="30" r="16" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<circle cx="44" cy="30" r="16" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<circle cx="34" cy="62" r="5" stroke="{{c}}" fill="none" stroke-width=".8"/>',
    },
  },
  achiever: {
    key: 'achiever',
    label: 'Realizador',
    guideName: 'Kwame',
    styleName: 'Portfólio de Maestria',
    emblemPaths:
      '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    // Gema lapidada e trilha de progresso em segmentos (sem medalha: medalha
    // e' "conquista" no app).
    motifTile: {
      size: 64,
      body:
        '<path d="M32 10 L44 22 L32 40 L20 22 Z M20 22 H44" stroke="{{c}}" fill="none" stroke-width="1"/>' +
        '<path d="M6 56 H18 M24 56 H36 M42 56 H54" stroke="{{c}}" stroke-width="1.4" stroke-linecap="round"/>',
    },
  },
};

export function getDeckProfileIdentity(profile: string | undefined | null): DeckProfileIdentity {
  return IDENTITIES[profileKeyOf(profile)];
}

export function emblemSvg(profile: string | undefined | null, className = 'emblem-svg'): string {
  const id = getDeckProfileIdentity(profile);
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${id.emblemPaths}</svg>`;
}

/** Ladrilho do motivo como data URI para background-image, na cor pedida. */
export function motifDataUri(profile: string | undefined | null, color: string): string {
  const { size, body } = getDeckProfileIdentity(profile).motifTile;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body.split('{{c}}').join(color)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Iniciais do guia para o avatar (Mateo e Zuri -> MZ). */
export function guideInitials(name: string | undefined | null): string {
  const words = String(name || '')
    .split(/\s+|&/)
    .map((w) => w.trim())
    .filter((w) => w && !['e', 'de', 'da', 'do', 'dos', 'das'].includes(w.toLowerCase()));
  if (words.length === 0) return '✦';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

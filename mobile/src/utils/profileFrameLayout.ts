import type { BrainHexProfile } from '../constants/brainHexProfiles';

export const FRAME_CANVAS_SIZE = 256;

// A abertura dos PNGs não coincide com o centro da tela de 256 × 256.
// Medidas da borda interna, sem incluir os adornos que avançam sobre a foto.
const openings: Record<BrainHexProfile, { x: number; y: number; radius: number }> = {
  achiever: { x: 130, y: 123, radius: 92 },
  conqueror: { x: 130, y: 133, radius: 94 },
  daredevil: { x: 129, y: 122, radius: 92 },
  mastermind: { x: 126, y: 134, radius: 96 },
  seeker: { x: 126, y: 133, radius: 93 },
  socializer: { x: 127, y: 125, radius: 87 },
  survivor: { x: 130, y: 124, radius: 91 },
};

export function getProfileFrameLayout(profile: BrainHexProfile, size: number) {
  const opening = openings[profile];
  const scale = size / FRAME_CANVAS_SIZE;
  // Sobreposição mínima sob o aro evita frestas nas bordas antisserrilhadas.
  const photoRadius = opening.radius + 1;
  return {
    opening,
    photoSize: photoRadius * 2 * scale,
    photoLeft: (opening.x - photoRadius) * scale,
    photoTop: (opening.y - photoRadius) * scale,
  };
}

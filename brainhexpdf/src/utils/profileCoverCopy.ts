// Vocabulario tematico por perfil BrainHex pro badge da capa e do slide
// final do deck - mesma estrutura HTML nos 7 perfis, so o texto muda pra
// refletir o tom/arquetipo de cada um (ver docs/superpowers/specs/
// 2026-08-24-capa-final-redesign-design.md). Perfil sem entrada aqui cai
// no texto generico ja existente (fallback, nunca quebra).
export interface ProfileCoverCopy {
  missionBadge: string;
  conclusionBadge: string;
}

const PROFILE_COVER_COPY: Record<string, ProfileCoverCopy> = {
  achiever: {
    missionBadge: 'MISSÃO DE HONRA',
    conclusionBadge: 'SÍNTESE DE GLÓRIA & CONQUISTA',
  },
  seeker: {
    missionBadge: 'EXPEDIÇÃO DE DESCOBERTA',
    conclusionBadge: 'MAPA DA JORNADA CONCLUÍDA',
  },
  survivor: {
    missionBadge: 'MISSÃO DE SOBREVIVÊNCIA',
    conclusionBadge: 'FORTALEZA CONSOLIDADA',
  },
  daredevil: {
    missionBadge: 'DESAFIO NA FORJA',
    conclusionBadge: 'VITÓRIA FORJADA NO CAOS',
  },
  mastermind: {
    missionBadge: 'RITUAL DE APRENDIZADO',
    conclusionBadge: 'SÍNTESE ARCANA & MAESTRIA',
  },
  conqueror: {
    missionBadge: 'CAMPANHA DE CONQUISTA',
    conclusionBadge: 'TERRITÓRIO DOMINADO',
  },
  socializer: {
    missionBadge: 'CONVITE DA TÁVOLA',
    conclusionBadge: 'CRÔNICA DA CONFRARIA',
  },
};

const DEFAULT_COVER_COPY: ProfileCoverCopy = {
  missionBadge: 'MISSÃO DE APRENDIZADO',
  conclusionBadge: 'SÍNTESE DE MAESTRIA & PRÓXIMOS PASSOS',
};

export function getProfileCoverCopy(profile: string | undefined | null): ProfileCoverCopy {
  const key = String(profile || '').trim().toLowerCase();
  return PROFILE_COVER_COPY[key] || DEFAULT_COVER_COPY;
}

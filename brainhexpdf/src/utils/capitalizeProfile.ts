// O microservice do trailup manda targetProfile em minusculo
// ("mastermind"); BRAIN_HEX_PROFILES usa chaves capitalizadas
// ("Mastermind") - mesma convencao ja usada no frontend (App.tsx/
// GeneratorModal.tsx).
export function capitalizeProfile(targetProfile: string): string {
  const lower = String(targetProfile || '').trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

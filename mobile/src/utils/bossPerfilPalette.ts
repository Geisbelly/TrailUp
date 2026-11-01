import type { IAEnemyPalette } from '@/interfaces/personalizacao/IAContracts';
import type { ProfileShellPalette } from './profileShellPalette';

// Escudo é sinal fixo, como success/warning/info: não deriva do accent do perfil.
export const BOSS_SHIELD_COLOR = '#60a5fa';

/**
 * Paleta do painel de batalha a partir do shell do perfil. O accent do shell já vem com a
 * luminosidade (HSL) elevada até 4.5:1 sobre `surfaceElevated` — nunca misturado com branco —,
 * e é sobre `surfaceElevated` que o painel desenha título, cronômetro e dano. A paleta que a IA
 * manda por arquétipo (`enemy.visual.palette`) é ignorada: ela não conhece o perfil do aluno.
 */
export function paletaDoBossNoPerfil(shell: ProfileShellPalette): Record<keyof IAEnemyPalette, string> {
  return {
    primaryColor: shell.accent,
    secondaryColor: shell.surfaceElevated,
    accentColor: shell.accent,
    hpColor: shell.accent,
    shieldColor: BOSS_SHIELD_COLOR,
    textColor: shell.text,
  };
}

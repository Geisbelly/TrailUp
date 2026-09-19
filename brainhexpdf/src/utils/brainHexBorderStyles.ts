import { BrainHexType, ThemeConfig } from '../types';

/**
 * Returns the CSS class name for the active BrainHex profile's decorative border
 */
export function getBrainHexBorderClassName(profile: BrainHexType | string = 'Achiever'): string {
  const p = String(profile || '').toLowerCase().trim();
  if (p.includes('achiever')) return 'brainhex-border-achiever';
  if (p.includes('mastermind')) return 'brainhex-border-mastermind';
  if (p.includes('seeker')) return 'brainhex-border-seeker';
  if (p.includes('conqueror')) return 'brainhex-border-conqueror';
  if (p.includes('socializer')) return 'brainhex-border-socializer';
  if (p.includes('daredevil')) return 'brainhex-border-daredevil';
  if (p.includes('survivor')) return 'brainhex-border-survivor';
  return 'brainhex-border-achiever';
}

/**
 * Generates the full CSS stylesheet string containing all BrainHex decorative border styles.
 * This can be injected into the live DOM, standalone HTML exports, and PDF generation engines.
 */
export function getBrainHexBorderCss(theme?: Partial<ThemeConfig>): string {
  const primary = theme?.palette?.primary || '#7C3AED';
  const secondary = theme?.palette?.secondary || '#3B82F6';
  const accent = theme?.palette?.accent || '#F59E0B';
  const background = theme?.palette?.background || '#0D0814';

  return `
    /* ==========================================================================
       TRAILUP DYNAMIC BRAINHEX CSS DECORATIVE BORDER SYSTEM
       Clean, Non-Colliding Themed Frame Borders
       ========================================================================== */

    /* 1. ACHIEVER: Gilded Paladin Gold Accent Border */
    .brainhex-border-achiever {
      position: relative;
      border: 2px solid #F59E0B;
      box-shadow: 
        0 0 20px rgba(245, 158, 11, 0.2),
        inset 0 0 20px rgba(245, 158, 11, 0.05),
        0 20px 40px rgba(0, 0, 0, 0.85);
      border-radius: 16px;
    }

    /* 2. MASTERMIND: Arcane Runic Purple & Cyan Frame */
    .brainhex-border-mastermind {
      position: relative;
      border: 2px solid #8B5CF6;
      box-shadow:
        0 0 25px rgba(139, 92, 246, 0.25),
        0 0 8px rgba(6, 182, 212, 0.2),
        inset 0 0 20px rgba(139, 92, 246, 0.08),
        0 20px 40px rgba(0, 0, 0, 0.9);
      border-radius: 16px;
    }

    /* 3. SEEKER: Botanical Emerald Compass Frame */
    .brainhex-border-seeker {
      position: relative;
      border: 2px solid #10B981;
      box-shadow:
        0 0 20px rgba(16, 185, 129, 0.2),
        inset 0 0 20px rgba(16, 185, 129, 0.05),
        0 20px 40px rgba(0, 0, 0, 0.85);
      border-radius: 16px;
    }

    /* 4. CONQUEROR: Imperial Warlord Crimson Frame */
    .brainhex-border-conqueror {
      position: relative;
      border: 2px solid #DC2626;
      box-shadow:
        0 0 25px rgba(220, 38, 38, 0.25),
        inset 0 0 25px rgba(0, 0, 0, 0.85),
        0 20px 45px rgba(0, 0, 0, 0.95);
      border-radius: 14px;
    }

    /* 5. SOCIALIZER: Roundtable Amber-Rose Crest Frame */
    .brainhex-border-socializer {
      position: relative;
      border: 2px solid #F59E0B;
      box-shadow:
        0 0 20px rgba(245, 158, 11, 0.25),
        inset 0 0 20px rgba(251, 113, 133, 0.05),
        0 20px 40px rgba(0, 0, 0, 0.85);
      border-radius: 16px;
    }

    /* 6. DAREDEVIL: Tactical Hazard Orange-Red Frame */
    .brainhex-border-daredevil {
      position: relative;
      border: 2px solid #EF4444;
      box-shadow:
        0 0 25px rgba(239, 68, 68, 0.3),
        0 0 8px rgba(249, 115, 22, 0.2),
        inset 0 0 20px rgba(239, 68, 68, 0.1),
        0 20px 45px rgba(0, 0, 0, 0.95);
      border-radius: 14px;
    }

    /* 7. SURVIVOR: Bastion Titanium Reinforced Frame */
    .brainhex-border-survivor {
      position: relative;
      border: 2px solid #64748B;
      box-shadow:
        0 0 20px rgba(100, 116, 139, 0.25),
        inset 0 0 25px rgba(0, 0, 0, 0.85),
        0 20px 40px rgba(0, 0, 0, 0.95);
      border-radius: 14px;
    }
  `;
}

import type { BrainHexProfile } from "./brainHex";
import assinaturas from "./editorialSignatures.json";

/**
 * Assinatura editorial de cada perfil BrainHex: como o conteúdo é dito (tom, ritmo, abertura,
 * fechamento, proibições), nunca o que é dito.
 *
 * O JSON é cópia de `_BRAINHEX_EDITORIAL_SIGNATURES` (api/app/services/personalizacao.py), que
 * continua sendo usado pelo fallback Python, pelas falas do boss e pelas notificações.
 * `api/tests/test_assinatura_editorial_paridade.py` quebra se os dois divergirem: mude os dois juntos.
 */
export interface EditorialSignature {
  tom_voz: string;
  ritmo: string;
  abertura_estilo: string;
  convencimento_estilo: string;
  progressao_narrativa: string;
  fechamento_estilo: string;
  narrativa_preferencial: string;
  marcadores_linguisticos: string[];
  proibicoes_estilo: string[];
}

// As chaves seguem o Python, inclusive a grafia "Socialiser".
const CHAVE_DO_PERFIL: Record<BrainHexProfile, string> = {
  seeker: "Seeker",
  survivor: "Survivor",
  daredevil: "Daredevil",
  mastermind: "Mastermind",
  conqueror: "Conqueror",
  socializer: "Socialiser",
  achiever: "Achiever",
};

const ASSINATURAS = assinaturas as Record<string, EditorialSignature>;

export function editorialSignatureFor(profile: BrainHexProfile): EditorialSignature {
  return ASSINATURAS[CHAVE_DO_PERFIL[profile]];
}

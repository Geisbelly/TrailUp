import {
  BrainHexProfile,
  normalizeBrainHexProfile,
} from "@/constants/brainHexProfiles";

type BrainHexPerfilLike = {
  nome?: string | null;
  perfil?: string | null;
  afinidade?: number | null;
};

const COMBAT_PROFILES: BrainHexProfile[] = ["survivor"];
const SECONDARY_SIGNAL_INDEX = 1;
const DEFAULT_SIGNAL_THRESHOLD = 20;

type RankedBrainHexProfile = {
  index: number;
  afinidade: number;
  profile: BrainHexProfile;
};

export function rankBrainHexProfiles(
  perfis?: BrainHexPerfilLike[] | null
): RankedBrainHexProfile[] {
  if (!Array.isArray(perfis) || perfis.length === 0) {
    return [];
  }

  return perfis
    .map((perfil, index) => ({
      index,
      afinidade: Number(perfil?.afinidade ?? 0),
      profile: normalizeBrainHexProfile(perfil?.nome ?? perfil?.perfil),
    }))
    .filter((entry): entry is RankedBrainHexProfile => Boolean(entry.profile))
    .sort((left, right) => {
      if (right.afinidade !== left.afinidade) {
        return right.afinidade - left.afinidade;
      }
      return left.index - right.index;
    });
}

export function resolveDominantBrainHexProfile(
  perfis?: BrainHexPerfilLike[] | null,
  fallback: BrainHexProfile = "seeker"
): BrainHexProfile {
  return rankBrainHexProfiles(perfis)[0]?.profile ?? fallback;
}

export function resolveRepresentativeBrainHexProfiles(
  perfis?: BrainHexPerfilLike[] | null,
  threshold = DEFAULT_SIGNAL_THRESHOLD,
): BrainHexProfile[] {
  return rankBrainHexProfiles(perfis)
    .filter((entry, index) => {
      const hasMeaningfulAffinity = entry.afinidade > 0;
      return (
        ((index === 0 || index === SECONDARY_SIGNAL_INDEX) && hasMeaningfulAffinity) ||
        entry.afinidade >= threshold
      );
    })
    .map((entry) => entry.profile);
}

/**
 * O perfil que o sistema assume quando o aluno ainda nao tem nenhum.
 *
 * Nao e' escolha de gosto: `getBrainHexConfig` (que da' cor, icone e guardiao) ja' caia aqui,
 * `_BRAINHEX_GUIDE_PERSONAS` na API tambem, e `contarAlunosPorPerfilDominante` conta aluno sem
 * linha em `aluno_perfil` como mastermind. Era o unico default fora do lugar que importava.
 */
export const PERFIL_PADRAO: BrainHexProfile = "mastermind";

export function resolveActiveBrainHexProfile(
  perfis: BrainHexPerfilLike[] | null | undefined,
  preferred?: string | null,
  fallback: BrainHexProfile = PERFIL_PADRAO,
): BrainHexProfile {
  const normalizedPreferred = normalizeBrainHexProfile(preferred);
  const representativeProfiles = resolveRepresentativeBrainHexProfiles(perfis);
  if (
    normalizedPreferred &&
    representativeProfiles.includes(normalizedPreferred)
  ) {
    return normalizedPreferred;
  }
  return resolveDominantBrainHexProfile(perfis, fallback);
}

export function hasBrainHexProfileSignal(
  perfis: BrainHexPerfilLike[] | null | undefined,
  target: BrainHexProfile,
  threshold = DEFAULT_SIGNAL_THRESHOLD
) {
  const ranked = rankBrainHexProfiles(perfis);
  if (!ranked.length) return false;

  return ranked.some((entry, index) => {
    if (entry.profile !== target) return false;
    const hasMeaningfulAffinity = entry.afinidade > 0;
    return (
      ((index === 0 || index === SECONDARY_SIGNAL_INDEX) && hasMeaningfulAffinity) ||
      entry.afinidade >= threshold
    );
  });
}

export function hasAnyBrainHexProfileSignal(
  perfis: BrainHexPerfilLike[] | null | undefined,
  targets: BrainHexProfile[],
  threshold = DEFAULT_SIGNAL_THRESHOLD
) {
  return targets.some((target) => hasBrainHexProfileSignal(perfis, target, threshold));
}

export function isCombatBrainHexProfile(profile?: BrainHexProfile | null) {
  return profile != null && COMBAT_PROFILES.includes(profile);
}


type AlunoComPerfil = {
  perfilAtivo?: string | null;
  perfis?: BrainHexPerfilLike[] | null;
};

/**
 * O perfil que pinta a tela do aluno — UM so' lugar que responde isso.
 *
 * Antes havia duas respostas para a mesma pergunta. A trilha usava
 * `resolveActiveBrainHexProfile(..., 'seeker')`; tudo que pintava usava
 * `perfilVisualDoAluno(usuario)`, cujo default acaba em mastermind — e
 * ainda apareciam `'conqueror'` e `''` como terceiro e quarto defaults, em 52 copias da mesma
 * expressao. Enquanto `perfis` nao chega do banco (ele e' hidratado numa consulta separada,
 * DEPOIS da sessao), as duas respostas divergem: o cabecalho e o guardiao da trilha saiam em
 * verde de seeker por cima de um corpo roxo de mastermind. Com aluno sem `aluno_perfil`, a
 * divergencia e' permanente.
 *
 * As duas respostas tambem usavam REGRAS diferentes: `perfis?.[0]` e' a primeira linha da
 * consulta, enquanto `resolveActiveBrainHexProfile` confere se a escolha do aluno ainda esta'
 * entre os perfis representativos dele e, se nao estiver, volta ao dominante. Essa e' a regra
 * do produto; a outra era um atalho.
 */
export function perfilVisualDoAluno(aluno: AlunoComPerfil | null | undefined): BrainHexProfile {
  return resolveActiveBrainHexProfile(aluno?.perfis ?? null, aluno?.perfilAtivo, PERFIL_PADRAO);
}

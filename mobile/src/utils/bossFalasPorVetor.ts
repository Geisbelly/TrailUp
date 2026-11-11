import { BrainHexProfile, normalizeBrainHexProfile } from '@/constants/brainHexProfiles';
import { rankBrainHexProfiles, resolveRepresentativeBrainHexProfiles } from '@/utils/brainHex';
import { getBrainHexProfileCapabilities } from '@/utils/brainHexCapabilities';
import { lerFalasDoBoss, type FalasPorConteudo } from '@/utils/bossFalas';

/**
 * De qual perfil é a voz de cada boss (fase 3 do roteiro de diversidade de perfis).
 *
 * Antes o boss falava só com a voz do perfil ativo: um aluno 40/35 Daredevil/Survivor nunca
 * ouvia o Survivor. Agora cada boss fala com a voz de um perfil de BATALHA representativo do
 * aluno, sorteado na proporção do vetor. O sorteio é estável por aluno × conteúdo: o boss tem
 * uma voz só (nome e falas do mesmo perfil), não muda entre sessões, e ao longo da trilha os
 * perfis aparecem na proporção dos pesos. O `enemy.id` não muda (`aplicarFalasNoBoss`).
 */

export type PesoDePerfil = { perfil: BrainHexProfile; peso: number };

type PerfilLike = { nome?: string | null; perfil?: string | null; afinidade?: number | null };

/** Perfis de batalha representativos, com a afinidade renormalizada; sem nenhum, o perfil ativo. */
export function pesosDeBatalha(perfis: PerfilLike[] | null | undefined, perfilAtivo: BrainHexProfile): PesoDePerfil[] {
  const representativos = new Set(resolveRepresentativeBrainHexProfiles(perfis));
  const deBatalha = rankBrainHexProfiles(perfis).filter(
    (entrada) =>
      representativos.has(entrada.profile) &&
      entrada.afinidade > 0 &&
      getBrainHexProfileCapabilities(entrada.profile).hasBattle,
  );
  const total = deBatalha.reduce((soma, entrada) => soma + entrada.afinidade, 0);
  if (total <= 0) return [{ perfil: perfilAtivo, peso: 1 }];
  return deBatalha.map((entrada) => ({ perfil: entrada.profile, peso: entrada.afinidade / total }));
}

/** FNV-1a de 32 bits em [0, 1): o mesmo texto dá sempre o mesmo número, em qualquer aparelho. */
function fracaoEstavel(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

/** Sorteio ponderado e estável: a mesma semente escolhe sempre o mesmo perfil. */
export function perfilDoBoss(pesos: PesoDePerfil[], semente: string): BrainHexProfile | null {
  const total = pesos.reduce((soma, p) => soma + Math.max(0, p.peso), 0);
  if (total <= 0) return null;
  let alvo = fracaoEstavel(semente) * total;
  for (const { perfil, peso } of pesos) {
    alvo -= Math.max(0, peso);
    if (alvo < 0) return perfil;
  }
  return pesos[pesos.length - 1].perfil;
}

type LinhaComPerfil = { conteudo_id?: unknown; perfil?: unknown; nome?: unknown; falas?: unknown };

/**
 * Linhas de `boss_falas` de vários perfis → uma voz por conteúdo. O sorteio fica só entre os
 * perfis que têm falas geradas para aquele conteúdo; conteúdo sem nenhum fica com as fixas.
 */
export function montarFalasDoAluno(
  linhas: LinhaComPerfil[] | null | undefined,
  pesos: PesoDePerfil[],
  alunoId: string,
): FalasPorConteudo {
  const peso = new Map(pesos.map((p) => [p.perfil, p.peso]));
  const porPerfil = new Map<BrainHexProfile, LinhaComPerfil[]>();
  for (const linha of linhas ?? []) {
    const perfil = normalizeBrainHexProfile(typeof linha?.perfil === 'string' ? linha.perfil : null);
    if (!perfil || !peso.has(perfil)) continue;
    porPerfil.set(perfil, [...(porPerfil.get(perfil) ?? []), linha]);
  }
  const falasPorPerfil = new Map([...porPerfil].map(([perfil, doPerfil]) => [perfil, lerFalasDoBoss(doPerfil)]));

  const conteudos = new Set<number>();
  for (const mapa of falasPorPerfil.values()) for (const id of Object.keys(mapa)) conteudos.add(Number(id));

  const resultado: FalasPorConteudo = {};
  for (const conteudoId of conteudos) {
    const candidatos = pesos.filter((p) => falasPorPerfil.get(p.perfil)?.[conteudoId]);
    const perfil = perfilDoBoss(candidatos, `${alunoId}:${conteudoId}`);
    const falas = perfil ? falasPorPerfil.get(perfil)?.[conteudoId] : undefined;
    if (falas) resultado[conteudoId] = falas;
  }
  return resultado;
}

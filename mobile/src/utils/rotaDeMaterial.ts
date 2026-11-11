import type { BrainHexProfile } from '@/constants/brainHexProfiles';
import { rankBrainHexProfiles, resolveRepresentativeBrainHexProfiles } from '@/utils/brainHex';
import { personalizedAvailabilityScore } from '@/utils/personalizationAvailability';

/**
 * A rota de material do tópico: de qual perfil vem cada conteúdo (fase 2 do roteiro de diversidade
 * de perfis; spec `docs/superpowers/specs/2026-11-11-mistura-de-material-por-conteudo-design.md`).
 *
 * Antes, o aluno via TODO o material de um perfil só (o da tela), mesmo com um vetor quase plano.
 * Aqui cada conteúdo vem inteiro de um perfil representativo — texto, áudio e slides com a mesma
 * voz —, e os conteúdos do tópico se distribuem pelo vetor por Sainte-Laguë sequencial.
 *
 * Tudo puro e determinístico: a mesma entrada dá a mesma rota em qualquer aparelho.
 */

export type PoliticaDaRota = 'perfil_unico' | 'proporcional';
export type ChaveDaMistura = 'desligada' | 'alternancia';
export type PesoDePerfil = { perfil: BrainHexProfile; peso: number };
export type PerfilLike = { nome?: string | null; perfil?: string | null; afinidade?: number | null };

export const VERSAO_DO_ALOCADOR = 'rota-v1';

/** FNV-1a de 32 bits em [0, 1): o mesmo texto dá sempre o mesmo número. */
function fracaoEstavel(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

/**
 * A política do par aluno × tópico. Com a chave ligada, metade dos tópicos de cada aluno fica como
 * hoje e metade mistura, por sorteio fixo: dá comparação dentro do mesmo aluno, e a probabilidade
 * vai para o registro de exposição.
 */
export function politicaDoTopico(
  chave: ChaveDaMistura,
  alunoId: string,
  topicoId: number,
): { politica: PoliticaDaRota; probabilidade: number } {
  if (chave !== 'alternancia') return { politica: 'perfil_unico', probabilidade: 1 };
  const politica = fracaoEstavel(`politica:${alunoId}:${topicoId}`) < 0.5 ? 'proporcional' : 'perfil_unico';
  return { politica, probabilidade: 0.5 };
}

/**
 * Os perfis representativos com a afinidade normalizada; o ativo (o que o aluno escolheu para a
 * tela) ganha `1 + bonus` sobre a própria afinidade. Sem representativos, o ativo inteiro.
 */
export function pesosDaRota(
  perfis: PerfilLike[] | null | undefined,
  perfilAtivo: BrainHexProfile,
  bonus: number,
): PesoDePerfil[] {
  const representativos = new Set(resolveRepresentativeBrainHexProfiles(perfis));
  const brutos = rankBrainHexProfiles(perfis)
    .filter((entrada) => representativos.has(entrada.profile) && entrada.afinidade > 0)
    .map((entrada) => ({
      perfil: entrada.profile,
      peso: entrada.afinidade * (entrada.profile === perfilAtivo ? 1 + Math.max(0, bonus) : 1),
    }));
  const total = brutos.reduce((soma, p) => soma + p.peso, 0);
  if (total <= 0) return [{ perfil: perfilAtivo, peso: 1 }];
  return brutos.map((p) => ({ perfil: p.perfil, peso: p.peso / total }));
}

/**
 * `conteudo_id → perfil`, na ordem do tópico.
 *
 * - Conteúdo iniciado (o aluno já tem progresso num registro dele) não troca de perfil: trocar
 *   zeraria o progresso. Ele conta como cadeira do seu perfil.
 * - `perfil_unico`: o resto vai para o ativo, como era antes da mistura.
 * - `proporcional`: cada conteúdo vai para o candidato de maior `peso / (2 × cadeiras + 1)`;
 *   empate fica com o ativo, depois com a ordem dos pesos. Sequencial: acrescentar conteúdo no fim
 *   não mexe nos anteriores.
 * - Conteúdo sem candidato fica fora do mapa: o aluno segue pelo material do professor.
 */
export function rotaDoTopico(p: {
  conteudos: number[];
  candidatos: Map<number, BrainHexProfile[]>;
  pesos: PesoDePerfil[];
  perfilAtivo: BrainHexProfile;
  politica: PoliticaDaRota;
  iniciados: Map<number, BrainHexProfile>;
}): Map<number, BrainHexProfile> {
  const rota = new Map<number, BrainHexProfile>();
  const cadeiras = new Map<BrainHexProfile, number>();
  const peso = new Map(p.pesos.map((item) => [item.perfil, item.peso]));
  const ordem = new Map(p.pesos.map((item, indice) => [item.perfil, indice]));
  const sentar = (conteudo: number, perfil: BrainHexProfile) => {
    rota.set(conteudo, perfil);
    cadeiras.set(perfil, (cadeiras.get(perfil) ?? 0) + 1);
  };

  for (const conteudo of p.conteudos) {
    const candidatos = p.candidatos.get(conteudo) ?? [];
    const iniciado = p.iniciados.get(conteudo);
    if (iniciado && candidatos.includes(iniciado)) {
      sentar(conteudo, iniciado);
      continue;
    }
    if (p.politica === 'perfil_unico') {
      if (candidatos.includes(p.perfilAtivo)) sentar(conteudo, p.perfilAtivo);
      continue;
    }
    let escolhido: BrainHexProfile | null = null;
    let melhor = -1;
    for (const candidato of candidatos) {
      const quociente = (peso.get(candidato) ?? 0) / (2 * (cadeiras.get(candidato) ?? 0) + 1);
      const ganha =
        escolhido === null ||
        quociente > melhor + 1e-12 ||
        (Math.abs(quociente - melhor) <= 1e-12 && desempata(candidato, escolhido, p.perfilAtivo, ordem));
      if (ganha) {
        escolhido = candidato;
        melhor = quociente;
      }
    }
    if (escolhido) sentar(conteudo, escolhido);
  }
  return rota;
}

function desempata(
  candidato: BrainHexProfile,
  atual: BrainHexProfile,
  perfilAtivo: BrainHexProfile,
  ordem: Map<BrainHexProfile, number>,
): boolean {
  if (candidato === perfilAtivo) return true;
  if (atual === perfilAtivo) return false;
  return (ordem.get(candidato) ?? Number.MAX_SAFE_INTEGER) < (ordem.get(atual) ?? Number.MAX_SAFE_INTEGER);
}

/** Identidade da rota para caches: muda quando a política ou os pesos mudam. */
export function assinaturaDaRota(politica: PoliticaDaRota, pesos: PesoDePerfil[]): string {
  return `${VERSAO_DO_ALOCADOR}:${politica}:${pesos.map((p) => `${p.perfil}=${p.peso.toFixed(3)}`).join('|')}`;
}

/**
 * A identidade do material da turma nos caches e chaves da trilha: com a mistura desligada, o
 * perfil ativo puro (as chaves de hoje não mudam); ligada, o perfil e os pesos, porque a rota de
 * cada tópico depende deles. A política não entra: ela sai de aluno × tópico, que já está na chave.
 */
export function chaveDoPerfilDaRota(chave: ChaveDaMistura, perfilAtivo: BrainHexProfile, pesos: PesoDePerfil[]): string {
  if (chave !== 'alternancia') return perfilAtivo;
  return `${perfilAtivo}|${VERSAO_DO_ALOCADOR}:alternancia:${pesos.map((p) => `${p.perfil}=${p.peso.toFixed(3)}`).join('|')}`;
}

/**
 * Identidade por valor do vetor do aluno. A sessão recria o array de perfis a cada evento de
 * autenticação (inclusive o `TOKEN_REFRESHED`); usado como dependência de React, o array novo
 * refaria leituras com a mistura desligada. A string só muda quando nome ou afinidade mudam.
 */
export function assinaturaDosPerfis(perfis: PerfilLike[] | null | undefined): string {
  return (perfis ?? [])
    .map((p) => `${String(p?.nome ?? p?.perfil ?? '').trim().toLowerCase()}:${Number(p?.afinidade ?? 0)}`)
    .sort()
    .join('|');
}

export type RegistroDaRota = { id?: number | null; conteudo_id?: number | null; materiais?: unknown };

function conteudoDo(registro: RegistroDaRota): number | null {
  const id = Number(registro?.conteudo_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Por conteúdo, os perfis da rota que têm um registro com material utilizável, na ordem de
 * `perfisDaRota`. Registro sem nada para mostrar não vira candidato: senão a rota mandaria o aluno
 * para um conteúdo vazio.
 */
export function candidatosPorConteudo<T extends RegistroDaRota>(
  registros: T[],
  perfisDaRota: BrainHexProfile[],
  perfilDoRegistro: (registro: T) => BrainHexProfile | null,
): Map<number, BrainHexProfile[]> {
  const comMaterial = new Map<number, Set<BrainHexProfile>>();
  for (const registro of registros) {
    const conteudo = conteudoDo(registro);
    const perfil = perfilDoRegistro(registro);
    if (!conteudo || !perfil || personalizedAvailabilityScore(registro) <= 0) continue;
    comMaterial.set(conteudo, (comMaterial.get(conteudo) ?? new Set()).add(perfil));
  }
  const candidatos = new Map<number, BrainHexProfile[]>();
  for (const [conteudo, perfis] of comMaterial) {
    const naOrdem = perfisDaRota.filter((perfil) => perfis.has(perfil));
    if (naOrdem.length) candidatos.set(conteudo, naOrdem);
  }
  return candidatos;
}

/**
 * Os registros que a rota usa: o do perfil que ela deu a cada conteúdo. Registro sem conteúdo
 * (legado, do tópico inteiro) só fica se for do perfil ativo, como antes da mistura. A escolha
 * entre versões do mesmo conteúdo × perfil continua com `orderPersonalizationRecordsByTeacherContent`.
 */
export function filtrarRegistrosDaRota<T extends RegistroDaRota>(
  registros: T[],
  rota: Map<number, BrainHexProfile>,
  perfilAtivo: BrainHexProfile,
  perfilDoRegistro: (registro: T) => BrainHexProfile | null,
): T[] {
  return registros.filter((registro) => {
    const conteudo = conteudoDo(registro);
    const perfil = perfilDoRegistro(registro);
    if (!conteudo) return perfil === perfilAtivo;
    return perfil !== null && rota.get(conteudo) === perfil;
  });
}

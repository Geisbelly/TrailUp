import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { chaveDoPerfil } from "./perfilCores";

// A diversidade de perfis da turma, como `classe_diversidade_perfis` (20261111_03) a devolve. A
// conta é do banco, numa regra só (`app_vetor_perfil`); aqui só se lê e se confere a forma.

export interface PerfilDaTurma {
  perfil: BrainHexProfileKey;
  /** Média dos vetores renormalizados para 100. */
  massa: number;
  /** Alunos que têm o perfil como 1º. */
  dominante: number;
  /** Alunos para quem o perfil é representativo (afinidade >= 20, ou > 0 entre os dois primeiros). */
  representativo: number;
}

export interface ParDaTurma {
  primeiro: BrainHexProfileKey;
  segundo: BrainHexProfileKey;
  alunos: number;
}

export interface AlunoDaDiversidade {
  alunoId: string;
  primeiro: BrainHexProfileKey | null;
  segundo: BrainHexProfileKey | null;
  /** Pontos entre o 1º e o 2º, no vetor renormalizado. Null = aluno sem vetor. */
  margem: number | null;
  misto: boolean;
}

export interface DiversidadeDaTurma {
  classeId: number;
  margemMisto: number;
  alunos: number;
  alunosComVetor: number;
  alunosMistos: number;
  entropiaNormalizada: number;
  /** "A turma se comporta como N perfis" (exp da entropia). */
  perfisEfetivos: number;
  perfis: PerfilDaTurma[];
  pares: ParDaTurma[];
  porAluno: AlunoDaDiversidade[];
}

type Bruto = Record<string, unknown>;

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function lista(valor: unknown): Bruto[] {
  return Array.isArray(valor) ? valor.filter((item): item is Bruto => !!item && typeof item === "object") : [];
}

/** A resposta da função; null quando ela devolveu NULL (turma que não é do professor). */
export function mapearDiversidade(bruto: unknown): DiversidadeDaTurma | null {
  let valor = bruto;
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const d = valor as Bruto;

  const perfis: PerfilDaTurma[] = [];
  for (const item of lista(d.perfis)) {
    const perfil = chaveDoPerfil(String(item.perfil ?? ""));
    if (!perfil) continue;
    perfis.push({ perfil, massa: numero(item.massa), dominante: numero(item.dominante), representativo: numero(item.representativo) });
  }

  const pares: ParDaTurma[] = [];
  for (const item of lista(d.pares)) {
    const primeiro = chaveDoPerfil(String(item.primeiro ?? ""));
    const segundo = chaveDoPerfil(String(item.segundo ?? ""));
    if (!primeiro || !segundo) continue;
    pares.push({ primeiro, segundo, alunos: numero(item.alunos) });
  }

  const porAluno: AlunoDaDiversidade[] = [];
  for (const item of lista(d.por_aluno)) {
    const alunoId = String(item.aluno_id ?? "");
    if (!alunoId) continue;
    const margem = item.margem === null || item.margem === undefined ? null : Number(item.margem);
    porAluno.push({
      alunoId,
      primeiro: chaveDoPerfil(item.primeiro as string | null),
      segundo: chaveDoPerfil(item.segundo as string | null),
      margem: margem !== null && Number.isFinite(margem) ? margem : null,
      misto: item.misto === true,
    });
  }

  return {
    classeId: numero(d.classe_id),
    margemMisto: numero(d.margem_misto),
    alunos: numero(d.alunos),
    alunosComVetor: numero(d.alunos_com_vetor),
    alunosMistos: numero(d.alunos_mistos),
    entropiaNormalizada: numero(d.entropia_normalizada),
    perfisEfetivos: numero(d.perfis_efetivos),
    perfis,
    pares,
    porAluno,
  };
}

export function alunoDaDiversidade(diversidade: DiversidadeDaTurma | null, alunoId: string): AlunoDaDiversidade | null {
  return diversidade?.porAluno.find((item) => item.alunoId === alunoId) ?? null;
}

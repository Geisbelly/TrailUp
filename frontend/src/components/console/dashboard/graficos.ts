import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import type { TurmaDistribuicao, TurmaPerfilMetricas } from "../useTurmaKpis";
import { chaveDoPerfil, NOME_DO_PERFIL, PERFIS_EM_ORDEM } from "./perfilCores";

export type SegmentoPerfil = "majoritario" | "segundo" | "afinidade_20_plus";

export type InatividadeDoPerfil = { perfil: BrainHexProfileKey; nome: string; valor: number | null; alunos: number };

/** Segmento com menos alunos que isto fica oculto (spec de métricas §4.2: `n_minimo`, padrão 5). */
export const N_MINIMO_SEGMENTO = 5;

// Percentual de alunos INATIVOS (7 dias ou mais sem estudar) por perfil — substitui a "taxa de
// abandono" por perfil, que media "ainda não terminou" (F5). A view traz uma linha por (turma,
// perfil); com várias turmas no escopo, soma inativos e alunos de cada perfil antes de dividir,
// que é a média ponderada pelos alunos do segmento.
export function inatividadePorPerfil(linhas: TurmaPerfilMetricas[], segmento: SegmentoPerfil): InatividadeDoPerfil[] {
  const acumulado = new Map<BrainHexProfileKey, { inativos: number; alunos: number }>();
  for (const linha of linhas) {
    if (linha.segmento !== segmento) continue;
    const perfil = chaveDoPerfil(linha.perfil_nome);
    if (!perfil) continue;
    const atual = acumulado.get(perfil) ?? { inativos: 0, alunos: 0 };
    atual.inativos += Number(linha.alunos_inativos ?? 0);
    atual.alunos += Number(linha.total_alunos_segmento ?? 0);
    acumulado.set(perfil, atual);
  }
  return PERFIS_EM_ORDEM.map((perfil) => {
    const a = acumulado.get(perfil);
    const alunos = a?.alunos ?? 0;
    const valor = !a || alunos < N_MINIMO_SEGMENTO ? null : (100 * a.inativos) / alunos;
    return { perfil, nome: NOME_DO_PERFIL[perfil], valor, alunos };
  });
}

export type TomDaFaixa = "success" | "info" | "warning" | "destructive";

const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cor pelo NOME da faixa (a ordem das linhas da view não é garantida). */
export function tomDaFaixa(faixa: string): TomDaFaixa | null {
  const f = semAcento(faixa);
  if (f.includes("baixa")) return "destructive";
  if (/media[\s_-]*alta/.test(f)) return "info";
  if (f.includes("media")) return "warning";
  if (f.includes("alta")) return "success";
  return null;
}

const ORDEM_DO_TOM: Record<TomDaFaixa, number> = { success: 0, info: 1, warning: 2, destructive: 3 };

export type FaixaDeNota = { faixa: string; total: number; tom: TomDaFaixa | null };

/** Soma as turmas do escopo por faixa e ordena da nota mais alta para a mais baixa. */
export function distribuicaoDeNotas(linhas: TurmaDistribuicao[]): FaixaDeNota[] {
  const porFaixa = new Map<string, number>();
  for (const linha of linhas) {
    if (linha.metrica !== "nota_media") continue;
    porFaixa.set(linha.faixa, (porFaixa.get(linha.faixa) ?? 0) + Number(linha.total_alunos ?? 0));
  }
  return [...porFaixa.entries()]
    .map(([faixa, total], indice) => ({ faixa, total, tom: tomDaFaixa(faixa), indice }))
    .sort((a, b) => (a.tom ? ORDEM_DO_TOM[a.tom] : 9) - (b.tom ? ORDEM_DO_TOM[b.tom] : 9) || a.indice - b.indice)
    .map(({ faixa, total, tom }) => ({ faixa, total, tom }));
}

import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import type { TurmaDistribuicao, TurmaPerfilMetricas } from "../useTurmaKpis";
import { chaveDoPerfil, NOME_DO_PERFIL, PERFIS_EM_ORDEM } from "./perfilCores";

export type SegmentoPerfil = "majoritario" | "segundo" | "afinidade_20_plus";

export type AbandonoDoPerfil = { perfil: BrainHexProfileKey; nome: string; valor: number | null };

// A view traz uma linha por (turma, perfil); com várias turmas no escopo o
// mesmo perfil aparece várias vezes. Junta ponderando pelos alunos do
// segmento — média simples entre turmas distorce quando os tamanhos diferem
// (mesmo motivo de lib/turmaResumo.ts).
export function abandonoPorPerfil(linhas: TurmaPerfilMetricas[], segmento: SegmentoPerfil): AbandonoDoPerfil[] {
  const acumulado = new Map<BrainHexProfileKey, { soma: number; peso: number; linhas: number; somaSimples: number }>();
  for (const linha of linhas) {
    if (linha.segmento !== segmento) continue;
    const perfil = chaveDoPerfil(linha.perfil_nome);
    if (!perfil) continue;
    const valor = Number(linha.taxa_abandono_pct ?? 0);
    const peso = Number(linha.total_alunos_segmento ?? 0);
    const atual = acumulado.get(perfil) ?? { soma: 0, peso: 0, linhas: 0, somaSimples: 0 };
    atual.soma += valor * peso;
    atual.peso += peso;
    atual.linhas += 1;
    atual.somaSimples += valor;
    acumulado.set(perfil, atual);
  }
  return PERFIS_EM_ORDEM.map((perfil) => {
    const a = acumulado.get(perfil);
    const valor = !a ? null : a.peso > 0 ? a.soma / a.peso : a.somaSimples / a.linhas;
    return { perfil, nome: NOME_DO_PERFIL[perfil], valor };
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

import type { TurmaDistribuicao, TurmaPerfilMetricas } from "../useTurmaKpis";
import type { TurmaResumo } from "@/lib/turmaResumo";
import type { SegmentoPerfil } from "./graficos";
import { NOME_DO_PERFIL, PERFIS_EM_ORDEM } from "./perfilCores";

/**
 * Valores ILUSTRATIVOS para a turma de demonstração da pesquisa com professores.
 *
 * A rodada avalia o formato das métricas (o que o painel mostra e como ele se explica), não o dado:
 * a turma do avaliador não tem alunos nem histórico, e não criamos aluno fictício para preencher.
 * Estes números nunca saem do navegador, nunca são gravados e só aparecem com o selo de exemplo.
 *
 * Os valores são coerentes entre si (o total de alunos bate com a soma dos perfis e das faixas de
 * nota), para o professor não tropeçar numa contradição que o painel real não teria. Dois perfis
 * ficam abaixo do mínimo de alunos de propósito: o estado "poucos alunos" também é formato.
 */

export const CLASSE_DE_EXEMPLO = -1;

/** Alunos por perfil dominante (segmento "majoritário"). Soma = TOTAL_DE_ALUNOS. */
const ALUNOS_POR_PERFIL = { seeker: 6, survivor: 3, daredevil: 5, mastermind: 5, conqueror: 5, socializer: 5, achiever: 3 } as const;

/** Quantos de cada perfil estão em risco alto e inativos (majoritário). */
const RISCO_ALTO = { seeker: 1, survivor: 1, daredevil: 2, mastermind: 0, conqueror: 1, socializer: 1, achiever: 0 } as const;
const INATIVOS = { seeker: 1, survivor: 1, daredevil: 2, mastermind: 0, conqueror: 1, socializer: 0, achiever: 1 } as const;

export const TOTAL_DE_ALUNOS = Object.values(ALUNOS_POR_PERFIL).reduce((s, n) => s + n, 0);
const TOTAL_RISCO_ALTO = Object.values(RISCO_ALTO).reduce((s, n) => s + n, 0);
const TOTAL_INATIVOS = Object.values(INATIVOS).reduce((s, n) => s + n, 0);

export const MEDIA_NOTAS_EXEMPLO = 7.2;
export const MEDIA_CONCLUSAO_EXEMPLO = 64;
export const MEDIA_ACERTOS_EXEMPLO = 71;

export const RESUMO_DE_EXEMPLO: TurmaResumo = {
  total_alunos: TOTAL_DE_ALUNOS,
  taxa_media_conclusao_pct: MEDIA_CONCLUSAO_EXEMPLO,
  media_nota_turma: MEDIA_NOTAS_EXEMPLO,
  taxa_media_acertos_pct: MEDIA_ACERTOS_EXEMPLO,
  tempo_ativo_medio_seg: 18.5 * 60,
  tempo_medio_uso_seg: 42 * 60,
  uso_chat_apos_erro_pct: 23.4,
  retorno_semanal_pct: 68,
  retorno_semanal_elegiveis: TOTAL_DE_ALUNOS - 3,
  taxa_risco_abandono_pct: (100 * TOTAL_RISCO_ALTO) / TOTAL_DE_ALUNOS,
  alunos_risco_alto: TOTAL_RISCO_ALTO,
  alunos_risco_com_dado: TOTAL_DE_ALUNOS,
  alunos_inativos: TOTAL_INATIVOS,
  alunos_estagnados: 4,
  alunos_evadidos: 1,
  alunos_sem_dado: 0,
};

/** Os outros recortes trocam alunos de lugar entre perfis, para a troca de segmento mudar o gráfico. */
const DESLOCAMENTO: Record<SegmentoPerfil, number> = { majoritario: 0, segundo: 1, afinidade_20_plus: 3 };

export function perfisDeExemplo(): TurmaPerfilMetricas[] {
  const linhas: TurmaPerfilMetricas[] = [];
  for (const segmento of Object.keys(DESLOCAMENTO) as SegmentoPerfil[]) {
    const desloc = DESLOCAMENTO[segmento];
    PERFIS_EM_ORDEM.forEach((perfil, i) => {
      const fonte = PERFIS_EM_ORDEM[(i + desloc) % PERFIS_EM_ORDEM.length];
      // "Afinidade ≥ 20%" conta o aluno em mais de um perfil: o segmento é maior que a turma.
      const extra = segmento === "afinidade_20_plus" ? 4 : 0;
      const alunos = ALUNOS_POR_PERFIL[fonte] + extra;
      linhas.push({
        classe_id: CLASSE_DE_EXEMPLO,
        segmento,
        perfil_nome: NOME_DO_PERFIL[perfil],
        total_alunos_segmento: alunos,
        alunos_inativos: INATIVOS[fonte],
        alunos_estagnados: 0,
        tempo_ativo_medio_seg: null,
        taxa_risco_abandono_pct: null,
        alunos_risco_alto: RISCO_ALTO[fonte],
        alunos_risco_com_dado: alunos,
        media_nota: MEDIA_NOTAS_EXEMPLO,
        taxa_acertos_pct: MEDIA_ACERTOS_EXEMPLO,
        taxa_uso_chat_pct: 0,
        uso_chat_apos_erro_pct: 0,
      });
    });
  }
  return linhas;
}

/** Faixas como a view do banco as nomeia (alta, media, baixa). Soma = TOTAL_DE_ALUNOS. */
const FAIXAS = { alta: 14, media: 13, baixa: 5 } as const;

export function distribuicaoDeExemplo(): TurmaDistribuicao[] {
  return (Object.entries(FAIXAS) as [string, number][]).map(([faixa, total_alunos]) => ({
    classe_id: CLASSE_DE_EXEMPLO,
    metrica: "nota_media",
    faixa,
    total_alunos,
    percentual: (100 * total_alunos) / TOTAL_DE_ALUNOS,
  }));
}

/**
 * A turma em tela é a de demonstração do avaliador? Só quando o escopo é exatamente ela: com outra
 * turma junto (o dono do projeto vê várias), o painel é o de verdade.
 */
export function mostraExemplo(classeDeDemonstracao: number | null | undefined, escopo: number[]): boolean {
  return classeDeDemonstracao != null && escopo.length === 1 && escopo[0] === classeDeDemonstracao;
}

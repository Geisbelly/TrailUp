/**
 * Linha de `aluno_perfil_medida`: a MEDIDA do perfil, nao so' o resultado.
 *
 * `aluno_perfil` guarda `(aluno, perfil, afinidade)` — o estado atual, que todo
 * o sistema le. Aqui fica o registro de COMO aquela afinidade foi obtida: a
 * ordem que o aluno declarou, a confianca da medida, a concordancia entre os
 * dois metodos e os motivos por tras da confianca.
 *
 * Sem isto, a fase 3 da issue #1 nao tem de onde partir: comparar o que o aluno
 * DISSE preferir com o que ele FAZ exige ter guardado o que ele disse.
 *
 * Funcao pura, separada do componente, para poder ser testada sem React nem
 * cliente Supabase — mesmo motivo de `telemetriaPayload.ts` no mobile.
 */

import type { BrainHexProfileKey } from "./brainhex";
import { validarOrdenacao } from "./brainhexOrdenacao";
import type { QualidadeDaResposta } from "./brainhexScoring";

/**
 * Versao do instrumento. SOBE quando itens, eixos, pesos ou a regra de escore
 * mudam — sem isso, medidas de instrumentos diferentes seriam comparadas como
 * se fossem a mesma coisa na fase 3.
 */
export const VERSAO_DO_INSTRUMENTO = "2026-10-02-v2-reversos-e-ordenacao";

export type MedidaDoPerfil = {
  aluno_id: string;
  versao_instrumento: string;
  ordenacao: BrainHexProfileKey[];
  afinidade: Record<string, number>;
  confianca: number;
  concordancia: number | null;
  qualidade: {
    indice: number;
    desvio: number;
    aquiescencia: number;
    motivos: string[];
  };
};

export class MedidaInvalida extends Error {}

export function montarMedidaDoPerfil(params: {
  alunoId: string;
  ordenacao: readonly string[];
  afinidade: Record<string, number>;
  confianca: number;
  concordancia?: number | null;
  qualidade: QualidadeDaResposta;
}): MedidaDoPerfil {
  const alunoId = String(params.alunoId ?? "").trim();
  if (!alunoId) throw new MedidaInvalida("medida sem aluno");

  // `validarOrdenacao` levanta se nao forem os 7 perfis, um de cada. Gravar
  // ordenacao incompleta criaria uma linha que mente sobre o que foi medido.
  const ordenacao = validarOrdenacao(params.ordenacao);

  const confianca = Number(params.confianca);
  if (!Number.isFinite(confianca) || confianca < 0 || confianca > 1) {
    throw new MedidaInvalida(`confiança fora de 0..1: ${params.confianca}`);
  }

  const concordancia =
    params.concordancia == null || !Number.isFinite(Number(params.concordancia))
      ? null
      : Math.max(-1, Math.min(1, Number(params.concordancia)));

  return {
    aluno_id: alunoId,
    versao_instrumento: VERSAO_DO_INSTRUMENTO,
    ordenacao,
    afinidade: params.afinidade,
    // O banco guarda numeric(4,3); arredondar aqui evita que o valor gravado
    // difira do que o cliente achou que gravou.
    confianca: Math.round(confianca * 1000) / 1000,
    concordancia: concordancia === null ? null : Math.round(concordancia * 1000) / 1000,
    qualidade: {
      indice: Math.round(params.qualidade.indice * 1000) / 1000,
      desvio: Math.round(params.qualidade.desvio * 1000) / 1000,
      aquiescencia: Math.round(params.qualidade.aquiescencia * 1000) / 1000,
      motivos: [...params.qualidade.motivos],
    },
  };
}

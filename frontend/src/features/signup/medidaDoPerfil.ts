/**
 * Registro da recomendação exploratória. v3 guarda confiança ausente,
 * concordância descritiva e confirmação explícita da ordenação.
 * Não é evidência de validade nem entrada calibrada para atualização bayesiana.
 */

import type { BrainHexProfileKey } from "./brainhex";
import { PERFIS_EM_ORDEM, validarOrdenacao } from "./brainhexOrdenacao";
import type { QualidadeDaResposta } from "./brainhexScoring";

/**
 * Versao do instrumento. SOBE quando itens, eixos, pesos ou a regra de escore
 * mudam — sem isso, medidas de instrumentos diferentes seriam comparadas como
 * se fossem a mesma coisa na fase 3.
 */
export const VERSAO_DO_INSTRUMENTO = "2026-10-24-v3-exploratorio";

export type MedidaDoPerfil = {
  aluno_id: string;
  versao_instrumento: string;
  ordenacao: BrainHexProfileKey[];
  afinidade: Record<string, number>;
  confianca: number | null;
  concordancia: number | null;
  qualidade: {
    indice: null;
    desvio: number;
    aquiescencia: number;
    motivos: string[];
    interpretacao: "exploratoria_nao_probabilistica";
    ordenacao_confirmada: true;
  };
};

export class MedidaInvalida extends Error {}

export function montarMedidaDoPerfil(params: {
  alunoId: string;
  ordenacaoConfirmada: boolean;
  ordenacao: readonly string[];
  afinidade: Record<string, number>;
  confianca: number | null;
  concordancia?: number | null;
  qualidade: QualidadeDaResposta;
}): MedidaDoPerfil {
  const alunoId = String(params.alunoId ?? "").trim();
  if (!alunoId) throw new MedidaInvalida("medida sem aluno");

  // `validarOrdenacao` levanta se nao forem os 7 perfis, um de cada. Gravar
  // ordenacao incompleta criaria uma linha que mente sobre o que foi medido.
  const ordenacao = validarOrdenacao(params.ordenacao);

  if (params.ordenacaoConfirmada !== true) throw new MedidaInvalida("ordenação não confirmada");
  if (params.confianca !== null || params.qualidade.indice !== null) {
    throw new MedidaInvalida("a versão exploratória não estima confiança");
  }
  const valores = PERFIS_EM_ORDEM.map(p => params.afinidade[p]);
  if (Object.keys(params.afinidade).length !== 7 ||
    valores.some(v => !Number.isInteger(v) || v < 1 || v > 100) ||
    valores.reduce((soma, v) => soma + v, 0) !== 100) {
    throw new MedidaInvalida("afinidade deve conter os sete perfis e somar 100");
  }
  if (!Number.isFinite(params.qualidade.desvio) || params.qualidade.desvio < 0 ||
    !Number.isFinite(params.qualidade.aquiescencia) || params.qualidade.aquiescencia < 0 || params.qualidade.aquiescencia > 1) {
    throw new MedidaInvalida("descritores inválidos");
  }

  const concordancia = params.concordancia ?? null;
  if (concordancia !== null && (!Number.isFinite(concordancia) || Math.abs(concordancia) > 1)) {
    throw new MedidaInvalida("concordância fora de -1..1");
  }

  return {
    aluno_id: alunoId,
    versao_instrumento: VERSAO_DO_INSTRUMENTO,
    ordenacao: [...ordenacao],
    afinidade: { ...params.afinidade },
    // O banco guarda numeric(4,3); arredondar aqui evita que o valor gravado
    // difira do que o cliente achou que gravou.
    confianca: null,
    concordancia: concordancia === null ? null : Math.round(concordancia * 1000) / 1000,
    qualidade: {
      indice: null,
      interpretacao: "exploratoria_nao_probabilistica",
      ordenacao_confirmada: true,
      desvio: Math.round(params.qualidade.desvio * 1000) / 1000,
      aquiescencia: Math.round(params.qualidade.aquiescencia * 1000) / 1000,
      motivos: [...params.qualidade.motivos],
    },
  };
}

import { useMemo } from "react";

import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import {
  type Atividade,
  type Block,
  type Conteudo,
} from "@/utils/trilhaBlocks";
import {
  normalizePersonalizedStepActivity,
  normalizePersonalizedStepContent,
} from "@/utils/personalizedFlow";
import {
  destaquesDaSugestao,
  formatoSugeridoDoBloco,
  ordenarPorSugestao,
  sugestaoTemOrdem,
  type DestaqueSugestao,
  type SugestaoMaterial,
} from "@/utils/materialSuggestion";

export type PersonalizedFlowResult = {
  conteudos: Conteudo[];
  atividades: Atividade[];
  blocks: Block[];
  /**
   * `true` quando havia ordem aconselhada para aplicar. Quem monta o percurso
   * usa isto para respeitar a ordem do fluxo em vez de mandar os cards para o fim.
   */
  sugestaoAplicada: boolean;
  /** "Comece por aqui", por id do conteúdo personalizado. Vazio sem sugestão. */
  destaquesSugestao: Map<number, DestaqueSugestao>;
};

type PersonalizedStep = PersonalizedTopicPayload["steps"][number];
type PassoCanonico = { step: PersonalizedStep; indice: number };

function inteiroPositivo(valor: unknown) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * De qual conteúdo o passo é. Os passos de um mesmo registro de
 * `conteudo_personalizado` (ou do mesmo conteúdo do professor) formam um grupo,
 * e a sugestão só troca a ordem DENTRO do grupo.
 */
export function grupoDoPassoPersonalizado(step: PersonalizedStep | null | undefined) {
  const metadata = (step?.metadata ?? {}) as Record<string, unknown>;
  const personalizacaoId = inteiroPositivo(
    metadata.personalizacao_id ?? metadata.personalizationId
  );
  if (personalizacaoId) return `personalizacao:${personalizacaoId}`;
  const conteudoId = inteiroPositivo(metadata.conteudo_id ?? metadata.contentId);
  if (conteudoId) return `conteudo:${conteudoId}`;
  return "topico";
}

/** Formato do passo para a sugestão. Atividade/quiz nunca é ordenado por ela. */
export function formatoDoPassoPersonalizado(step: PersonalizedStep | null | undefined) {
  const kind = String((step as any)?.kind ?? "content");
  if (kind !== "content" && kind !== "cards") return null;
  return formatoSugeridoDoBloco(step?.blocks?.[0]);
}

/**
 * Monta o percurso personalizado do tópico.
 *
 * A identidade de cada passo é calculada SEMPRE na ordem canônica (a da
 * normalização, por `ordem`): o `item_key` vem do passo e o id do conteúdo usa o
 * índice canônico. A sugestão só permuta os passos DEPOIS disso. Assim o
 * progresso gravado, o manifesto do percurso, o checkpoint e a telemetria (que
 * dependem da chave e do id) continuam apontando para o mesmo material, com ou
 * sem sugestão, sem migração nenhuma.
 */
export function buildPersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
  sugestao?: SugestaoMaterial | null;
}): PersonalizedFlowResult {
  const { personalizedTopic, topicoId } = args;

  const empty: PersonalizedFlowResult = {
    conteudos: [],
    atividades: [],
    blocks: [],
    sugestaoAplicada: false,
    destaquesSugestao: new Map(),
  };
  if (!personalizedTopic || !topicoId || !Array.isArray(personalizedTopic.steps)) {
    return empty;
  }

  const canonicos: PassoCanonico[] = [...personalizedTopic.steps]
    .sort((left, right) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0))
    .map((step, indice) => ({ step, indice }));

  const sugestaoAplicada = sugestaoTemOrdem(args.sugestao);
  const passos = sugestaoAplicada
    ? ordenarPorSugestao(canonicos, args.sugestao, {
        formatoDe: ({ step }) => formatoDoPassoPersonalizado(step),
        grupoDe: ({ step }) => grupoDoPassoPersonalizado(step),
      })
    : canonicos;

  const conteudosPersonalizados: Conteudo[] = [];
  const atividadesPersonalizadas: Atividade[] = [];
  const blocksPersonalizados: Block[] = [];
  const passosDeConteudo: { conteudo: Conteudo; step: PersonalizedStep }[] = [];

  passos.forEach(({ step, indice }) => {
    const stepKind = String((step as any)?.kind ?? "content");
    if (stepKind === "content" || stepKind === "cards") {
      const conteudo = normalizePersonalizedStepContent(topicoId, step, indice);
      conteudosPersonalizados.push(conteudo);
      passosDeConteudo.push({ conteudo, step });
      blocksPersonalizados.push({
        kind: "conteudo",
        id: `pc-${conteudo.id}`,
        conteudo,
      });
      return;
    }

    if (stepKind === "activity") {
      const atividade = normalizePersonalizedStepActivity(topicoId, step, indice);
      if (!atividade) return;
      atividadesPersonalizadas.push(atividade);
      blocksPersonalizados.push({
        kind: "atividade",
        id: `pa-${atividade.id}`,
        atividade,
      });
    }
  });

  const destaquesSugestao = new Map<number, DestaqueSugestao>();
  if (sugestaoAplicada) {
    destaquesDaSugestao(passosDeConteudo, args.sugestao, {
      formatoDe: ({ step }) => formatoDoPassoPersonalizado(step),
      grupoDe: ({ step }) => grupoDoPassoPersonalizado(step),
      chaveDe: ({ conteudo }) => Number(conteudo.id),
    }).forEach((destaque, chave) => destaquesSugestao.set(Number(chave), destaque));
  }

  return {
    conteudos: conteudosPersonalizados,
    atividades: atividadesPersonalizadas,
    blocks: blocksPersonalizados,
    sugestaoAplicada,
    destaquesSugestao,
  };
}

export function usePersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
  sugestao?: SugestaoMaterial | null;
}): PersonalizedFlowResult {
  const { personalizedTopic, topicoId, sugestao } = args;
  return useMemo(
    () => buildPersonalizedFlow({ personalizedTopic, topicoId, sugestao }),
    [personalizedTopic, topicoId, sugestao],
  );
}

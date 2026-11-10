/**
 * Quantos tópicos a trilha tem, separado do `index.ts` para ser testado no
 * vitest. Sem `Deno.*` aqui dentro.
 *
 * Quem decide é o professor: o número que ele digitou vale sempre. Antes,
 * com arquivo anexado, a função trocava o número dele pela quantidade de
 * arquivos (um tópico por arquivo), e a trilha saía com 2 tópicos quando ele
 * tinha pedido 8. Agora o material se adapta ao número: assuntos afins se
 * juntam num tópico, um arquivo grande se divide em vários.
 *
 * Sem número (automático), os tópicos que ele listou definem a quantidade; sem
 * lista, a IA escolhe pelo material, dentro de [MIN_AUTOMATICO, MAX_TOPICOS].
 */

export const MAX_TOPICOS = 20;
/** Faixa sugerida ao modelo quando a quantidade é automática. */
export const MIN_AUTOMATICO = 3;
export const MAX_AUTOMATICO = 12;

/** `null` = automático, sem lista de nomes: o modelo escolhe. */
export function quantidadeDeTopicos(numTopics: unknown, topicNames: string[]): number | null {
  const pedido = typeof numTopics === "number" ? numTopics : typeof numTopics === "string" ? Number(numTopics) : NaN;
  if (Number.isFinite(pedido) && pedido >= 1) return Math.min(MAX_TOPICOS, Math.round(pedido));
  const nomes = topicNames.filter((nome) => nome.trim().length > 0).length;
  if (nomes > 0) return Math.min(MAX_TOPICOS, nomes);
  return null;
}

/** As regras de quantidade que vão no prompt do esqueleto. */
export function regrasDaQuantidade(quantidade: number | null, arquivos: number): string[] {
  if (quantidade === null) {
    return [
      `- Escolha a quantidade de topicos que o material pede, normalmente entre ${MIN_AUTOMATICO} e ${MAX_AUTOMATICO} (nunca mais de ${MAX_TOPICOS}).`,
      "- Cada topico deve ter assunto suficiente para pelo menos um conteudo proprio; nao crie topicos vazios nem repetidos.",
    ];
  }
  const regras = [
    `- Gere EXATAMENTE ${quantidade} ${quantidade === 1 ? "topico" : "topicos"}: nem mais, nem menos. Essa quantidade foi escolhida pelo professor.`,
    "- Adapte o material a essa quantidade: se houver mais assuntos do que topicos, agrupe assuntos afins no mesmo topico; se houver menos, divida os assuntos em partes menores e progressivas.",
  ];
  if (arquivos > 0 && arquivos !== quantidade) {
    regras.push(
      `- Ha ${arquivos} ${arquivos === 1 ? "arquivo" : "arquivos"} para ${quantidade} ${quantidade === 1 ? "topico" : "topicos"}: um arquivo pode servir a varios topicos e um topico pode usar varios arquivos. Nao amarre um topico a cada arquivo.`,
    );
  }
  return regras;
}

/** Limites do array `topicos` no esquema de resposta do esqueleto. */
export function limitesDoEsqueleto(quantidade: number | null): { minItems: number; maxItems: number } {
  if (quantidade === null) return { minItems: 1, maxItems: MAX_TOPICOS };
  return { minItems: quantidade, maxItems: quantidade };
}

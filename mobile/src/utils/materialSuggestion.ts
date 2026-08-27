import type { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";

/**
 * Ordem aconselhada de consumo do material, vinda de
 * `GET /api/v1/personalizar/sugestao/{alunoId}/{topicoId}`.
 */
export type SugestaoMaterialItem = {
  formato: string;
  posicao?: number | null;
  score?: number | null;
  motivos?: string[] | null;
};

export type SugestaoMaterial = {
  formato_inicial?: string | null;
  ordem?: SugestaoMaterialItem[] | null;
  versao?: number | null;
  origem?: string | null;
};

/**
 * Espelha `_FORMATO_POR_TIPO` de `api/app/services/sugestao_sinais.py`. Tipo de
 * bloco que não aparece aqui não é ordenável pela sugestão — e, por isso, nunca
 * é movido.
 */
const FORMATO_POR_TIPO: Partial<Record<ContentBlock["tipo"], string>> = {
  markdown: "markdown",
  texto: "markdown",
  audio: "audio",
  apresentacao: "apresentacao",
  "apresentacao-slides": "apresentacao",
  cards: "cards",
  pdf: "pdf",
  documento: "pdf",
};

export function formatoSugeridoDoBloco(block: ContentBlock | null | undefined) {
  if (!block?.tipo) return null;
  return FORMATO_POR_TIPO[block.tipo] ?? null;
}

function rankPorFormato(sugestao: SugestaoMaterial | null | undefined) {
  const ranks = new Map<string, number>();
  const ordem = sugestao?.ordem ?? [];
  ordem.forEach((item, indice) => {
    const formato = String(item?.formato ?? "").trim().toLowerCase();
    if (!formato || ranks.has(formato)) return;
    // A posição do servidor manda; o índice é só fallback para payload antigo
    // sem `posicao`.
    const posicao = Number(item?.posicao);
    ranks.set(formato, Number.isFinite(posicao) && posicao > 0 ? posicao : indice + 1);
  });
  return ranks;
}

/**
 * Reordena os blocos de um passo seguindo a ordem aconselhada.
 *
 * Só os blocos de formato sugerível trocam de lugar, e apenas **entre as
 * posições que já ocupavam**. Blocos que a sugestão não cobre (vídeo, imagem,
 * atividade, embed) ficam exatamente onde o professor os colocou: a sugestão
 * opina sobre qual formato do mesmo conteúdo ler primeiro, não sobre a sequência
 * pedagógica do passo. Mover tudo poderia jogar um quiz antes da explicação.
 *
 * Empate mantém a ordem original (ordenação estável), então dois formatos com o
 * mesmo peso não ficam pulando de lugar entre renderizações.
 */
export function ordenarBlocosPorSugestao(
  blocks: ContentBlock[] | null | undefined,
  sugestao: SugestaoMaterial | null | undefined
): ContentBlock[] {
  const lista = blocks ?? [];
  const ranks = rankPorFormato(sugestao);
  if (!lista.length || ranks.size === 0) return [...lista];

  const posicoesOrdenaveis: number[] = [];
  const ordenaveis: { block: ContentBlock; rank: number; indice: number }[] = [];

  lista.forEach((block, indice) => {
    const formato = formatoSugeridoDoBloco(block);
    const rank = formato ? ranks.get(formato) : undefined;
    if (rank === undefined) return;
    posicoesOrdenaveis.push(indice);
    ordenaveis.push({ block, rank, indice });
  });

  if (ordenaveis.length < 2) return [...lista];

  ordenaveis.sort((left, right) =>
    left.rank !== right.rank ? left.rank - right.rank : left.indice - right.indice
  );

  const resultado = [...lista];
  posicoesOrdenaveis.forEach((posicao, ordem) => {
    resultado[posicao] = ordenaveis[ordem].block;
  });
  return resultado;
}

/**
 * O bloco que a sugestão aconselha abrir primeiro, se ele existir neste passo.
 *
 * Serve para destaque visual. Devolve `null` quando o formato aconselhado não
 * está aqui — destacar um bloco de outro formato "porque foi o que sobrou"
 * transformaria a sugestão em ruído.
 */
export function blocoInicialSugerido(
  blocks: ContentBlock[] | null | undefined,
  sugestao: SugestaoMaterial | null | undefined
): ContentBlock | null {
  const alvo = String(sugestao?.formato_inicial ?? "").trim().toLowerCase();
  if (!alvo) return null;
  return (blocks ?? []).find((block) => formatoSugeridoDoBloco(block) === alvo) ?? null;
}

/**
 * Motivos que o servidor registrou para o formato — o "por quê" que o app pode
 * mostrar ao aluno. Sugestão sem explicação vira ordem arbitrária aos olhos de
 * quem a recebe.
 */
export function motivosDoFormato(
  sugestao: SugestaoMaterial | null | undefined,
  formato: string | null | undefined
): string[] {
  const alvo = String(formato ?? "").trim().toLowerCase();
  if (!alvo) return [];
  const item = (sugestao?.ordem ?? []).find(
    (candidato) => String(candidato?.formato ?? "").trim().toLowerCase() === alvo
  );
  return (item?.motivos ?? []).map((motivo) => String(motivo)).filter(Boolean);
}

import type { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";

/**
 * Ordem aconselhada de consumo do material, vinda de
 * `GET /api/v1/personalizar/sugestao/{alunoId}/{topicoId}`.
 */
export type SugestaoMaterialItem = {
  formato: string;
  posicao?: number | null;
  score?: number | null;
  /** Notas internas do motor (regra, sinal, número). Não vão para a tela do aluno. */
  motivos?: string[] | null;
  /**
   * Frase curta escrita PARA o aluno ("Este conteúdo depende de imagens: comece
   * pela apresentação."). É o único "por quê" que o app mostra; vazio = destaque
   * sem explicação.
   */
  motivo_aluno?: string | null;
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

/** A sugestão tem alguma ordem utilizável? Sem isso, nada muda em lugar nenhum. */
export function sugestaoTemOrdem(sugestao: SugestaoMaterial | null | undefined) {
  return rankPorFormato(sugestao).size > 0;
}

/**
 * Permutação estável guiada pela sugestão, genérica para blocos e passos.
 *
 * Só os itens de formato sugerível trocam de lugar, e apenas **entre as
 * posições que já ocupavam dentro do próprio grupo**. Quem a sugestão não cobre
 * (vídeo, imagem, atividade, formato que ela não citou) fica parado. `grupoDe`
 * separa o que não pode se misturar: o áudio do conteúdo B nunca passa à frente
 * do texto do conteúdo A, porque a sugestão opina sobre qual formato DO MESMO
 * conteúdo vem primeiro, não sobre a sequência entre conteúdos.
 *
 * Empate mantém a ordem original, então dois formatos com o mesmo peso não
 * ficam pulando de lugar entre renderizações.
 */
export function ordenarPorSugestao<T>(
  itens: readonly T[] | null | undefined,
  sugestao: SugestaoMaterial | null | undefined,
  opcoes: {
    formatoDe: (item: T) => string | null | undefined;
    grupoDe?: (item: T) => string | null | undefined;
  }
): T[] {
  const lista = [...(itens ?? [])];
  const ranks = rankPorFormato(sugestao);
  if (lista.length < 2 || ranks.size === 0) return lista;

  const porGrupo = new Map<string, { posicoes: number[]; itens: { item: T; rank: number; indice: number }[] }>();

  lista.forEach((item, indice) => {
    const formato = String(opcoes.formatoDe(item) ?? "").trim().toLowerCase();
    const rank = formato ? ranks.get(formato) : undefined;
    if (rank === undefined) return;
    const grupo = String(opcoes.grupoDe?.(item) ?? "");
    const atual = porGrupo.get(grupo) ?? { posicoes: [], itens: [] };
    atual.posicoes.push(indice);
    atual.itens.push({ item, rank, indice });
    porGrupo.set(grupo, atual);
  });

  porGrupo.forEach(({ posicoes, itens: ordenaveis }) => {
    if (ordenaveis.length < 2) return;
    ordenaveis.sort((left, right) =>
      left.rank !== right.rank ? left.rank - right.rank : left.indice - right.indice
    );
    posicoes.forEach((posicao, ordem) => {
      lista[posicao] = ordenaveis[ordem].item;
    });
  });

  return lista;
}

/**
 * Reordena os blocos de um passo seguindo a ordem aconselhada.
 *
 * Só os blocos de formato sugerível trocam de lugar, e apenas **entre as
 * posições que já ocupavam**. Blocos que a sugestão não cobre (vídeo, imagem,
 * atividade, embed) ficam exatamente onde o professor os colocou: a sugestão
 * opina sobre qual formato do mesmo conteúdo ler primeiro, não sobre a sequência
 * pedagógica do passo. Mover tudo poderia jogar um quiz antes da explicação.
 */
export function ordenarBlocosPorSugestao(
  blocks: ContentBlock[] | null | undefined,
  sugestao: SugestaoMaterial | null | undefined
): ContentBlock[] {
  return ordenarPorSugestao(blocks, sugestao, { formatoDe: formatoSugeridoDoBloco });
}

/**
 * Formato por onde a sugestão manda começar: `formato_inicial`, ou o primeiro
 * da ordem quando o servidor não o mandou.
 */
export function formatoInicialDaSugestao(sugestao: SugestaoMaterial | null | undefined) {
  const explicito = String(sugestao?.formato_inicial ?? "").trim().toLowerCase();
  if (explicito) return explicito;
  let melhorFormato: string | null = null;
  let melhorRank = Number.POSITIVE_INFINITY;
  rankPorFormato(sugestao).forEach((rank, formato) => {
    if (rank < melhorRank) {
      melhorRank = rank;
      melhorFormato = formato;
    }
  });
  return melhorFormato;
}

function itemDoFormato(
  sugestao: SugestaoMaterial | null | undefined,
  formato: string | null | undefined
) {
  const alvo = String(formato ?? "").trim().toLowerCase();
  if (!alvo) return null;
  return (
    (sugestao?.ordem ?? []).find(
      (candidato) => String(candidato?.formato ?? "").trim().toLowerCase() === alvo
    ) ?? null
  );
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
  const alvo = formatoInicialDaSugestao(sugestao);
  if (!alvo) return null;
  return (blocks ?? []).find((block) => formatoSugeridoDoBloco(block) === alvo) ?? null;
}

/**
 * Motivos que o servidor registrou para o formato. São notas internas do motor
 * (para auditoria e para o console), não texto para o aluno: o que vai para a
 * tela é `motivoAlunoDoFormato`.
 */
export function motivosDoFormato(
  sugestao: SugestaoMaterial | null | undefined,
  formato: string | null | undefined
): string[] {
  const item = itemDoFormato(sugestao, formato);
  return (item?.motivos ?? []).map((motivo) => String(motivo)).filter(Boolean);
}

/** A frase curta para o aluno sobre aquele formato, ou `null` se o servidor não mandou. */
export function motivoAlunoDoFormato(
  sugestao: SugestaoMaterial | null | undefined,
  formato: string | null | undefined
): string | null {
  const texto = String(itemDoFormato(sugestao, formato)?.motivo_aluno ?? "").trim();
  return texto || null;
}

export type DestaqueSugestao = {
  formato: string;
  /** Frase para o aluno; `null` mostra só o destaque. */
  motivo: string | null;
};

/**
 * "Comece por aqui": em cada grupo (cada conteúdo), o PRIMEIRO item cujo
 * formato é o aconselhado para começar. Devolve `chave → destaque`.
 *
 * Grupo sem esse formato não ganha destaque: apontar outro formato "porque foi
 * o que sobrou" transformaria a sugestão em ruído.
 */
export function destaquesDaSugestao<T>(
  itens: readonly T[] | null | undefined,
  sugestao: SugestaoMaterial | null | undefined,
  opcoes: {
    formatoDe: (item: T) => string | null | undefined;
    grupoDe?: (item: T) => string | null | undefined;
    chaveDe: (item: T) => string | number;
  }
): Map<string | number, DestaqueSugestao> {
  const destaques = new Map<string | number, DestaqueSugestao>();
  if (!sugestaoTemOrdem(sugestao)) return destaques;
  const alvo = formatoInicialDaSugestao(sugestao);
  if (!alvo) return destaques;

  const motivo = motivoAlunoDoFormato(sugestao, alvo);
  const gruposAtendidos = new Set<string>();
  (itens ?? []).forEach((item) => {
    const formato = String(opcoes.formatoDe(item) ?? "").trim().toLowerCase();
    if (formato !== alvo) return;
    const grupo = String(opcoes.grupoDe?.(item) ?? "");
    if (gruposAtendidos.has(grupo)) return;
    gruposAtendidos.add(grupo);
    destaques.set(opcoes.chaveDe(item), { formato: alvo, motivo });
  });
  return destaques;
}

// --- sugestões por tópico (leitura do banco, cache e congelamento) --------

function lerOrdem(valor: unknown): SugestaoMaterialItem[] {
  let bruto = valor;
  if (typeof bruto === "string") {
    try {
      bruto = JSON.parse(bruto);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (item): item is SugestaoMaterialItem =>
      Boolean(item) && typeof item === "object" && String((item as any).formato ?? "").trim() !== ""
  );
}

/**
 * Linhas de `personalizacao_sugestao` → `topico_id → sugestão`. Linha sem
 * tópico válido ou sem ordem utilizável é descartada: ela não reordenaria nada.
 */
export function sugestoesPorTopico(
  linhas: readonly Record<string, unknown>[] | null | undefined
): Record<number, SugestaoMaterial> {
  const resultado: Record<number, SugestaoMaterial> = {};
  (linhas ?? []).forEach((linha) => {
    const topicoId = Number(linha?.topico_id);
    if (!Number.isInteger(topicoId) || topicoId <= 0) return;
    const sugestao: SugestaoMaterial = {
      formato_inicial: (linha.formato_inicial as string | null | undefined) ?? null,
      ordem: lerOrdem(linha.ordem),
      versao: Number.isFinite(Number(linha.versao)) ? Number(linha.versao) : null,
      origem: (linha.origem as string | null | undefined) ?? null,
    };
    if (sugestaoTemOrdem(sugestao)) resultado[topicoId] = sugestao;
  });
  return resultado;
}

/**
 * Junta sugestões novas às que já se tinha, por tópico.
 *
 * Tópico ausente nas novas fica como estava: enquanto a RLS não deixar o aluno
 * ler a tabela, a leitura do banco volta vazia, e apagar por isso jogaria fora o
 * que a API devolveu na última abertura. Versão menor não substitui maior — a
 * resposta mais nova não pode ser desfeita por uma leitura atrasada.
 *
 * Devolve o MESMO objeto quando nada muda, para não disparar renderização.
 */
export function mesclarSugestoes(
  atuais: Record<number, SugestaoMaterial>,
  novas: Record<number, SugestaoMaterial | null | undefined> | null | undefined
): Record<number, SugestaoMaterial> {
  let resultado = atuais;
  Object.entries(novas ?? {}).forEach(([chave, nova]) => {
    const topicoId = Number(chave);
    if (!Number.isInteger(topicoId) || topicoId <= 0 || !nova || !sugestaoTemOrdem(nova)) return;
    const atual = atuais[topicoId];
    if (atual) {
      const versaoAtual = Number(atual.versao);
      const versaoNova = Number(nova.versao);
      if (Number.isFinite(versaoAtual) && Number.isFinite(versaoNova) && versaoNova < versaoAtual) {
        return;
      }
      if (JSON.stringify(atual) === JSON.stringify(nova)) return;
    }
    if (resultado === atuais) resultado = { ...atuais };
    resultado[topicoId] = nova;
  });
  return resultado;
}

export type EstadoSugestaoCongelada = {
  topicoId: number | null;
  sugestao: SugestaoMaterial | null;
  congelada: boolean;
};

/**
 * A ordem do tópico é decidida ANTES da retomada e não muda mais nesta visita.
 *
 * Enquanto os blocos não estão prontos, a sugestão acompanha o que estiver
 * disponível; no render em que ficam prontos (é quando a retomada calcula o
 * índice), ela congela. Daí em diante, sugestão nova — a resposta da API, uma
 * revisão — só vale na próxima abertura: reordenar agora moveria o material
 * embaixo de quem está lendo. Trocar de tópico recomeça.
 */
export function avancarSugestaoCongelada(
  anterior: EstadoSugestaoCongelada | null | undefined,
  entrada: {
    topicoId: number | null;
    disponivel: SugestaoMaterial | null | undefined;
    pronta: boolean;
  }
): EstadoSugestaoCongelada {
  const base: EstadoSugestaoCongelada =
    anterior && anterior.topicoId === entrada.topicoId
      ? anterior
      : { topicoId: entrada.topicoId, sugestao: null, congelada: false };
  if (base.congelada) return base;

  const sugestao = entrada.disponivel ?? null;
  const congelada = Boolean(entrada.pronta);
  if (base === anterior && base.sugestao === sugestao && base.congelada === congelada) {
    return base;
  }
  return { topicoId: entrada.topicoId, sugestao, congelada };
}

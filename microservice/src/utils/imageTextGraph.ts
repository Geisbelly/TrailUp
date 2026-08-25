// Grafo de relacionamento entre IMAGEM, TEXTO e TEMA.
//
// Problema que isto resolve: a distribuicao de imagens pelo material era
// rodizio puro (insertImagesIntoMarkdown ciclava a lista secao a secao). Com
// menos imagens que secoes - o caso normal - a mesma imagem reaparecia em
// secao atras de secao, inclusive onde nao tinha nada a ver com o assunto. E
// como o deck recebe as imagens da sua parte do markdown, a repeticao se
// propagava pros slides.
//
// Aqui cada imagem e ligada as secoes por AFINIDADE de conteudo, e o vinculo so
// existe quando ha evidencia:
//
//   imagem --(texto do slide de origem, nome do arquivo)--> termos
//   secao  --(titulo = tema, corpo)------------------------> termos
//   aresta = termos em comum, pesados por raridade (idf)
//
// Duas regras que vem junto e sao o coracao da correcao:
//
//   1. Uma imagem e usada NO MAXIMO uma vez. Nao existe mais "a mesma imagem
//      em todo lugar" - se ela ja foi colocada, acabou.
//   2. Secao sem afinidade fica SEM imagem. Preencher com a primeira imagem
//      disponivel e exatamente o defeito que estamos removendo.

const ACENTOS_RE = /[̀-ͯ]/g;

// Palavras vazias em pt-br (e algumas em ingles que aparecem em material
// tecnico). Sem isso, "de/da/para/como" dominam a intersecao e toda imagem
// parece relacionada a toda secao.
const STOPWORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "dela", "dele", "delas", "deles",
  "do", "dos", "e", "ela", "elas", "ele", "eles", "em", "entre", "essa", "essas", "esse",
  "esses", "esta", "estas", "este", "estes", "eu", "foi", "for", "isso", "isto", "ja", "la",
  "lhe", "mais", "mas", "me", "mesmo", "meu", "minha", "muito", "na", "nas", "nao", "no",
  "nos", "num", "numa", "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por",
  "qual", "quando", "que", "quem", "sao", "se", "sem", "ser", "seu", "sua", "tambem", "tem",
  "ter", "um", "uma", "voce", "and", "for", "from", "the", "this", "that", "with", "your",
  // Termos de baixo valor discriminativo neste corpus (e os plurais - nao ha
  // stemming aqui, entao singular e plural precisam estar os dois).
  "slide", "slides", "imagem", "imagens", "figura", "figuras", "fonte", "fontes",
  "exemplo", "exemplos",
]);

const MIN_TOKEN_LENGTH = 3;

/** Normaliza pra comparacao: sem acento, minusculo, so termos com conteudo. */
export function tokenize(texto: string | undefined | null): string[] {
  if (!texto) return [];
  return texto
    .normalize("NFD")
    .replace(ACENTOS_RE, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export interface RelatableImage {
  /** Identidade da imagem no markdown (data URI ou URL). */
  url: string;
  /** Nome do arquivo - sinal fraco, mas util em upload avulso ("diagrama-socket.png"). */
  name?: string;
  /** Texto do slide de onde a imagem veio - o sinal forte (ver pptxImageContext.ts). */
  sourceText?: string;
  /** Posicao no material de origem, usada so pra desempate e pro fallback posicional. */
  sourceOrder?: number;
}

export interface RelatableSection {
  /** Titulo da secao (## ...) - e o "tema" no grafo. */
  title: string;
  /** Corpo da secao. */
  body?: string;
}

export interface RelationEdge {
  imageIndex: number;
  sectionIndex: number;
  score: number;
  /** Termos que sustentam a aresta - deixa a decisao auditavel. */
  sharedTerms: string[];
}

export interface AssignmentResult {
  /** indice da secao -> indices das imagens colocadas nela. */
  bySection: Map<number, number[]>;
  /** Imagens que nao acharam lugar (nem por afinidade, nem por posicao). */
  unmatched: number[];
  /** Arestas que sustentaram cada colocacao, na ordem em que foram decididas. */
  edges: RelationEdge[];
}

function imageTerms(image: RelatableImage): string[] {
  // O nome do arquivo entra junto, mas "image7.png" nao produz termo nenhum
  // depois da tokenizacao - o que e o comportamento certo.
  return [...tokenize(image.sourceText), ...tokenize(image.name)];
}

function sectionTerms(section: RelatableSection): string[] {
  // O titulo pesa mais que o corpo: e ele que nomeia o tema da secao.
  return [...tokenize(section.title), ...tokenize(section.title), ...tokenize(section.body)];
}

function frequencias(termos: string[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const termo of termos) mapa.set(termo, (mapa.get(termo) ?? 0) + 1);
  return mapa;
}

/**
 * Peso por raridade: termo presente em quase toda secao (ex.: "rede" numa aula
 * de redes) quase nao distingue nada e vale pouco; termo que so aparece em uma
 * secao vale muito. E o que evita que tudo pareca relacionado a tudo.
 */
function pesosIdf(secoes: RelatableSection[]): Map<string, number> {
  const documentos = secoes.map((s) => new Set(sectionTerms(s)));
  const total = Math.max(1, documentos.length);
  const idf = new Map<string, number>();
  for (const doc of documentos) {
    for (const termo of doc) {
      if (idf.has(termo)) continue;
      const ocorrencias = documentos.filter((d) => d.has(termo)).length;
      idf.set(termo, Math.log((total + 1) / (ocorrencias + 1)) + 1);
    }
  }
  return idf;
}

/**
 * Monta todas as arestas com afinidade maior que zero, da mais forte pra mais
 * fraca. Serve tanto pra atribuicao quanto pra inspecao (o grafo em si).
 */
export function buildRelationGraph(
  images: RelatableImage[],
  sections: RelatableSection[],
): RelationEdge[] {
  const idf = pesosIdf(sections);
  const arestas: RelationEdge[] = [];

  images.forEach((image, imageIndex) => {
    const termosImagem = frequencias(imageTerms(image));
    if (termosImagem.size === 0) return;

    sections.forEach((section, sectionIndex) => {
      const termosSecao = frequencias(sectionTerms(section));
      let score = 0;
      const sharedTerms: string[] = [];

      for (const [termo, freqImagem] of termosImagem) {
        const freqSecao = termosSecao.get(termo);
        if (!freqSecao) continue;
        const peso = idf.get(termo) ?? 1;
        // Saturacao logaritmica: repetir o mesmo termo 20 vezes nao vale 20x.
        score += peso * (1 + Math.log(Math.min(freqImagem, freqSecao)));
        sharedTerms.push(termo);
      }

      if (score <= 0) return;
      // Normaliza pelo tamanho da imagem em termos, senao slide comprido ganha
      // de slide curto so por ter mais palavras.
      const normalizado = score / Math.sqrt(termosImagem.size);
      arestas.push({ imageIndex, sectionIndex, score: normalizado, sharedTerms });
    });
  });

  return arestas.sort(
    (a, b) => b.score - a.score || a.imageIndex - b.imageIndex || a.sectionIndex - b.sectionIndex,
  );
}

export interface AssignOptions {
  /** Afinidade minima pra colocar a imagem na secao. */
  minScore?: number;
  /** Teto de imagens por secao. */
  maxPerSection?: number;
  /**
   * Quando true (padrao), imagem sem nenhuma afinidade ainda e distribuida pelas
   * secoes vagas, em ordem, SEM repetir. E o caso do material sem sinal nenhum
   * (ex.: .docx, ou fotos com nome "IMG_1234"): melhor perto do conteudo do que
   * empilhada no fim - mas nunca repetida.
   */
  positionalFallback?: boolean;
}

/**
 * Decide onde cada imagem entra. Nenhuma imagem e usada duas vezes, e secao sem
 * afinidade fica sem imagem em vez de receber a primeira da fila.
 */
export function assignImagesToSections(
  images: RelatableImage[],
  sections: RelatableSection[],
  options: AssignOptions = {},
): AssignmentResult {
  const { minScore = 1.2, maxPerSection = 1, positionalFallback = true } = options;

  const bySection = new Map<number, number[]>();
  const usadas = new Set<number>();
  const edges: RelationEdge[] = [];

  const cabeMais = (sectionIndex: number) =>
    (bySection.get(sectionIndex)?.length ?? 0) < maxPerSection;

  for (const aresta of buildRelationGraph(images, sections)) {
    if (aresta.score < minScore) break; // lista ja vem ordenada
    if (usadas.has(aresta.imageIndex) || !cabeMais(aresta.sectionIndex)) continue;
    const atuais = bySection.get(aresta.sectionIndex) ?? [];
    atuais.push(aresta.imageIndex);
    bySection.set(aresta.sectionIndex, atuais);
    usadas.add(aresta.imageIndex);
    edges.push(aresta);
  }

  const sobrando = images.map((_, i) => i).filter((i) => !usadas.has(i));

  if (positionalFallback && sobrando.length > 0) {
    const ordenadas = [...sobrando].sort(
      (a, b) => (images[a].sourceOrder ?? a) - (images[b].sourceOrder ?? b),
    );
    for (const sectionIndex of sections.keys()) {
      if (ordenadas.length === 0) break;
      if (!cabeMais(sectionIndex)) continue;
      const imageIndex = ordenadas.shift()!;
      const atuais = bySection.get(sectionIndex) ?? [];
      atuais.push(imageIndex);
      bySection.set(sectionIndex, atuais);
      usadas.add(imageIndex);
    }
  }

  return {
    bySection,
    unmatched: images.map((_, i) => i).filter((i) => !usadas.has(i)),
    edges,
  };
}

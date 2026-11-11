import JSZip from "jszip";

/**
 * Os arquivos do professor como a edge function `generate-content-ai` os manda
 * ao Gemini (ver `supabase/functions/generate-content-ai/anexosDaTrilha.ts`).
 *
 * Até aqui só .txt e .md eram lidos: PDF, PPTX e DOCX iam como "[Arquivo:
 * nome]" e a trilha saía sem nada do material. Agora:
 *
 * - PDF vai inteiro (o Gemini lê texto e figuras), com o texto extraído de
 *   reserva para quando não cabe no pedido;
 * - PPTX e DOCX vão como texto (slide a slide, parágrafo a parágrafo) e com as
 *   imagens que estão dentro deles — o Gemini não lê esses formatos;
 *
 * TXT e MD não entram aqui: o texto deles já vai em `sources`/`fileContents`.
 *
 * Cada arquivo ganha um id curto (A1, A2…) pela ordem da lista; imagem ganha
 * `A2#i3`. É assim que o texto gerado marca uma figura (`{{figura:A2#i3|…}}`),
 * e `figurasDaTrilha.ts` troca o marcador pela imagem ao aplicar a trilha.
 */

export type ImagemDoAnexo = { id: string; mimeType: string; base64: string };

export type AnexoParaIa = {
  id: string;
  nome: string;
  mimeType: string;
  base64?: string;
  texto?: string;
  paginas?: number;
  imagens?: ImagemDoAnexo[];
};

/** PDF acima disso vai só como texto: o pedido inteiro ao Gemini tem 20 MB. */
export const PDF_INTEIRO_ATE_BYTES = 8 * 1024 * 1024;
/** Bytes de arquivo por pedido (o mesmo limite da função, que corta de novo). */
export const LIMITE_DO_PEDIDO_BYTES = 10 * 1024 * 1024;
/** Imagem menor que isso é ícone, logo ou marcador de slide. */
const IMAGEM_MIN_BYTES = 6 * 1024;
const IMAGEM_MAX_BYTES = 1.5 * 1024 * 1024;
const IMAGENS_POR_ARQUIVO = 20;
const TEXTO_MAX = 60_000;

const MIME_POR_EXTENSAO: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export const extensaoDe = (nome: string) => nome.split(".").pop()?.toLowerCase() ?? "";

export function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(binario);
}

export function bytesDoBase64(base64: string): number {
  const preenchimento = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - preenchimento);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodificarXml(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? _;
  });
}

/** Texto de um parágrafo do Office: as corridas `<x:t>` coladas. */
function textoDasCorridas(xml: string, tag: "a:t" | "w:t"): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g");
  let saida = "";
  for (const m of xml.matchAll(re)) saida += decodificarXml(m[1]);
  return saida.trim();
}

/** Destinos (`Id` → caminho no zip) de um arquivo `.rels`. */
async function relacoes(zip: JSZip, caminhoRels: string, pastaBase: string): Promise<Map<string, string>> {
  const xml = await zip.file(caminhoRels)?.async("string");
  const mapa = new Map<string, string>();
  if (!xml) return mapa;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const alvo = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (!id || !alvo || /TargetMode="External"/.test(m[0])) continue;
    mapa.set(id, normalizarCaminho(`${pastaBase}/${alvo}`));
  }
  return mapa;
}

function normalizarCaminho(caminho: string): string {
  const partes: string[] = [];
  for (const parte of caminho.split("/")) {
    if (parte === "..") partes.pop();
    else if (parte && parte !== ".") partes.push(parte);
  }
  return partes.join("/");
}

/**
 * Lê a imagem `caminho` do zip, se for de um tipo que o Gemini aceita e de
 * tamanho que valha mandar. Devolve o id novo ou null.
 */
async function coletarImagem(
  zip: JSZip,
  caminho: string,
  id: string,
  imagens: ImagemDoAnexo[],
  vistas: Map<string, string>,
): Promise<string | null> {
  const ja = vistas.get(caminho);
  if (ja) return ja;
  if (imagens.length >= IMAGENS_POR_ARQUIVO) return null;
  const mimeType = MIME_POR_EXTENSAO[extensaoDe(caminho)];
  const arquivo = zip.file(caminho);
  if (!mimeType || !arquivo) return null;
  const bytes = await arquivo.async("uint8array");
  if (bytes.length < IMAGEM_MIN_BYTES || bytes.length > IMAGEM_MAX_BYTES) return null;
  const idImagem = `${id}#i${imagens.length + 1}`;
  imagens.push({ id: idImagem, mimeType, base64: paraBase64(bytes) });
  vistas.set(caminho, idImagem);
  return idImagem;
}

/** Texto slide a slide e as imagens de cada slide, na ordem dos slides. */
export async function lerPptx(dados: ArrayBuffer | Uint8Array, id: string): Promise<{ texto: string; imagens: ImagemDoAnexo[] }> {
  const zip = await JSZip.loadAsync(dados);
  const slides = Object.keys(zip.files)
    .map((caminho) => ({ caminho, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(caminho)?.[1]) }))
    .filter((s) => Number.isInteger(s.n) && s.n > 0)
    .sort((a, b) => a.n - b.n);
  const imagens: ImagemDoAnexo[] = [];
  const vistas = new Map<string, string>();
  const blocos: string[] = [];

  for (const [indice, slide] of slides.entries()) {
    const xml = (await zip.file(slide.caminho)?.async("string")) ?? "";
    const paragrafos = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((m) => textoDasCorridas(m[0], "a:t")).filter(Boolean);
    const rels = await relacoes(zip, `ppt/slides/_rels/slide${slide.n}.xml.rels`, "ppt/slides");
    const idsDoSlide: string[] = [];
    for (const m of xml.matchAll(/r:embed="([^"]+)"/g)) {
      const caminho = rels.get(m[1]);
      if (!caminho) continue;
      const idImagem = await coletarImagem(zip, caminho, id, imagens, vistas);
      if (idImagem && !idsDoSlide.includes(idImagem)) idsDoSlide.push(idImagem);
    }
    if (paragrafos.length === 0 && idsDoSlide.length === 0) continue;
    blocos.push(
      [`[Slide ${indice + 1}]`, ...paragrafos, ...idsDoSlide.map((i) => `[imagem ${i}]`)].join("\n"),
    );
  }
  return { texto: blocos.join("\n\n").slice(0, TEXTO_MAX), imagens };
}

/** Parágrafos do documento, com `[imagem A3#i1]` onde a imagem está. */
export async function lerDocx(dados: ArrayBuffer | Uint8Array, id: string): Promise<{ texto: string; imagens: ImagemDoAnexo[] }> {
  const zip = await JSZip.loadAsync(dados);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const rels = await relacoes(zip, "word/_rels/document.xml.rels", "word");
  const imagens: ImagemDoAnexo[] = [];
  const vistas = new Map<string, string>();
  const linhas: string[] = [];

  for (const m of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const paragrafo = m[0];
    const titulo = /<w:pStyle w:val="(?:Heading|Ttulo|Titulo)(\d)"/i.exec(paragrafo);
    const texto = textoDasCorridas(paragrafo, "w:t");
    if (texto) linhas.push(titulo ? `${"#".repeat(Math.min(6, Number(titulo[1]) + 1))} ${texto}` : texto);
    for (const e of paragrafo.matchAll(/r:embed="([^"]+)"/g)) {
      const caminho = rels.get(e[1]);
      if (!caminho) continue;
      const idImagem = await coletarImagem(zip, caminho, id, imagens, vistas);
      if (idImagem) linhas.push(`[imagem ${idImagem}]`);
    }
  }
  return { texto: linhas.join("\n").slice(0, TEXTO_MAX), imagens };
}

export type LeitorDePdf = (dados: Uint8Array) => Promise<{ texto: string; paginas: number }>;

/**
 * Lê os arquivos para a IA. Arquivo que não se consegue ler (formato fora da
 * lista, zip corrompido) fica só com o nome: a geração segue com o resto.
 */
export async function prepararAnexos(arquivos: File[], lerPdf: LeitorDePdf): Promise<AnexoParaIa[]> {
  const anexos: AnexoParaIa[] = [];
  for (const [indice, arquivo] of arquivos.entries()) {
    const id = `A${indice + 1}`;
    const ext = extensaoDe(arquivo.name);
    const base = { id, nome: arquivo.name, mimeType: arquivo.type || "application/octet-stream" };
    try {
      if (ext === "pdf") {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        const { texto, paginas } = await lerPdf(bytes.slice());
        anexos.push({
          ...base,
          mimeType: "application/pdf",
          ...(bytes.length <= PDF_INTEIRO_ATE_BYTES ? { base64: paraBase64(bytes) } : {}),
          ...(texto.trim() ? { texto: texto.slice(0, TEXTO_MAX) } : {}),
          ...(paginas > 0 ? { paginas } : {}),
        });
      } else if (ext === "pptx" || ext === "docx") {
        const lido = await (ext === "pptx" ? lerPptx : lerDocx)(await arquivo.arrayBuffer(), id);
        anexos.push({
          ...base,
          ...(lido.texto ? { texto: lido.texto } : {}),
          ...(lido.imagens.length > 0 ? { imagens: lido.imagens } : {}),
        });
      }
    } catch (erro) {
      console.warn(`[trilha] não deu para ler ${arquivo.name} para a IA:`, erro);
    }
  }
  return anexos;
}

const chaveDoNome = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Os anexos de um pedido: os de `nomes` (os `arquivos_relacionados` do tópico)
 * ou, sem nomes ou sem nenhum que case, todos. Depois, o corte por tamanho:
 * PDF que não cabe vai sem o arquivo (fica o texto), imagem que não cabe sai.
 */
export function anexosDoPedido(
  anexos: AnexoParaIa[],
  nomes?: string[] | null,
  limiteBytes: number = LIMITE_DO_PEDIDO_BYTES,
): AnexoParaIa[] {
  const procurados = new Set((nomes ?? []).map(chaveDoNome).filter(Boolean));
  const casados = anexos.filter((a) => procurados.has(chaveDoNome(a.nome)));
  const escolhidos = casados.length > 0 ? casados : anexos;

  let restante = limiteBytes;
  return escolhidos.map((anexo) => {
    const saida: AnexoParaIa = { ...anexo };
    if (saida.base64) {
      const bytes = bytesDoBase64(saida.base64);
      if (bytes <= restante) restante -= bytes;
      else delete saida.base64;
    }
    if (saida.imagens) {
      const cabem = saida.imagens.filter((img) => {
        const bytes = bytesDoBase64(img.base64);
        if (bytes > restante) return false;
        restante -= bytes;
        return true;
      });
      if (cabem.length > 0) saida.imagens = cabem;
      else delete saida.imagens;
    }
    return saida;
  });
}

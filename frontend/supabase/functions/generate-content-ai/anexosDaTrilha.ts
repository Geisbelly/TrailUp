/**
 * Os arquivos do professor como o Gemini os lê, na geração da trilha.
 *
 * Até aqui só .txt e .md chegavam ao modelo: PDF, PPTX e DOCX viravam
 * "[Arquivo: nome]" e a IA escrevia texto genérico de um parágrafo, sem nada do
 * material. Agora o console manda, por arquivo:
 *
 * - PDF: o arquivo inteiro (`base64`), que o Gemini lê nativamente, com texto e
 *   figuras, e o texto extraído (`texto`) para quando o PDF não cabe no pedido;
 * - PPTX e DOCX: o texto de cada slide ou do documento (`texto`) e as imagens
 *   que vêm dentro do arquivo (`imagens`), porque o Gemini não lê esses formatos;
 * - TXT e MD: o texto.
 *
 * Cada arquivo tem um `id` curto (A1, A2…) dado pelo console e estável na
 * geração inteira. É por ele que o texto gerado marca onde entra uma figura do
 * material: `{{figura:A1#p3|legenda}}` (página 3 do PDF A1) ou
 * `{{figura:A2#i4|legenda}}` (imagem 4 do arquivo A2). O console troca o marcador
 * pela imagem quando aplica a trilha.
 *
 * Sem `Deno.*` aqui dentro: o vitest do frontend testa este arquivo.
 */

export type ImagemDoAnexo = { id: string; mimeType: string; base64: string };

export type AnexoDaTrilha = {
  /** Curto e estável na geração: "A1", "A2"… */
  id: string;
  nome: string;
  mimeType: string;
  /** PDF inteiro. */
  base64?: string;
  /** Texto extraído (PPTX, DOCX, TXT, MD; e o PDF, de reserva). */
  texto?: string;
  /** Páginas do PDF, para validar `#pN`. */
  paginas?: number;
  imagens?: ImagemDoAnexo[];
};

export type ParteGemini = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Bytes de arquivo (antes do base64) que um pedido leva inline. O Gemini aceita
 * até 20 MB de pedido inteiro, e o base64 cresce um terço: 10 MB de arquivo dão
 * ~13,3 MB no corpo, com folga para o prompt.
 */
export const LIMITE_INLINE_BYTES = 10 * 1024 * 1024;
/** Caracteres de texto por arquivo. */
export const LIMITE_TEXTO_POR_ANEXO = 60_000;
/** Imagens de PPTX/DOCX por pedido. */
export const MAX_IMAGENS_POR_PEDIDO = 12;
/** Figuras por conteúdo gerado: mais que isso vira álbum, não aula. */
export const MAX_FIGURAS_POR_CONTEUDO = 3;

const ID_VALIDO = /^A\d{1,3}$/;
const ID_IMAGEM_VALIDO = /^A\d{1,3}#i\d{1,4}$/;
const MIME_IMAGEM = /^image\/(png|jpe?g|webp|gif)$/;

const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

/** Valida o que o console mandou em `anexos`; descarta o que não serve, sem lançar. */
export function lerAnexos(valor: unknown): AnexoDaTrilha[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const anexos: AnexoDaTrilha[] = [];
  for (const bruto of valor) {
    if (!bruto || typeof bruto !== "object") continue;
    const r = bruto as Record<string, unknown>;
    const id = texto(r.id).trim();
    const nome = texto(r.nome).trim();
    if (!ID_VALIDO.test(id) || !nome || vistos.has(id)) continue;
    const base64 = texto(r.base64).trim();
    const conteudo = texto(r.texto).trim();
    const paginas = Number(r.paginas);
    const imagens = (Array.isArray(r.imagens) ? r.imagens : [])
      .map((img) => img as Record<string, unknown>)
      .filter((img) => img && ID_IMAGEM_VALIDO.test(texto(img.id)) && texto(img.id).startsWith(`${id}#`))
      .filter((img) => MIME_IMAGEM.test(texto(img.mimeType)) && texto(img.base64).length > 0)
      .map((img) => ({ id: texto(img.id), mimeType: texto(img.mimeType), base64: texto(img.base64) }));
    if (!base64 && !conteudo && imagens.length === 0) continue;
    vistos.add(id);
    anexos.push({
      id,
      nome,
      mimeType: texto(r.mimeType).trim() || "application/octet-stream",
      ...(base64 ? { base64 } : {}),
      ...(conteudo ? { texto: conteudo } : {}),
      ...(Number.isInteger(paginas) && paginas > 0 ? { paginas } : {}),
      ...(imagens.length > 0 ? { imagens } : {}),
    });
  }
  return anexos;
}

/** Bytes que o base64 representa (sem decodificar). */
export function bytesDoBase64(base64: string): number {
  const limpo = base64.replace(/\s/g, "");
  const preenchimento = limpo.endsWith("==") ? 2 : limpo.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((limpo.length * 3) / 4) - preenchimento);
}

const ehPdf = (anexo: AnexoDaTrilha) => anexo.mimeType === "application/pdf" || /\.pdf$/i.test(anexo.nome);

export type PartesDosAnexos = {
  partes: ParteGemini[];
  /** Referências de figura que o modelo pode usar neste pedido. */
  figuras: { pdfs: { id: string; paginas?: number }[]; imagens: string[] };
  /** Arquivos que não couberam (nem PDF nem texto). */
  omitidos: string[];
};

/**
 * As partes do pedido ao Gemini: cada arquivo com um rótulo antes. PDF vai
 * inteiro enquanto couber em `limiteBytes`; depois, o texto dele. Imagem de
 * PPTX/DOCX entra enquanto couber e até `MAX_IMAGENS_POR_PEDIDO`.
 */
export function montarPartesDosAnexos(
  anexos: AnexoDaTrilha[],
  limiteBytes: number = LIMITE_INLINE_BYTES,
): PartesDosAnexos {
  const partes: ParteGemini[] = [];
  const figuras: PartesDosAnexos["figuras"] = { pdfs: [], imagens: [] };
  const omitidos: string[] = [];
  let restante = limiteBytes;
  let imagensUsadas = 0;

  for (const anexo of anexos) {
    if (ehPdf(anexo) && anexo.base64) {
      const bytes = bytesDoBase64(anexo.base64);
      if (bytes <= restante) {
        restante -= bytes;
        partes.push({ text: `[Arquivo ${anexo.id}: ${anexo.nome} (PDF completo, a seguir)]` });
        partes.push({ inlineData: { mimeType: "application/pdf", data: anexo.base64 } });
        figuras.pdfs.push({ id: anexo.id, ...(anexo.paginas ? { paginas: anexo.paginas } : {}) });
        continue;
      }
    }

    if (anexo.texto) {
      partes.push({
        text: `[Arquivo ${anexo.id}: ${anexo.nome} (texto extraido)]\n${anexo.texto.slice(0, LIMITE_TEXTO_POR_ANEXO)}`,
      });
    }

    let imagensDoAnexo = 0;
    for (const imagem of anexo.imagens ?? []) {
      if (imagensUsadas >= MAX_IMAGENS_POR_PEDIDO) break;
      const bytes = bytesDoBase64(imagem.base64);
      if (bytes > restante) continue;
      restante -= bytes;
      imagensUsadas += 1;
      imagensDoAnexo += 1;
      partes.push({ text: `[Figura ${imagem.id} do arquivo ${anexo.id}: ${anexo.nome}]` });
      partes.push({ inlineData: { mimeType: imagem.mimeType, data: imagem.base64 } });
      figuras.imagens.push(imagem.id);
    }

    if (!anexo.texto && imagensDoAnexo === 0 && !figuras.pdfs.some((pdf) => pdf.id === anexo.id)) {
      omitidos.push(anexo.nome);
    }
  }

  return { partes, figuras, omitidos };
}

/** O trecho do prompt que ensina a marcar figuras, ou "" se não há nenhuma. */
export function instrucaoDeFiguras(figuras: PartesDosAnexos["figuras"]): string {
  if (figuras.pdfs.length === 0 && figuras.imagens.length === 0) return "";
  const linhas = [
    "Figuras do material: quando uma figura, diagrama, tabela ou trecho de codigo do material ajudar a explicar, " +
      "insira no texto do conteudo, numa linha sozinha, o marcador {{figura:REF|legenda curta}}.",
    `- No maximo ${MAX_FIGURAS_POR_CONTEUDO} figuras por conteudo, e so as que o texto explica.`,
  ];
  for (const pdf of figuras.pdfs) {
    linhas.push(
      `- Pagina N do PDF ${pdf.id}: REF = ${pdf.id}#pN${pdf.paginas ? ` (N de 1 a ${pdf.paginas})` : ""}. ` +
        "Use a pagina onde a figura aparece.",
    );
  }
  if (figuras.imagens.length > 0) {
    linhas.push(`- Imagens enviadas: REF = ${figuras.imagens.join(", ")}.`);
  }
  linhas.push("- Nunca invente REF fora dessas.");
  return linhas.join("\n");
}

const MARCADOR = /\{\{figura:([^|}]+)(?:\|([^}]*))?\}\}/g;

/**
 * Tira do texto os marcadores de figura que não existem neste pedido e os que
 * passam do máximo por conteúdo. O que sobra o console resolve.
 */
export function limparMarcadoresDeFigura(conteudo: string, figuras: PartesDosAnexos["figuras"]): string {
  const imagens = new Set(figuras.imagens);
  const paginas = new Map(figuras.pdfs.map((pdf) => [pdf.id, pdf.paginas ?? Number.POSITIVE_INFINITY]));
  let usadas = 0;
  const limpo = conteudo.replace(MARCADOR, (marcador, refBruta: string) => {
    const ref = refBruta.trim();
    const pagina = /^(A\d{1,3})#p(\d{1,4})$/.exec(ref);
    const valida = imagens.has(ref) || (pagina !== null && Number(pagina[2]) >= 1 && Number(pagina[2]) <= (paginas.get(pagina[1]) ?? 0));
    if (!valida || usadas >= MAX_FIGURAS_POR_CONTEUDO) return "";
    usadas += 1;
    return marcador.replace(refBruta, ref);
  });
  return limpo.replace(/\n{3,}/g, "\n\n").trim();
}

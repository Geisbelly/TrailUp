/**
 * PDF no navegador, com o pdf.js, carregado só quando o professor gera uma
 * trilha com PDF (o pacote é grande e o resto do console não precisa dele).
 *
 * Duas coisas: o texto, página a página, que vai de reserva para a IA quando o
 * PDF não cabe no pedido; e a página como PNG, para virar figura no conteúdo
 * gerado (ver `figurasDaTrilha.ts`).
 */

type PdfJs = typeof import("pdfjs-dist");

let carregando: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  carregando ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return carregando;
}

async function abrir(dados: Uint8Array) {
  const lib = await pdfjs();
  // O pdf.js transfere o buffer para o worker: cópia, para quem chamou não ficar com ele vazio.
  return lib.getDocument({ data: dados.slice() }).promise;
}

/** O texto de cada página, com `[Pagina N]` antes, e o número de páginas. */
export async function lerTextoDoPdf(dados: Uint8Array): Promise<{ texto: string; paginas: number }> {
  const doc = await abrir(dados);
  try {
    const partes: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const pagina = await doc.getPage(n);
      const conteudo = await pagina.getTextContent();
      let linha = "";
      for (const item of conteudo.items) {
        if (!("str" in item)) continue;
        linha += item.str + (item.hasEOL ? "\n" : " ");
      }
      const texto = linha.replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();
      if (texto) partes.push(`[Pagina ${n}]\n${texto}`);
    }
    return { texto: partes.join("\n\n"), paginas: doc.numPages };
  } finally {
    void doc.destroy();
  }
}

/** A página `numero` como PNG de até `larguraMax` px. `null` se a página não existe. */
export async function paginaDoPdfComoPng(dados: Uint8Array, numero: number, larguraMax = 1400): Promise<Blob | null> {
  const doc = await abrir(dados);
  try {
    if (numero < 1 || numero > doc.numPages) return null;
    const pagina = await doc.getPage(numero);
    const base = pagina.getViewport({ scale: 1 });
    const escala = Math.min(2, larguraMax / base.width);
    const viewport = pagina.getViewport({ scale: escala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const contexto = canvas.getContext("2d");
    if (!contexto) return null;
    // Fundo branco: PDF sem fundo vira PNG transparente, ilegível no tema escuro do app.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvas, canvasContext: contexto, viewport }).promise;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    void doc.destroy();
  }
}

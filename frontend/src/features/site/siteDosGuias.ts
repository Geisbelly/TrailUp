// O site, em texto, para o Guia do aluno e a Lumi do professor.
//
// A API lê uma cópia (`api/app/agent/prompts/site_trailup.json`, `app/services/site_trailup.py`) e
// manda ao modelo só as seções que a pergunta pede. A cópia sai daqui, pelo teste
// `siteDosGuias.paridade.test.tsx`: as páginas são renderizadas como o visitante as vê e os artigos
// do Diário vão no markdown de origem. Mudou o texto de uma página, gere a cópia de novo
// (o teste diz como); se esquecer, ele falha.

export type SecaoDoSite = {
  /** Estável: `pagina/<rota>/<n>`, `diario/<id>` ou `video/<slug>`. */
  id: string;
  tipo: "pagina" | "diario" | "video";
  titulo: string;
  /** Caminho no site, sem o domínio. */
  url: string;
  texto: string;
};

export const BASE_DO_SITE = "https://trailup.vercel.app";

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodificar(texto: string): string {
  return texto
    .replace(/&(amp|lt|gt|quot|nbsp|#x27|#39);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * O HTML renderizado de uma página, em texto com títulos em markdown (`#`, `##`, `###`).
 * Cabeçalho, rodapé e navegação ficam de fora: repetem em toda página e não dizem nada dela.
 */
export function htmlParaTexto(html: string): string {
  let s = html
    .replace(/<(header|footer|nav|script|style|svg)\b[\s\S]*?<\/\1>/g, "")
    .replace(/<h1\b[^>]*>/g, "\n# ")
    .replace(/<h2\b[^>]*>/g, "\n## ")
    .replace(/<h3\b[^>]*>/g, "\n### ")
    .replace(/<li\b[^>]*>/g, "\n- ")
    .replace(/<\/?(p|div|h\d|li|ul|ol|section|article|br|tr|td|th|button|a|span|label|summary|details|figcaption|blockquote)\b[^>]*>/g, (tag) =>
      /^<\/?(span|a|label)\b/.test(tag) ? " " : "\n",
    )
    .replace(/<[^>]+>/g, "");
  s = decodificar(s);
  return s
    .split("\n")
    .map((linha) => linha.replace(/\s+/g, " ").trim())
    .filter((linha) => linha && linha !== "-")
    .join("\n");
}

/** Divide o texto de uma página nos títulos `##`. O que vem antes do primeiro fica na seção 0. */
export function secoesDaPagina(nomeDaPagina: string, rota: string, texto: string): SecaoDoSite[] {
  const partes = texto.split(/\n(?=## )/);
  const secoes: SecaoDoSite[] = [];
  partes.forEach((parte, n) => {
    const corpo = parte.trim();
    if (!corpo) return;
    const titulo = corpo.startsWith("## ") ? corpo.slice(3).split("\n")[0].trim() : null;
    secoes.push({
      id: `pagina${rota === "/" ? "/inicio" : rota}/${n}`,
      tipo: "pagina",
      titulo: titulo ? `${nomeDaPagina}: ${titulo}` : nomeDaPagina,
      url: rota,
      texto: corpo,
    });
  });
  return secoes;
}

export type ArtigoDoDiario = { id: string; title: string; excerpt: string; category: string };
export type VideoDoSite = { slug: string; titulo: string; papel: string; descricao: string; duracao: string };

export function secoesDoDiario(
  lista: readonly ArtigoDoDiario[],
  conteudo: Record<string, { content: string }>,
  videoDoArtigo: Readonly<Record<string, string>>,
): SecaoDoSite[] {
  return lista.map((artigo) => {
    const video = videoDoArtigo[artigo.id];
    const texto = [
      `Categoria: ${artigo.category}. ${artigo.excerpt}`,
      video ? `Vídeo no artigo: /videos/${video}` : null,
      (conteudo[artigo.id]?.content ?? "").trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    return { id: `diario/${artigo.id}`, tipo: "diario", titulo: `Diário: ${artigo.title}`, url: `/blog/${artigo.id}`, texto };
  });
}

export function secoesDosVideos(videos: readonly VideoDoSite[], caminhoDaCartilha: string): SecaoDoSite[] {
  return videos.map((v) => ({
    id: `video/${v.slug}`,
    tipo: "video",
    titulo: `Vídeo: ${v.titulo}`,
    url: `/videos/${v.slug}`,
    texto: `${v.papel}. ${v.titulo} (${v.duracao}). ${v.descricao}\nTambém na cartilha: ${caminhoDaCartilha}/videos/${v.slug}`,
  }));
}

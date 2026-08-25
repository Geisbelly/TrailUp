// Como pre-visualizar o arquivo-fonte que o professor enviou (o material base
// da aula), a partir do nome/caminho dele.
//
// O card do arquivo so oferecia "abrir em nova aba": para PDF o navegador
// mostra, mas .pptx/.docx ele apenas BAIXA - o professor nunca via o que subiu
// sem abrir o PowerPoint. Aqui cada tipo ganha o visualizador que funciona no
// navegador.

export type SourcePreviewKind =
  | "pdf"
  | "office"
  | "imagem"
  | "video"
  | "audio"
  | "texto"
  | "desconhecido";

// Formatos que o Office Web Viewer renderiza. Ele busca o arquivo pela URL,
// entao so funciona com link acessivel de fora (a URL assinada do Supabase e).
const OFFICE_EXTENSIONS = new Set([
  "ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm",
  "doc", "docx", "docm", "dot", "dotx",
  "xls", "xlsx", "xlsm", "csv",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv"]);

export function fileExtension(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  // Corta query/hash antes: "...pptx?token=abc" nao pode virar extensao "pptx?token=abc".
  const semQuery = pathOrUrl.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const arquivo = semQuery.slice(semQuery.lastIndexOf("/") + 1);
  const ponto = arquivo.lastIndexOf(".");
  if (ponto <= 0 || ponto === arquivo.length - 1) return null;
  return arquivo.slice(ponto + 1).toLowerCase();
}

export function resolveSourcePreviewKind(pathOrUrl: string | null | undefined): SourcePreviewKind {
  const ext = fileExtension(pathOrUrl);
  if (!ext) return "desconhecido";
  if (ext === "pdf") return "pdf";
  // csv aparece nos dois conjuntos: como texto le melhor no navegador do que
  // pelo visualizador do Office, entao texto ganha.
  if (TEXT_EXTENSIONS.has(ext)) return "texto";
  if (OFFICE_EXTENSIONS.has(ext)) return "office";
  if (IMAGE_EXTENSIONS.has(ext)) return "imagem";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "desconhecido";
}

/** True quando da pra mostrar algo dentro da propria pagina. */
export function podePreVisualizar(pathOrUrl: string | null | undefined): boolean {
  return resolveSourcePreviewKind(pathOrUrl) !== "desconhecido";
}

/**
 * URL de embed do Office Web Viewer. Precisa da URL do arquivo codificada -
 * sem isso o token da URL assinada (com & e =) quebra o parametro.
 */
export function officeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

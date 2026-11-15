// Como tocar, dentro do editor, o vídeo que o professor colou no conteúdo.
//
// O campo aceita link do YouTube (watch, youtu.be, shorts, embed), link do
// Vimeo, arquivo de vídeo direto (.mp4/.webm/...) e o HTML de um <iframe>. O
// iframe colado NUNCA é injetado como HTML: só o `src` dele é lido, e só se for
// https. Assim o que o professor cola não roda script na página do console.

export type VideoDoConteudo =
  | { tipo: "youtube"; id: string; embedUrl: string }
  | { tipo: "vimeo"; id: string; embedUrl: string }
  | { tipo: "iframe"; embedUrl: string }
  | { tipo: "arquivo"; url: string };

const YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const VIMEO = /(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/;
const ARQUIVO_DE_VIDEO = /\.(mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i;
const SRC_DO_IFRAME = /<iframe\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;

export function idDoYouTube(valor: string): string | null {
  return valor.match(YOUTUBE)?.[1] ?? null;
}

function desfazEntidades(valor: string): string {
  return valor.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** O endereço que o campo aponta: o `src` do iframe colado, ou o texto como veio. */
function enderecoDoCampo(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;
  if (/^<iframe\b/i.test(texto) || texto.includes("<iframe")) {
    const m = texto.match(SRC_DO_IFRAME);
    const src = m?.[1] ?? m?.[2] ?? m?.[3];
    if (!src) return null;
    return desfazEntidades(src.trim()).replace(/^\/\//, "https://");
  }
  // Qualquer outro HTML não é endereço.
  if (texto.startsWith("<")) return null;
  return texto;
}

export function videoDoConteudo(valor: string | null | undefined): VideoDoConteudo | null {
  const endereco = enderecoDoCampo(String(valor ?? ""));
  if (!endereco) return null;

  const yt = idDoYouTube(endereco);
  if (yt) {
    // Mesmos parâmetros do player do app (mobile/src/components/funcionais/VideoPlayer.tsx).
    return { tipo: "youtube", id: yt, embedUrl: `https://www.youtube.com/embed/${yt}?playsinline=1&rel=0&modestbranding=1` };
  }

  const vimeo = endereco.match(VIMEO)?.[1];
  if (vimeo) return { tipo: "vimeo", id: vimeo, embedUrl: `https://player.vimeo.com/video/${vimeo}` };

  if (ARQUIVO_DE_VIDEO.test(endereco)) {
    // Link direto ou caminho no bucket `conteudos`: quem exibe assina o caminho.
    return /^https?:\/\//i.test(endereco) || !/\s/.test(endereco) ? { tipo: "arquivo", url: endereco } : null;
  }

  // Iframe de outro provedor: só https. `http:` seria bloqueado como conteúdo
  // misto, e `javascript:`/`data:` não são vídeo.
  if (/^https:\/\//i.test(endereco) && String(valor ?? "").includes("<iframe")) {
    return { tipo: "iframe", embedUrl: endereco };
  }

  return null;
}

/**
 * O material de UM conteúdo como o Gemini o recebe no modo `content`
 * ("Sugerir cards e atividades").
 *
 * Até aqui só o conteúdo do tipo `texto` mandava o corpo: vídeo e link iam
 * apenas com o título, e PDF virava "[Arquivo anexado: nome]" — as questões
 * saíam do título. Agora:
 *
 * - vídeo do YouTube vai como `fileData` com o link, que o Gemini assiste;
 * - link externo é lido pela função (só o texto da página);
 * - PDF/PPTX/DOCX vêm do console como `anexos`, como na trilha.
 *
 * Sem `Deno.*` aqui dentro: o vitest do frontend testa este arquivo.
 */

/** Caracteres da página do link que vão ao modelo. */
export const LIMITE_TEXTO_DO_LINK = 30_000;

const YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/** O link canônico do vídeo do YouTube (`watch?v=`), ou `null`. Aceita também o iframe colado. */
export function urlDoYouTube(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const id = valor.match(YOUTUBE)?.[1];
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function ipv4Privado(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * O link pode ser buscado pela função? Só http(s) para nome público: nada de
 * localhost, rede interna, IP privado ou porta fora do padrão — a função roda
 * na infraestrutura do Supabase, e o endereço vem do professor.
 */
export function linkPublicoSeguro(valor: unknown): URL | null {
  if (typeof valor !== "string") return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null;
  if (host.startsWith("[") || host.includes(":")) return null; // IPv6 literal: não há por que aceitar
  if (ipv4Privado(host)) return null;
  // IPv4 em outra notação (decimal inteiro, hexa) também não.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return null;
  return url;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** O texto legível de uma página HTML: sem script, estilo, menu e rodapé, com espaços colapsados. */
export function textoDoHtml(html: string, limite = LIMITE_TEXTO_DO_LINK): string {
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const corpo = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
      if (nome.startsWith("#x") || nome.startsWith("#X")) return String.fromCodePoint(parseInt(nome.slice(2), 16) || 32);
      if (nome.startsWith("#")) return String.fromCodePoint(Number(nome.slice(1)) || 32);
      return ENTIDADES[nome.toLowerCase()] ?? inteira;
    })
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const texto = titulo && !corpo.startsWith(titulo) ? `${titulo}\n\n${corpo}` : corpo;
  return texto.slice(0, limite);
}

/**
 * O texto da pagina do link, ou `null`. Segue no maximo 3 redirecionamentos,
 * conferindo cada destino (um link publico nao pode levar a rede interna), le
 * no maximo 1,5 MB e so aceita HTML ou texto.
 */
export async function lerPaginaDoLink(
  inicial: URL,
  deadline: number,
  buscar: typeof fetch = fetch,
): Promise<string | null> {
  let url: URL | null = inicial;
  try {
    for (let salto = 0; url && salto <= 3; salto += 1) {
      const restante = Math.min(10_000, deadline - Date.now() - 60_000);
      if (restante <= 0) return null;
      const res: Response = await buscar(url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(restante),
        headers: { "User-Agent": "TrailUp/1.0 (+material do professor)", Accept: "text/html,text/plain;q=0.9" },
      });
      if (res.status >= 300 && res.status < 400) {
        const destino: string | null = res.headers.get("location");
        await res.body?.cancel();
        url = destino ? linkPublicoSeguro(new URL(destino, url).href) : null;
        continue;
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        return null;
      }
      const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!tipo.includes("text/html") && !tipo.includes("text/plain")) {
        await res.body.cancel();
        return null;
      }
      const leitor = res.body.getReader();
      const pedacos: Uint8Array[] = [];
      let total = 0;
      while (total < 1_500_000) {
        const { done, value } = await leitor.read();
        if (done || !value) break;
        pedacos.push(value);
        total += value.length;
      }
      await leitor.cancel().catch(() => undefined);
      const junto = new Uint8Array(total);
      let posicao = 0;
      for (const pedaco of pedacos) {
        junto.set(pedaco, posicao);
        posicao += pedaco.length;
      }
      const bruto = new TextDecoder().decode(junto);
      const texto = tipo.includes("text/html") ? textoDoHtml(bruto) : bruto.slice(0, LIMITE_TEXTO_DO_LINK).trim();
      return texto.length >= 200 ? texto : null;
    }
  } catch (erro) {
    console.warn("link do conteudo nao foi lido:", erro instanceof Error ? erro.message : String(erro));
  }
  return null;
}

/** O que a resposta conta ao console sobre o material: o que o modelo leu e o que não deu para ler. */
export type RelatoDoMaterial = { lido: string[]; naoLido: string[] };

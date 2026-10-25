/**
 * URLs do Storage DENTRO de texto livre (markdown do material personalizado,
 * conteudo, questao) - #195.
 *
 * `trailup_fechar_buckets_privados()` (alembic 20261024_11) troca, dentro dos
 * textos, `/object/public/<bucket privado>/` por `/object/authenticated/...`.
 * Nenhuma das duas carrega num `<img>` com o bucket fechado (400 / pede token),
 * entao o console assina NA LEITURA, antes de renderizar. Puro: quem assina e'
 * injetado.
 */

export const BUCKETS_PRIVADOS: ReadonlySet<string> = new Set([
  "conteudo_aluno",
  "conteudos",
  "perfil_fotos",
  "banners_fotos",
]);

const URL_DO_STORAGE = /https?:\/\/[^\s<>"'()[\]]+?\/storage\/v1\/object\/[^\s<>"'()[\]]+/gi;

export type ObjetoPrivado = { url: string; bucket: string; caminho: string };

/** Bucket e caminho de uma URL `public`/`authenticated` de bucket privado; o resto e' null. */
export function objetoPrivadoDaUrl(url: string): ObjetoPrivado | null {
  const achado = /\/storage\/v1\/object\/(public|authenticated)\/([^/?#]+)\/([^?#]+)/i.exec(url);
  if (!achado) return null;
  const bucket = achado[2];
  if (!BUCKETS_PRIVADOS.has(bucket)) return null;
  let caminho = achado[3];
  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    /* fica como veio */
  }
  return caminho ? { url, bucket, caminho } : null;
}

/** Objetos (unicos, na ordem do texto) que precisam ser assinados. */
export function objetosPrivadosNoTexto(texto: string | null | undefined): ObjetoPrivado[] {
  if (!texto) return [];
  const vistos = new Map<string, ObjetoPrivado>();
  for (const bruta of texto.match(URL_DO_STORAGE) ?? []) {
    const url = bruta.replace(/[.,;:!?]+$/, "");
    const objeto = objetoPrivadoDaUrl(url);
    if (objeto && !vistos.has(url)) vistos.set(url, objeto);
  }
  return [...vistos.values()];
}

/** Troca cada URL privada pela assinada; a que nao assinar fica como esta'. */
export async function assinarUrlsDoStorageNoTexto(
  texto: string,
  assinar: (objeto: ObjetoPrivado) => Promise<string | null | undefined>,
): Promise<string> {
  const objetos = objetosPrivadosNoTexto(texto);
  if (!objetos.length) return texto;
  const assinadas = await Promise.all(
    objetos.map(async (o) => {
      try {
        return (await assinar(o)) || null;
      } catch {
        return null;
      }
    }),
  );
  const troca = new Map(objetos.map((o, i) => [o.url, assinadas[i]] as const));
  // Uma passada so', pela mesma regex que achou: uma URL que e' prefixo de
  // outra (ou que reaparece dentro da assinada) nao estraga a vizinha.
  return texto.replace(URL_DO_STORAGE, (bruta) => {
    const url = bruta.replace(/[.,;:!?]+$/, "");
    return (troca.get(url) || url) + bruta.slice(url.length);
  });
}

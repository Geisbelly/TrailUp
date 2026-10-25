// URLs do Storage DENTRO de texto livre (markdown de conteudo, questao, card,
// material personalizado) - #195.
//
// O fechamento dos buckets (`trailup_fechar_buckets_privados()`, alembic
// 20261024_11) troca, dentro dos textos, `/object/public/<bucket privado>/`
// por `/object/authenticated/<bucket privado>/`. Nenhuma das duas carrega no
// app sem token (a publica da' 400 com o bucket fechado; a autenticada pede o
// Bearer, que uma <Image> nao manda), entao o texto e' assinado NA LEITURA,
// antes de renderizar. Puro: quem assina e' injetado (no app, o
// `resolveSupabaseStorageUrl`), para rodar no harness do `node --test`.

import { exigeAssinatura, parseSupabaseStorageUrl } from "./storageUrlShape";

// Para no que nao cabe numa URL dentro de markdown/HTML: espaco, aspas,
// `<>`, e o `)` que fecha `![alt](url)`.
const URL_DO_STORAGE = /https?:\/\/[^\s<>"'()[\]]+?\/storage\/v1\/object\/[^\s<>"'()[\]]+/gi;

/** URLs (unicas, na ordem em que aparecem) de bucket privado que o app precisa assinar. */
export function urlsDoStorageQueExigemAssinatura(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const vistas = new Set<string>();
  for (const bruta of texto.match(URL_DO_STORAGE) ?? []) {
    // Pontuacao colada no fim de uma URL solta numa frase nao e' da URL.
    const url = bruta.replace(/[.,;:!?]+$/, "");
    const parsed = parseSupabaseStorageUrl(url);
    if (parsed && exigeAssinatura(parsed)) vistas.add(url);
  }
  return [...vistas];
}

/**
 * Troca cada URL de bucket privado pela assinada. A que nao assinar fica como
 * esta' (imagem quebrada, mas o resto do texto aparece).
 */
export async function assinarUrlsDoStorageNoTexto(
  texto: string,
  assinar: (url: string) => Promise<string | null | undefined>,
): Promise<string> {
  const urls = urlsDoStorageQueExigemAssinatura(texto);
  if (!urls.length) return texto;
  const assinadas = await Promise.all(
    urls.map(async (url) => {
      try {
        return (await assinar(url)) || null;
      } catch {
        return null;
      }
    }),
  );
  const troca = new Map(urls.map((url, i) => [url, assinadas[i]] as const));
  // Uma passada so', pela mesma regex que achou: uma URL que e' prefixo de
  // outra (ou que reaparece dentro da assinada) nao estraga a vizinha.
  return texto.replace(URL_DO_STORAGE, (bruta) => {
    const url = bruta.replace(/[.,;:!?]+$/, "");
    return (troca.get(url) || url) + bruta.slice(url.length);
  });
}

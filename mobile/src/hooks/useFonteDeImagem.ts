import { useEffect, useState } from "react";
import type { ImageSourcePropType } from "react-native";

import { supabase } from "@/database/supabase";
import { refDeImagem } from "@/utils/fotoPerfil";
import { resolverUrlDeImagem, urlDeImagemEmCache, type AssinadorDeImagem } from "@/utils/imagemPrivada";

const assinarNoStorage: AssinadorDeImagem = async (bucket, caminho, segundos) => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, segundos);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

function uriDe(source: ImageSourcePropType | null | undefined): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const uri = (source as { uri?: unknown }).uri;
  return typeof uri === "string" ? uri : null;
}

/**
 * Fonte de imagem pronta para o <Image>: troca a foto/banner privado
 * (`perfil_fotos`/`banners_fotos`, #195) por uma URL assinada curta. Enquanto
 * assina (ou se falhar), devolve undefined, e quem chama mostra o padrao.
 * Qualquer outra fonte (asset, arquivo local, URL externa) passa como veio.
 */
export function useFonteDeImagem(
  source: ImageSourcePropType | null | undefined,
): ImageSourcePropType | undefined {
  const uri = uriDe(source);
  const ehRef = uri ? refDeImagem(uri) !== null : false;
  const [resolvida, setResolvida] = useState<{ de: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!uri || !ehRef) return;
    let vivo = true;
    void resolverUrlDeImagem(uri, assinarNoStorage).then((url) => {
      if (vivo) setResolvida({ de: uri, url });
    });
    return () => {
      vivo = false;
    };
  }, [uri, ehRef]);

  if (!source) return undefined;
  if (!uri || !ehRef) return source;
  const url = urlDeImagemEmCache(uri) ?? (resolvida?.de === uri ? resolvida.url : null);
  return url ? { ...(source as object), uri: url } : undefined;
}

/** Atalho para um valor de `foto_url`/`banner_url` (string) direto. */
export function useUrlDeImagem(valor: string | null | undefined): string | null {
  const fonte = useFonteDeImagem(valor ? { uri: valor } : undefined);
  return uriDe(fonte);
}

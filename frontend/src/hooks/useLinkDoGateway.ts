import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { caminhoParaAssinar, criarAssinador, type RespostaDeLinks } from "@/lib/linkDoGateway";

// Um assinador para o console inteiro: o cache de links vale entre telas.
// `functions.invoke` manda o JWT da sessao no Authorization, que e' o que o gateway confere.
const assinador = criarAssinador(async (caminhos) => {
  const { data, error } = await supabase.functions.invoke<RespostaDeLinks>("storage-redirect", {
    body: { paths: caminhos },
  });
  if (error || !data) throw error ?? new Error("resposta vazia do gateway");
  return data;
});

export const assinarUrlDoGateway = assinador.assinar;

/**
 * A URL do material pronta para `<audio src>`, `<iframe>`, `fetch` ou link: assinada quando e' do
 * gateway. Enquanto o link do gateway nao chega, `carregando` fica `true` e `url` e' `null`, para o
 * player nao comecar a baixar a URL sem assinatura e trocar no meio.
 */
export function useLinkDoGateway(url: string | null): { url: string | null; carregando: boolean } {
  const precisa = url !== null && caminhoParaAssinar(url) !== null;
  const [assinada, setAssinada] = useState<{ de: string; para: string } | null>(null);

  useEffect(() => {
    if (!url || !precisa) return;
    let vivo = true;
    void assinador.assinar(url).then((para) => {
      if (vivo) setAssinada({ de: url, para });
    });
    return () => {
      vivo = false;
    };
  }, [url, precisa]);

  if (!url) return { url: null, carregando: false };
  if (!precisa) return { url, carregando: false };
  if (assinada?.de === url) return { url: assinada.para, carregando: false };
  return { url: null, carregando: true };
}

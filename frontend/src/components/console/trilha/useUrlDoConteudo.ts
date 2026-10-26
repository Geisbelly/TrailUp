import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { caminhoNoBucketConteudos } from "@/lib/conteudosStorage";

/**
 * URL para EXIBIR um arquivo do bucket `conteudos` (privado): assina o caminho
 * por 1h sob o RLS do bucket. Link externo passa como veio.
 */
export function useUrlDoConteudo(valor: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const caminho = caminhoNoBucketConteudos(valor);
    if (!caminho) {
      setUrl(valor ? String(valor) : null);
      return;
    }
    setUrl(null);
    void supabase.storage
      .from("conteudos")
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => {
        if (ativo) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      ativo = false;
    };
  }, [valor]);

  return url;
}

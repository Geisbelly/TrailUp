import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  officeViewerUrl,
  resolveSourcePreviewKind,
  type SourcePreviewKind,
} from "./sourceFilePreview";

const TEXTO_MAX_CHARS = 20000;

/**
 * Pre-visualizacao do arquivo-fonte dentro do proprio editor de trilha.
 *
 * O card do arquivo so tinha "abrir em nova aba", o que para .pptx/.docx
 * significa BAIXAR - o professor nao conseguia conferir o que subiu sem sair do
 * console e abrir o PowerPoint. Inline (nao modal) de proposito: a conferencia
 * e rapida e acontece no meio da edicao.
 */
export function ContentFilePreview({
  pathOrUrl,
  isStoragePath,
  nome,
}: {
  pathOrUrl: string;
  isStoragePath: boolean;
  nome?: string;
}) {
  const kind: SourcePreviewKind = resolveSourcePreviewKind(nome ?? pathOrUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);

  // URL assinada e temporaria (1h) e so serve enquanto o painel esta aberto -
  // por isso e resolvida aqui, na abertura, e nao guardada com o conteudo.
  useEffect(() => {
    let ativo = true;

    const resolver = async () => {
      if (!isStoragePath) {
        if (ativo) setUrl(pathOrUrl);
        return;
      }
      const { data, error } = await supabase.storage
        .from("conteudos")
        .createSignedUrl(pathOrUrl, 3600);
      if (!ativo) return;
      if (error || !data?.signedUrl) {
        setErro("Não foi possível gerar o link de pré-visualização.");
        return;
      }
      setUrl(data.signedUrl);
    };

    void resolver();
    return () => {
      ativo = false;
    };
  }, [pathOrUrl, isStoragePath]);

  useEffect(() => {
    if (kind !== "texto" || !url) return;
    let ativo = true;

    void (async () => {
      try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(String(resposta.status));
        const conteudo = await resposta.text();
        if (ativo) setTexto(conteudo.slice(0, TEXTO_MAX_CHARS));
      } catch {
        if (ativo) setErro("Não foi possível ler o arquivo de texto.");
      }
    })();

    return () => {
      ativo = false;
    };
  }, [kind, url]);

  if (erro) {
    return <p className="px-3 py-4 text-center text-xs text-destructive">{erro}</p>;
  }

  if (!url) {
    return (
      <p className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Preparando pré-visualização...
      </p>
    );
  }

  const abrirEmNovaAba = (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" asChild>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Abrir em nova aba
        </a>
      </Button>
    </div>
  );

  return (
    <div className="space-y-2 border-t border-border/60 p-3">
      {kind === "pdf" && (
        <iframe src={url} title={`Pré-visualização de ${nome ?? "arquivo"}`} className="h-[55vh] w-full rounded-md border" />
      )}

      {kind === "office" && (
        <iframe
          src={officeViewerUrl(url)}
          title={`Pré-visualização de ${nome ?? "arquivo"}`}
          className="h-[55vh] w-full rounded-md border"
        />
      )}

      {kind === "imagem" && (
        <img
          src={url}
          alt={nome ? `Pré-visualização de ${nome}` : "Pré-visualização do arquivo"}
          className="mx-auto max-h-[55vh] w-auto max-w-full rounded-md border"
        />
      )}

      {kind === "video" && <video src={url} controls className="max-h-[55vh] w-full rounded-md border" />}

      {kind === "audio" && <audio src={url} controls className="w-full" />}

      {kind === "texto" &&
        (texto === null ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Carregando texto...</p>
        ) : (
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs text-foreground">
            {texto}
          </pre>
        ))}

      {kind === "desconhecido" && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Este formato não abre aqui dentro.
        </p>
      )}

      {abrirEmNovaAba}
    </div>
  );
}

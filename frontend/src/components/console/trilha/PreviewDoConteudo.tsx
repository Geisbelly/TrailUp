import { useEffect, useState } from "react";
import { ExternalLink, Globe, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextoRico } from "@/components/textoRico/TextoRico";
import { useUrlDoConteudo } from "./useUrlDoConteudo";
import { videoDoConteudo, type VideoDoConteudo } from "./videoDoConteudo";

/**
 * O conteúdo rodando dentro do editor, sem sair da tela: o vídeo toca aqui, o
 * texto aparece como o aluno lê e o link externo pode ser carregado na página.
 * O arquivo tem a própria pré-visualização em `ContentFileUpload`.
 */

const MOLDURA = "overflow-hidden rounded-[14px] border border-border bg-black";

function ArquivoDeVideo({ url }: { url: string }) {
  const assinada = useUrlDoConteudo(url);
  if (!assinada) {
    return <div role="status" className="console-skeleton aspect-video w-full rounded-[14px]" aria-label="Preparando o vídeo" />;
  }
  return (
    <div className={MOLDURA}>
      <video src={assinada} controls preload="metadata" className="aspect-video w-full" />
    </div>
  );
}

function PlayerEmbutido({ video, titulo }: { video: Exclude<VideoDoConteudo, { tipo: "arquivo" }>; titulo: string }) {
  return (
    <div className={MOLDURA}>
      <iframe
        key={video.embedUrl}
        src={video.embedUrl}
        title={titulo}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        // O YouTube recusa o embed sem referrer (erro 153).
        referrerPolicy="strict-origin-when-cross-origin"
        // Iframe de provedor desconhecido roda isolado: sem navegar o console nem abrir formulário.
        {...(video.tipo === "iframe" ? { sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups" } : {})}
      />
    </div>
  );
}

export function PreviewDoVideo({ valor, titulo }: { valor: string; titulo: string }) {
  const video = videoDoConteudo(valor);
  if (!video) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-muted/30 px-6 text-center">
        <PlayCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {valor.trim()
            ? "Não reconheci este endereço como vídeo. Use um link do YouTube ou do Vimeo, um arquivo .mp4/.webm, ou o código de incorporação (iframe) com https."
            : "Cole o link do vídeo acima para assistir aqui."}
        </p>
      </div>
    );
  }
  if (video.tipo === "arquivo") return <ArquivoDeVideo url={video.url} />;
  return <PlayerEmbutido video={video} titulo={titulo || "Vídeo do conteúdo"} />;
}

export function PreviewDoTexto({ valor }: { valor: string }) {
  if (!valor.trim()) {
    return <p className="rounded-[14px] border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">Nada escrito ainda.</p>;
  }
  return (
    <div className="max-h-[70vh] overflow-auto rounded-[14px] border border-border bg-card p-5" aria-live="polite">
      <TextoRico texto={valor} formato="rico" className="text-sm leading-relaxed" />
    </div>
  );
}

export function PreviewDoLink({ url }: { url: string }) {
  const [carregar, setCarregar] = useState(false);
  // Trocar o link volta ao cartão: não carrega sozinho um site que o professor ainda está digitando.
  useEffect(() => setCarregar(false), [url]);

  let dominio = "";
  try {
    dominio = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const https = /^https:\/\//i.test(url);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-[14px] border bg-muted p-4">
        <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary/20 text-sm font-extrabold uppercase text-primary">{dominio.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{dominio}</p>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {https && (
            <Button type="button" variant="outline" size="sm" className="rounded-full" aria-expanded={carregar} onClick={() => setCarregar((v) => !v)}>
              <Globe className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {carregar ? "Fechar a página" : "Ver a página aqui"}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Nova aba
          </Button>
        </div>
      </div>
      {carregar && (
        <div className="space-y-1.5">
          <iframe
            src={url}
            title={`Página de ${dominio}`}
            className="h-[60vh] w-full rounded-[14px] border border-border bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p className="text-[11.5px] text-muted-foreground">
            Alguns sites não deixam ser abertos dentro de outra página e aparecem em branco aqui. Nesse caso, use “Nova aba”.
          </p>
        </div>
      )}
    </div>
  );
}

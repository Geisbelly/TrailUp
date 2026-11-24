import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Link2, Share2 } from "lucide-react";
import {
  VIDEOS_DA_PESQUISA,
  caminhoDoVideo,
  linkDoArquivo,
  type VideoDaPesquisa,
} from "@/features/pesquisa/videosDaPesquisa";

/** O player. Sem o arquivo no R2 (ou sem rede), troca o player quebrado por um aviso. */
export function PlayerDaPesquisa({ video }: { video: VideoDaPesquisa }) {
  const [falhou, setFalhou] = useState(false);
  const src = linkDoArquivo(video.arquivo);
  if (!src || falhou) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        Este vídeo não carregou agora. Tente de novo mais tarde.
      </div>
    );
  }
  return (
    <video
      className="aspect-video w-full rounded-lg border border-border bg-black"
      controls
      playsInline
      preload="metadata"
      poster={linkDoArquivo(video.poster) ?? undefined}
      src={src}
      onError={() => setFalhou(true)}
      aria-label={video.titulo}
    />
  );
}

/** Compartilha a página do vídeo sozinho: a folha do sistema no celular, o link copiado no resto. */
export function BotaoDeCompartilhar({ video, caminho = caminhoDoVideo(video) }: { video: VideoDaPesquisa; caminho?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [mostrarLink, setMostrarLink] = useState(false);
  const url = `${window.location.origin}${caminho}`;

  async function compartilhar() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${video.titulo} · TrailUp`, url });
        return;
      } catch (erro) {
        // Fechar a folha não é erro; qualquer outra falha cai na cópia do link.
        if (erro instanceof DOMException && erro.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência: o link aparece para copiar à mão.
      setMostrarLink(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" className="journey-button inline-flex" onClick={compartilhar}>
        {copiado ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
        <span aria-live="polite">{copiado ? "Link copiado" : "Compartilhar este vídeo"}</span>
      </button>
      {mostrarLink && (
        <input
          readOnly
          value={url}
          aria-label="Link do vídeo"
          onFocus={e => e.currentTarget.select()}
          className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-center text-sm text-foreground"
        />
      )}
    </div>
  );
}

/**
 * Player, título, descrição e os dois atalhos (compartilhar e abrir só o vídeo). `caminho` é a
 * página própria do vídeo: a da pesquisa na cartilha, `/videos/<slug>` no resto do site.
 */
export function VideoEmDestaque({ video, caminho = caminhoDoVideo(video), as: Tag = "div" }: {
  video: VideoDaPesquisa;
  caminho?: string;
  as?: "div" | "li";
}) {
  return (
    <Tag className="mx-auto w-full max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4 text-center sm:p-6">
      <PlayerDaPesquisa video={video} />
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {video.papel} · {video.duracao}
        </p>
        <h3 className="text-lg font-semibold text-foreground">{video.titulo}</h3>
        <p className="text-sm">{video.descricao}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <BotaoDeCompartilhar video={video} caminho={caminho} />
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline" to={caminho}>
          <Link2 size={16} aria-hidden="true" /> Abrir só este vídeo
        </Link>
      </div>
    </Tag>
  );
}

/** A seção da cartilha. Sem a URL do projeto no build, some inteira. */
export function VideosDaCartilha() {
  if (!linkDoArquivo(VIDEOS_DA_PESQUISA[0].arquivo)) return null;
  return (
    <ul className="space-y-6">
      {VIDEOS_DA_PESQUISA.map(video => (
        <VideoEmDestaque key={video.slug} video={video} as="li" />
      ))}
    </ul>
  );
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Info, Link2, Play, Share2 } from "lucide-react";
import {
  VIDEOS_DA_PESQUISA,
  caminhoDoVideo,
  linkDoArquivo,
  type VideoDaPesquisa,
} from "@/features/pesquisa/videosDaPesquisa";

/**
 * O player, numa moldura no estilo das capas. Antes do play, a capa fica sozinha com um botão
 * próprio no centro; os controles do navegador só entram quando o vídeo começa. Sem o arquivo no
 * R2 (ou sem rede), a capa continua na moldura com um aviso no lugar do botão.
 */
export function PlayerDaPesquisa({ video }: { video: VideoDaPesquisa }) {
  const [falhou, setFalhou] = useState(false);
  const [tocando, setTocando] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const src = linkDoArquivo(video.arquivo);
  const capa = linkDoArquivo(video.poster) ?? undefined;

  if (!src || falhou) {
    return (
      <div className="video-moldura">
        <div className="video-tela video-sem-arquivo" style={capa ? { backgroundImage: `url("${capa}")` } : undefined}>
          <p role="status">Este vídeo não carregou agora. Tente de novo mais tarde.</p>
        </div>
      </div>
    );
  }

  function assistir() {
    setTocando(true);
    const elemento = player.current;
    if (!elemento) return;
    void elemento.play().catch(() => undefined);
    elemento.focus();
  }

  return (
    <div className="video-moldura">
      <div className="video-tela">
        <video
          ref={player}
          controls={tocando}
          playsInline
          preload="metadata"
          poster={capa}
          src={src}
          onPlay={() => setTocando(true)}
          onError={() => setFalhou(true)}
          aria-label={video.titulo}
        />
        {!tocando && (
          <button type="button" className="video-play" onClick={assistir}>
            <span className="video-play-icone" aria-hidden="true"><Play size={30} fill="currentColor" /></span>
            <span className="video-play-rotulo">Assistir<span className="sr-only">: {video.titulo}</span> · {video.duracao}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Correção de um vídeo ou do PDF já gerado, sem regravar. */
export function AvisoDeCorrecao({ children, centralizado = true }: { children: string; centralizado?: boolean }) {
  return (
    <p role="note" className={`${centralizado ? "mx-auto " : ""}flex max-w-xl items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-left text-sm text-foreground`}>
      <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </p>
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
      <button type="button" className="journey-button journey-button-small" onClick={compartilhar}>
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
 * Player, título, descrição e os dois atalhos (compartilhar e abrir só o vídeo), tudo centralizado.
 * `caminho` é a página própria do vídeo: a da pesquisa na cartilha, `/videos/<slug>` no resto do site.
 */
export function VideoEmDestaque({ video, caminho = caminhoDoVideo(video), as: Tag = "div" }: {
  video: VideoDaPesquisa;
  caminho?: string;
  as?: "div" | "li";
}) {
  return (
    <Tag className="video-cena">
      <PlayerDaPesquisa video={video} />
      <div className="video-legenda">
        <p className="journey-eyebrow"><span aria-hidden="true" />{video.papel} · {video.duracao}<span aria-hidden="true" /></p>
        <h3>{video.titulo}</h3>
        <p className="video-descricao">{video.descricao}</p>
        {video.aviso && <AvisoDeCorrecao>{video.aviso}</AvisoDeCorrecao>}
        <div className="video-acoes">
          <BotaoDeCompartilhar video={video} caminho={caminho} />
          <Link className="journey-link" to={caminho}>
            <Link2 size={16} aria-hidden="true" /> Abrir só este vídeo
          </Link>
        </div>
      </div>
    </Tag>
  );
}

/** A seção da cartilha. Sem a URL do projeto no build, some inteira. */
export function VideosDaCartilha() {
  if (!linkDoArquivo(VIDEOS_DA_PESQUISA[0].arquivo)) return null;
  return (
    <ul className="video-lista">
      {VIDEOS_DA_PESQUISA.map(video => (
        <VideoEmDestaque key={video.slug} video={video} as="li" />
      ))}
    </ul>
  );
}

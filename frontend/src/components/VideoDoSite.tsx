import { VideoEmDestaque } from "@/components/pesquisa/VideosDaPesquisa";
import { caminhoDoVideoNoSite, linkDoArquivo, videoPorSlug } from "@/features/pesquisa/videosDaPesquisa";

/**
 * Um vídeo do TrailUp numa página do site (início, Sobre, Download, Diário), com a página própria em
 * `/videos/<slug>`. Sem o projeto no build ou com slug desconhecido, não desenha nada.
 */
export default function VideoDoSite({ slug }: { slug: string }) {
  const video = videoPorSlug(slug);
  if (!video || !linkDoArquivo(video.arquivo)) return null;
  return <VideoEmDestaque video={video} caminho={caminhoDoVideoNoSite(video)} />;
}

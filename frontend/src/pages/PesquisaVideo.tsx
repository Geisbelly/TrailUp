import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { AvisoDeCorrecao, BotaoDeCompartilhar, PlayerDaPesquisa } from "@/components/pesquisa/VideosDaPesquisa";
import { CAMINHO_DA_CARTILHA } from "@/features/pesquisa/pesquisaProfessores";
import { VIDEOS_DA_PESQUISA, caminhoDoVideo, caminhoDoVideoNoSite, videoPorSlug } from "@/features/pesquisa/videosDaPesquisa";

/**
 * Um vídeo sozinho, para compartilhar. Na pesquisa (`/pesquisa/professores/videos/<slug>`) aponta de
 * volta para a cartilha; no resto do site (`/videos/<slug>`, `noSite`), para o início.
 */
export default function PesquisaVideo({ noSite = false }: { noSite?: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const video = videoPorSlug(slug);
  const caminho = noSite ? caminhoDoVideoNoSite : caminhoDoVideo;
  const eyebrow = noSite ? "TrailUp em vídeo" : "Pesquisa TrailUp";

  if (!video) {
    return (
      <PublicLayout>
        <div className="public-article">
          <PublicPageTitle title="Vídeo não encontrado" eyebrow={eyebrow}>
            Este endereço não corresponde a nenhum vídeo do TrailUp.
          </PublicPageTitle>
          <ul className="space-y-2">
            {VIDEOS_DA_PESQUISA.map(v => (
              <li key={v.slug}>
                <Link className="font-semibold text-primary underline-offset-4 hover:underline" to={caminho(v)}>
                  {v.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="public-article">
        <PublicPageTitle title={video.titulo} eyebrow={`${eyebrow} · ${video.papel}`}>
          {video.descricao}
        </PublicPageTitle>
        <div className="space-y-6">
          <PlayerDaPesquisa key={video.slug} video={video} />
          <p className="text-center text-sm text-muted-foreground">Duração: {video.duracao}.</p>
          {video.aviso && <AvisoDeCorrecao>{video.aviso}</AvisoDeCorrecao>}
          <div className="flex flex-wrap items-start justify-center gap-4">
            <BotaoDeCompartilhar video={video} caminho={caminho(video)} />
            {noSite ? (
              <Link className="journey-button journey-button-coral inline-flex" to="/">
                <ArrowLeft size={18} aria-hidden="true" /> Conhecer o TrailUp
              </Link>
            ) : (
              <Link className="journey-button journey-button-coral inline-flex" to={`${CAMINHO_DA_CARTILHA}#videos`}>
                <ArrowLeft size={18} aria-hidden="true" /> Ver a cartilha da pesquisa
              </Link>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

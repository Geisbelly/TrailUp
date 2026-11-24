import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { BotaoDeCompartilhar, PlayerDaPesquisa } from "@/components/pesquisa/VideosDaPesquisa";
import { CAMINHO_DA_CARTILHA } from "@/features/pesquisa/pesquisaProfessores";
import { VIDEOS_DA_PESQUISA, caminhoDoVideo, videoPorSlug } from "@/features/pesquisa/videosDaPesquisa";

/** Um vídeo da pesquisa sozinho, para compartilhar sem a cartilha inteira. */
export default function PesquisaVideo() {
  const { slug } = useParams<{ slug: string }>();
  const video = videoPorSlug(slug);

  if (!video) {
    return (
      <PublicLayout>
        <div className="public-article">
          <PublicPageTitle title="Vídeo não encontrado" eyebrow="Pesquisa TrailUp">
            Este endereço não corresponde a nenhum vídeo da pesquisa.
          </PublicPageTitle>
          <ul className="space-y-2">
            {VIDEOS_DA_PESQUISA.map(v => (
              <li key={v.slug}>
                <Link className="font-semibold text-primary underline-offset-4 hover:underline" to={caminhoDoVideo(v)}>
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
        <PublicPageTitle title={video.titulo} eyebrow={`Pesquisa TrailUp · ${video.papel}`}>
          {video.descricao}
        </PublicPageTitle>
        <div className="space-y-6">
          <PlayerDaPesquisa key={video.slug} video={video} />
          <p className="text-sm text-muted-foreground">Duração: {video.duracao}.</p>
          <div className="flex flex-wrap items-start gap-4">
            <BotaoDeCompartilhar video={video} />
            <Link className="journey-button journey-button-coral inline-flex" to={`${CAMINHO_DA_CARTILHA}#videos`}>
              <ArrowLeft size={18} aria-hidden="true" /> Ver a cartilha da pesquisa
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

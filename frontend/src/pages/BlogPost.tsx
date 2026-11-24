import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/PublicLayout";
import VideoDoSite from "@/components/VideoDoSite";
import { VIDEO_DO_ARTIGO } from "@/features/pesquisa/videosDaPesquisa";
import { BLOG_CONTENT } from "@/features/diario/artigosDoDiario";

// Divide o texto em partes normais, negrito (**assim**), italico (*assim*) e link interno
// ([texto](/caminho) ou [texto](https://...), este numa aba nova), sem alterar o markdown de origem.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:\/|https:\/\/)[^)]*\))/g);
  return parts.map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(((?:\/|https:\/\/)[^)]*)\)$/);
    if (link && link[2].startsWith("/")) {
      return <Link key={i} to={link[2]} className="text-primary underline-offset-4 hover:underline">{link[1]}</Link>;
    }
    if (link) {
      return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">{link[1]}</a>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const post = id ? BLOG_CONTENT[id] : null;

  if (!post) {
    return (
      <PublicLayout>
        <div className="public-empty">
          <h1 className="text-4xl font-bold mb-4">Artigo não encontrado</h1>
          <Button asChild><Link to="/blog"><ArrowLeft size={16} className="mr-2" />Voltar ao Diário</Link></Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <article className="public-article">
        <div>
            <Button asChild variant="ghost" className="mb-8 gap-2"><Link to="/blog">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Diário
            </Link></Button>

          <div className="space-y-6">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">
                {post.category}
              </span>
              <span>{new Date(`${post.date}T12:00:00`).toLocaleDateString('pt-BR')}</span>
            </div>

            <h1>
              {post.title}
            </h1>

            <div className="prose prose-invert prose-lg max-w-none">
              {post.content
                .split('\n')
                // A primeira linha do conteudo repete o titulo (ja exibido acima); evita duplicar.
                .filter((paragraph, index) => !(index === 0 && paragraph.trim() === '') && !(paragraph.startsWith('# ') && paragraph.slice(2).trim() === post.title.trim()))
                .map((paragraph, index) => {
                if (paragraph.startsWith('# ')) {
                  return <h1 key={index} className="text-3xl font-bold mt-8 mb-4">{renderInline(paragraph.slice(2))}</h1>;
                }
                if (paragraph.startsWith('## ')) {
                  return <h2 key={index} className="text-2xl font-bold mt-6 mb-3 text-primary">{renderInline(paragraph.slice(3))}</h2>;
                }
                if (paragraph.startsWith('### ')) {
                  return <h3 key={index} className="text-xl font-semibold mt-4 mb-2">{renderInline(paragraph.slice(4))}</h3>;
                }
                if (paragraph.startsWith('- ')) {
                  return <li key={index} className="ml-6 list-disc">{renderInline(paragraph.slice(2))}</li>;
                }
                const orderedMatch = paragraph.match(/^(\d+)\.\s+(.*)$/);
                if (orderedMatch) {
                  // Numero exibido como texto (nao via CSS list-style) para nao herdar a
                  // contagem das listas com marcador (bullet) anteriores no mesmo fluxo.
                  return (
                    <li key={index} className="ml-6 list-none">
                      {orderedMatch[1]}. {renderInline(orderedMatch[2])}
                    </li>
                  );
                }
                if (paragraph.trim() === '---') {
                  return <hr key={index} className="my-6 border-border" />;
                }
                if (paragraph.trim() === '') {
                  return <br key={index} />;
                }
                return <p key={index} className="text-muted-foreground leading-relaxed mb-4">{renderInline(paragraph)}</p>;
              })}
            </div>

            {id && VIDEO_DO_ARTIGO[id] && (
              <section className="mt-12 space-y-4" aria-labelledby="video-do-artigo">
                <h2 id="video-do-artigo" className="text-center text-2xl font-bold text-primary">Veja em vídeo</h2>
                <VideoDoSite slug={VIDEO_DO_ARTIGO[id]} />
              </section>
            )}
          </div>
        </div>
      </article>

    </PublicLayout>
  );
};

export default BlogPost;

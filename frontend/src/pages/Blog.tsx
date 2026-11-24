import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock, PlayCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART, PROFILE_WORLDS } from "@/lib/design-art";
import { VIDEO_DO_ARTIGO } from "@/features/pesquisa/videosDaPesquisa";
import { BLOG_POSTS } from "@/features/diario/artigosDoDiario";

/** Arte de cada artigo que não é de perfil (os de perfil usam o emblema do perfil). */
const ARTE_DO_ARTIGO: Record<string, string> = {
  "o-que-e-o-trailup": DESIGN_ART.star,
  "como-o-material-e-personalizado": DESIGN_ART.chest,
  "dados-e-privacidade": DESIGN_ART.book,
  "primeiros-passos-no-app": DESIGN_ART.map,
  "guia-do-console": DESIGN_ART.compass,
  "avaliar-o-trailup": DESIGN_ART.trophy,
  "pesquisa-tcc": DESIGN_ART.book,
  "artigos-da-pesquisa": DESIGN_ART.community,
  brainhex: DESIGN_ART.compass,
};
const CATEGORIES = ["Todos", ...new Set(BLOG_POSTS.map(post => post.category))];

export default function Blog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const filteredPosts = useMemo(() => BLOG_POSTS.filter(post => (
    (post.title.toLowerCase().includes(searchTerm.toLowerCase()) || post.excerpt.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (selectedCategory === "Todos" || post.category === selectedCategory)
  )), [searchTerm, selectedCategory]);

  return (
    <PublicLayout scene={DESIGN_ART.landscape}>
      <PublicPageTitle title="Diário do TrailUp" eyebrow="Artigos">Guias de uso, os sete perfis do BrainHex e a pesquisa por trás do TrailUp.</PublicPageTitle>
      <div className="public-toolbar">
        <div className="public-search"><Search size={18} /><Input aria-label="Buscar artigos" placeholder="Buscar artigos..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></div>
        <div className="public-filters" role="group" aria-label="Categoria do artigo">{CATEGORIES.map(category => <button type="button" key={category} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>{category}</button>)}</div>
      </div>
      {filteredPosts.length ? <div className="public-posts">{filteredPosts.map(post => {
        const emblem = PROFILE_WORLDS.find(profile => profile.key === post.id)?.emblem ?? ARTE_DO_ARTIGO[post.id] ?? DESIGN_ART.book;
        return <Link to={`/blog/${post.id}`} className="public-post" key={post.id}>
          <img className="public-post-emblem" src={emblem} alt="" width="52" height="52" loading="lazy" />
          <span className="journey-eyebrow">{post.category}</span><h2>{post.title}</h2><p>{post.excerpt}</p>
          <div className="public-post-meta"><span><Calendar size={13} />{new Date(`${post.date}T12:00:00`).toLocaleDateString("pt-BR")}</span><span><Clock size={13} />{post.readTime}</span>{VIDEO_DO_ARTIGO[post.id] && <span><PlayCircle size={13} />Com vídeo</span>}<ArrowRight size={16} className="ml-auto text-primary" /></div>
        </Link>;
      })}</div> : <div className="public-empty"><h2>Nenhum artigo encontrado</h2><p>Tente ajustar sua busca ou filtros.</p><button type="button" className="journey-link" onClick={() => { setSearchTerm(""); setSelectedCategory("Todos"); }}>Limpar filtros</button></div>}
    </PublicLayout>
  );
}

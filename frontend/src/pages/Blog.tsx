import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART, PROFILE_WORLDS } from "@/lib/design-art";

const BLOG_POSTS = [
  { id: "brainhex", title: "O que é o BrainHex?", excerpt: "Entenda o modelo de perfis de jogadores e como ele pode transformar seu aprendizado.", category: "Metodologia", date: "2025-01-15", readTime: "5 min" },
  { id: "seeker", title: "Perfil Seeker: O Explorador", excerpt: "Descubra as características do perfil explorador e como otimizar seu aprendizado.", category: "Perfis BrainHex", date: "2025-01-14", readTime: "4 min" },
  { id: "survivor", title: "Perfil Survivor: O Desafiador", excerpt: "Aprenda sobre o perfil que busca desafios intensos e pressão.", category: "Perfis BrainHex", date: "2025-01-13", readTime: "4 min" },
  { id: "daredevil", title: "Perfil Daredevil: O Aventureiro", excerpt: "Conheça o perfil que adora tomar riscos e experimentar.", category: "Perfis BrainHex", date: "2025-01-12", readTime: "3 min" },
  { id: "mastermind", title: "Perfil Mastermind: O Estrategista", excerpt: "Descubra como o pensamento estratégico define este perfil.", category: "Perfis BrainHex", date: "2025-01-11", readTime: "6 min" },
  { id: "conqueror", title: "Perfil Conqueror: O Competidor", excerpt: "Entenda a motivação competitiva e como ela impulsiona o aprendizado.", category: "Perfis BrainHex", date: "2025-01-10", readTime: "5 min" },
  { id: "socializer", title: "Perfil Socializer: O Colaborador", excerpt: "Saiba como a interação social potencializa o aprendizado.", category: "Perfis BrainHex", date: "2025-01-09", readTime: "4 min" },
  { id: "achiever", title: "Perfil Achiever: O Completionista", excerpt: "Conheça o perfil motivado por conquistas e objetivos completos.", category: "Perfis BrainHex", date: "2025-01-08", readTime: "5 min" },
  { id: "pesquisa-tcc", title: "Pesquisa Acadêmica: TrailUp", excerpt: "Conheça a pesquisa de TCC que fundamenta o desenvolvimento do TrailUp.", category: "Pesquisa", date: "2025-01-07", readTime: "10 min" },
];
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
      <PublicPageTitle title="Blog TrailUp" eyebrow="Diário da jornada">Perfis BrainHex, formas de aprender e a ciência por trás de cada descoberta.</PublicPageTitle>
      <div className="public-toolbar">
        <div className="public-search"><Search size={18} /><Input aria-label="Buscar artigos" placeholder="Buscar artigos..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></div>
        <div className="public-filters" role="group" aria-label="Categoria do artigo">{CATEGORIES.map(category => <button type="button" key={category} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>{category}</button>)}</div>
      </div>
      {filteredPosts.length ? <div className="public-posts">{filteredPosts.map(post => {
        const emblem = PROFILE_WORLDS.find(profile => profile.key === post.id)?.emblem ?? (post.id === "brainhex" ? DESIGN_ART.compass : DESIGN_ART.book);
        return <Link to={`/blog/${post.id}`} className="public-post" key={post.id}>
          <img className="public-post-emblem" src={emblem} alt="" width="52" height="52" loading="lazy" />
          <span className="journey-eyebrow">{post.category}</span><h2>{post.title}</h2><p>{post.excerpt}</p>
          <div className="public-post-meta"><span><Calendar size={13} />{new Date(`${post.date}T12:00:00`).toLocaleDateString("pt-BR")}</span><span><Clock size={13} />{post.readTime}</span><ArrowRight size={16} className="ml-auto text-primary" /></div>
        </Link>;
      })}</div> : <div className="public-empty"><h2>Nenhum artigo encontrado</h2><p>Tente ajustar sua busca ou filtros.</p><button type="button" className="journey-link" onClick={() => { setSearchTerm(""); setSelectedCategory("Todos"); }}>Limpar filtros</button></div>}
    </PublicLayout>
  );
}

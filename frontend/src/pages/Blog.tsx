import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART, PROFILE_WORLDS } from "@/lib/design-art";

const BLOG_POSTS = [
  { id: "pesquisa-tcc", title: "A pesquisa por trás do TrailUp", excerpt: "De onde o TrailUp veio, o que ele faz e em que fase a pesquisa está.", category: "Pesquisa", date: "2026-11-23", readTime: "4 min" },
  { id: "brainhex", title: "O que é o BrainHex?", excerpt: "Os sete perfis de jogador e como o TrailUp usa cada um para contar o mesmo conteúdo de jeitos diferentes.", category: "Metodologia", date: "2026-11-23", readTime: "4 min" },
  { id: "seeker", title: "Perfil Explorador (Seeker)", excerpt: "Para quem aprende descobrindo, uma pergunta puxando a outra.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "survivor", title: "Perfil Sobrevivente (Survivor)", excerpt: "Para quem encara o difícil com preparo e um plano para atravessar.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "daredevil", title: "Perfil Aventureiro (Daredevil)", excerpt: "Para quem aprende fazendo, tentando e ajustando no caminho.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "mastermind", title: "Perfil Estrategista (Mastermind)", excerpt: "Para quem quer entender o porquê antes de agir.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "conqueror", title: "Perfil Conquistador (Conqueror)", excerpt: "Para quem gosta de metas claras e de superar a própria marca.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "socializer", title: "Perfil Socializador (Socializer)", excerpt: "Para quem aprende trocando ideias e construindo junto.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "achiever", title: "Perfil Realizador (Achiever)", excerpt: "Para quem gosta de ver o progresso andar e de fechar cada etapa.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
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
      <PublicPageTitle title="Diário do TrailUp" eyebrow="Artigos">Os sete perfis do BrainHex, jeitos de estudar e a pesquisa por trás do TrailUp.</PublicPageTitle>
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

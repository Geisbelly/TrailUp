import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock, PlayCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART, PROFILE_WORLDS } from "@/lib/design-art";
import { VIDEO_DO_ARTIGO } from "@/features/pesquisa/videosDaPesquisa";

const BLOG_POSTS = [
  { id: "o-que-e-o-trailup", title: "O que é o TrailUp", excerpt: "O app do aluno, o console do professor e o que muda de um aluno para outro.", category: "TrailUp", date: "2026-11-23", readTime: "3 min" },
  { id: "como-o-material-e-personalizado", title: "Como o material é personalizado", excerpt: "As duas camadas da personalização e onde o professor entra.", category: "TrailUp", date: "2026-11-23", readTime: "3 min" },
  { id: "dados-e-privacidade", title: "Seus dados no TrailUp", excerpt: "O que o app guarda, o que é opcional e o que o professor vê.", category: "TrailUp", date: "2026-11-23", readTime: "3 min" },
  { id: "primeiros-passos-no-app", title: "Primeiros passos no app do aluno", excerpt: "Do cadastro à trilha introdutória, com o vídeo do primeiro acesso.", category: "Guias", date: "2026-11-23", readTime: "3 min" },
  { id: "guia-do-console", title: "O console do professor, aba por aba", excerpt: "Turmas, trilhas, personalizações, missões, notas e a Visão geral, com o guia em vídeo.", category: "Guias", date: "2026-11-23", readTime: "5 min" },
  { id: "avaliar-o-trailup", title: "Como avaliar o TrailUp na pesquisa com professores", excerpt: "Quem pode participar, as três fases, o roteiro e o tempo, com o passo a passo em vídeo.", category: "Pesquisa", date: "2026-11-23", readTime: "3 min" },
  { id: "pesquisa-tcc", title: "A pesquisa por trás do TrailUp", excerpt: "De onde o TrailUp veio e em que fase a pesquisa está.", category: "Pesquisa", date: "2026-11-23", readTime: "4 min" },
  { id: "artigos-da-pesquisa", title: "Os artigos da pesquisa", excerpt: "Os dois resumos expandidos preparados para a JIC 2026 e o que cada um investigou.", category: "Pesquisa", date: "2026-11-23", readTime: "4 min" },
  { id: "brainhex", title: "O que é o BrainHex?", excerpt: "Os sete perfis de jogador e como o TrailUp usa cada um para contar o mesmo conteúdo de jeitos diferentes.", category: "Metodologia", date: "2026-11-23", readTime: "4 min" },
  { id: "seeker", title: "Perfil Explorador (Seeker)", excerpt: "Para quem aprende descobrindo, uma pergunta puxando a outra.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "survivor", title: "Perfil Sobrevivente (Survivor)", excerpt: "Para quem encara o difícil com preparo e um plano para atravessar.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "daredevil", title: "Perfil Aventureiro (Daredevil)", excerpt: "Para quem aprende fazendo, tentando e ajustando no caminho.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "mastermind", title: "Perfil Estrategista (Mastermind)", excerpt: "Para quem quer entender o porquê antes de agir.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "conqueror", title: "Perfil Conquistador (Conqueror)", excerpt: "Para quem gosta de metas claras e de superar a própria marca.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "socializer", title: "Perfil Socializador (Socializer)", excerpt: "Para quem aprende trocando ideias e construindo junto.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "achiever", title: "Perfil Realizador (Achiever)", excerpt: "Para quem gosta de ver o progresso andar e de fechar cada etapa.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
];
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

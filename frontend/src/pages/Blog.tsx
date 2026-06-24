import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// PARA SEU PROJETO: Descomente a linha abaixo e remova o Footer local
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { 
  Hexagon, Calendar, Clock, ArrowRight, Search, 
  BookOpen, Filter, 
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";


// --- FIM FOOTER LOCAL ---

const BLOG_POSTS = [
  {
    id: "brainhex",
    title: "O que é o BrainHex?",
    excerpt: "Entenda o modelo de perfis de jogadores e como ele pode transformar seu aprendizado.",
    category: "Metodologia",
    date: "2025-01-15",
    readTime: "5 min",
  },
  {
    id: "seeker",
    title: "Perfil Seeker: O Explorador",
    excerpt: "Descubra as características do perfil explorador e como otimizar seu aprendizado.",
    category: "Perfis BrainHex",
    date: "2025-01-14",
    readTime: "4 min",
  },
  {
    id: "survivor",
    title: "Perfil Survivor: O Desafiador",
    excerpt: "Aprenda sobre o perfil que busca desafios intensos e pressão.",
    category: "Perfis BrainHex",
    date: "2025-01-13",
    readTime: "4 min",
  },
  {
    id: "daredevil",
    title: "Perfil Daredevil: O Aventureiro",
    excerpt: "Conheça o perfil que adora tomar riscos e experimentar.",
    category: "Perfis BrainHex",
    date: "2025-01-12",
    readTime: "3 min",
  },
  {
    id: "mastermind",
    title: "Perfil Mastermind: O Estrategista",
    excerpt: "Descubra como o pensamento estratégico define este perfil.",
    category: "Perfis BrainHex",
    date: "2025-01-11",
    readTime: "6 min",
  },
  {
    id: "conqueror",
    title: "Perfil Conqueror: O Competidor",
    excerpt: "Entenda a motivação competitiva e como ela impulsiona o aprendizado.",
    category: "Perfis BrainHex",
    date: "2025-01-10",
    readTime: "5 min",
  },
  {
    id: "socialiser",
    title: "Perfil Socialiser: O Colaborador",
    excerpt: "Saiba como a interação social potencializa o aprendizado.",
    category: "Perfis BrainHex",
    date: "2025-01-09",
    readTime: "4 min",
  },
  {
    id: "achiever",
    title: "Perfil Achiever: O Completionista",
    excerpt: "Conheça o perfil motivado por conquistas e objetivos completos.",
    category: "Perfis BrainHex",
    date: "2025-01-08",
    readTime: "5 min",
  },
  {
    id: "pesquisa-tcc",
    title: "Pesquisa Acadêmica: TrailUp",
    excerpt: "Conheça a pesquisa de TCC que fundamenta o desenvolvimento do TrailUp.",
    category: "Pesquisa",
    date: "2025-01-07",
    readTime: "10 min",
  },
];

const CATEGORIES = ["Todos", ...Array.from(new Set(BLOG_POSTS.map(p => p.category)))];

const Blog = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");

  const filteredPosts = useMemo(() => {
    return BLOG_POSTS.filter(post => {
      const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            post.excerpt.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "Todos" || post.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      
      {/* Header (Original Style) */}
      <Header />
 

      {/* Hero Section (Original Style + Improved Typography) */}
      <section className="py-20 px-4 relative overflow-hidden">
        {/* Glow effect sutil */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
        
        
        <div className="container mx-auto text-center relative z-10">
          <div className="inline-flex items-center justify-center px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium uppercase tracking-wider mb-4">
              <Sparkles className="w-3 h-3 mr-2" />
              Central de Conhecimento
            </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-purple-500 to-primary bg-clip-text text-transparent animate-in fade-in slide-in-from-bottom-4 duration-700">
            Blog TrailUp
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Explore os perfis BrainHex, metodologias de aprendizado e a ciência por trás da gamificação educacional.
          </p>

          {/* Search & Filter Toolbar (New UX Feature within Old Style) */}
          <div className="flex flex-col md:flex-row gap-4 justify-center items-center max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 delay-100 duration-700">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar artigos..." 
                className="pl-10 bg-card/50 backdrop-blur border-primary/20 focus:border-primary transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
              {CATEGORIES.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  onClick={() => setSelectedCategory(cat)}
                  size="sm"
                  className={cn(
                    "rounded-full whitespace-nowrap",
                    selectedCategory === cat ? "bg-primary text-primary-foreground" : "border-primary/20 text-muted-foreground hover:text-primary hover:border-primary/50"
                  )}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="py-8 px-4 pb-20">
        <div className="container mx-auto">
          {filteredPosts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post, idx) => (
                <Link key={post.id} to={`/blog/${post.id}`} className="group h-full">
                  <Card 
                    className="h-full p-6 border-primary/20 bg-card/50 backdrop-blur hover:border-primary transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5 cursor-pointer flex flex-col animate-in fade-in zoom-in-95"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="space-y-4 flex-1">
                      <div className="flex justify-between items-start">
                        <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
                          {post.category}
                        </span>
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors leading-tight">
                          {post.title}
                        </h3>
                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                          {post.excerpt}
                        </p>
                      </div>
                    </div>

                    <div className="pt-6 mt-6 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex gap-4">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(post.date).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {post.readTime}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-primary font-medium opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                        Ler artigo <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 animate-in fade-in">
              <div className="inline-flex items-center justify-center p-4 rounded-full bg-muted/30 border border-border mb-4">
                <BookOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">Nenhum artigo encontrado</h3>
              <p className="text-muted-foreground mt-2">
                Tente ajustar sua busca ou filtros.
              </p>
              <Button 
                variant="link" 
                onClick={() => { setSearchTerm(""); setSelectedCategory("Todos"); }}
                className="mt-2 text-primary"
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
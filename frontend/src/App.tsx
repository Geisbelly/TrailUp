import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import CadastroAluno from "./pages/CadastroAluno";
import CadastroProfessor from "./pages/CadastroProfessor";
import Login from "./pages/Login";
import Console from "./pages/Console";
import { CONSOLE_SECTIONS, consolePathForView } from "./pages/consoleSections";
import { MATERIAL_ROUTE_PATH } from "./components/console/personalizacoes/materialRoute";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Sobre from "./pages/Sobre";
import Contato from "./pages/Contato";
import Privacidade from "./pages/Privacidade";
import Termos from "./pages/Termos";
import NotFound from "./pages/NotFound";
import AuthConfirm from "./pages/EmailConfirm";
import Download from "./pages/Download";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/cadastro-aluno" element={<CadastroAluno />} />
            <Route path="/cadastro-professor" element={<CadastroProfessor />} />
            <Route path="/auth/confirmacao" element={<AuthConfirm />} />
            <Route path="/login" element={<Login />} />
            {/* Uma rota por aba do console, geradas da mesma lista que a barra
                de navegacao usa (consoleSections.ts) - sem caminho escrito a
                mao em dois lugares. A rota do editor de topico e a unica
                subrota com parametro, entao fica declarada a parte. */}
            {CONSOLE_SECTIONS.map((secao) => (
              <Route
                key={secao.slug || "raiz"}
                path={consolePathForView(secao.view)}
                element={
                  <ProtectedRoute allowedRoles={["professor"]} requireLiberado>
                    <Console />
                  </ProtectedRoute>
                }
              />
            ))}
            {/* Subrotas com conteudo proprio dentro de uma aba: a aba ativa sai
                do primeiro segmento (consoleSections), entao elas continuam
                abrindo o console na secao certa. */}
            <Route
              path={MATERIAL_ROUTE_PATH}
              element={
                <ProtectedRoute allowedRoles={["professor"]} requireLiberado>
                  <Console />
                </ProtectedRoute>
              }
            />
            <Route
              path="/console/trilha/:topicoId/editar"
              element={
                <ProtectedRoute allowedRoles={["professor"]} requireLiberado>
                  <Console />
                </ProtectedRoute>
              }
            />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:id" element={<BlogPost />} />
            <Route path="/sobre" element={<Sobre />} />
            <Route path="/contato" element={<Contato />} />
            <Route path="/privacidade" element={<Privacidade />} />
            <Route path="/termos" element={<Termos />} />
            <Route path="/download" element={<Download />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

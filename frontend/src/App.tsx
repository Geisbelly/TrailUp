import { Suspense } from "react";
import { lazyWithReload } from "@/lib/chunkReload";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH } from "./features/auth/resetPasswordRoute";
import { CONSOLE_SECTIONS, consolePathForView } from "./pages/consoleSections";
import { MATERIAL_ROUTE_PATH } from "./components/console/personalizacoes/materialRoute";

// Cada pagina vira o proprio chunk (import dinamico) em vez de entrar tudo
// no bundle inicial — a home/landing nao precisa pagar o peso do console
// (recharts, editor de trilha etc.) so pra alguem ver o "Comece sua Jornada".
// Ver issue #29: bundle unico de 1,67 MB / 465 kB gzip antes desta mudanca.
const Index = lazyWithReload(() => import("./pages/Index"));
const CadastroAluno = lazyWithReload(() => import("./pages/CadastroAluno"));
const CadastroProfessor = lazyWithReload(() => import("./pages/CadastroProfessor"));
const Login = lazyWithReload(() => import("./pages/Login"));
const EsqueciSenha = lazyWithReload(() => import("./pages/EsqueciSenha"));
const RedefinirSenha = lazyWithReload(() => import("./pages/RedefinirSenha"));
const Console = lazyWithReload(() => import("./pages/Console"));
const Blog = lazyWithReload(() => import("./pages/Blog"));
const BlogPost = lazyWithReload(() => import("./pages/BlogPost"));
const Sobre = lazyWithReload(() => import("./pages/Sobre"));
const Contato = lazyWithReload(() => import("./pages/Contato"));
const Privacidade = lazyWithReload(() => import("./pages/Privacidade"));
const Termos = lazyWithReload(() => import("./pages/Termos"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
const AuthConfirm = lazyWithReload(() => import("./pages/EmailConfirm"));
const Download = lazyWithReload(() => import("./pages/Download"));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/cadastro-aluno" element={<CadastroAluno />} />
              <Route path="/cadastro-professor" element={<CadastroProfessor />} />
              <Route path="/auth/confirmacao" element={<AuthConfirm />} />
              <Route path="/login" element={<Login />} />
              <Route path={FORGOT_PASSWORD_PATH} element={<EsqueciSenha />} />
              <Route path={RESET_PASSWORD_PATH} element={<RedefinirSenha />} />
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, School, Hexagon, Mail, Lock, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    signIn,
    signInWithGoogle,
    user,
    userRole,
    isProfessorLiberado,
    isLoading: authLoading,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [completeProfessor, setCompleteProfessor] = useState<{ nome: string; descricao: string } | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    if (location.state?.completeProfessor) {
      setCompleteProfessor(location.state.completeProfessor);
    }
    if (location.state?.pendingApproval) {
      setPendingApproval(true);
    }
  }, [location.state]);

  useEffect(() => {
    if (user && !authLoading) {
      if (userRole === "professor" && isProfessorLiberado) {
        navigate("/console");
      }
    }
  }, [user, userRole, isProfessorLiberado, authLoading, navigate]);

  const completeProfessorData = async (userId: string) => {
    try {
      if (!completeProfessor?.nome || !completeProfessor.descricao) return;

      const { data: existing, error: fetchError } = await supabase
        .from("professor")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (fetchError) {
        console.error("Erro ao verificar professor:", fetchError);
        return;
      }

      if (!existing) {
        const { error: insertError } = await supabase.from("professor").insert({
          id: userId,
          nome: completeProfessor.nome,
          descricao: completeProfessor.descricao,
          liberado: false,
        });
        if (insertError) {
          console.error("Erro ao criar professor:", insertError);
          toast.error("Não foi possível completar o cadastro de professor.");
          return;
        }
      }

      toast.success("Dados de professor salvos.");
    } catch (error) {
      console.error("Erro ao completar professor:", error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "email") fieldErrors.email = err.message;
        if (err.path[0] === "password") fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        toast.error("Email ou senha incorretos");
      } else if (error.message.includes("Email not confirmed")) {
        toast.error("Por favor, confirme seu email antes de fazer login");
      } else {
        toast.error(error.message);
      }
      setIsLoading(false);
      return;
    }

    const { data: authUser } = await supabase.auth.getUser();
    const userId = authUser?.user?.id;

    if (completeProfessor && userId) {
      await completeProfessorData(userId);
    }

    // Redireciona conforme o papel
    if (userId) {
      const { data: profData } = await supabase
        .from("professor")
        .select("liberado")
        .eq("id", userId)
        .maybeSingle();

      if (profData?.liberado) {
        toast.success("Login realizado. Redirecionando para o console...");
        navigate("/console");
        return;
      } else if (profData) {
        toast.warning("Sua conta está aguardando aprovação do administrador.");
        setIsLoading(false);
        return;
      }
    }

    toast.success("Login realizado com sucesso!");
    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error("Erro ao fazer login com Google: " + error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex flex-col items-center text-center space-y-4 mb-1">
          <Link to="/" className="group relative">
            <div className="absolute inset-0 bg-primary/40 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative p-4 bg-zinc-900/50 rounded-2xl border border-white/10 backdrop-blur-md shadow-xl transition-transform duration-300 group-hover:scale-105">
              {/* Ícone School para diferenciar sutilmente, mas mantendo a base Hexagon na marca */}
              <Hexagon className="w-10 h-10 text-primary fill-primary/20" />
            </div>
            {/* Ícone Badge flutuante para professor */}
            <div className="absolute -bottom-1 -right-1 bg-zinc-900 rounded-full p-1 border border-zinc-700 shadow-lg">
                <School className="w-4 h-4 text-primary" />
            </div>
          </Link>
          <CardTitle className="text-2xl font-bold text-center">
            Login do Professor
          </CardTitle>
          <CardDescription className="text-center">
            Acesse o console de gerenciamento
          </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {pendingApproval && (
            <Alert className="mb-4 border-amber-500/30 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-400">
                Sua conta está aguardando aprovação de um administrador.
              </AlertDescription>
            </Alert>
          )}

          {completeProfessor && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Complete o login para finalizar o cadastro de professor. Após salvar,
                o acesso fica disponível imediatamente.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative group">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all"
              />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative group">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
              <Input
                id="password"
                type={showSenha ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-10 pr-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 focus:ring-primary/20 focus:border-primary/50"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full w-10 text-zinc-500 hover:text-zinc-300 hover:bg-transparent"
                onClick={() => setShowSenha((s) => !s)}
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full mt-4"
              onClick={handleGoogleLogin}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continuar com Google
            </Button>
          </div>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Não tem uma conta? </span>
            <Link
              to="/cadastro-professor"
              className="text-primary hover:underline font-medium"
            >
              Cadastre-se como professor
            </Link>
          </div>

          <div className="mt-4 pt-4 border-t border-border text-center text-sm">
            <span className="text-muted-foreground">É aluno? </span>
            <Link
              to="/cadastro-aluno"
              className="text-primary hover:underline font-medium"
            >
              Cadastre-se aqui
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

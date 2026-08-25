import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Hexagon, Eye, EyeOff, Mail, ArrowRight, Info, CheckCircle2, Download, Smartphone, LogIn, User, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "pending-signup:";
const PLAY_STORE_LINK = import.meta.env.VITE_PLAY_STORE_LINK || "";
const APK_LINK = import.meta.env.VITE_APK_URL || "";

type Stage = "email" | "existing" | "new" | "confirm-sent" | "await-confirm" | "already";

const CadastroAluno = () => {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termos, setTermos] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("email");
  const [infoMessage, setInfoMessage] = useState("");

  const emailLower = email.trim().toLowerCase();

  const resendConfirmation = async (emailLowercase: string) => {
    const { error } = await supabase.auth.resend({ type: "signup", email: emailLowercase });
    if (error) {
      toast.error("Erro ao reenviar email: " + error.message);
      return false;
    }
    toast.success("Novo link de confirmação enviado.");
    return true;
  };

  const handleCheckEmail = async () => {
    if (!emailLower) {
      toast.error("Informe o email.");
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await supabase.rpc("fn_auth_email_exists", { p_email: emailLower });
      const exists = data === true;
      setStage(exists ? "existing" : "new");
      setInfoMessage(
        exists ? "Já existe uma conta com este email. Informe a senha para continuar." : "Email disponível. Crie uma senha para criar sua conta."
      );
    } catch (err) {
      toast.error((err)?.message || "Erro ao validar email.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginExisting = async () => {
    if (!senha) {
      toast.error("Informe a senha.");
      return;
    }
    setIsLoading(true);
    try {
      const { error: loginError, user: signedUser } = await signIn(emailLower, senha);
      if (loginError) {
        toast.error("Senha incorreta ou conta inválida.");
        return;
      }

      const user = signedUser ?? (await supabase.auth.getUser()).data.user;
      if (!user) {
        toast.error("Sessão não encontrada.");
        return;
      }

      const { data: alunoRow } = await supabase.from("alunos").select("id").eq("id", user.id).maybeSingle();

      const emailConfirmed = Boolean(user?.email_confirmed_at ?? user?.confirmed_at);

      if (alunoRow?.id) {
        if (emailConfirmed) {
          setStage("already");
          setInfoMessage("Você já possui cadastro de aluno.");
          return;
        }
        setStage("await-confirm");
        setInfoMessage("Conta de aluno encontrada. Confirme seu email para continuar.");
        return;
      }


      localStorage.setItem(`${STORAGE_PREFIX}${emailLower}`, JSON.stringify({ tipo: "aluno", email: emailLower }));
      navigate("/auth/confirmacao");
      setStage("confirm-sent");
      setInfoMessage("Conta sem perfil. Finalize seu cadastro de aluno.");
    } catch (err) {
      toast.error((err)?.message || "Erro ao autenticar.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = async () => {
    if (!senha || !confirmSenha) {
      toast.error("Informe e confirme a senha.");
      return;
    }
    if (senha.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!termos) {
      toast.error("É necessário aceitar os termos para continuar.");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signUp(emailLower, senha, "aluno");
      if (error) {
        toast.error(error.message || "Erro ao criar conta.");
        return;
      }

      localStorage.setItem(`${STORAGE_PREFIX}${emailLower}`, JSON.stringify({ tipo: "aluno", email: emailLower }));
      setStage("confirm-sent");
      setInfoMessage("Enviamos um link de confirmação. Após confirmar, conclua seu cadastro.");
    } catch (err) {
      toast.error((err )?.message || "Erro ao criar conta.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderEmailStep = () => (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleCheckEmail(); }}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative group">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setStage("email");
              setInfoMessage("");
            }}
            placeholder="exemplo@email.com"
            required
            className="pl-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all"
          />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Validando..." : "Continuar"}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </form>
  );

  const renderExistingStep = () => (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleLoginExisting(); }}>
      <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 text-primary" /> {infoMessage}
      </div>
      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
     
          <div className="relative group">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
          <Input
            id="senha"
            type={showSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
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
          {/* <Button type="button" variant="outline" onClick={() => setShowSenha((s) => !s)} className="shrink-0">
            {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button> */}
       
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Entrando..." : "Entrar e continuar"}
        <Mail className="w-4 h-4 ml-2" />
      </Button>
    </form>
  );

  const renderNewStep = () => (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleCreateNew(); }}>
      {infoMessage && (
        <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 text-primary" /> {infoMessage}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <div className="relative group">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
            <Input
              id="senha-new"
              type={showSenha ? "text" : "password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              className="pl-10 pr-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 focus:ring-primary/20 focus:border-primary/50"
              placeholder="Mínimo 6 caracteres"
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
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-senha">Confirmar senha</Label>
        <div className="relative group">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
            <Input
              id="confirm-senha"
              type={showConfirm ? "text" : "password"}
              value={confirmSenha}
              onChange={(e) => setConfirmSenha(e.target.value)}
              required
              className="pl-10 pr-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 focus:ring-primary/20 focus:border-primary/50"
              placeholder="Repita a senha"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-10 text-zinc-500 hover:text-zinc-300 hover:bg-transparent"
              onClick={() => setShowConfirm((s) => !s)}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
      </div>
      <div className="flex items-start space-x-2">
        <Checkbox id="termos" checked={termos} onCheckedChange={(v) => setTermos(Boolean(v))} />
        <Label htmlFor="termos" className="text-sm text-zinc-400 leading-relaxed cursor-pointer">
          Li e aceito os{" "}
          <a 
            href="/termos" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="underline underline-offset-2 hover:text-primary transition-colors"
          >
            termos de uso
          </a>{" "}
          e a{" "}
          <a 
            href="/privacidade" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="underline underline-offset-2 hover:text-primary transition-colors"
          >
            política de privacidade
          </a>.
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Processando..." : "Criar conta e enviar confirmação"}
        <Mail className="w-4 h-4 ml-2" />
      </Button>
    </form>
  );

  const renderAwaitConfirm = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 text-primary" /> {infoMessage}
      </div>
      <Button onClick={() => resendConfirmation(emailLower)} className="w-full" disabled={isLoading}>
        Reenviar email de confirmação
      </Button>
    </div>
  );

  const renderAlready = () => (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
      <p className="text-muted-foreground">{infoMessage || "Conta de aluno ativa."}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Button className="w-full" onClick={() => APK_LINK && window.open(APK_LINK, "_blank")}>
          <Download className="w-4 h-4 mr-2" /> Baixar APK
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => PLAY_STORE_LINK && window.open(PLAY_STORE_LINK, "_blank")}
        >
          <Smartphone className="w-4 h-4 mr-2" /> Play Store
        </Button>
      </div>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={() => navigate("/")}>Início</Button>
      </div>
    </div>
  );

  const renderConfirmSent = () => (
    <div className="space-y-4 text-center">
      <Hexagon className="w-10 h-10 text-primary fill-primary/20 mx-auto" />
      <p className="text-muted-foreground">
        {infoMessage || `Enviamos um link de confirmação para ${email}. Após confirmar, conclua seu cadastro.`}
      </p>
      <Button onClick={() => navigate("/auth/confirmacao")} className="w-full">
        Ir para confirmação
      </Button>
    </div>
  );

  const renderCurrentStage = () => {
    if (stage === "email") return renderEmailStep();
    if (stage === "existing") return renderExistingStep();
    if (stage === "new") return renderNewStep();
    if (stage === "confirm-sent") return renderConfirmSent();
    if (stage === "await-confirm") return renderAwaitConfirm();
    if (stage === "already") return renderAlready();
    return null;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="p-8 border-primary/20 bg-card/60 backdrop-blur">
          <div className="flex flex-col items-center text-center space-y-4 mb-6">
            <Link to="/" className="group relative">
            <div className="absolute inset-0 bg-primary/40 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative p-4 bg-zinc-900/50 rounded-2xl border border-white/10 backdrop-blur-md shadow-xl transition-transform duration-300 group-hover:scale-105">
              <Hexagon className="w-10 h-10 text-primary fill-primary/20" />
            </div>
          </Link>
            <h1 className="text-3xl font-bold">Cadastro de Aluno</h1>
            <p className="text-muted-foreground">Inicie informando seu email.</p>
          </div>

          {renderCurrentStage()}

        </Card>
      </div>
    </div>
  );
};

export default CadastroAluno;

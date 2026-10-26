import { useState } from "react";
import { AuthBrand, AuthScenery } from "@/components/auth/AuthScenery";
import { useNavigate, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Hexagon, Eye, EyeOff, Mail, ArrowRight, Info, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ehCredencialInvalida,
  ehContaJaExistente,
  MENSAGEM_SOLICITACAO_CADASTRO,
  ehEmailNaoConfirmado,
  mensagemDeAcesso,
  normalizarEmail,
  validarAcesso,
} from "@/lib/cadastroEmUmaEtapa";

import { FORGOT_PASSWORD_PATH } from "@/features/auth/resetPasswordRoute";

const STORAGE_PREFIX = "pending-signup:";

/** Uma etapa só (#329) — ver `CadastroAluno.tsx` e `lib/cadastroEmUmaEtapa.ts`. */
type Stage = "acesso" | "confirm-sent" | "await-confirm" | "already";

const CadastroProfessor = () => {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termos, setTermos] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("acesso");
  const [infoMessage, setInfoMessage] = useState("");

  const emailLower = normalizarEmail(email);

  const resendConfirmation = async (emailToSend: string) => {
    const { error } = await supabase.auth.resend({ type: "signup", email: emailToSend });
    if (error) {
      toast.error("Erro ao reenviar email: " + error.message);
      return false;
    }
    toast.success("Novo link de confirmação enviado.");
    return true;
  };

  /** Caminho de conta existente, intocado: decide entre console, confirmação e pendência. */
  const seguirComoContaExistente = async (signedUser: unknown) => {
    const user = (signedUser as { id?: string } | null) ?? (await supabase.auth.getUser()).data.user;
    if (!user) {
      toast.error("Sessão não encontrada.");
      return;
    }

    const { data: profRow } = await supabase.from("professor").select("id").eq("id", user.id).maybeSingle();
    const u = user as { email_confirmed_at?: string | null; confirmed_at?: string | null };
    const emailConfirmed = Boolean(u?.email_confirmed_at || u?.confirmed_at);

    if (profRow?.id) {
      if (!emailConfirmed) {
        setStage("await-confirm");
        setInfoMessage("Conta de professor encontrada. Confirme seu email para continuar.");
        return;
      }
      navigate("/console");
      return;
    }

    // Usuário sem tipo definido: cria pendência para o fluxo de professor.
    localStorage.setItem(`${STORAGE_PREFIX}${emailLower}`, JSON.stringify({ tipo: "professor", email: emailLower }));
    navigate("/auth/confirmacao");
    setStage("confirm-sent");
    setInfoMessage("Conta sem perfil. Finalize seu cadastro de professor.");
  };

  /**
   * Entrar OU criar numa chamada só. `signIn` primeiro, e o `signUp` só depois de o login falhar
   * por credencial inválida — quando já não se sabe se a conta existe. Ver
   * `lib/cadastroEmUmaEtapa.ts` para o motivo (issue #329) e para a indistinção das mensagens.
   */
  const handleAcessar = async () => {
    const dados = { email: emailLower, senha, confirmSenha, termos };
    const erroEntrada = validarAcesso(dados, false);
    if (erroEntrada) {
      toast.error(erroEntrada);
      return;
    }

    setIsLoading(true);
    try {
      const { error: loginError, user: signedUser } = await signIn(emailLower, senha);

      if (!loginError) {
        await seguirComoContaExistente(signedUser);
        return;
      }

      if (ehEmailNaoConfirmado(loginError)) {
        setStage("await-confirm");
        setInfoMessage(mensagemDeAcesso(loginError));
        return;
      }

      if (!ehCredencialInvalida(loginError)) {
        toast.error(mensagemDeAcesso(loginError));
        return;
      }

      const erroCriacao = validarAcesso(dados, true);
      if (erroCriacao) {
        toast.error(erroCriacao);
        return;
      }

      const { error: signUpError } = await signUp(emailLower, senha, "professor");
      if (signUpError && !ehContaJaExistente(signUpError)) {
        toast.error(mensagemDeAcesso(signUpError));
        return;
      }

      try {
        localStorage.setItem(`${STORAGE_PREFIX}${emailLower}`, JSON.stringify({ tipo: "professor", email: emailLower }));
      } catch { /* O callback recupera o tipo pela conta confirmada. */ }
      setStage("confirm-sent");
      setInfoMessage(MENSAGEM_SOLICITACAO_CADASTRO);
    } catch (err) {
      toast.error(mensagemDeAcesso(err));
    } finally {
      setIsLoading(false);
    }
  };

  const renderAcessoStep = () => (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleAcessar(); }}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative group">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setInfoMessage(""); }}
            placeholder="exemplo@email.com"
            required
            className="pl-10 bg-card/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-primary/20 focus:border-primary/50 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <div className="relative group">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            id="senha"
            type={showSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            placeholder="Mínimo 6 caracteres"
            className="pl-10 pr-10 bg-card/50 border-border text-foreground focus:ring-primary/20 focus:border-primary/50"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground hover:bg-transparent"
            onClick={() => setShowSenha((s) => !s)}
          >
            {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-senha">Confirmar senha</Label>
        <div className="relative group">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            id="confirm-senha"
            type={showConfirm ? "text" : "password"}
            value={confirmSenha}
            onChange={(e) => setConfirmSenha(e.target.value)}
            placeholder="Repita a senha (só para criar conta)"
            className="pl-10 pr-10 bg-card/50 border-border text-foreground focus:ring-primary/20 focus:border-primary/50"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground hover:bg-transparent"
            onClick={() => setShowConfirm((s) => !s)}
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-start space-x-2">
        <Checkbox id="termos" checked={termos} onCheckedChange={(v) => setTermos(Boolean(v))} />
        <Label htmlFor="termos" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
          Li e aceito os{" "}
          <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
            termos de uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
            política de privacidade
          </a>
          .
        </Label>
      </div>

      {infoMessage && (
        <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 text-primary" /> {infoMessage}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Verificando..." : "Entrar ou criar conta"}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Confirmar a senha e aceitar os termos é necessário apenas quando a conta é nova.
      </p>
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
      <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
        Ir para login
      </Button>
    </div>
  );

  const renderConfirmSent = () => (
    <div className="space-y-4 text-center">
      <Hexagon className="w-10 h-10 text-primary fill-primary/20 mx-auto" />
      <p className="text-muted-foreground">
        {infoMessage || MENSAGEM_SOLICITACAO_CADASTRO}
      </p>
      <Button onClick={() => navigate("/auth/confirmacao")} className="w-full">
        Ir para confirmação
      </Button>
      <Button asChild variant="outline" className="w-full"><Link to="/login">Entrar na minha conta</Link></Button>
      <Link to={FORGOT_PASSWORD_PATH} className="block text-sm underline">Recuperar acesso</Link>
    </div>
  );


  const renderAlready = () => (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
      <p className="text-muted-foreground">{infoMessage}</p>
      <div className="flex gap-3 justify-center">
        <Button onClick={() => navigate("/login")}>Fazer login</Button>
        <Button variant="outline" onClick={() => navigate("/")}>Início</Button>
      </div>
    </div>
  );

  const renderCurrentStage = () => {
    if (stage === "acesso") return renderAcessoStep();
    if (stage === "confirm-sent") return renderConfirmSent();
    if (stage === "await-confirm") return renderAwaitConfirm();
    if (stage === "already") return renderAlready();
    return null;
  };

  return (
    <div className="auth-immersive min-h-screen flex items-center justify-center p-4">
      <AuthScenery />
      <div className="w-full max-w-md">
        <Card className="auth-panel p-8">
          <div className="flex flex-col items-center text-center space-y-4 mb-6">
            <AuthBrand />
            <h1 className="text-3xl font-bold">Cadastro de Professor</h1>
            <p className="text-muted-foreground">Entre com seu e-mail e senha. Se ainda não tem conta, ela é criada na hora.</p>
          </div>

          {renderCurrentStage()}

          <p className="text-center text-sm text-muted-foreground mt-4">
            Já tem conta?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default CadastroProfessor;

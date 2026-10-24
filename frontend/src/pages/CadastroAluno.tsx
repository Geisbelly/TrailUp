import { useState } from "react";
import { AuthBrand, AuthScenery } from "@/components/auth/AuthScenery";
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
import {
  ehCredencialInvalida,
  ehEmailNaoConfirmado,
  mensagemDeAcesso,
  normalizarEmail,
  validarAcesso,
} from "@/lib/cadastroEmUmaEtapa";
import { ehMenorDeIdade, hojeEmBrasilia, validarDataNascimento } from "@/lib/dataNascimento";

const STORAGE_PREFIX = "pending-signup:";
const PLAY_STORE_LINK = import.meta.env.VITE_PLAY_STORE_LINK || "";
const APK_LINK = import.meta.env.VITE_APK_URL || "";

/**
 * Uma etapa só para e-mail+senha (#329). Os estágios "email" / "existing" / "new" existiam
 * porque `fn_auth_email_exists` dizia, ANTES do login, se o e-mail tinha conta — e dizia para
 * qualquer pessoa na internet, sem limite. Agora quem decide é `signIn`/`signUp`.
 */
type Stage = "acesso" | "confirm-sent" | "await-confirm" | "already";

const CadastroAluno = () => {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termos, setTermos] = useState(false);
  // #195: pedida na criação da conta (como a confirmação de senha). Vai para
  // `aluno_nascimento` quando o cadastro do aluno for concluído, após confirmar o e-mail.
  const [dataNascimento, setDataNascimento] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("acesso");
  const [infoMessage, setInfoMessage] = useState("");

  const emailLower = normalizarEmail(email);

  const resendConfirmation = async (emailLowercase: string) => {
    const { error } = await supabase.auth.resend({ type: "signup", email: emailLowercase });
    if (error) {
      toast.error("Erro ao reenviar email: " + error.message);
      return false;
    }
    toast.success("Novo link de confirmação enviado.");
    return true;
  };

  /** O que fazer quando o login deu certo: é o caminho de conta existente, intocado. */
  const seguirComoContaExistente = async (signedUser: unknown) => {
    const user = (signedUser as { id?: string } | null) ?? (await supabase.auth.getUser()).data.user;
    if (!user) {
      toast.error("Sessão não encontrada.");
      return;
    }

    const { data: alunoRow } = await supabase.from("alunos").select("id").eq("id", user.id).maybeSingle();
    const u = user as { email_confirmed_at?: string | null; confirmed_at?: string | null };
    const emailConfirmed = Boolean(u?.email_confirmed_at ?? u?.confirmed_at);

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
  };

  /**
   * Entrar OU criar, numa chamada só — e nesta ordem de propósito.
   *
   * `signIn` primeiro: sucesso já prova que a conta existe e a senha está certa, sem perguntar
   * nada ao banco sobre o e-mail. Se falhar por credencial inválida, não se sabe se a conta não
   * existe ou se a senha está errada — o Supabase não distingue, e é essa indistinção que
   * substitui o oráculo que `fn_auth_email_exists` era.
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

      // Daqui para baixo é CRIAÇÃO. Exigir confirmação de senha e termos só agora não revela
      // nada: a mesma exigência aparece para quem errou a senha de uma conta existente.
      const erroCriacao = validarAcesso(dados, true) ?? validarDataNascimento(dataNascimento);
      if (erroCriacao) {
        toast.error(erroCriacao);
        return;
      }

      const { error: signUpError } = await signUp(emailLower, senha, "aluno");
      if (signUpError) {
        // `mensagemDeAcesso` devolve a MESMA frase de senha errada quando a conta já existe.
        toast.error(mensagemDeAcesso(signUpError));
        return;
      }

      localStorage.setItem(
        `${STORAGE_PREFIX}${emailLower}`,
        JSON.stringify({ tipo: "aluno", email: emailLower, data_nascimento: dataNascimento })
      );
      setStage("confirm-sent");
      setInfoMessage("Enviamos um link de confirmação. Após confirmar, conclua seu cadastro.");
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

      <div className="space-y-2">
        <Label htmlFor="data-nascimento">Data de nascimento</Label>
        <Input
          id="data-nascimento"
          type="date"
          value={dataNascimento}
          max={hojeEmBrasilia()}
          onChange={(e) => setDataNascimento(e.target.value)}
          className="bg-card/50 border-border text-foreground focus:ring-primary/20 focus:border-primary/50"
        />
        <p className="text-xs text-muted-foreground">
          Só para criar conta. Fica visível apenas para você.
          {dataNascimento && !validarDataNascimento(dataNascimento) && ehMenorDeIdade(dataNascimento)
            ? " Como você tem menos de 18 anos, câmera, análise de emoções, telemetria, mentor de IA e pesquisa só ligam depois que seu responsável autorizar, no app ou pelo termo em papel entregue ao professor. Trilhas, questões e progresso funcionam desde já."
            : ""}
        </p>
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
        Confirmar a senha, informar a data de nascimento e aceitar os termos é necessário apenas quando a conta é nova.
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
            <h1 className="text-3xl font-bold">Cadastro de Aluno</h1>
            <p className="text-muted-foreground">Entre com seu e-mail e senha. Se ainda não tem conta, ela é criada na hora.</p>
          </div>

          {renderCurrentStage()}

        </Card>
      </div>
    </div>
  );
};

export default CadastroAluno;

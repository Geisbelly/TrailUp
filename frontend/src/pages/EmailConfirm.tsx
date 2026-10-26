import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X, Loader2, Home, LogIn } from "lucide-react";
import { AuthBrand, AuthScenery } from "@/components/auth/AuthScenery";
import { AlunoSignupWizard } from "@/components/auth/AlunoSignupWizard";
import { ProfessorSignupForm } from "@/components/auth/ProfessorSignupForm";
import { validarDataNascimento } from "@/lib/dataNascimento";
import { confirmarSessao } from "@/features/signup/confirmarSessao";
import { AREA_ALUNO, alunoTemCadastro, lerPendente, removerPendente, salvarCadastroAluno,
  tipoDoCadastro, type TipoCadastro } from "@/features/signup/cadastroAluno";

type Status = "loading" | "ready" | "error";

export default function EmailConfirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState("Confirmando seu e-mail...");
  const [pendingTipo, setPendingTipo] = useState<TipoCadastro>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [dataNascimento, setDataNascimento] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const confirmation = useRef<{ url: string; promise: Promise<User> } | null>(null);
  const url = useMemo(() => new URL(window.location.origin + location.pathname + location.search),
    [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;
    // StrictMode pode montar o efeito duas vezes; um OTP só pode ser consumido uma vez.
    if (confirmation.current?.url !== url.href) {
      confirmation.current = { url: url.href, promise: confirmarSessao(supabase.auth, url) };
    }
    const run = async () => {
      try {
        const user = await confirmation.current!.promise;
        if (cancelled) return;
        // O token é de uso único. Retire-o da URL antes de abrir o formulário,
        // para que recarregar a página retome a sessão em vez de consumir o link de novo.
        if (url.searchParams.has('code') || url.searchParams.has('token_hash')) {
          navigate('/auth/confirmacao', { replace: true });
          return;
        }
        const email = user.email!.toLowerCase();
        const tipo = tipoDoCadastro(user);
        if (tipo === 'aluno' && await alunoTemCadastro(user.id)) {
          if (!cancelled) navigate(AREA_ALUNO, { replace: true });
          return;
        }
        if (cancelled) return;
        setSessionEmail(email);
        setSessionUserId(user.id);
        setPendingTipo(tipo);
        setDataNascimento(lerPendente(email)?.dataNascimento ?? '');
        setStatus('ready');
        setDetail('');
      } catch (err) {
        if (cancelled) return;
        setDetail(err instanceof Error ? err.message : 'Não foi possível confirmar o e-mail. Tente entrar novamente.');
        setStatus('error');
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [url, navigate]);

  const handleAlunoConfirm: Parameters<typeof AlunoSignupWizard>[0]['onConfirm'] = async payload => {
    if (saving.current || !sessionEmail || !sessionUserId) return;
    const erroData = validarDataNascimento(dataNascimento);
    if (erroData) { toast.error(erroData); return; }
    saving.current = true;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (data.user?.id !== sessionUserId) throw new Error('A sessão mudou. Entre novamente para continuar.');
      await salvarCadastroAluno(sessionUserId, payload, dataNascimento);
      removerPendente(sessionEmail);
      toast.success('Cadastro concluído! Sua trilha introdutória está disponível.');
      navigate(AREA_ALUNO, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o cadastro. Suas respostas continuam nesta tela; tente novamente.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  // ======= UI =======
  if (status === "loading") {
    return (
      <div className="auth-immersive min-h-screen flex items-center justify-center p-4">
        <AuthScenery />
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="auth-immersive min-h-screen flex items-center justify-center p-4">
        <AuthScenery />
        <Card className="auth-panel w-full max-w-md p-8 text-center space-y-4">
          <AuthBrand />
          <X className="w-10 h-10 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Não foi possível continuar</h1>
          <p className="text-sm text-muted-foreground">{detail}</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate("/")}>
              <Home className="w-4 h-4 mr-2" />
              Início
            </Button>
            <Button onClick={() => navigate("/login")}>
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const showStudent = pendingTipo === "aluno";
  const showProfessor = pendingTipo === "professor";

  return (
    <div className="auth-immersive min-h-screen flex items-center justify-center p-4">
      <AuthScenery />
      <div className="w-full max-w-3xl">
        <div className="text-center mb-4"><AuthBrand /></div>
        <Card className="auth-panel p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">
              {showStudent
                ? "Finalize seu cadastro de aluno"
                : showProfessor
                ? "Finalize seu cadastro de professor"
                : "Cadastro pendente"}
            </h1>
            {sessionEmail && <p className="text-sm text-muted-foreground">Sessão ativa: {sessionEmail}</p>}
          </div>

          {showStudent && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nascimento-confirmacao">Data de nascimento</Label>
                <Input id="nascimento-confirmacao" type="date" value={dataNascimento}
                  onChange={event => setDataNascimento(event.target.value)} disabled={isSaving} required />
                <p className="text-sm text-muted-foreground">Confirme sua data para concluir o cadastro. Ela não é exibida aos colegas.</p>
              </div>
              <AlunoSignupWizard onConfirm={handleAlunoConfirm} isSaving={isSaving} />
            </div>
          )}

          {showProfessor && (
            <ProfessorSignupForm sessionEmail={sessionEmail} onDone={() => { toast.success("Cadastro de professor concluído!"); navigate("/login"); }} />
          )}

          {!showStudent && !showProfessor && (
            <div className="space-y-4">
              <p>Seu e-mail está confirmado. Escolha o cadastro que deseja concluir.</p>
              <Button onClick={() => setPendingTipo('aluno')}>Sou aluno</Button>{' '}
              <Button variant="outline" onClick={() => setPendingTipo('professor')}>Sou professor</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

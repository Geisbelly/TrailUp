import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Hexagon, X, Loader2, Home, LogIn } from "lucide-react";

import { AlunoSignupWizard } from "@/components/auth/AlunoSignupWizard";
import { ProfessorSignupForm } from "@/components/auth/ProfessorSignupForm";

type Status = "loading" | "ready" | "error";
type PendingType = "aluno" | "professor" | null;

const STORAGE_PREFIX = "pending-signup:";

export default function EmailConfirm() {
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState<string>("Confirmando seu email...");
  const [pendingTipo, setPendingTipo] = useState<PendingType>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const url = useMemo(
    () => new URL(window.location.origin + location.pathname + location.search),
    [location.pathname, location.search]
  );

  // 1) Aceita 2 cenários:
  // - usuário já está com sessão e email confirmado => libera
  // - usuário não tem sessão confirmada, mas tem parâmetros do link => troca/valida e libera
  const getConfirmedSession = useCallback(async (): Promise<{ email: string; userId: string }> => {
    // tenta sessão existente
    const { data: sessData } = await supabase.auth.getSession();
    const existing = sessData.session;

    if (existing?.user) {
      const { data: userData, error } = await supabase.auth.getUser();
      if (error) throw error;

      const u = userData.user;
      const confirmedAt = u?.email_confirmed_at ?? u?.confirmed_at;

      if (confirmedAt && u?.email) {
        return { email: u.email.toLowerCase(), userId: u.id };
      }
      // se tem sessão mas não confirmou, tenta via link se tiver
    }

    // tenta callback via URL (PKCE code ou OTP token_hash)
    const code = url.searchParams.get("code");
    const token_hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type"); // signup, recovery, magiclink...

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (token_hash && type) {
      const EMAIL_OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'email', 'recovery', 'email_change'];
      const otpType = EMAIL_OTP_TYPES.includes(type as EmailOtpType) ? (type as EmailOtpType) : null;
      if (!otpType) throw new Error("Tipo de confirmação inválido.");
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: otpType });
      if (error) throw error;
    } else {
      throw new Error("Você precisa confirmar o email (ou fazer login com uma conta já confirmada).");
    }

    // valida confirmação REAL no user
    const { data: userData2, error: userErr2 } = await supabase.auth.getUser();
    if (userErr2) throw userErr2;

    const u2 = userData2.user;
    const confirmedAt2 = u2?.email_confirmed_at ?? u2?.confirmed_at;

    if (!confirmedAt2 || !u2?.email) {
      throw new Error("Email ainda não confirmado. Abra o link do email novamente.");
    }

    const { data: sessData2 } = await supabase.auth.getSession();
    if (!sessData2.session) {
      throw new Error("Sessão não encontrada após confirmação. Abra o link do email novamente.");
    }

    return { email: u2.email.toLowerCase(), userId: u2.id };
  }, [url]);

  const loadPending = (email: string): { tipo: PendingType; email?: string } => {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${email}`);
    const pending = raw ? (JSON.parse(raw) as { tipo?: PendingType; email?: string }) : null;

    if (!pending?.tipo) {
      throw new Error("Nenhum cadastro pendente para este email. Inicie um novo cadastro.");
    }

    if (pending.email && pending.email.toLowerCase() !== email) {
      throw new Error("O email da sessão não corresponde ao cadastro pendente.");
    }

    return { tipo: pending.tipo ?? null, email: pending.email };
  };

  useEffect(() => {
    const run = async () => {
      try {
        setStatus("loading");
        setDetail("Validando sessão...");

        const { email } = await getConfirmedSession();
        setSessionEmail(email);

        setDetail("Carregando cadastro pendente...");
        const pending = loadPending(email);
        setPendingTipo(pending.tipo);

        setStatus("ready");
        setDetail("");
      } catch (err) {
        setPendingTipo(null);
        setSessionEmail(null);
        setDetail((err as Error)?.message || "Não foi possível confirmar o email.");
        setStatus("error");
      }
    };

    void run();
  }, [url, getConfirmedSession]);

  // ======= handlers de confirmação (cadastro final) =======
  const handleAlunoConfirm: Parameters<typeof AlunoSignupWizard>[0]["onConfirm"] = async (payload) => {
    if (!sessionEmail) return;

    setIsSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user?.id) throw new Error("Sessão inválida. Faça login novamente.");

      // chama sua RPC igual antes
      const perfisArray = Object.entries(payload.brainhexPercent).map(([nome, afinidade]) => ({
        nome: nome.toLowerCase(),
        afinidade,
      }));

      const { error: rpcError } = await supabase.rpc("fn_cadastrar_aluno_com_perfis", {
        p_auth_user_id: session.user.id,
        p_nome_completo: payload.nome,
        p_email: sessionEmail,
        p_apelido: payload.apelido,
        p_modooperacao_nome: payload.modoOperacao,
        p_perfis: perfisArray,
      });

      if (rpcError) throw rpcError;

      localStorage.removeItem(`${STORAGE_PREFIX}${sessionEmail.toLowerCase()}`);
      toast.success("Cadastro de aluno concluído!");
      navigate("/login");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao concluir cadastro do aluno.";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };


  // ======= UI =======
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* <div className="flex justify-center mb-6">
          <Link to="/" aria-label="Início">
            <Hexagon className="w-10 h-10 text-primary fill-primary/20" />
          </Link>
        </div> */}

        <Card className="p-8 border-primary/20 bg-card/60 backdrop-blur">
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
            <AlunoSignupWizard
              onConfirm={handleAlunoConfirm}
              isSaving={isSaving}
            />
          )}

          {showProfessor && (
            <ProfessorSignupForm sessionEmail={sessionEmail} onDone={() => { toast.success("Cadastro de professor concluído!"); navigate("/login"); }} />
          )}

          {!showStudent && !showProfessor && (
            <p className="text-sm text-muted-foreground">
              Nenhum cadastro pendente foi encontrado para este email. Inicie um novo cadastro.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

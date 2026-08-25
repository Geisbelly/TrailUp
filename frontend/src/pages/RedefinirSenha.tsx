import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ArrowLeft, Eye, EyeOff, Hexagon, Lock } from "lucide-react";
import { toast } from "sonner";
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
import { supabase } from "@/integrations/supabase/client";
import {
  SENHA_MINIMA,
  mensagemDeErroDeSenha,
  validarNovaSenha,
} from "@/features/auth/passwordPolicy";
import { FORGOT_PASSWORD_PATH } from "@/features/auth/resetPasswordRoute";

type Estado = "validando" | "pronto" | "linkInvalido";

/**
 * Pagina que o link de recuperacao abre. Duas etapas:
 *
 * 1. transformar o que veio na URL em sessao - PKCE (?code=) ou OTP
 *    (?token_hash=&type=recovery). O Supabase tambem pode devolver a sessao no
 *    fragmento (#access_token=...), e nesse caso o proprio cliente ja a
 *    persiste sozinho: por isso a checagem por getSession antes de desistir.
 * 2. definir a nova senha (updateUser), ja com a sessao de recuperacao ativa.
 */
export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>("validando");
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    const estabelecerSessao = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });
          if (error) throw error;
        }

        const { data } = await supabase.auth.getSession();
        if (!ativo) return;

        if (!data.session) {
          setDetalhe("Abra esta página pelo link enviado no e-mail.");
          setEstado("linkInvalido");
          return;
        }

        setEstado("pronto");
      } catch (error) {
        if (!ativo) return;
        setDetalhe(mensagemDeErroDeSenha(error));
        setEstado("linkInvalido");
      }
    };

    void estabelecerSessao();
    return () => {
      ativo = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const validacao = validarNovaSenha({ novaSenha, confirmacao });
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;

      // Encerra a sessao de recuperacao: quem redefiniu a senha entra de novo
      // com ela, e um link de e-mail nao deve virar sessao permanente.
      await supabase.auth.signOut();
      toast.success("Senha alterada. Entre com a nova senha.");
      navigate("/login", { replace: true });
    } catch (error) {
      setErro(mensagemDeErroDeSenha(error));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary/5 to-primary/5">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <Link to="/" className="mx-auto w-fit">
            <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/10 backdrop-blur-md">
              <Hexagon className="h-8 w-8 text-primary" />
            </div>
          </Link>
          <CardTitle className="text-2xl font-bold text-center">Criar nova senha</CardTitle>
          <CardDescription className="text-center">
            {estado === "pronto" && `Escolha uma senha com pelo menos ${SENHA_MINIMA} caracteres.`}
            {estado === "validando" && "Validando o link de recuperação..."}
            {estado === "linkInvalido" && "Não foi possível validar este link."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {estado === "validando" && (
            <p className="py-6 text-center text-sm text-muted-foreground">Um instante...</p>
          )}

          {estado === "linkInvalido" && (
            <>
              <Alert variant="destructive">
                <AlertDescription>
                  {detalhe ?? "Este link de recuperação expirou ou já foi usado."}
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link to={FORGOT_PASSWORD_PATH}>Pedir um novo link</Link>
              </Button>
            </>
          )}

          {estado === "pronto" && (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {erro && (
                <Alert variant="destructive">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="nova-senha"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete="new-password"
                    autoFocus
                    className="pl-9 pr-10"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmar-senha"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete="new-password"
                    className="pl-9"
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}

          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Hexagon, Mail, MailCheck } from "lucide-react";
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
import { emailValido, mensagemDeErroDeSenha } from "@/features/auth/passwordPolicy";
import { RESET_PASSWORD_PATH } from "@/features/auth/resetPasswordRoute";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!emailValido(email)) {
      setErro("Digite um e-mail válido.");
      return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        // Origem da propria janela: em producao aponta pro dominio publicado e
        // em dev pro localhost, sem URL fixa em lugar nenhum.
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
      });
      if (error) throw error;
      setEnviado(true);
    } catch (error) {
      setErro(mensagemDeErroDeSenha(error));
    } finally {
      setEnviando(false);
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
          <CardTitle className="text-2xl font-bold text-center">Recuperar senha</CardTitle>
          <CardDescription className="text-center">
            {enviado
              ? "Confira sua caixa de entrada."
              : "Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {enviado ? (
            <>
              <Alert>
                <MailCheck className="h-4 w-4" />
                <AlertDescription>
                  Se existir uma conta com esse e-mail, o link de recuperação chega em instantes. Ele vale
                  por tempo limitado e só pode ser usado uma vez.
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => setEnviado(false)}>
                Enviar para outro e-mail
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {erro && (
                <Alert variant="destructive">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    className="pl-9"
                    placeholder="voce@instituicao.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(erro)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? "Enviando..." : "Enviar link de recuperação"}
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

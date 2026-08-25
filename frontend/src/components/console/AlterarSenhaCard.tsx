import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  SENHA_MINIMA,
  mensagemDeErroDeSenha,
  validarNovaSenha,
} from "@/features/auth/passwordPolicy";

/**
 * Troca de senha do professor logado.
 *
 * Pede a senha atual e reautentica antes de trocar. O updateUser do Supabase
 * NAO exige a senha antiga - o que significa que uma sessao sequestrada (aba
 * aberta, maquina compartilhada da instituicao) trocaria a senha sozinha e
 * trancaria o dono pra fora. A reautenticacao fecha isso.
 */
export default function AlterarSenhaCard() {
  const { user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const limpar = () => {
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmacao("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const validacao = validarNovaSenha({ novaSenha, confirmacao, senhaAtual });
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }

    const email = user?.email;
    if (!email) {
      setErro("Sessão sem e-mail. Entre novamente para trocar a senha.");
      return;
    }

    setSalvando(true);
    try {
      // 1. confirma que quem esta na frente da tela sabe a senha atual
      const { error: erroLogin } = await supabase.auth.signInWithPassword({
        email,
        password: senhaAtual,
      });
      if (erroLogin) throw erroLogin;

      // 2. so entao troca
      const { error: erroUpdate } = await supabase.auth.updateUser({ password: novaSenha });
      if (erroUpdate) throw erroUpdate;

      limpar();
      toast.success("Senha alterada com sucesso.");
    } catch (error) {
      setErro(mensagemDeErroDeSenha(error));
    } finally {
      setSalvando(false);
    }
  };

  const campo = (
    id: string,
    label: string,
    valor: string,
    onChange: (v: string) => void,
    autoComplete: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={mostrar ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={mostrar ? "Ocultar senhas" : "Mostrar senhas"}
        >
          {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <CardTitle>Alterar senha</CardTitle>
        </div>
        <CardDescription>
          Confirme a senha atual e escolha uma nova, com pelo menos {SENHA_MINIMA} caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md" noValidate>
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          {campo("senha-atual", "Senha atual", senhaAtual, setSenhaAtual, "current-password")}
          {campo("nova-senha", "Nova senha", novaSenha, setNovaSenha, "new-password")}
          {campo("confirmar-senha", "Confirmar nova senha", confirmacao, setConfirmacao, "new-password")}

          <Button type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Alterar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

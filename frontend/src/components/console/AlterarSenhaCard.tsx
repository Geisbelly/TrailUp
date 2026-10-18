import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  SENHA_MINIMA,
  mensagemDeErroDeSenha,
  validarNovaSenha,
} from "@/features/auth/passwordPolicy";
import { forcaDaSenha } from "./meusdados/conta";

const NIVEL_COR = ["", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

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

  const forca = forcaDaSenha(novaSenha);

  const campo = (
    id: string,
    label: string,
    valor: string,
    onChange: (v: string) => void,
    autoComplete: string,
    medidor = false,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={mostrar ? "text" : "password"}
          autoComplete={autoComplete}
          className="rounded-[14px] bg-muted pr-10"
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
      {medidor && valor && (
        <div className="flex items-center gap-1.5" aria-live="polite">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-[5px] flex-1 rounded-full ${forca.nivel >= n ? NIVEL_COR[forca.nivel] : "bg-border"}`} />
          ))}
          <span className="ml-1 whitespace-nowrap text-[10.5px] font-bold text-muted-foreground">{forca.rotulo}</span>
        </div>
      )}
    </div>
  );

  return (
    <section className="rounded-[20px] border bg-card p-6">
      <div className="flex items-center gap-[11px]">
        <span aria-hidden="true" className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-primary bg-primary/15">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
        </span>
        <h3 className="text-lg font-bold">Alterar senha</h3>
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Confirme a senha atual e escolha uma nova, com pelo menos {SENHA_MINIMA} caracteres.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3.5" noValidate>
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {campo("senha-atual", "Senha atual", senhaAtual, setSenhaAtual, "current-password")}
        {campo("nova-senha", "Nova senha", novaSenha, setNovaSenha, "new-password", true)}
        {campo("confirmar-senha", "Confirmar nova senha", confirmacao, setConfirmacao, "new-password")}

        <Button type="submit" variant="outline" disabled={salvando} className="w-full rounded-full border-primary bg-primary/15 font-bold text-primary hover:bg-primary/25">
          {salvando ? "Salvando..." : "Alterar senha"}
        </Button>
      </form>
    </section>
  );
}

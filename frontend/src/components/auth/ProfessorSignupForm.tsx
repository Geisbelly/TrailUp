import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { User, Building2, BookOpen, FileText, ArrowRight, Loader2 } from "lucide-react";

const STORAGE_PREFIX = "pending-signup:";

type Props = {
  sessionEmail: string;
  onDone: () => void;
};

export function ProfessorSignupForm({ sessionEmail, onDone }: Props) {
  const [isSaving, setIsSaving] = useState(false);

  const [profData, setProfData] = useState({
    nome: "",
    instituicao: "",
    disciplina: "",
    descricao: "",
    termos: false,
  });

  const submit = async () => {
    if (!profData.termos) {
      toast.error("Aceite os termos para continuar.");
      return;
    }
    if (!profData.nome || !profData.instituicao || !profData.descricao) {
      toast.error("Preencha nome, instituição e descrição.");
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const u = data.user;
      const confirmedAt = u?.email_confirmed_at ?? u?.confirmed_at;
      if (!confirmedAt) {
        toast.error("Email ainda não confirmado. Abra o link do email novamente.");
        return;
      }

      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.user?.id) {
        toast.error("Sessão inválida. Faça login novamente.");
        return;
      }

      const { error: upsertErr } = await supabase.from("professor").upsert({
        id: session.user.id,
        nome: profData.nome,
        descricao: profData.descricao,
        instituicao: profData.instituicao,
        disciplina: profData.disciplina,
        liberado: false,
      });

      if (upsertErr) {
        toast.error(upsertErr.message);
        return;
      }

      localStorage.removeItem(`${STORAGE_PREFIX}${sessionEmail.toLowerCase()}`);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao concluir cadastro.";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-4">
        
        {/* Nome */}
        <div className="space-y-2">
          <Label className="text-zinc-300">Nome completo</Label>
          <div className="relative group">
            <User className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
            <Input 
              value={profData.nome} 
              onChange={(e) => setProfData({ ...profData, nome: e.target.value })}
              className="pl-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all"
              placeholder="Como prefere ser chamado"
            />
          </div>
        </div>

        {/* Instituição e Disciplina (Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Instituição</Label>
            <div className="relative group">
              <Building2 className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
              <Input 
                value={profData.instituicao} 
                onChange={(e) => setProfData({ ...profData, instituicao: e.target.value })}
                className="pl-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all"
                placeholder="Universidade ou Escola"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Disciplina Principal</Label>
            <div className="relative group">
              <BookOpen className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
              <Input 
                value={profData.disciplina} 
                onChange={(e) => setProfData({ ...profData, disciplina: e.target.value })}
                className="pl-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all"
                placeholder="Ex: Gamificação"
              />
            </div>
          </div>
        </div>

        {/* Descrição */}
        <div className="space-y-2">
          <Label className="text-zinc-300">Sobre você</Label>
          <div className="relative group">
            <FileText className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
            <Textarea
              value={profData.descricao}
              onChange={(e) => setProfData({ ...profData, descricao: e.target.value })}
              rows={3}
              className="pl-10 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all resize-none"
              placeholder="Uma breve descrição sobre sua atuação acadêmica..."
            />
          </div>
        </div>

        {/* Termos */}
        <div className="flex items-start space-x-3 pt-2">
          <Checkbox
            id="termos-prof"
            checked={profData.termos}
            onCheckedChange={(v) => setProfData({ ...profData, termos: Boolean(v) })}
            className="border-zinc-700 data-[state=checked]:bg-primary data-[state=checked]:text-white mt-1"
          />
          <Label htmlFor="termos-prof" className="text-sm text-zinc-400 leading-relaxed cursor-pointer hover:text-zinc-300 transition-colors">
            Li e aceito os <span className="underline underline-offset-2">termos de uso</span> e a <span className="underline underline-offset-2">política de privacidade</span> para professores.
          </Label>
        </div>

        {/* Submit Button */}
        <Button 
          onClick={submit} 
          disabled={isSaving} 
          className="w-full bg-primary hover:bg-primary/90 h-11 text-white font-medium"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finalizando cadastro...
            </>
          ) : (
            <>
              Concluir cadastro de professor
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

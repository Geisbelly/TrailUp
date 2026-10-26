import { useState } from "react";
import { Mail, MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART } from "@/lib/design-art";
import { supabase } from "@/integrations/supabase/client";
import { enviarContatoPublico, LIMITES_CONTATO, type ClienteRpcContato } from "@/lib/contatoPublico";

export default function Contato() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({ nome: "", email: "", assunto: "", mensagem: "", armadilha: "" });
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSending(true);
    try {
      const resultado = await enviarContatoPublico(supabase as unknown as ClienteRpcContato, formData);
      if ("mensagem" in resultado) {
        toast({ title: "Erro ao enviar", description: resultado.mensagem, variant: "destructive" });
        return;
      }
      toast({ title: "Mensagem enviada!", description: "Entraremos em contato em breve." });
      setFormData({ nome: "", email: "", assunto: "", mensagem: "", armadilha: "" });
    } catch {
      toast({ title: "Erro ao enviar", description: "Não foi possível enviar sua mensagem. Tente novamente.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PublicLayout scene={DESIGN_ART.lanterns}>
      <PublicPageTitle title="Entre em contato" eyebrow="TrailUp">Dúvidas, sugestões ou uma ideia para compartilhar? Fale com a gente.</PublicPageTitle>
      <div className="contact-layout">
        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-2"><Label htmlFor="nome">Nome completo</Label><Input id="nome" name="nome" autoComplete="name" required minLength={LIMITES_CONTATO.nome.min} maxLength={LIMITES_CONTATO.nome.max} value={formData.nome} onChange={event => setFormData({ ...formData, nome: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required maxLength={LIMITES_CONTATO.email.max} value={formData.email} onChange={event => setFormData({ ...formData, email: event.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="assunto">Assunto</Label><Input id="assunto" name="assunto" required minLength={LIMITES_CONTATO.assunto.min} maxLength={LIMITES_CONTATO.assunto.max} value={formData.assunto} onChange={event => setFormData({ ...formData, assunto: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="mensagem">Mensagem</Label><Textarea id="mensagem" name="mensagem" rows={6} required minLength={LIMITES_CONTATO.mensagem.min} maxLength={LIMITES_CONTATO.mensagem.max} value={formData.mensagem} onChange={event => setFormData({ ...formData, mensagem: event.target.value })} /></div>
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="site">Não preencha este campo</label>
            <input id="site" name="site" type="text" tabIndex={-1} autoComplete="off" value={formData.armadilha} onChange={event => setFormData({ ...formData, armadilha: event.target.value })} />
          </div>
          <Button type="submit" disabled={isSending} className="min-h-12 justify-self-start gap-2">{isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}{isSending ? "Enviando..." : "Enviar mensagem"}</Button>
        </form>
        <aside className="contact-channels">
          <div><h2><Mail size={20} className="text-secondary" />Mensagem</h2><p>Parcerias e dúvidas gerais: use o formulário ao lado. Respondemos no e-mail que você informar.</p></div>
          <div><h2><MessageSquare size={20} className="text-accent" />Suporte e privacidade</h2><p>Ajuda com a conta, relatório dos seus dados ou exclusão: no app, em Perfil › Privacidade, ou por este formulário.</p></div>
        </aside>
      </div>
    </PublicLayout>
  );
}

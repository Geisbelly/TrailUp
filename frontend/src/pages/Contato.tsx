import { useState } from "react";
import { Mail, MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART } from "@/lib/design-art";

export default function Contato() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({ nome: "", email: "", assunto: "", mensagem: "" });
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSending(true);
    try {
      const response = await fetch("https://formsubmit.co/ajax/geisbelly19@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...formData, _subject: "Novo contato - TrailUp", _captcha: "false" }),
      });
      if (!response.ok) throw new Error("Erro ao enviar formulário");
      toast({ title: "Mensagem enviada!", description: "Entraremos em contato em breve." });
      setFormData({ nome: "", email: "", assunto: "", mensagem: "" });
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
            <div className="space-y-2"><Label htmlFor="nome">Nome completo</Label><Input id="nome" name="nome" autoComplete="name" required value={formData.nome} onChange={event => setFormData({ ...formData, nome: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required value={formData.email} onChange={event => setFormData({ ...formData, email: event.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="assunto">Assunto</Label><Input id="assunto" name="assunto" required value={formData.assunto} onChange={event => setFormData({ ...formData, assunto: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="mensagem">Mensagem</Label><Textarea id="mensagem" name="mensagem" rows={6} required value={formData.mensagem} onChange={event => setFormData({ ...formData, mensagem: event.target.value })} /></div>
          <Button type="submit" disabled={isSending} className="min-h-12 justify-self-start gap-2">{isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}{isSending ? "Enviando..." : "Enviar mensagem"}</Button>
        </form>
        <aside className="contact-channels">
          <div><h2><Mail size={20} className="text-secondary" />Email</h2><p>Parcerias e dúvidas gerais.</p><a href="mailto:geisbelly19@gmail.com">geisbelly19@gmail.com</a></div>
          <div><h2><MessageSquare size={20} className="text-accent" />Suporte</h2><p>Ajuda com sua conta ou com o aprendizado.</p><a href="mailto:geisbelly19@gmail.com">Falar com o suporte</a></div>
        </aside>
      </div>
    </PublicLayout>
  );
}

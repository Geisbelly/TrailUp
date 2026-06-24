import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {  Mail, MessageSquare, Send, Sparkles, User, FileText, AtSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import Header from "@/components/Header";



const Contato = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    assunto: "",
    mensagem: "",
  });
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSending(true);

    try {
      const response = await fetch(
        "https://formsubmit.co/ajax/geisbelly19@gmail.com",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            nome: formData.nome,
            email: formData.email,
            assunto: formData.assunto,
            mensagem: formData.mensagem,
            _subject: "Novo contato - TrailUp",
            _captcha: "false",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao enviar formulário");
      }

      toast({
        title: "Mensagem enviada!",
        description: "Entraremos em contato em breve.",
      });

      setFormData({ nome: "", email: "", assunto: "", mensagem: "" });
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: "Não foi possível enviar sua mensagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col overflow-x-hidden selection:bg-primary/30 relative">
      
      {/* Background Effects (Consistente com Download/Blog/Login) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {/* Orbes de luz sutis */}
        {/* <div className="absolute top-[-10%] left-[-5%] w-[800px] h-[800px] bg-primary/10 blur-[120px] rounded-full opacity-40 animate-pulse duration-[4000ms]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-600/5 blur-[100px] rounded-full opacity-30 animate-pulse duration-[5000ms] delay-1000" /> */}
      </div>

      <Header />

      {/* Main Content */}
      <main className="relative z-10 pt-20 pb-20 px-4 flex-grow">
        
        {/* Hero Section */}
        <section className="container mx-auto text-center max-w-4xl mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center justify-center px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium uppercase tracking-wider mb-6 shadow-[0_0_15px_-3px_rgba(124,58,237,0.2)]">
            <Sparkles className="w-3 h-3 mr-2" />
            Fale Conosco
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
            Entre em <span className="bg-gradient-to-r from-primary via-purple-400 to-primary bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">Contato</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Tem dúvidas, sugestões ou quer saber mais sobre a gamificação no TrailUp? Estamos prontos para te ouvir.
          </p>
        </section>

        {/* Form & Cards Grid */}
        <section className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
            
            {/* Contact Form Column */}
            <div className="lg:col-span-3 animate-in fade-in slide-in-from-left-8 duration-700 delay-100">
              <Card className="p-8 border-border/50 bg-card/40 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
                {/* Glow interno no card */}
                <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="nome" className="text-zinc-300 ml-1">Nome Completo</Label>
                      <div className="relative group/input">
                        <User className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within/input:text-primary transition-colors" />
                        <Input
                          id="nome"
                          name="nome"
                          placeholder="Seu nome"
                          required
                          value={formData.nome}
                          onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
                          className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-primary/50 focus:ring-primary/20 h-11 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-zinc-300 ml-1">Email</Label>
                      <div className="relative group/input">
                        <AtSign className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within/input:text-primary transition-colors" />
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="seu@email.com"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                          className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-primary/50 focus:ring-primary/20 h-11 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assunto" className="text-zinc-300 ml-1">Assunto</Label>
                    <div className="relative group/input">
                      <FileText className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within/input:text-primary transition-colors" />
                      <Input
                        id="assunto"
                        name="assunto"
                        placeholder="Sobre o que você quer falar?"
                        required
                        value={formData.assunto}
                        onChange={(e) => setFormData((prev) => ({ ...prev, assunto: e.target.value }))}
                        className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-primary/50 focus:ring-primary/20 h-11 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mensagem" className="text-zinc-300 ml-1">Mensagem</Label>
                    <Textarea
                      id="mensagem"
                      name="mensagem"
                      placeholder="Escreva sua mensagem aqui..."
                      rows={6}
                      required
                      value={formData.mensagem}
                      onChange={(e) => setFormData((prev) => ({ ...prev, mensagem: e.target.value }))}
                      className="bg-zinc-900/50 border-zinc-800 focus:border-primary/50 focus:ring-primary/20 resize-none transition-all"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-base shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300 group/btn"
                    disabled={isSending}
                  >
                    {isSending ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Enviando...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Enviar Mensagem 
                        <Send className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                      </span>
                    )}
                  </Button>
                </form>
              </Card>
            </div>

            {/* Info Cards Column */}
            <div className="lg:col-span-2 space-y-6 animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
              
              <Card className="p-6 border-border/50 bg-card/40 backdrop-blur-xl hover:bg-card/60 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 group">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300 border border-primary/10">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">Email</h3>
                    <p className="text-sm text-muted-foreground mb-2">Para parcerias e dúvidas gerais.</p>
                    <a href="mailto:geisbelly19@gmail.com" className="text-sm font-medium text-primary hover:underline underline-offset-4">
                      geisbelly19@gmail.com
                    </a>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-border/50 bg-card/40 backdrop-blur-xl hover:bg-card/60 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 group">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300 border border-primary/10">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">Suporte</h3>
                    <p className="text-sm text-muted-foreground mb-2">Problemas técnicos ou ajuda com a conta.</p>
                    <a href="mailto:geisbelly19@gmail.com" className="text-sm font-medium text-primary hover:underline underline-offset-4">
                      Falar com suporte
                    </a>
                  </div>
                </div>
              </Card>

              {/* Decorative Element */}
              <div className="relative mt-8 p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-600/5 border border-primary/10 overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:16px_16px]" />
                <div className="relative z-10 text-center space-y-2">
                  <p className="text-sm font-medium text-primary">Tempo médio de resposta</p>
                  <p className="text-3xl font-bold text-foreground">24 horas</p>
                  <p className="text-xs text-muted-foreground">Em dias úteis</p>
                </div>
              </div>

            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
};

export default Contato;
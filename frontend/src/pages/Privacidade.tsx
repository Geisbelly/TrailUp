import { Hexagon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const Privacidade = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Content */}
      <div className="py-12 px-4 pt-20">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-8 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Política de Privacidade — TrailUp
          </h1>

          <Card className="p-8 border-primary/20 bg-card/50 backdrop-blur space-y-6">
            <section className="bg-accent/10 p-4 rounded-lg border border-accent/20">
              <h2 className="text-xl font-bold mb-3 text-accent">Uso para Pesquisa Acadêmica</h2>
              <p className="text-muted-foreground leading-relaxed">
                Este aplicativo faz parte de um projeto de pesquisa acadêmica conduzido pela aluna de Ciência da Computação da Ulbra Palmas, Geisbelly Victória. 
                Ao utilizar o TrailUp, o usuário pode responder questionários e interagir com atividades que 
                ajudam a montar um perfil de aprendizagem. As respostas são utilizadas exclusivamente para fins 
                educacionais e de pesquisa, e podem ser acessadas pelos professores responsáveis pelas disciplinas 
                participantes (incluindo Redes de Computadores). Todos os dados são tratados com confidencialidade 
                e não são compartilhados fora da instituição.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">1. Finalidade do Aplicativo</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                O TrailUp é um aplicativo educacional desenvolvido inicialmente para estudantes de graduação da 
                ULBRA Palmas, especialmente da disciplina de Redes. O aplicativo também faz parte de um projeto 
                de pesquisa acadêmica, o que exige coleta e análise de dados educacionais.
              </p>
              <p className="text-muted-foreground leading-relaxed font-semibold">O TrailUp tem dois objetivos:</p>
              <ol className="list-decimal ml-6 space-y-2 text-muted-foreground mt-2">
                <li>Apoiar o aprendizado dos alunos por meio de trilhas adaptativas e atividades gamificadas.</li>
                <li>Coletar informações educacionais e comportamentais para fins de pesquisa acadêmica, visando 
                aprimorar modelos de ensino, perfis de aprendizagem e estratégias pedagógicas.</li>
              </ol>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">2. Quais Dados São Coletados</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                O TrailUp coleta somente dados relevantes para funcionamento do app e para fins educacionais/pesquisa.
              </p>
              
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <p className="font-semibold text-foreground">2.1 Dados fornecidos pelo usuário</p>
                  <ul className="list-disc ml-6 space-y-1 mt-2">
                    <li>Nome ou apelido</li>
                    <li>E-mail (em caso de criação de conta)</li>
                    <li>Respostas de questionários de aprendizagem</li>
                    <li>Respostas de quizzes e atividades</li>
                    <li>Preferências dentro do app (ex.: escolha de trilhas, tempo de estudo)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-foreground">2.2 Dados derivados</p>
                  <p className="mb-2">Usados para criar o perfil de aprendizagem, com base em:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Ritmo de estudo</li>
                    <li>Erros e acertos</li>
                    <li>Padrão de navegação</li>
                    <li>Módulos mais acessados</li>
                    <li>Tempo entre atividades</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-foreground">2.3 Dados NÃO coletados</p>
                  <ul className="list-disc ml-6 space-y-1 mt-2">
                    <li>Fotos, vídeos</li>
                    <li>Dados biométricos</li>
                    <li>Microfone</li>
                    <li>Localização</li>
                    <li>Arquivos pessoais</li>
                    <li>Contatos</li>
                    <li>Dados sensíveis não relacionados ao estudo</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-foreground">2.4 Câmera</p>
                  <p className="mt-2">
                    A versão atual do TrailUp não utiliza a câmera. 
                    Se um dia isso mudar, o app pedirá permissão explícita antes.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">3. Uso dos Dados para Pesquisa</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Os dados coletados serão utilizados exclusivamente para:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground">
                <li>Análise de padrões de aprendizagem</li>
                <li>Ajuste de trilhas e níveis de dificuldade</li>
                <li>Melhorias pedagógicas</li>
                <li>Produção de artigos, relatórios ou TCCs</li>
                <li>Estudos sobre perfis comportamentais usados em gamificação educacional</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3 font-semibold">
                Os dados nunca serão usados para marketing, anúncios ou qualquer finalidade comercial.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">4. Acesso dos Professores</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Dentro do contexto acadêmico:
              </p>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Professores da ULBRA Palmas, especialmente da disciplina de Redes e cursos envolvidos, 
                poderão acessar dados acadêmicos dos alunos, incluindo:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mb-3">
                <li>Desempenho</li>
                <li>Progresso</li>
                <li>Respostas de atividades</li>
                <li>Perfis de aprendizagem gerados automaticamente</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mb-3">Tudo isso serve para:</p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mb-3">
                <li>Acompanhar evolução</li>
                <li>Adaptar práticas de ensino</li>
                <li>Avaliar engajamento</li>
                <li>Identificar dificuldades</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed font-semibold">
                Nenhum professor poderá visualizar:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>E-mail pessoal (a menos que o aluno tenha fornecido voluntariamente)</li>
                <li>Informações sensíveis</li>
                <li>Qualquer dado fora do escopo educacional</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">5. Como os Dados São Armazenados</h2>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground">
                <li>Guardados de forma criptografada e protegida</li>
                <li>Hospedados em servidores seguros</li>
                <li>Nunca vendidos ou compartilhados com terceiros</li>
                <li>Acesso restrito somente à equipe do projeto e docentes envolvidos</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">6. Direitos do Usuário</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                Você pode, a qualquer momento:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground">
                <li>Solicitar exclusão de conta</li>
                <li>Solicitar remoção dos seus dados</li>
                <li>Pedir um relatório completo do que o app sabe sobre você</li>
                <li>Optar por não participar da pesquisa (mas isso pode limitar algumas funções do app)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">7. Participação Voluntária</h2>
              <p className="text-muted-foreground leading-relaxed">
                O uso do TrailUp para fins de pesquisa é totalmente voluntário. 
                O usuário pode utilizar o app apenas para estudo, mesmo sem participar da parte analítica.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">8. Alterações</h2>
              <p className="text-muted-foreground leading-relaxed">
                Qualquer mudança nesta política será publicada dentro do app e no repositório oficial.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">9. Contato</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para questões sobre esta Política de Privacidade ou sobre seus dados, entre em contato através 
                da nossa <Link to="/contato" className="text-primary hover:underline">página de contato</Link>.
              </p>
            </section>

            <div className="pt-6 border-t border-border mt-8">
              <p className="text-sm text-muted-foreground">
                Última atualização: {new Date().toLocaleDateString('pt-BR')}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Privacidade;

import { Hexagon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const Termos = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Content */}
      <div className="py-12 px-4 pt-20">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-8 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Termos de Uso
          </h1>

          <Card className="p-8 border-primary/20 bg-card/50 backdrop-blur space-y-6">
            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">1. Aceitação dos Termos</h2>
              <p className="text-muted-foreground leading-relaxed">
                Ao acessar e usar a plataforma TrailUp, você concorda em cumprir e estar vinculado a estes 
                Termos de Uso. Se você não concorda com estes termos, por favor, não use nossa plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">2. Descrição do Serviço</h2>
              <p className="text-muted-foreground leading-relaxed">
                O TrailUp é uma plataforma educacional gamificada que oferece:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>Trilhas de aprendizado personalizadas</li>
                <li>Sistema de gamificação com badges e conquistas</li>
                <li>Mapeamento de perfil de aprendizado via BrainHex</li>
                <li>Acompanhamento de progresso e desempenho</li>
                <li>Rankings e competições saudáveis</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">3. Registro e Conta</h2>
              <div className="space-y-3 text-muted-foreground">
                <p className="font-semibold">3.1. Requisitos:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Você deve ter pelo menos 18 anos ou consentimento parental</li>
                  <li>Fornecer informações precisas e atualizadas</li>
                  <li>Manter a segurança de sua senha</li>
                  <li>Notificar-nos sobre uso não autorizado de sua conta</li>
                </ul>
                
                <p className="font-semibold mt-4">3.2. Responsabilidades:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Você é responsável por toda atividade em sua conta</li>
                  <li>Não compartilhar credenciais de acesso</li>
                  <li>Manter seus dados de contato atualizados</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">4. Uso Aceitável</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">Você concorda em NÃO:</p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground">
                <li>Usar a plataforma para fins ilegais</li>
                <li>Tentar acessar áreas restritas do sistema</li>
                <li>Interferir com a operação da plataforma</li>
                <li>Fazer engenharia reversa ou copiar o código</li>
                <li>Criar múltiplas contas para ganhar vantagem indevida</li>
                <li>Assediar, intimidar ou prejudicar outros usuários</li>
                <li>Compartilhar conteúdo ofensivo ou inapropriado</li>
                <li>Usar bots ou automação não autorizada</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">5. Propriedade Intelectual</h2>
              <div className="space-y-3 text-muted-foreground">
                <p className="font-semibold">5.1. Propriedade do TrailUp:</p>
                <p>
                  Todo o conteúdo, design, código, marca e materiais da plataforma são de propriedade 
                  exclusiva do TrailUp e protegidos por leis de direitos autorais.
                </p>
                
                <p className="font-semibold mt-4">5.2. Licença de Uso:</p>
                <p>
                  Concedemos a você uma licença limitada, não exclusiva e não transferível para usar a 
                  plataforma para fins educacionais pessoais.
                </p>

                <p className="font-semibold mt-4">5.3. Conteúdo do Usuário:</p>
                <p>
                  Você mantém os direitos sobre o conteúdo que criar, mas nos concede licença para usar, 
                  modificar e exibir esse conteúdo na plataforma.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">6. Gamificação e Rankings</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>Quanto aos elementos de gamificação:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Badges, conquistas e pontos não têm valor monetário</li>
                  <li>Rankings são baseados em desempenho legítimo</li>
                  <li>Reservamo-nos o direito de ajustar ou remover conquistas</li>
                  <li>Tentativas de manipular o sistema resultarão em penalidades</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">7. Privacidade de Dados</h2>
              <p className="text-muted-foreground leading-relaxed">
                O uso de seus dados pessoais é regido por nossa{" "}
                <Link to="/privacidade" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
                . Ao usar a plataforma, você concorda com a coleta e uso de dados conforme descrito 
                naquela política.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">8. Modificações do Serviço</h2>
              <p className="text-muted-foreground leading-relaxed">
                Reservamo-nos o direito de:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>Modificar ou descontinuar recursos a qualquer momento</li>
                <li>Atualizar conteúdo e funcionalidades</li>
                <li>Realizar manutenção programada ou emergencial</li>
                <li>Alterar estes Termos de Uso (com notificação prévia)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">9. Suspensão e Encerramento</h2>
              <div className="space-y-3 text-muted-foreground">
                <p className="font-semibold">9.1. Suspensão:</p>
                <p>
                  Podemos suspender sua conta temporariamente se detectarmos violação destes termos.
                </p>
                
                <p className="font-semibold mt-4">9.2. Encerramento por Usuário:</p>
                <p>
                  Você pode encerrar sua conta a qualquer momento através das configurações ou 
                  entrando em contato conosco.
                </p>

                <p className="font-semibold mt-4">9.3. Encerramento pela Plataforma:</p>
                <p>
                  Podemos encerrar sua conta em caso de violação grave ou repetida destes termos.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">10. Isenção de Garantias</h2>
              <p className="text-muted-foreground leading-relaxed">
                A plataforma é fornecida "como está" e "conforme disponível". Não garantimos que:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>O serviço será ininterrupto ou livre de erros</li>
                <li>Todos os bugs serão corrigidos</li>
                <li>A plataforma atenderá suas expectativas específicas</li>
                <li>Os resultados de aprendizado serão garantidos</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">11. Limitação de Responsabilidade</h2>
              <p className="text-muted-foreground leading-relaxed">
                Na máxima extensão permitida por lei, o TrailUp não será responsável por:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>Danos indiretos, incidentais ou consequenciais</li>
                <li>Perda de dados ou lucros</li>
                <li>Interrupções de negócios ou estudos</li>
                <li>Ações de terceiros</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">12. Lei Aplicável</h2>
              <p className="text-muted-foreground leading-relaxed">
                Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa 
                será resolvida nos tribunais brasileiros competentes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">13. Contato</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para questões sobre estes Termos de Uso, entre em contato:
              </p>
              <div className="mt-2 text-muted-foreground">
                <p>Email: legal@trailup.com</p>
                <p>Ou através da nossa <Link to="/contato" className="text-primary hover:underline">página de contato</Link></p>
              </div>
            </section>

            <div className="pt-6 border-t border-border mt-8">
              <p className="text-sm text-muted-foreground">
                Última atualização: 15 de janeiro de 2025
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Termos;

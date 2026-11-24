import { Link } from "react-router-dom";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";

const Termos = () => {
  return (
    <PublicLayout>
        <div className="public-article">
          <PublicPageTitle title="Termos de uso" eyebrow="TrailUp" />
          <article className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">1. Aceitação dos termos</h2>
              <p className="text-muted-foreground leading-relaxed">
                Ao acessar e usar a plataforma TrailUp, você concorda em cumprir e estar vinculado a estes 
                Termos de Uso. Se você não concorda com estes termos, por favor, não use nossa plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">2. Descrição do serviço</h2>
              <p className="text-muted-foreground leading-relaxed">
                O TrailUp é uma plataforma educacional gamificada que oferece:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>Trilhas de estudo com material gerado no formato de cada perfil e revisado pelo professor</li>
                <li>Missões, conquistas, eventos, guildas, ranking da turma e moedas virtuais</li>
                <li>Perfil de preferências de engajamento, com base no modelo BrainHex</li>
                <li>Acompanhamento de progresso e desempenho</li>
                <li>Console do professor, com a assistente Lumi</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">3. Cadastro e conta</h2>
              <div className="space-y-3 text-muted-foreground">
                <p className="font-semibold">3.1. Requisitos</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>
                    Informar sua data de nascimento. A inteligência artificial do TrailUp (mentor,
                    correção de respostas e personalização por aluno) é só para maiores de 18 anos:
                    quem tem menos de 18, ou não informou a data, usa o app sem ela, mesmo com a
                    autorização do responsável. Se você tiver menos de 18 anos, câmera,
                    análise de emoções, telemetria de uso e pesquisa só são ligados
                    depois que um dos pais ou o responsável legal autorizar, item por item, numa
                    tela própria do aplicativo ou pelo termo em papel entregue ao professor
                    (LGPD, art. 14). Até lá, trilhas, questões e progresso funcionam normalmente,
                    e a autorização pode ser revogada a qualquer momento em Perfil › Coleta e acessos.
                  </li>
                  <li>Fornecer informações precisas e atualizadas</li>
                  <li>Manter a segurança de sua senha</li>
                  <li>Notificar-nos sobre uso não autorizado de sua conta</li>
                </ul>
                
                <p className="font-semibold mt-4">3.2. Responsabilidades</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Você é responsável por toda atividade em sua conta</li>
                  <li>Não compartilhar credenciais de acesso</li>
                  <li>Manter seus dados de contato atualizados</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">4. Uso aceitável</h2>
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
              <h2 className="text-2xl font-bold mb-4 text-primary">5. Propriedade intelectual</h2>
              <div className="space-y-3 text-muted-foreground">
                <p className="font-semibold">5.1. Propriedade do TrailUp</p>
                <p>
                  Todo o conteúdo, design, código, marca e materiais da plataforma são de propriedade 
                  exclusiva do TrailUp e protegidos por leis de direitos autorais.
                </p>
                
                <p className="font-semibold mt-4">5.2. Licença de uso</p>
                <p>
                  Concedemos a você uma licença limitada, não exclusiva e não transferível para usar a 
                  plataforma para fins educacionais pessoais.
                </p>

                <p className="font-semibold mt-4">5.3. Conteúdo do usuário</p>
                <p>
                  Você mantém os direitos sobre o conteúdo que criar, mas nos concede licença para usar, 
                  modificar e exibir esse conteúdo na plataforma.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">6. Gamificação e ranking</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>Quanto aos elementos de gamificação:</p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Moedas, conquistas e pontos não têm valor em dinheiro e só valem dentro do TrailUp</li>
                  <li>Rankings são baseados em desempenho legítimo</li>
                  <li>Reservamo-nos o direito de ajustar ou remover conquistas</li>
                  <li>Tentativas de manipular o sistema resultarão em penalidades</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">7. Privacidade de dados</h2>
              <p className="text-muted-foreground leading-relaxed">
                O uso de seus dados pessoais é regido por nossa{" "}
                <Link to="/privacidade" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
                . Câmera, personalização emocional, pesquisa e notificações são opcionais e dependem
                de consentimento próprio (para menores de 18 anos, do responsável legal), que pode ser
                revogado a qualquer momento. Parte dos dados é processada por fornecedores de tecnologia
                e de inteligência artificial, em sua maioria nos Estados Unidos, conforme listado na
                política.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">8. Mudanças no serviço</h2>
              <p className="text-muted-foreground leading-relaxed">
                Reservamo-nos o direito de:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-muted-foreground mt-2">
                <li>Modificar ou descontinuar recursos a qualquer momento</li>
                <li>Atualizar conteúdo e funcionalidades</li>
                <li>Realizar manutenção programada ou emergencial</li>
                <li>Alterar estes termos de uso, com aviso prévio</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">9. Suspensão e encerramento</h2>
              <div className="space-y-3 text-muted-foreground">
                <p className="font-semibold">9.1. Suspensão</p>
                <p>
                  Podemos suspender sua conta temporariamente se detectarmos violação destes termos.
                </p>
                
                <p className="font-semibold mt-4">9.2. Encerramento pelo usuário</p>
                <p>
                  Você pode encerrar sua conta a qualquer momento através das configurações ou 
                  entrando em contato conosco.
                </p>

                <p className="font-semibold mt-4">9.3. Encerramento pela plataforma</p>
                <p>
                  Podemos encerrar sua conta em caso de violação grave ou repetida destes termos.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">10. Isenção de garantias</h2>
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
              <h2 className="text-2xl font-bold mb-4 text-primary">11. Limitação de responsabilidade</h2>
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
              <h2 className="text-2xl font-bold mb-4 text-primary">12. Lei aplicável</h2>
              <p className="text-muted-foreground leading-relaxed">
                Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa 
                será resolvida nos tribunais brasileiros competentes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-primary">13. Contato</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para dúvidas sobre estes termos de uso:
              </p>
              <div className="mt-2 text-muted-foreground">
                <p>
                  Pela nossa <Link to="/contato" className="text-primary hover:underline">página de contato</Link> ou
                  pelo e-mail do encarregado, na{" "}
                  <Link to="/privacidade" className="text-primary hover:underline">Política de privacidade</Link>.
                </p>
              </div>
            </section>

            <div className="pt-6 border-t border-border mt-8">
              <p className="text-sm text-muted-foreground">
                Última atualização: 23/11/2026
              </p>
            </div>
          </article>
        </div>
    </PublicLayout>
  );
};

export default Termos;

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";

const PRIVACIDADE_ATUALIZADA_EM = "24/10/2026";

const Secao = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section>
    <h2 className="text-2xl font-bold mb-4 text-primary">{titulo}</h2>
    <div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const Lista = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc ml-6 space-y-1">{children}</ul>
);

const Privacidade = () => {
  return (
    <PublicLayout>
        <div className="public-article">
          <PublicPageTitle title="Política de Privacidade" eyebrow="TrailUp" />
          <article className="space-y-8">
            <section className="bg-accent/10 p-4 rounded-lg border border-accent/20">
              <h2 className="text-xl font-bold mb-3 text-accent">Uso para Pesquisa Acadêmica</h2>
              <p className="text-muted-foreground leading-relaxed">
                O TrailUp faz parte de um projeto de pesquisa acadêmica conduzido pela aluna de Ciência da
                Computação da Ulbra Palmas, Geisbelly Victória. Os dados são usados para o funcionamento do
                app, para apoiar o ensino e para a pesquisa. Eles podem ser vistos pelos professores das
                turmas participantes e são processados por fornecedores de tecnologia listados na seção 6,
                alguns fora do Brasil. Nenhum dado é vendido.
              </p>
            </section>

            <Secao titulo="1. Finalidade do Aplicativo">
              <p>
                O TrailUp é um aplicativo educacional criado inicialmente para estudantes da ULBRA Palmas,
                especialmente da disciplina de Redes de Computadores. Ele tem dois objetivos:
              </p>
              <ol className="list-decimal ml-6 space-y-2">
                <li>Apoiar o aprendizado com trilhas adaptativas e atividades gamificadas.</li>
                <li>
                  Coletar informações educacionais e de uso para pesquisa acadêmica, visando aprimorar
                  modelos de ensino, perfis de aprendizagem e estratégias pedagógicas.
                </li>
              </ol>
            </Secao>

            <Secao titulo="2. Quais Dados São Coletados">
              <p className="font-semibold text-foreground">2.1 Dados fornecidos por você</p>
              <Lista>
                <li>Nome, e-mail e data de nascimento (a data serve para saber se é preciso autorização do responsável)</li>
                <li>Respostas de questionários de aprendizagem (BrainHex), quizzes, redações e atividades</li>
                <li>Mensagens enviadas ao mentor do app e pelo formulário de contato</li>
                <li>Preferências no app e as escolhas de consentimento</li>
              </Lista>
              <p className="font-semibold text-foreground">2.2 Dados de uso e derivados</p>
              <Lista>
                <li>Ritmo de estudo, acertos e erros, tempo nas atividades, progresso, moedas e ranking</li>
                <li>Perfil de aprendizagem e, se você permitir, estado emocional estimado (seção 3)</li>
                <li>Token do aparelho para notificações</li>
              </Lista>
              <p className="font-semibold text-foreground">2.3 Câmera (opcional, desligada por padrão)</p>
              <p>
                A câmera só é usada se você ligar e permitir a finalidade de câmera e a de personalização
                emocional nas configurações. Para menores de 18 anos, também é preciso a autorização do
                responsável. Com a câmera ligada, imagens do rosto são enviadas ao servidor da TrailUp
                (nos Estados Unidos). Quando a análise por imagem está ativada na configuração do servidor,
                elas são analisadas na memória por modelos abertos de detecção de rosto e de expressão
                (YuNet e FER+) para estimar a emoção. Se essa análise não estiver ativada, a estimativa usa
                só sinais de uso. As imagens <strong>não são gravadas nem enviadas a terceiros</strong>,
                inclusive provedores de inteligência artificial. Fica guardado só o resultado (a emoção
                estimada).
              </p>
            </Secao>

            <Secao titulo="3. Inferência Emocional">
              <p>
                Se você permitir, o TrailUp estima seu estado emocional a partir de sinais de uso e,
                quando a câmera está ligada, da análise de imagem descrita acima. Isso serve para:
              </p>
              <Lista>
                <li>adaptar ritmo, temas e a oferta de apoio no app;</li>
                <li>avisar o professor de que um aluno pode precisar de apoio.</li>
              </Lista>
              <p>
                O professor vê só uma faixa ("precisa de apoio" ou "ok"). Ele não vê pontuação, histórico
                nem imagem. A estimativa não é diagnóstico e não é usada para nota, ranking ou punição.
                O professor pode desconsiderar um alerta. Você (ou o seu responsável) pode ver e contestar a
                estimativa, e desligar a personalização emocional sem perder as demais funções. A emoção
                estimada, sem a imagem, faz parte das informações enviadas aos provedores de inteligência
                artificial (seção 6) para personalizar o conteúdo.
              </p>
            </Secao>

            <Secao titulo="4. Menores de 18 Anos">
              <Lista>
                <li>
                  Para menores, cada finalidade opcional (câmera, personalização emocional, pesquisa,
                  notificações) depende da autorização do responsável legal. Ela pode ser dada no app ou
                  no formulário em papel entregue ao professor. Sem autorização, o app funciona em modo
                  restrito.
                </li>
                <li>
                  O conteúdo gerado por inteligência artificial para menores, ou para quem não informou a
                  data de nascimento, usa só a OpenAI, com a opção de não armazenar as conversas ativada.
                  Para eles ficam desligadas a geração de imagens e a leitura em voz alta por serviços do
                  Google.
                </li>
              </Lista>
            </Secao>

            <Secao titulo="5. Como os Dados São Usados">
              <Lista>
                <li>Montar trilhas, missões e o feedback personalizado</li>
                <li>Mostrar ao professor o progresso da turma e os alertas de apoio</li>
                <li>Pesquisa acadêmica, com os dados tratados de forma agregada ou pseudonimizada nas publicações</li>
                <li>Segurança e funcionamento do serviço</li>
              </Lista>
              <p>
                Nome e e-mail não são enviados nas instruções aos provedores de inteligência artificial: o
                aluno é identificado por um código interno. Textos que você mesmo escreve (redações,
                mensagens ao mentor) são enviados como estão, então evite incluir dados pessoais neles.
              </p>
            </Secao>

            <Secao titulo="6. Compartilhamento e Transferência Internacional">
              <p>
                Os dados não são vendidos. Eles são compartilhados com os professores das turmas e com os
                fornecedores abaixo, que os tratam em nome do TrailUp. A maioria fica nos Estados Unidos,
                o que é uma transferência internacional de dados (LGPD, arts. 33 a 36).
              </p>
              <Lista>
                <li>Supabase (banco de dados, login e arquivos): Estados Unidos</li>
                <li>Hetzner (servidor da API e análise de imagem da câmera): Estados Unidos</li>
                <li>Vercel (hospedagem deste site): Estados Unidos e rede global</li>
                <li>Google Gemini (inteligência artificial, só para maiores de 18 anos confirmados): Estados Unidos e outros países</li>
                <li>OpenAI (inteligência artificial; única opção para menores): Estados Unidos</li>
                <li>Cloudflare R2 (armazenamento de arquivos): local em confirmação</li>
                <li>Expo, Google (FCM) e Apple (APNs) (notificações): Estados Unidos</li>
                <li>Brevo (e-mails de contato do app): União Europeia</li>
                <li>Google (login com Google, vídeos do YouTube e fontes) e Microsoft (visualização de documentos)</li>
              </Lista>
              <p>
                Estamos formalizando com esses fornecedores as cláusulas contratuais exigidas pela ANPD para
                a transferência internacional. A lista completa, com finalidade e retenção de cada um, está
                no registro de transferências do projeto e é atualizada sempre que um fornecedor muda.
              </p>
            </Secao>

            <Secao titulo="7. Por Quanto Tempo Guardamos">
              <Lista>
                <li>Telemetria bruta de uso: 90 dias (180 dias quando autorizada para pesquisa)</li>
                <li>Indicadores derivados da telemetria: 13 meses (24 meses para pesquisa)</li>
                <li>Estado emocional estimado: 30 dias</li>
                <li>Imagens da câmera: não são guardadas</li>
                <li>Conta inativa: apagada após 24 meses, com aviso e mais 30 dias de prazo</li>
                <li>
                  Ao sair de uma turma: o conteúdo gerado para você é apagado em 90 dias; notas, moedas e
                  ranking, em 365 dias
                </li>
                <li>Registro do consentimento: 5 anos depois de apagada a conta, como prova legal</li>
              </Lista>
            </Secao>

            <Secao titulo="8. Segurança">
              <p>
                Usamos acesso autenticado, regras de acesso por usuário no banco de dados e conexões
                criptografadas. Cada pessoa vê só o que o seu papel permite (aluno, professor).
              </p>
            </Secao>

            <Secao titulo="9. Seus Direitos (LGPD, art. 18)">
              <p>Você, ou o seu responsável legal se você for menor, pode:</p>
              <Lista>
                <li>confirmar e acessar seus dados ("Gerar relatório dos dados", em Perfil › Privacidade);</li>
                <li>corrigir dados incompletos ou errados;</li>
                <li>pedir a exclusão da conta ("Solicitar exclusão da conta");</li>
                <li>revogar ou mudar consentimentos a qualquer momento (Perfil › Coleta e acessos);</li>
                <li>contestar a estimativa emocional e pedir revisão humana;</li>
                <li>saber com quem os dados são compartilhados (seção 6).</li>
              </Lista>
            </Secao>

            <Secao titulo="10. Contato">
              <p>
                Para exercer seus direitos ou tirar dúvidas sobre esta política, use a nossa{" "}
                <Link to="/contato" className="text-primary hover:underline">página de contato</Link>.
              </p>
            </Secao>

            <div className="pt-6 border-t border-border mt-8">
              <p className="text-sm text-muted-foreground">
                Última atualização: {PRIVACIDADE_ATUALIZADA_EM}
              </p>
            </div>
          </article>
        </div>
    </PublicLayout>
  );
};

export default Privacidade;

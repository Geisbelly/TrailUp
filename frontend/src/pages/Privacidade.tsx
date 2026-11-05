import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";

const PRIVACIDADE_ATUALIZADA_EM = "05/11/2026";

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
                A câmera só é usada se você ligar e permitir as finalidades de câmera e personalização
                emocional. Para menores de 18 anos, também é necessária autorização do responsável. As imagens
                do rosto são enviadas ao servidor da TrailUp nos Estados Unidos. Quando o provedor local
                `local_vision` está explicitamente configurado — como na API de produção —, YuNet e FER+
                analisam as imagens na memória, sem enviá-las a provedores externos. Sem essa configuração
                ou sem resultado de análise, a emoção fica indisponível; sinais de uso não são usados como
                substituto. A imagem não é gravada; categoria, confiança e resumo ficam por 30 dias.
              </p>
            </Secao>

            <Secao titulo="3. Inferência Emocional">
              <p>
                Quando a análise visual estiver explicitamente ativada e você tiver autorizado a câmera e a
                personalização emocional, o TrailUp estima uma expressão facial. Sem esse sinal, a emoção fica
                indisponível; sinais comportamentais não são usados para inferir emoção. Isso serve para:
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
                  A inteligência artificial do TrailUp é só para maiores de 18 anos. Para o aluno menor,
                  ou que não informou a data de nascimento, ficam desligados o mentor, a correção
                  automática de respostas, a personalização por aluno, a geração de imagens e a leitura em
                  voz alta, mesmo com a autorização do responsável: nada do que ele faz no app é enviado a
                  provedor de inteligência artificial.
                </li>
                <li>
                  Há uma exceção: a Lumi, a assistente do professor no console. Quando o professor
                  pergunta sobre a turma, a Lumi envia ao provedor de inteligência artificial (seção 6) os
                  indicadores da turma e de cada aluno, inclusive dos menores: perfil de aprendizagem,
                  progresso, respostas e acertos dos últimos 30 dias, dias sem estudar, tópico em que está
                  parado e faixa de risco de abandono. Cada aluno vai identificado só por um código (A1,
                  A2…), sem nome, e-mail ou identificador da conta, e o estado emocional não vai. O motivo:
                  a regra de idade trata do aluno usar a inteligência artificial, e a Lumi é usada pelo
                  professor, adulto, para acompanhar a própria turma. Sem esses indicadores ela não
                  conseguiria responder sobre nenhuma turma em que haja um aluno menor ou sem data de
                  nascimento. Perguntas do professor sobre como usar o TrailUp não enviam dado de aluno.
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
                <li>
                  Google Gemini (inteligência artificial, só para maiores de 18 anos confirmados, exceto a Lumi do professor; ver seção 4): Estados Unidos e
                  outros países. Usamos o plano gratuito, em que o Google pode usar o que é enviado para melhorar
                  os produtos dele, inclusive com revisão humana
                </li>
                <li>OpenAI (inteligência artificial de reserva, só para maiores de 18 anos confirmados, exceto a Lumi do professor; ver seção 4): Estados Unidos</li>
                <li>Cloudflare R2 (armazenamento de arquivos): Estados Unidos (leste da América do Norte)</li>
                <li>Expo, Google (FCM) e Apple (APNs) (notificações): Estados Unidos</li>
                <li>Google (envio dos e-mails de contato e de aviso de conta inativa, pelo Gmail): Estados Unidos e outros países</li>
                <li>Google (login com Google, vídeos do YouTube e fontes) e Microsoft (visualização de documentos)</li>
              </Lista>
              <p>
                Não temos cláusulas-padrão da ANPD assinadas com esses fornecedores. Os EUA não têm
                adequação reconhecida pela ANPD; portanto, a transferência de imagens para o servidor
                da API exige mecanismo válido previsto na LGPD. A escolha e a validação desse mecanismo
                continuam pendentes e estão registradas em
                <code>docs/lgpd/transferencias-internacionais.md</code>. O consentimento não é apresentado
                como prova de que essa pendência jurídica foi resolvida.
              </p>
            </Secao>

            <Secao titulo="7. Por Quanto Tempo Guardamos">
              <Lista>
                <li>Telemetria bruta de uso: 90 dias (180 dias quando autorizada para pesquisa)</li>
                <li>Indicadores derivados da telemetria: 13 meses (24 meses para pesquisa)</li>
                <li>Estado emocional estimado: 30 dias</li>
                <li>Imagens da câmera: não são guardadas</li>
                <li>Conta de aluno inativa: apagada após 24 meses sem acesso, só depois de um aviso por e-mail e mais 30 dias de prazo (entrar de novo cancela)</li>
                <li>Conta de professor excluída: os dados pessoais saem na hora, e as turmas dele também, com trilhas, matrículas, notas e o material das turmas; a conta de cada aluno continua</li>
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
              <p>
                Encarregado pelo tratamento de dados pessoais (LGPD, art. 41):{" "}
                <a href="mailto:geisbelly19@gmail.com" className="text-primary hover:underline">
                  geisbelly19@gmail.com
                </a>
                .
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

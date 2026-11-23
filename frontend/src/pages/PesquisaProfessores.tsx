import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, ClipboardList, Clock, Lock, Monitor, Smartphone, Users, X } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ACESSO,
  EVITE,
  FACA,
  ITENS_DO_ACESSO,
  PASSOS,
  PERGUNTAS_FREQUENTES,
  RESUMO,
  ACIONABILIDADE,
  BLOCOS,
  CAMPOS_DE_IDENTIFICACAO,
  EXTREMOS_SUS,
  ITENS_EFLA,
  ITENS_TLX,
  NAO_OBSERVEI,
  OPCOES_CONCLUSAO,
  OPCOES_TEMPO,
  PARES_UEQS,
  PERGUNTA_CONCLUSAO,
  PERGUNTA_TEMPO,
  TEMPO_ESTIMADO,
  COLUNAS_DAS_METRICAS,
  ESCALA_CONCORDANCIA,
  EXTREMOS_SEQ,
  FRANQUEZA,
  FORA_DESTA_RODADA,
  ITENS_SUS,
  METRICAS,
  OPCOES_DIVULGACAO,
  PERGUNTAS_ABERTAS,
  PERGUNTA_SEQ,
  TAREFAS,
  abaDaPagina,
  linkDoFormulario,
  linkEmbutido,
  voltouDaConfirmacao,
  type AbaDaPagina,
  type Tarefa,
} from "@/features/pesquisa/pesquisaProfessores";

const LINK_DO_FORMULARIO = linkDoFormulario(import.meta.env.VITE_PESQUISA_INSCRICAO_FORM_URL);
const LINK_DA_ATUALIZACAO = linkDoFormulario(import.meta.env.VITE_PESQUISA_ATUALIZACAO_FORM_URL);

const TAREFAS_DO_CONSOLE = TAREFAS.filter(t => t.onde === "console");
const TAREFAS_DO_ALUNO = TAREFAS.filter(t => t.onde === "aluno");

const ICONES_DO_RESUMO: ReactNode[] = [
  <Users key="quem" size={22} />,
  <Monitor key="faz" size={22} />,
  <ClipboardList key="avalia" size={22} />,
  <Lock key="identificado" size={22} />,
];






function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="space-y-4">
      <h2 id={`${id}-titulo`} className="font-bold text-foreground">{titulo}</h2>
      <div className="space-y-4 text-muted-foreground">{children}</div>
    </section>
  );
}

function BotaoDoFormulario() {
  if (!LINK_DO_FORMULARIO) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">O formulário ainda não está aberto.</p>
        <p>
          A coleta só começa depois da aprovação do Comitê de Ética em Pesquisa. O link da inscrição chega no convite,
          por e-mail individual.
        </p>
      </div>
    );
  }
  return (
    <a
      className="journey-button journey-button-coral inline-flex"
      href={LINK_DO_FORMULARIO}
      target="_blank"
      rel="noopener noreferrer"
    >
      Fazer a inscrição <ArrowRight size={18} aria-hidden="true" />
    </a>
  );
}

function ListaDeTarefas({ tarefas }: { tarefas: readonly Tarefa[] }) {
  return (
    <ol className="space-y-4">
      {tarefas.map(tarefa => (
        <li key={tarefa.id} className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-2 font-semibold text-foreground">
            <span className="mr-2 text-primary">{tarefa.id}</span>
            {tarefa.titulo}
          </h4>
          <ul className="ml-5 list-disc space-y-1 text-sm">
            {tarefa.passos.map(passo => <li key={passo}>{passo}</li>)}
          </ul>
          <p className="mt-2 text-sm">
            <span className="font-semibold text-foreground">Repare: </span>
            {tarefa.observar}
          </p>
        </li>
      ))}
    </ol>
  );
}

const ROTULO_DA_ABA: Record<AbaDaPagina, string> = { cartilha: "Cartilha", inscricao: "Inscrição" };

function AbasDaPagina({ ativa }: { ativa: AbaDaPagina }) {
  return (
    <nav aria-label="Partes da pesquisa" className="mb-8 flex gap-2 border-b border-border">
      {(Object.keys(ROTULO_DA_ABA) as AbaDaPagina[]).map(aba => (
        <Link
          key={aba}
          to={aba === "cartilha" ? "/pesquisa/professores" : `/pesquisa/professores?aba=${aba}`}
          aria-current={ativa === aba ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
            ativa === aba ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {ROTULO_DA_ABA[aba]}
        </Link>
      ))}
    </nav>
  );
}

function Inscricao({ confirmado }: { confirmado: boolean }) {
  const embutido = linkEmbutido(LINK_DO_FORMULARIO);
  return (
    <div className="space-y-6">
      {confirmado && (
        <div role="status" className="flex gap-3 rounded-lg border border-primary/40 bg-primary/10 p-5">
          <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={22} aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">E-mail confirmado.</p>
            <p className="text-muted-foreground">
              O seu acesso de professor, o do aluno de teste e o link da avaliação chegam no seu e-mail em até 15 minutos.
              Se não chegar, confira a caixa de spam.
            </p>
          </div>
        </div>
      )}
      <p className="text-muted-foreground">
        A inscrição começa pelo Termo de Consentimento. Depois de concordar, você se identifica; o e-mail informado será o
        seu login no TrailUp. A equipe confere cada inscrição e manda o acesso por e-mail.
      </p>
      <BotaoDoFormulario />
      {embutido && (
        <iframe
          title="Formulário de inscrição na pesquisa"
          src={embutido}
          className="h-[1600px] w-full rounded-lg border border-border bg-white"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}

export default function PesquisaProfessores() {
  const { search } = useLocation();
  const aba = abaDaPagina(search);
  return (
    <PublicLayout>
      <div className="public-article">
        <PublicPageTitle title="Cartilha do professor" eyebrow="Pesquisa TrailUp">
          Como funciona a avaliação do TrailUp com professores: o que você vai fazer no sistema, o que observar e como
          responder ao formulário.
        </PublicPageTitle>

        <AbasDaPagina ativa={aba} />

        {aba === "inscricao" ? <Inscricao confirmado={voltouDaConfirmacao(search)} /> : <Cartilha />}
      </div>
    </PublicLayout>
  );
}

function Cartilha() {
  return (
    <>
        <div className="mb-10 flex flex-col gap-3">
          <BotaoDoFormulario />
        </div>

        <aside
          aria-labelledby="franqueza-titulo"
          className="mb-10 rounded-lg border border-primary/40 bg-primary/10 p-5"
        >
          <h2 id="franqueza-titulo" className="mb-2 text-lg font-semibold text-foreground">
            Resultado negativo também é resultado
          </h2>
          <p className="text-muted-foreground">{FRANQUEZA}</p>
        </aside>

        <article className="space-y-12">
          <Secao id="por-que" titulo="O que a pesquisa quer saber">
            <p>
              O TrailUp é uma plataforma de aprendizagem criada num Trabalho de Conclusão de Curso. O professor monta a
              trilha da turma; o sistema personaliza o material para cada perfil de aluno, transforma o estudo em jogo
              e mostra ao professor métricas e sugestões feitas por inteligência artificial.
            </p>
            <p>
              Antes de levar o sistema a uma turma de verdade, é preciso saber se ele funciona para quem dá aula:{" "}
              <strong>se é fácil de usar, se as métricas fazem sentido, se o material personalizado serve ao aluno e
              quanto trabalho ele exige</strong>. Quem consegue responder a isso são especialistas em ensino: docentes da
              área de TI, docentes de outras áreas e pedagogos. Por isso esta etapa envolve só eles, sem alunos.
            </p>
          </Secao>

          <Secao id="resumo" titulo="Em resumo">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {RESUMO.map((item, i) => (
                <li key={item.titulo} className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                    <span className="text-primary" aria-hidden="true">{ICONES_DO_RESUMO[i]}</span>
                    {item.titulo}
                  </p>
                  <p className="text-sm">{item.texto}</p>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-sm">
              <Clock size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
              Estimativa: {TEMPO_ESTIMADO}
            </p>
          </Secao>

          <Secao id="passo-a-passo" titulo="Passo a passo">
            <ol className="space-y-5">
              {PASSOS.map((passo, i) => (
                <li key={passo.titulo} className="flex gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="mb-1 text-lg font-semibold text-foreground">{passo.titulo}</h3>
                    <p>{passo.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Secao>

          <Secao id="identificacao" titulo="O que o formulário pergunta sobre você">
            <p>
              A avaliação vale pela experiência de quem avalia. Por isso a primeira parte pede:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              {CAMPOS_DE_IDENTIFICACAO.map(campo => (
                <li key={campo.pergunta}>
                  {campo.pergunta}
                  {campo.opcoes && <span className="text-sm"> ({campo.opcoes.join(", ")})</span>}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Nenhum campo é obrigatório, mas sem a formação a sua avaliação não entra na comparação entre grupos.
            </p>
            <p className="text-sm">
              Como a sua avaliação aparece na monografia, você só decide no fim (veja{" "}
              <a className="underline" href="#divulgacao">como você aparece</a>).
            </p>
          </Secao>

          <Secao id="acesso" titulo="Seu acesso ao TrailUp">
            <p>{ACESSO}</p>
            <ul className="space-y-2">
              {ITENS_DO_ACESSO.map(item => (
                <li key={item} className="flex gap-2">
                  <Lock size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Secao>

          <Secao id="roteiro" titulo="O roteiro de uso">
            <p className="rounded-lg border border-warning/60 bg-warning/10 p-4 text-sm text-foreground">
              <strong>O que fica fora desta rodada.</strong> {FORA_DESTA_RODADA}
            </p>
            <p>São {TAREFAS.length} tarefas curtas. Depois de cada uma, o formulário faz quatro perguntas rápidas:</p>
            <ul className="ml-5 list-disc space-y-1 text-sm">
              <li>
                {PERGUNTA_CONCLUSAO} ({OPCOES_CONCLUSAO.join(", ").toLowerCase()})
              </li>
              <li>
                “{PERGUNTA_SEQ}” de 1 ({EXTREMOS_SEQ[0].toLowerCase()}) a 7 ({EXTREMOS_SEQ[1].toLowerCase()})
              </li>
              <li>
                {PERGUNTA_TEMPO} ({OPCOES_TEMPO.join(", ").toLowerCase()})
              </li>
              <li>Onde travou, o que confundiu ou o que faltou (opcional)</li>
            </ul>
            <p className="text-sm">
              Ninguém cronometra: o tempo é uma estimativa sua. Dizer que não conseguiu é tão útil quanto dizer que
              conseguiu. Onde a tarefa deixa registro na turma de demonstração (uma personalização pedida), a equipe
              confere só isso, para checar o roteiro.
            </p>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Monitor size={20} className="text-primary" aria-hidden="true" /> No console do professor
            </h3>
            <ListaDeTarefas tarefas={TAREFAS_DO_CONSOLE} />
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Smartphone size={20} className="text-primary" aria-hidden="true" /> Na tela do aluno
            </h3>
            <ListaDeTarefas tarefas={TAREFAS_DO_ALUNO} />
          </Secao>

          <Secao id="avaliacao" titulo="O que você vai avaliar">
            <div className="space-y-6">
              <div className="space-y-2 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold text-foreground">Usabilidade</h3>
                <p className="text-sm">
                  Dez frases da Escala de Usabilidade de Sistema, versão brasileira validada, de 1 (
                  {EXTREMOS_SUS[0].toLowerCase()}) a 5 ({EXTREMOS_SUS[1].toLowerCase()}). Por exemplo: “{ITENS_SUS[2]}”
                  Responda pensando no sistema como um todo.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold text-foreground">Carga de trabalho</h3>
                <p className="text-sm">
                  Seis perguntas sobre as tarefas do console, de 0 (pouquíssimo) a 10 (muitíssimo), baseadas no
                  Índice NASA de carga de tarefa: {ITENS_TLX.map(i => i[0].toLowerCase()).join(", ")}.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold text-foreground">As métricas do console</h3>
                <p className="text-sm">
                  Oito frases de um instrumento internacional para avaliar painéis de dados educacionais (EFLA), de 1
                  (discordo totalmente) a 10 (concordo totalmente). Elas perguntam se o console deixaria você ciente da
                  situação dos alunos, se estimularia a refletir e a adaptar a sua prática, e se fica claro que dados
                  ele usa. Como a turma é de demonstração, responda como seria com uma turma sua.
                </p>
                <ul className="ml-5 list-disc space-y-1 text-sm">
                  {ITENS_EFLA.map(item => <li key={item.id}>{item.texto}</li>)}
                </ul>
                <p className="text-sm">
                  Depois: “{ACIONABILIDADE.agiria.replace(/\.$/, "")}”, que ação seria essa e quanto as métricas refletiriam a realidade.
                  Por fim, para cada métrica da Visão geral, você marca o que vale para ela:
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLUNAS_DAS_METRICAS.map(coluna => (
                    <span key={coluna} className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-sm text-foreground">
                      {coluna}
                    </span>
                  ))}
                </div>
                <p className="text-sm">
                  As métricas são: {METRICAS.join(", ")}. Os valores na turma de demonstração são de exemplo, com
                  um selo: julgue o painel, não o número. A última coluna é a mais importante: um painel que você
                  entende, mas que não mudaria nada na sua aula, ocupa espaço sem ajudar.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold text-foreground">Primeira impressão da tela do aluno</h3>
                <p className="text-sm">
                  Antes do bloco “Interface do aluno”, oito pares de palavras opostas, de 1 a 7 (Questionário de
                  Experiência do Usuário, versão curta):{" "}
                  {PARES_UEQS.map(([a, b]) => `${a.toLowerCase()}–${b.toLowerCase()}`).join(", ")}.
                </p>
              </div>

              {BLOCOS.map(bloco => (
                <div key={bloco.id} className="space-y-2 rounded-lg border border-border bg-card p-5">
                  <h3 className="text-lg font-semibold text-foreground">
                    {bloco.titulo}
                    {bloco.opcional && <span className="ml-2 text-sm font-normal text-muted-foreground">(opcional)</span>}
                  </h3>
                  <p className="text-sm">{bloco.sobre}</p>
                  <ul className="ml-5 list-disc space-y-1 text-sm">
                    {bloco.itens.map(item => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ))}
              <p className="text-sm">
                Esses blocos usam a mesma escala de cinco pontos, de “{ESCALA_CONCORDANCIA[0].toLowerCase()}” a “
                {ESCALA_CONCORDANCIA[4].toLowerCase()}”, mais “{NAO_OBSERVEI.toLowerCase()}” para o que você não viu.
                Algumas frases são negativas de propósito: leia cada uma antes de marcar.
              </p>

              <div className="space-y-2 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold text-foreground">Perguntas abertas</h3>
                <ul className="ml-5 list-disc space-y-1 text-sm">
                  {PERGUNTAS_ABERTAS.map(item => <li key={item}>{item}</li>)}
                </ul>
                <p className="text-sm">
                  Aqui vale escrever com as suas palavras. Um bom comentário diz a tela e o que aconteceu, por exemplo:
                  “em Trilhas, não achei onde mudar a ordem dos tópicos”.
                </p>
              </div>
            </div>
          </Secao>

          <Secao id="divulgacao" titulo="Como você aparece na monografia">
            <p>
              A monografia traz a avaliação de cada especialista, num quadro próprio: notas das tarefas, usabilidade,
              métricas e comentários. A última pergunta do formulário, <strong>depois de toda a avaliação</strong>, é
              como o seu quadro aparece:
            </p>
            <ul className="space-y-2">
              {OPCOES_DIVULGACAO.map(opcao => (
                <li key={opcao} className="rounded-md border border-border bg-card px-4 py-3 text-sm">{opcao}</li>
              ))}
            </ul>
            <p>
              <strong>Você pode trocar essa escolha a qualquer momento</strong>, até a versão final da monografia, e
              vale sempre a mais recente. Qualquer das três vale igual: recusar o nome não tira você da pesquisa. A
              escolha fica para o fim, e é reversível, para que você responda sem pensar em quem vai ler: a avaliação
              mais útil é a franca.
            </p>
            {LINK_DA_ATUALIZACAO ? (
              <a className="journey-link inline-flex" href={LINK_DA_ATUALIZACAO} target="_blank" rel="noopener noreferrer">
                Atualizar como a minha avaliação aparece <ArrowRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <p className="text-sm">
                O link para trocar a escolha aparece na mensagem de confirmação do formulário e aqui, quando a coleta
                começar.
              </p>
            )}
          </Secao>

          <Secao id="cuidados" titulo="Cuidados para a avaliação valer">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-2 font-semibold text-foreground">Faça</p>
                <ul className="space-y-2 text-sm">
                  {FACA.map(item => (
                    <li key={item} className="flex gap-2">
                      <Check size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-2 font-semibold text-foreground">Evite</p>
                <ul className="space-y-2 text-sm">
                  {EVITE.map(item => (
                    <li key={item} className="flex gap-2">
                      <X size={18} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Secao>

          <Secao id="direitos" titulo="Seus direitos e seus dados">
            <ul className="space-y-2">
              <li className="flex gap-2">
                <Lock size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Participar é voluntário, sem custo e sem pagamento. Recusar ou desistir não traz prejuízo, e a
                  instituição não sabe quem participou. O convite é feito pela pesquisadora, nunca por coordenação ou
                  superior.
                </span>
              </li>
              <li className="flex gap-2">
                <Lock size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Você se identifica para a equipe. O que é publicado depende da sua escolha: com nome, com código e
                  perfil, ou só no conjunto. Fora do que você autorizar, a identificação fica em sigilo, só com a
                  equipe. Ao fim da coleta, as respostas são baixadas para um computador da equipe e apagadas do
                  formulário online.
                </span>
              </li>
              <li className="flex gap-2">
                <Lock size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Se você escolher aparecer com o nome, só aparece com ele depois de ver o seu quadro e confirmar. Como
                  os participantes são poucos e muitos se conhecem, publicar com o nome expõe a sua opinião: escolha o
                  nível com que você fica à vontade, e troque quando quiser.
                </span>
              </li>
            </ul>
            <p className="text-sm">
              O texto completo, com os contatos da equipe e do Comitê de Ética, é o Termo de Consentimento, na
              primeira página do formulário.
            </p>
          </Secao>

          <Secao id="duvidas" titulo="Dúvidas frequentes">
            <Accordion type="single" collapsible>
              {PERGUNTAS_FREQUENTES.map((item, i) => (
                <AccordionItem key={item.pergunta} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-foreground">{item.pergunta}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{item.resposta}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Secao>

          <section className="space-y-4 border-t border-border pt-8">
            <h2 className="font-bold text-foreground">Pronto para começar?</h2>
            <BotaoDoFormulario />
            <p className="text-sm text-muted-foreground">
              Pesquisa de Trabalho de Conclusão de Curso de Ciência da Computação da Ulbra Palmas, orientada pelo
              Prof. Esp. Fábio Castro Araújo.
            </p>
          </section>
        </article>
    </>
  );
}

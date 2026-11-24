import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/PublicLayout";
import VideoDoSite from "@/components/VideoDoSite";
import { VIDEO_DO_ARTIGO } from "@/features/pesquisa/videosDaPesquisa";

// Divide o texto em partes normais, negrito (**assim**), italico (*assim*) e link interno
// ([texto](/caminho)), sem alterar o markdown de origem.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(\/[^)]*\))/g);
  return parts.map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((\/[^)]*)\)$/);
    if (link) {
      return <Link key={i} to={link[2]} className="text-primary underline-offset-4 hover:underline">{link[1]}</Link>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// Os artigos do Diário. O que dizem do app tem de bater com o código: guias e cores em
// `microservice/src/constants/brainHex.ts`, o tom de cada perfil em `_BRAINHEX_EDITORIAL_SIGNATURES`
// (`api/app/services/personalizacao.py`), cronômetro e batalha em `mobile/src/utils/brainHexCapabilities.ts`.
// Nada de recurso que o app não tem, nem resultado de pesquisa que ainda não existe.
const BLOG_CONTENT: Record<string, { title: string; content: string; category: string; date: string }> = {
  brainhex: {
    title: "O que é o BrainHex?",
    category: "Metodologia",
    date: "2026-11-23",
    content: `
# O que é o BrainHex?

O BrainHex é uma tipologia de jogadores proposta por Lennart Nacke, Chris Bateman e Regan Mandryk. Ela descreve sete formas de sentir prazer num jogo: descobrir, sobreviver a uma ameaça, arriscar, resolver, vencer, conviver e completar. Uma pessoa tem um pouco de cada uma, em doses diferentes.

## Os sete perfis no TrailUp

### Explorador (Seeker)
Gosta de descobrir caminhos e detalhes escondidos. Guia: Amara.

### Sobrevivente (Survivor)
Encara o que parece difícil com preparo e persistência. Guia: Kenji.

### Aventureiro (Daredevil)
Prefere experimentar e aprender no meio da ação. Guia: Ember.

### Estrategista (Mastermind)
Quer entender o porquê e montar um plano antes de agir. Guia: Idris.

### Conquistador (Conqueror)
Gosta de metas claras e de superar a própria marca. Guia: Amina.

### Socializador (Socializer)
Aprende trocando ideias e construindo junto. Guias: Mateo e Zuri.

### Realizador (Achiever)
Gosta de ver o progresso e de fechar cada etapa. Guia: Kwame.

## Como o TrailUp usa o BrainHex

No cadastro, o aluno responde a um questionário curto de preferências. Dele sai uma afinidade de 0 a 100 com cada um dos sete perfis. O de maior afinidade é o perfil dominante, e o aluno vê as sete afinidades no próprio perfil, no app.

O professor cadastra o conteúdo da aula uma vez. Para cada tópico, o TrailUp gera texto, áudio e apresentação no jeito de cada perfil: o tom de voz, a forma de abrir o assunto e a forma de fechar mudam, e o conteúdo é o mesmo. O professor revisa esse material antes de ele chegar à turma.

O questionário mede preferências de engajamento, e o perfil só decide o formato do material. Inteligência e capacidade ficam fora da conta.

## Referências

- Nacke, L. E.; Bateman, C.; Mandryk, R. L. BrainHex: preliminary results from a neurobiological gamer typology survey. ICEC, 2011.
- Nacke, L. E.; Bateman, C.; Mandryk, R. L. BrainHex: a neurobiological gamer typology survey. Entertainment Computing, v. 5, n. 1, 2014.
    `,
  },
  seeker: {
    title: "Perfil Explorador (Seeker)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Explorador (Seeker)

Quem tem o Explorador como perfil dominante gosta de descobrir. Uma pergunta puxa outra, e o caminho lateral costuma ser tão interessante quanto o principal.

## Como o material chega

O texto, o áudio e a apresentação do Explorador abrem com uma pergunta e avançam como uma descoberta guiada por pistas. O tom é curioso, e o fim convida a continuar explorando sozinho. A guia do perfil é Amara, a Guardiã das Runas.

## No app

- A trilha aparece como um mapa, com o próximo tópico e os que dependem dele.
- O Explorador estuda sem cronômetro: o ritmo é dele.
- Missões, conquistas e guildas valem para todos os perfis da turma.

## Para estudar melhor

- Anote as ligações que você encontrar entre um tópico e outro.
- Antes de abrir o material, escreva a pergunta que você quer responder.
- Quando um assunto puxar outro, termine o tópico atual e volte depois.
    `,
  },
  survivor: {
    title: "Perfil Sobrevivente (Survivor)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Sobrevivente (Survivor)

O Sobrevivente encara o difícil com preparo. Gosta de saber onde está o risco e de ter um plano para atravessar.

## Como o material chega

O material do Sobrevivente abre com um problema real e o risco que ele traz, e segue passo a passo, reduzindo esse risco. O tom é prático e seguro, e o fim é uma lista do que aplicar. O guia do perfil é Kenji, o Guardião da Montanha.

## No app

- Atividades com cronômetro, para treinar sob tempo.
- Batalhas contra o chefe do conteúdo, com falas próprias de cada perfil.
- Missões, conquistas e guildas, como os demais perfis da turma.

## Para estudar melhor

- Comece pelo que mais assusta, com tempo de sobra para errar.
- Treine com o relógio antes da prova, e descanse depois.
- Revise os erros: eles dizem onde está o risco de verdade.
    `,
  },
  daredevil: {
    title: "Perfil Aventureiro (Daredevil)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Aventureiro (Daredevil)

O Aventureiro aprende fazendo. Prefere tentar, errar rápido e ajustar a ler tudo antes de começar.

## Como o material chega

O material do Aventureiro abre com um gancho de ação e segue como uma superação, com desafio e recompensa. O ritmo é rápido, e o fim propõe uma missão curta para executar na hora. A guia do perfil é Ember, a Fênix do Caos.

## No app

- Atividades com cronômetro.
- Batalhas contra o chefe do conteúdo.
- Missões, conquistas e guildas, como os demais perfis da turma.

## Para estudar melhor

- Tente o exercício primeiro e leia a explicação quando travar.
- Depois de acertar, refaça de outro jeito.
- Anote o que deu errado em cada tentativa: é o seu mapa do assunto.
    `,
  },
  mastermind: {
    title: "Perfil Estrategista (Mastermind)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Estrategista (Mastermind)

O Estrategista quer entender o porquê. Gosta de problemas que pedem raciocínio e de montar o próprio plano de estudo.

## Como o material chega

O material do Estrategista abre com uma ideia central e avança de forma analítica, com lógica e evidência. O tom é preciso, e o fim resume o conceito e aponta os próximos passos. O guia do perfil é Idris, o Sábio das Constelações.

## No app

- A trilha mostra a ordem dos tópicos e os pré-requisitos de cada um.
- Atividades com cronômetro.
- Missões, conquistas e guildas, como os demais perfis da turma.

## Para estudar melhor

- Leia a ideia geral do tópico antes dos detalhes.
- Desenhe o assunto: um diagrama ajuda a ver o que depende do quê.
- Explique o conceito com as suas palavras antes de ir para o exercício.
    `,
  },
  conqueror: {
    title: "Perfil Conquistador (Conqueror)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Conquistador (Conqueror)

O Conquistador gosta de metas claras e de vencer. Disputa com os colegas, e principalmente com a própria marca.

## Como o material chega

O material do Conquistador abre com a meta e o que muda quando ela é alcançada. O tom é direto e voltado a resultado, e o fim chama para a execução. A guia do perfil é Amina, a Rainha da Tempestade.

## No app

- Ranking da turma e o rank de batalhas dos eventos.
- Batalhas contra o chefe do conteúdo e atividades com cronômetro.
- Missões, conquistas e guildas, como os demais perfis da turma.

## Para estudar melhor

- Defina uma meta para a semana e confira no fim.
- Compare o seu resultado com o seu da semana passada.
- Depois de uma derrota, refaça a atividade com calma antes de tentar de novo.
    `,
  },
  socializer: {
    title: "Perfil Socializador (Socializer)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Socializador (Socializer)

O Socializador aprende com os outros. Explicar para um colega e ouvir outra forma de ver o assunto é o que fixa o conteúdo.

## Como o material chega

O material do Socializador abre com uma história, com personagens ou uma situação do dia a dia, e acompanha uma transformação. O tom é humano, e o fim convida a compartilhar e aplicar em grupo. Os guias do perfil são Mateo e Zuri, os Gêmeos Espíritos da Aurora.

## No app

- Guildas, para estudar e cumprir missões com colegas.
- O fundo coletivo e as metas da turma, na economia do app.
- O Socializador estuda sem cronômetro.

## Para estudar melhor

- Combine um horário fixo de estudo com alguém da turma.
- Explique o tópico para um colega antes da atividade.
- Quando travar, pergunte cedo: na guilda ou para o professor.
    `,
  },
  achiever: {
    title: "Perfil Realizador (Achiever)",
    category: "Perfis BrainHex",
    date: "2026-11-23",
    content: `
# Perfil Realizador (Achiever)

O Realizador gosta de ver o progresso andar. Fechar cada etapa e completar a coleção é o que mantém o ritmo.

## Como o material chega

O material do Realizador abre com um objetivo que dá para medir e avança por marcos. O tom é objetivo, e o fim aponta o próximo marco. O guia do perfil é Kwame, o Cavaleiro Solar.

## No app

- O percentual de cada tópico e da trilha.
- Conquistas da turma, com marcos e pontos.
- Atividades com cronômetro, além de missões e guildas.

## Para estudar melhor

- Quebre o tópico em partes pequenas e marque cada uma.
- Comece o dia pela etapa mais curta: ela puxa as outras.
- Celebre o fim de cada tópico antes de abrir o próximo.
    `,
  },
  "pesquisa-tcc": {
    title: "A pesquisa por trás do TrailUp",
    category: "Pesquisa",
    date: "2026-11-23",
    content: `
# A pesquisa por trás do TrailUp

## De onde veio

O TrailUp nasceu de uma inquietação com a educação no Brasil: faltam recursos, e alunos com tipos de inteligência diferentes acabam deixados para trás num ensino que trata todo mundo do mesmo jeito. A ideia virou o Trabalho de Conclusão de Curso de Geisbelly Victória, em Ciência da Computação na Ulbra Palmas.

## O que o TrailUp faz

O professor cadastra o conteúdo da aula, dividido em tópicos. Para cada tópico, o TrailUp gera texto, áudio e apresentação nos sete perfis do BrainHex. O conteúdo é o mesmo, e muda o jeito de contar: o tom, a abertura, o ritmo e o fechamento. O professor revisa esse material antes de liberar para a turma.

No aplicativo, o aluno segue a trilha como um mapa, com o guia do seu perfil, missões, conquistas, eventos e guildas. No console, o professor acompanha a turma e conta com a Lumi, uma assistente que ajuda a ler os dados e a usar o sistema.

## Como a pesquisa está organizada

1. **Análise crítica da literatura** sobre gamificação, personalização e perfis de jogador.
2. **Desenvolvimento do sistema**: o app do aluno, o console do professor e a geração do material por perfil.
3. **Validação com especialistas**: professores e pedagogos usam o sistema numa turma de demonstração e respondem a um questionário. É a fase atual.
4. **Teste com alunos em sala**, depois da validação e da aprovação no comitê de ética.

## Resultados

Ainda não há resultados publicados. Este artigo vai ser atualizado quando a validação com especialistas terminar.

## Quer participar?

Se você dá aula no ensino superior ou trabalha com pedagogia, pode avaliar o TrailUp. A cartilha da pesquisa explica as fases, o tempo e o que acontece com as suas respostas: [trailup.vercel.app/pesquisa/professores](/pesquisa/professores).

## Referências

- Nacke, L. E.; Bateman, C.; Mandryk, R. L. BrainHex: a neurobiological gamer typology survey. Entertainment Computing, v. 5, n. 1, 2014.
- Deterding, S. et al. From game design elements to gamefulness: defining "gamification". MindTrek, 2011.
- Kapp, K. M. The Gamification of Learning and Instruction. Pfeiffer, 2012.
    `,
  },
};

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const post = id ? BLOG_CONTENT[id] : null;

  if (!post) {
    return (
      <PublicLayout>
        <div className="public-empty">
          <h1 className="text-4xl font-bold mb-4">Artigo não encontrado</h1>
          <Button asChild><Link to="/blog"><ArrowLeft size={16} className="mr-2" />Voltar ao Diário</Link></Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <article className="public-article">
        <div>
            <Button asChild variant="ghost" className="mb-8 gap-2"><Link to="/blog">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Diário
            </Link></Button>

          <div className="space-y-6">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">
                {post.category}
              </span>
              <span>{new Date(`${post.date}T12:00:00`).toLocaleDateString('pt-BR')}</span>
            </div>

            <h1>
              {post.title}
            </h1>

            <div className="prose prose-invert prose-lg max-w-none">
              {post.content
                .split('\n')
                // A primeira linha do conteudo repete o titulo (ja exibido acima); evita duplicar.
                .filter((paragraph, index) => !(index === 0 && paragraph.trim() === '') && !(paragraph.startsWith('# ') && paragraph.slice(2).trim() === post.title.trim()))
                .map((paragraph, index) => {
                if (paragraph.startsWith('# ')) {
                  return <h1 key={index} className="text-3xl font-bold mt-8 mb-4">{renderInline(paragraph.slice(2))}</h1>;
                }
                if (paragraph.startsWith('## ')) {
                  return <h2 key={index} className="text-2xl font-bold mt-6 mb-3 text-primary">{renderInline(paragraph.slice(3))}</h2>;
                }
                if (paragraph.startsWith('### ')) {
                  return <h3 key={index} className="text-xl font-semibold mt-4 mb-2">{renderInline(paragraph.slice(4))}</h3>;
                }
                if (paragraph.startsWith('- ')) {
                  return <li key={index} className="ml-6 list-disc">{renderInline(paragraph.slice(2))}</li>;
                }
                const orderedMatch = paragraph.match(/^(\d+)\.\s+(.*)$/);
                if (orderedMatch) {
                  // Numero exibido como texto (nao via CSS list-style) para nao herdar a
                  // contagem das listas com marcador (bullet) anteriores no mesmo fluxo.
                  return (
                    <li key={index} className="ml-6 list-none">
                      {orderedMatch[1]}. {renderInline(orderedMatch[2])}
                    </li>
                  );
                }
                if (paragraph.trim() === '---') {
                  return <hr key={index} className="my-6 border-border" />;
                }
                if (paragraph.trim() === '') {
                  return <br key={index} />;
                }
                return <p key={index} className="text-muted-foreground leading-relaxed mb-4">{renderInline(paragraph)}</p>;
              })}
            </div>

            {id && VIDEO_DO_ARTIGO[id] && (
              <section className="mt-12 space-y-4" aria-labelledby="video-do-artigo">
                <h2 id="video-do-artigo" className="text-center text-2xl font-bold text-primary">Veja em vídeo</h2>
                <VideoDoSite slug={VIDEO_DO_ARTIGO[id]} />
              </section>
            )}
          </div>
        </div>
      </article>

    </PublicLayout>
  );
};

export default BlogPost;

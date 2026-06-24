import { Hexagon, ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const BLOG_CONTENT: Record<string, { title: string; content: string; category: string; date: string }> = {
  brainhex: {
    title: "O que é o BrainHex?",
    category: "Metodologia",
    date: "2025-01-15",
    content: `
# O que é o BrainHex?

O BrainHex é um modelo desenvolvido por pesquisadores para entender as diferentes motivações que levam as pessoas a se engajarem em jogos e atividades lúdicas. No contexto educacional, adaptamos esse modelo para identificar perfis de aprendizado.

## Os 7 Perfis

O modelo identifica 7 perfis principais, cada um com suas características e motivações únicas:

### 1. Seeker (Explorador)
Motivado pela curiosidade e descoberta. Gosta de explorar todos os aspectos disponíveis.

### 2. Survivor (Desafiador)
Busca situações de alta pressão e desafios intensos. Se motiva com prazos apertados.

### 3. Daredevil (Aventureiro)
Gosta de tomar riscos e experimentar novas abordagens sem medo de errar.

### 4. Mastermind (Estrategista)
Prefere planejar e criar estratégias complexas antes de agir.

### 5. Conqueror (Competidor)
Motivado pela competição e pelo desejo de ser o melhor.

### 6. Socialiser (Colaborador)
Prefere atividades em grupo e interação social.

### 7. Achiever (Completionista)
Motivado por completar 100% das atividades e conquistar todos os objetivos.

## Aplicação no TrailUp

No TrailUp, usamos o BrainHex para:
- Personalizar trilhas de aprendizado
- Adaptar o conteúdo ao estilo de cada aluno
- Criar desafios apropriados para cada perfil
- Aumentar o engajamento e motivação

## Pesquisa Científica

Este modelo é baseado em pesquisa acadêmica sólida e tem sido validado em diversos contextos educacionais e de entretenimento.
    `,
  },
  seeker: {
    title: "Perfil Seeker: O Explorador",
    category: "Perfis BrainHex",
    date: "2025-01-14",
    content: `
# Perfil Seeker: O Explorador

## Características Principais

O Seeker é movido pela curiosidade inata. Este perfil adora:
- Explorar todos os cantos do ambiente de aprendizado
- Descobrir conteúdos extras e materiais complementares
- Encontrar informações ocultas e recursos adicionais
- Experimentar diferentes caminhos e abordagens

## Como o Seeker Aprende Melhor

### Estratégias Eficazes
1. **Exploração Livre**: Permita tempo para descobrir recursos por conta própria
2. **Conteúdo Rico**: Ofereça materiais complementares e referencias extras
3. **Múltiplos Caminhos**: Apresente várias formas de resolver problemas
4. **Easter Eggs**: Inclua descobertas surpresas ao longo do aprendizado

### Dicas para Seekers
- Reserve tempo para explorar além do conteúdo obrigatório
- Faça anotações sobre conexões interessantes que descobrir
- Crie mapas mentais dos conteúdos
- Busque aplicações práticas não óbvias

## No TrailUp

Para alunos com perfil Seeker dominante, o TrailUp oferece:
- Trilhas com múltiplos caminhos opcionais
- Conteúdos extras escondidos para descoberta
- Badges especiais para exploração completa
- Conexões entre tópicos para mapear
    `,
  },
  survivor: {
    title: "Perfil Survivor: O Desafiador",
    category: "Perfis BrainHex",
    date: "2025-01-13",
    content: `
# Perfil Survivor: O Desafiador

## Características Principais

O Survivor prospera sob pressão. Este perfil:
- Adora desafios difíceis
- Mantém a calma em situações estressantes
- Se motiva mais com prazos apertados
- Busca testar seus limites constantemente

## Como o Survivor Aprende Melhor

### Estratégias Eficazes
1. **Desafios Progressivos**: Aumente a dificuldade gradualmente
2. **Pressão Controlada**: Use timers e deadlines motivadores
3. **Feedback Imediato**: Mostre progresso e áreas de melhoria rapidamente
4. **Simulações Realistas**: Crie cenários que simulem pressão real

### Dicas para Survivors
- Use a técnica Pomodoro com intervalos curtos
- Defina metas desafiadoras mas alcançáveis
- Pratique com questões de alto nível desde cedo
- Participe de competições e olimpíadas

## No TrailUp

Para alunos com perfil Survivor dominante, o TrailUp oferece:
- Desafios cronometrados
- Modos de dificuldade elevada
- Rankings de velocidade de conclusão
- Simulados de alta pressão
    `,
  },
  daredevil: {
    title: "Perfil Daredevil: O Aventureiro",
    category: "Perfis BrainHex",
    date: "2025-01-12",
    content: `
# Perfil Daredevil: O Aventureiro

## Características Principais

O Daredevil adora tomar riscos calculados. Este perfil:
- Experimenta sem ler todas as instruções
- Prefere descobrir por tentativa e erro
- Gosta de testar os limites do sistema
- Não tem medo de cometer erros

## Como o Daredevil Aprende Melhor

### Estratégias Eficazes
1. **Aprendizado Experimental**: Permita tentativas sem penalização severa
2. **Métodos Não Convencionais**: Incentive abordagens criativas
3. **Desafios de Improviação**: Crie situações que exigem pensamento rápido
4. **Ambiente Seguro para Falhar**: Erros como parte do processo

### Dicas para Daredevils
- Experimente diferentes métodos antes de escolher um
- Use a gamificação como motivador
- Participe de hackathons e desafios relâmpago
- Documente suas experimentações

## No TrailUp

Para alunos com perfil Daredevil dominante, o TrailUp oferece:
- Modo sandbox para experimentação livre
- Desafios que recompensam criatividade
- Sistema de tentativas ilimitadas
- Badges para abordagens inovadoras
    `,
  },
  mastermind: {
    title: "Perfil Mastermind: O Estrategista",
    category: "Perfis BrainHex",
    date: "2025-01-11",
    content: `
# Perfil Mastermind: O Estrategista

## Características Principais

O Mastermind é o pensador estratégico. Este perfil:
- Planeja antes de executar
- Adora resolver problemas complexos
- Busca entender a teoria por trás das práticas
- Cria sistemas e estratégias eficientes

## Como o Mastermind Aprende Melhor

### Estratégias Eficazes
1. **Compreensão Profunda**: Entenda o "porquê" antes do "como"
2. **Quebra-Cabeças Lógicos**: Desafios que exigem raciocínio
3. **Mapas Conceituais**: Visualize conexões entre conceitos
4. **Planejamento Estruturado**: Organize o estudo metodicamente

### Dicas para Masterminds
- Crie um plano de estudos detalhado
- Use diagramas e fluxogramas
- Estude a fundamentação teórica primeiro
- Documente suas estratégias

## No TrailUp

Para alunos com perfil Mastermind dominante, o TrailUp oferece:
- Visualização de dependências entre tópicos
- Desafios de lógica e estratégia
- Ferramentas de planejamento de trilha
- Explicações detalhadas de conceitos
    `,
  },
  conqueror: {
    title: "Perfil Conqueror: O Competidor",
    category: "Perfis BrainHex",
    date: "2025-01-10",
    content: `
# Perfil Conqueror: O Competidor

## Características Principais

O Conqueror é movido pela competição. Este perfil:
- Adora rankings e classificações
- Se motiva ao superar outros
- Busca ser o melhor da turma
- Prospera em ambientes competitivos

## Como o Conqueror Aprende Melhor

### Estratégias Eficazes
1. **Competições Saudáveis**: Participe de olimpíadas e torneios
2. **Metas de Superação**: Defina objetivos de ranqueamento
3. **Feedback Comparativo**: Saiba onde está em relação aos outros
4. **Reconhecimento Público**: Celebre conquistas visíveis

### Dicas para Conquerors
- Participe de rankings e leaderboards
- Estabeleça metas de superação constante
- Use a competição como motivador, não estressor
- Celebre vitórias mas aprenda com derrotas

## No TrailUp

Para alunos com perfil Conqueror dominante, o TrailUp oferece:
- Rankings globais e por turma
- Desafios competitivos semanais
- Badges de topo de ranking
- Torneios e competições especiais
    `,
  },
  socialiser: {
    title: "Perfil Socialiser: O Colaborador",
    category: "Perfis BrainHex",
    date: "2025-01-09",
    content: `
# Perfil Socialiser: O Colaborador

## Características Principais

O Socialiser prospera na interação. Este perfil:
- Prefere estudar em grupo
- Adora ajudar colegas
- Se motiva com atividades colaborativas
- Valoriza conexões sociais no aprendizado

## Como o Socialiser Aprende Melhor

### Estratégias Eficazes
1. **Grupos de Estudo**: Organize sessões colaborativas
2. **Peer Teaching**: Ensine o que aprendeu para outros
3. **Projetos em Equipe**: Trabalhe em atividades colaborativas
4. **Fóruns e Discussões**: Participe ativamente de debates

### Dicas para Socialisers
- Forme grupos de estudo regulares
- Use plataformas de discussão online
- Ensine conceitos para solidificar conhecimento
- Participe de comunidades de aprendizado

## No TrailUp

Para alunos com perfil Socialiser dominante, o TrailUp oferece:
- Desafios em equipe
- Fóruns de discussão por tópico
- Sistema de ajuda mútua
- Badges por colaboração
    `,
  },
  achiever: {
    title: "Perfil Achiever: O Completionista",
    category: "Perfis BrainHex",
    date: "2025-01-08",
    content: `
# Perfil Achiever: O Completionista

## Características Principais

O Achiever busca completude. Este perfil:
- Quer completar 100% das atividades
- Coleciona conquistas e badges
- Se motiva com metas claras
- Não gosta de deixar nada incompleto

## Como o Achiever Aprende Melhor

### Estratégias Eficazes
1. **Objetivos Claros**: Defina metas específicas e mensuráveis
2. **Tracking de Progresso**: Acompanhe percentuais de conclusão
3. **Checklists Detalhadas**: Use listas para marcar itens completos
4. **Recompensas Graduais**: Celebre cada marco alcançado

### Dicas para Achievers
- Crie listas de tarefas detalhadas
- Use apps de tracking de progresso
- Defina mini-metas dentro das grandes
- Celebre cada conquista, por menor que seja

## No TrailUp

Para alunos com perfil Achiever dominante, o TrailUp oferece:
- Sistema completo de badges e conquistas
- Visualização de progresso detalhada
- Metas e objetivos claros por tópico
- Certificados de conclusão
    `,
  },
  "pesquisa-tcc": {
    title: "Pesquisa Acadêmica: TrailUp",
    category: "Pesquisa",
    date: "2025-01-07",
    content: `
# Pesquisa Acadêmica: TrailUp

## Fundamentação Científica

O TrailUp foi desenvolvido como resultado de uma pesquisa acadêmica de TCC (Trabalho de Conclusão de Curso) que investigou a aplicação de gamificação e personalização no contexto educacional universitário.

## Objetivos da Pesquisa

1. **Mapear Perfis de Aprendizado**: Adaptar o modelo BrainHex para o contexto educacional
2. **Personalização de Trilhas**: Criar algoritmos que adaptem o conteúdo ao perfil do aluno
3. **Gamificação Efetiva**: Implementar elementos de jogo que realmente aumentem o engajamento
4. **Validação Empírica**: Testar a eficácia da abordagem com alunos reais

## Metodologia

### Fase 1: Pesquisa Bibliográfica
- Revisão de literatura sobre gamificação educacional
- Estudo do modelo BrainHex original
- Análise de plataformas educacionais existentes

### Fase 2: Desenvolvimento
- Adaptação do questionário BrainHex
- Desenvolvimento do algoritmo de personalização
- Criação da interface gamificada

### Fase 3: Validação
- Testes com grupo piloto de universitários
- Coleta de dados de engajamento e desempenho
- Análise estatística dos resultados

## Principais Descobertas

1. **Perfis Predominantes**: Identificamos os perfis mais comuns entre universitários
2. **Impacto no Engajamento**: Aumento significativo no tempo de estudo
3. **Melhoria de Desempenho**: Notas médias superiores no grupo que usou personalização
4. **Satisfação do Usuário**: Alta avaliação da experiência gamificada

## Documentação Completa

A pesquisa completa, incluindo metodologia detalhada, análise de dados e conclusões, está disponível nos documentos de TCC fornecidos durante o desenvolvimento do projeto.

## Continuidade

O TrailUp continua sendo desenvolvido e aprimorado com base em:
- Feedback contínuo dos usuários
- Novas pesquisas na área
- Avanços tecnológicos em IA e personalização

## Referências

Este projeto se baseia em trabalhos de:
- Nacke, L. E., Bateman, C., & Mandryk, R. L. (2011). BrainHex
- Deterding, S. et al. (2011). Gamification: Design Elements
- Kapp, K. M. (2012). The Gamification of Learning and Instruction

---

*Para mais informações sobre a pesquisa, entre em contato através da página de contato.*
    `,
  },
};

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const post = id ? BLOG_CONTENT[id] : null;

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Post não encontrado</h1>
          <Link to="/blog">
            <Button>Voltar ao Blog</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Content */}
      <article className="py-12 px-4 pt-20">
        <div className="container mx-auto max-w-4xl">
          <Link to="/blog">
            <Button variant="ghost" className="mb-8 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Blog
            </Button>
          </Link>

          <div className="space-y-6">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">
                {post.category}
              </span>
              <span>{new Date(post.date).toLocaleDateString('pt-BR')}</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {post.title}
            </h1>

            <div className="prose prose-invert prose-lg max-w-none">
              {post.content.split('\n').map((paragraph, index) => {
                if (paragraph.startsWith('# ')) {
                  return <h1 key={index} className="text-3xl font-bold mt-8 mb-4">{paragraph.slice(2)}</h1>;
                }
                if (paragraph.startsWith('## ')) {
                  return <h2 key={index} className="text-2xl font-bold mt-6 mb-3 text-primary">{paragraph.slice(3)}</h2>;
                }
                if (paragraph.startsWith('### ')) {
                  return <h3 key={index} className="text-xl font-semibold mt-4 mb-2">{paragraph.slice(4)}</h3>;
                }
                if (paragraph.startsWith('- ')) {
                  return <li key={index} className="ml-6">{paragraph.slice(2)}</li>;
                }
                if (paragraph.trim() === '') {
                  return <br key={index} />;
                }
                return <p key={index} className="text-muted-foreground leading-relaxed mb-4">{paragraph}</p>;
              })}
            </div>
          </div>
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default BlogPost;

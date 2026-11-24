// Os artigos do Diário (`/blog`): a lista e o texto de cada um.
//
// Ficam fora das páginas porque o Guia e a Lumi também os leem: `features/site/siteDosGuias.paridade.test.tsx`
// copia tudo para a API. Mudou um artigo, gere a cópia de novo (o teste diz como).

export const BLOG_POSTS = [
  { id: "o-que-e-o-trailup", title: "O que é o TrailUp", excerpt: "O app do aluno, o console do professor e o que muda de um aluno para outro.", category: "TrailUp", date: "2026-11-23", readTime: "3 min" },
  { id: "como-o-material-e-personalizado", title: "Como o material é personalizado", excerpt: "As duas camadas da personalização e onde o professor entra.", category: "TrailUp", date: "2026-11-23", readTime: "3 min" },
  { id: "dados-e-privacidade", title: "Seus dados no TrailUp", excerpt: "O que o app guarda, o que é opcional e o que o professor vê.", category: "TrailUp", date: "2026-11-23", readTime: "3 min" },
  { id: "primeiros-passos-no-app", title: "Primeiros passos no app do aluno", excerpt: "Do cadastro à trilha introdutória, com o vídeo do primeiro acesso.", category: "Guias", date: "2026-11-23", readTime: "3 min" },
  { id: "guia-do-console", title: "O console do professor, aba por aba", excerpt: "Turmas, trilhas, personalizações, missões, notas e a Visão geral, com o guia em vídeo.", category: "Guias", date: "2026-11-23", readTime: "5 min" },
  { id: "avaliar-o-trailup", title: "Como avaliar o TrailUp na pesquisa com professores", excerpt: "Quem pode participar, as três fases, o roteiro e o tempo, com o passo a passo em vídeo.", category: "Pesquisa", date: "2026-11-23", readTime: "3 min" },
  { id: "pesquisa-tcc", title: "A pesquisa por trás do TrailUp", excerpt: "De onde o TrailUp veio e em que fase a pesquisa está.", category: "Pesquisa", date: "2026-11-23", readTime: "4 min" },
  { id: "artigos-da-pesquisa", title: "Os artigos da pesquisa", excerpt: "Os dois resumos expandidos preparados para a JIC 2026 e o que cada um investigou.", category: "Pesquisa", date: "2026-11-23", readTime: "4 min" },
  { id: "brainhex", title: "O que é o BrainHex?", excerpt: "Os sete perfis de jogador e como o TrailUp usa cada um para contar o mesmo conteúdo de jeitos diferentes.", category: "Metodologia", date: "2026-11-23", readTime: "4 min" },
  { id: "seeker", title: "Perfil Explorador (Seeker)", excerpt: "Para quem aprende descobrindo, uma pergunta puxando a outra.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "survivor", title: "Perfil Sobrevivente (Survivor)", excerpt: "Para quem encara o difícil com preparo e um plano para atravessar.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "daredevil", title: "Perfil Aventureiro (Daredevil)", excerpt: "Para quem aprende fazendo, tentando e ajustando no caminho.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "mastermind", title: "Perfil Estrategista (Mastermind)", excerpt: "Para quem quer entender o porquê antes de agir.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "conqueror", title: "Perfil Conquistador (Conqueror)", excerpt: "Para quem gosta de metas claras e de superar a própria marca.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "socializer", title: "Perfil Socializador (Socializer)", excerpt: "Para quem aprende trocando ideias e construindo junto.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
  { id: "achiever", title: "Perfil Realizador (Achiever)", excerpt: "Para quem gosta de ver o progresso andar e de fechar cada etapa.", category: "Perfis BrainHex", date: "2026-11-23", readTime: "2 min" },
];

// Os artigos do Diário. O que dizem do app tem de bater com o código: guias e cores em
// `microservice/src/constants/brainHex.ts`, o tom de cada perfil em `_BRAINHEX_EDITORIAL_SIGNATURES`
// (`api/app/services/personalizacao.py`), cronômetro e batalha em `mobile/src/utils/brainHexCapabilities.ts`.
// Nada de recurso que o app não tem, nem resultado de pesquisa que ainda não existe.
export const BLOG_CONTENT: Record<string, { title: string; content: string; category: string; date: string }> = {
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
  "o-que-e-o-trailup": {
    title: "O que é o TrailUp",
    category: "TrailUp",
    date: "2026-11-23",
    content: `
# O que é o TrailUp

O TrailUp é um aplicativo de estudo para o ensino superior. O professor cadastra o conteúdo da aula, e cada aluno recebe esse conteúdo no jeito do seu perfil, dentro de uma trilha que parece um mapa de jogo.

## Duas partes, dois públicos

O **aplicativo do aluno** roda no Android. Nele ficam a trilha da turma, o material de cada tópico, as atividades, as missões, as conquistas e as guildas. Cada aluno tem um guia, um dos sete personagens do TrailUp, escolhido pelo seu perfil.

O **console do professor** roda no navegador. É onde o professor cria turmas, monta a trilha, revisa o material gerado e acompanha como a turma está indo.

## O que muda de um aluno para outro

O conteúdo é o mesmo para a turma inteira. O que muda é a forma: o texto, o áudio e a apresentação de cada tópico são escritos no tom e no ritmo de um dos sete perfis do BrainHex. Quem gosta de explorar recebe uma pergunta para começar; quem gosta de metas recebe o objetivo logo na abertura.

## Quem decide

O professor revisa o material antes de ele chegar à turma, e pode ajustar o conteúdo-base ou pedir uma nova versão. As sugestões da IA no console também passam por ele: aprovar, editar ou recusar.

## Para ir além

- [Como o material é personalizado](/blog/como-o-material-e-personalizado)
- [Primeiros passos no app do aluno](/blog/primeiros-passos-no-app)
- [O console do professor, aba por aba](/blog/guia-do-console)
    `,
  },
  "como-o-material-e-personalizado": {
    title: "Como o material é personalizado",
    category: "TrailUp",
    date: "2026-11-23",
    content: `
# Como o material é personalizado

A personalização do TrailUp acontece em duas camadas. Entender as duas ajuda a saber o que esperar de cada tópico.

## Primeira camada: o material de cada perfil

Para cada tópico, o TrailUp gera um texto, um áudio narrado e uma apresentação para cada um dos sete perfis do BrainHex. Esse material é compartilhado: dois alunos com o mesmo perfil na mesma turma recebem a mesma versão.

Cada perfil tem uma assinatura própria. O Estrategista recebe uma ideia central e uma explicação analítica; o Socializador recebe uma história com personagens; o Aventureiro começa pela ação. O conteúdo, os conceitos e o objetivo do tópico ficam iguais em todas as versões.

## Segunda camada: o ajuste para cada aluno

Sobre o material do perfil entra um ajuste leve para cada aluno, com base nas preferências dele e no que ele faz no app. Esse ajuste muda a ordem sugerida do material e a oferta de apoio. Ele usa o que já foi gerado, sem criar áudio ou apresentação novos para cada pessoa.

## O papel do professor

Nada chega à turma sem passar pelo professor. No console, ele vê o material de cada perfil, aprova, ajusta o conteúdo-base ou gera de novo. Quando o professor muda um conteúdo que algum aluno já viu, o TrailUp avisa quem precisa revisar.

## Inteligência artificial e idade

A geração do material por perfil é feita uma vez, para a turma, e vale para todos. Já a IA que atende o aluno diretamente (o chat com o guia, a correção automática de respostas e o ajuste por aluno) é só para maiores de 18 anos. Quem tem menos de 18 usa o app com o material do perfil, sem chamadas de IA ligadas à conta.

- [O que é o BrainHex?](/blog/brainhex)
- [Seus dados no TrailUp](/blog/dados-e-privacidade)
    `,
  },
  "primeiros-passos-no-app": {
    title: "Primeiros passos no app do aluno",
    category: "Guias",
    date: "2026-11-23",
    content: `
# Primeiros passos no app do aluno

Este guia acompanha o vídeo abaixo: do cadastro até a trilha introdutória.

## 1. Instale o app

O TrailUp roda no Android. A [página de download](/download) tem o link da versão de teste na Google Play e o instalador APK.

## 2. Crie a conta

Cadastre-se com e-mail, senha e data de nascimento. A data serve para saber quais recursos ficam ligados: a inteligência artificial do TrailUp é só para maiores de 18 anos. Depois, confirme o e-mail pelo link que chega na sua caixa de entrada.

## 3. Complete o perfil

Informe nome, apelido e como você prefere estudar. Em seguida vem o questionário de preferências: afirmações curtas e uma lista para pôr em ordem, do que mais move você ao que menos move.

## 4. Conheça o seu perfil

Do questionário saem as afinidades com os sete perfis do BrainHex. O de maior afinidade define o seu guia e o jeito como o material vai chegar. O questionário mede preferências de estudo, e a sua capacidade fica fora dessa conta.

## 5. Faça a trilha introdutória

São três etapas curtas que mostram como o TrailUp funciona. Você pode fazer antes mesmo de estar numa turma.

## 6. Entre na turma

O professor inclui você na turma pelo e-mail do cadastro. A partir daí, a trilha da disciplina aparece no app, tópico por tópico.

Ficou com dúvida? Escreva pela [página de contato](/contato).
    `,
  },
  "guia-do-console": {
    title: "O console do professor, aba por aba",
    category: "Guias",
    date: "2026-11-23",
    content: `
# O console do professor, aba por aba

Este guia resume o vídeo abaixo, que segue uma turma de Introdução à Programação do cadastro às métricas.

## Cadastro e aprovação

O professor se cadastra com e-mail e senha, confirma o e-mail e completa o perfil: nome, instituição, disciplina principal e uma apresentação curta. Como o console mostra dados de alunos, todo cadastro de professor passa pela aprovação da equipe, e o aviso chega por e-mail.

## Turmas

Em **Turmas** ficam a criação da turma, as matrículas (busca de alunos por nome ou e-mail) e a presença.

## Trilhas

Em **Trilhas**, a disciplina vira um mapa de tópicos. As ligações mostram a sequência e os pré-requisitos. O botão "Gerar trilha com IA" propõe os tópicos a partir de uma descrição ou da ementa, e nada é publicado sem a sua confirmação. Em cada tópico, "Editar tópico" guarda o conteúdo-base.

## Personalizações

Aqui o material é gerado para os sete perfis, um de cada vez ou todos juntos. Se algum perfil falhar, um aviso aparece para gerar de novo. Antes de chegar à turma, revise: se algo não estiver bom, ajuste o conteúdo-base ou gere outra versão.

## Recomendações, missões e notas

- **Recomendações**: sugestões da IA para a turma, para aprovar, editar ou recusar.
- **Missões**: objetivos com prazo, pontuação e recompensa.
- **Notas**: correção das respostas dissertativas, comparando com o gabarito e devolvendo um retorno ao aluno.

## Jogo da turma

**Conquistas** (marcos com métrica, limite e pontos), **Rankings**, **Eventos** (rascunho aberto na mão ou no horário marcado), **Rank de batalhas**, **Economia** (moedas, prazos, loja, fundo coletivo e metas) e **Guildas** (quando e como os alunos formam grupos).

## Visão geral

A **Visão geral** mostra o total de alunos, as médias, a conclusão e quem precisa de atenção, com as abas Evolução, Conteúdo e Insights. Os números apontam onde olhar; a leitura e a decisão pedagógica ficam com o professor.

## Lumi e Meus dados

A **Lumi** é a assistente do console: explica as telas e ajuda a ler os dados da turma. Em **Meus dados** ficam o perfil, a senha e a opção de gerar automaticamente o material dos sete perfis sempre que um conteúdo é criado.
    `,
  },
  "avaliar-o-trailup": {
    title: "Como avaliar o TrailUp na pesquisa com professores",
    category: "Pesquisa",
    date: "2026-11-23",
    content: `
# Como avaliar o TrailUp na pesquisa com professores

A fase atual da pesquisa é a validação com especialistas. O vídeo abaixo mostra o caminho inteiro; este texto resume.

## Quem pode participar

Docentes da área de Tecnologia da Informação, docentes de outras áreas do ensino superior e pedagogos. Não precisa saber programar nem entender de IA. Participar é voluntário.

## As três fases

1. **Inscrição**: o termo de consentimento e os seus dados de identificação, na [cartilha da pesquisa](/pesquisa/professores).
2. **Acesso**: a equipe cria a sua conta de professor e uma conta de aluno de teste, e manda as senhas só para o seu e-mail.
3. **Avaliação**: você usa o TrailUp numa turma de demonstração e responde ao formulário, que fica no próprio console, na aba **Avaliar o TrailUp**.

## O roteiro

São oito tarefas curtas: seis no console e duas no app, com o aluno de teste. Um painel ao lado da tela marca cada etapa feita e guarda as suas anotações, no console e no app. Depois de cada tarefa vêm quatro perguntas rápidas: se você conseguiu, se foi fácil, quanto tempo levou e onde travou.

## Tempo

Mais ou menos uma hora: cerca de 35 minutos usando o sistema e 25 respondendo.

## Crítica franca ajuda

Uma tarefa difícil, uma métrica confusa ou um material com erro é exatamente o que a pesquisa precisa saber. No fim, você escolhe como a sua avaliação aparece na monografia: com o nome, com um código ou só no conjunto.

[Abrir a cartilha da pesquisa](/pesquisa/professores)
    `,
  },
  "artigos-da-pesquisa": {
    title: "Os artigos da pesquisa",
    category: "Pesquisa",
    date: "2026-11-23",
    content: `
# Os artigos da pesquisa

Além da monografia, o TrailUp rendeu dois resumos expandidos preparados para a Jornada de Iniciação Científica (JIC) 2026 do CEULP/ULBRA. Os dois seguem a Design Science Research: constroem o TrailUp como artefato e avaliam uma parte dele.

## Da tipologia à trilha

*Personalização de conteúdo por perfil de jogador com modelos de linguagem.* Autores: Geisbelly Victoria Feitosa Moraes Domiciano, Guilherme Domiciano Feitosa Silva e Fábio Castro Araújo (orientador).

A pergunta: quando um modelo de linguagem adapta o material a um perfil BrainHex, o texto segue as características desse perfil ou só leva o nome dele? O experimento comparou 252 textos em três condições de *prompt*. O nome do perfil bastou para um juiz automático reconhecê-lo, mas a aderência às características só aumentou com a especificação completa do perfil no *prompt*. O resultado virou correção no próprio TrailUp.

[Ler o artigo](https://geisbelly.github.io/TrailUp/documentacao/artigo-da-tipologia-a-trilha.html)

## IA onde importa

*Princípios arquiteturais para personalização e acolhimento na educação gamificada.* Autores: Geisbelly Victoria Feitosa Moraes Domiciano e Fábio Castro Araújo (orientador).

O trabalho tira cinco princípios de arquitetura dos problemas que o TrailUp enfrentou ao usar IA generativa, que é instável e cobrada por uso: regras e filas no banco de dados, material-base só para os perfis presentes na turma, nada gerado duas vezes, acolhimento com o mínimo de dados e pesquisa embutida no sistema. Os princípios foram avaliados em seis cenários, por inspeção do código e testes simulados.

[Ler o artigo](https://geisbelly.github.io/TrailUp/documentacao/artigo-ia-onde-importa.html)

## A monografia

O Trabalho de Conclusão de Curso reúne o sistema, a fundamentação e a validação com especialistas, que está em andamento. Veja [a pesquisa por trás do TrailUp](/blog/pesquisa-tcc).
    `,
  },
  "dados-e-privacidade": {
    title: "Seus dados no TrailUp",
    category: "TrailUp",
    date: "2026-11-23",
    content: `
# Seus dados no TrailUp

Um resumo do que o TrailUp guarda e por quê. O texto completo está na [política de privacidade](/privacidade).

## O que entra

Nome, e-mail, data de nascimento, as respostas do questionário de preferências e o que você faz no app: tópicos abertos, tempo de estudo ativo, acertos, moedas e conquistas. Esses dados montam a sua trilha e mostram ao professor como a turma está.

## O que é opcional

Câmera, personalização emocional, uso na pesquisa e notificações dependem do seu consentimento, item por item, e você muda de ideia quando quiser em Perfil › Coleta e acessos. A câmera vem desligada. Quando está ligada, a imagem é analisada na memória do servidor e não é gravada.

## Menores de 18 anos

Para quem tem menos de 18, cada item opcional depende da autorização do responsável. A inteligência artificial que atende o aluno diretamente (o chat com o guia, a correção automática de respostas e o ajuste por aluno) fica desligada até os 18, mesmo com autorização.

## O que o professor vê

O professor vê o progresso e o desempenho dos alunos das turmas dele. Sobre emoção, ele vê só uma faixa ("precisa de apoio" ou "ok"), sem imagem, pontuação ou histórico.

## Seus direitos

No app, em Perfil › Privacidade, você gera um relatório com os seus dados e pode pedir a exclusão da conta. Dúvidas vão pela [página de contato](/contato).
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

## Resultados e artigos

A validação com especialistas ainda não tem resultados; este artigo vai ser atualizado quando ela terminar. Enquanto isso, dois resumos expandidos já tratam de partes do sistema: veja [os artigos da pesquisa](/blog/artigos-da-pesquisa).

## Quer participar?

Se você dá aula no ensino superior ou trabalha com pedagogia, pode avaliar o TrailUp. O passo a passo está em [como avaliar o TrailUp](/blog/avaliar-o-trailup), e a [cartilha da pesquisa](/pesquisa/professores) explica as fases, o tempo e o que acontece com as suas respostas.

## Referências

- Nacke, L. E.; Bateman, C.; Mandryk, R. L. BrainHex: a neurobiological gamer typology survey. Entertainment Computing, v. 5, n. 1, 2014.
- Deterding, S. et al. From game design elements to gamefulness: defining "gamification". MindTrek, 2011.
- Kapp, K. M. The Gamification of Learning and Instruction. Pfeiffer, 2012.
    `,
  },
};

---
fonte: Google Drive — TCC 2 / Monografia TrailUp.docx (rascunho)
link: https://drive.google.com/file/d/1AYGYu_2Gz5ZZGaXn6YGhk_fJSdSxj5eC/view
exportado: 2026-10-18
---

> Cópia em texto do documento do Drive (conversão automática docx → Markdown). Imagens, prints e diagramas foram omitidos; o original no Drive é a fonte de verdade.

**CENTRO UNIVERSITÁRIO LUTERANO DE PALMAS – CEULP/ULBRA\
CURSO DE CIÊNCIA DA COMPUTAÇÃO**

**ORIENTADOR: PROF. ESP. FÁBIO ARAÚJO**

**GEISBELLY VICTÓRIA FEITOSA MORAES DOMICIANO**

**TRAILUP: PLATAFORMA ADAPTATIVA DE APRENDIZAGEM COM PERSONALIZAÇÃO POR PERFIL, GAMIFICAÇÃO, TELEMETRIA E INTELIGÊNCIA ARTIFICIAL**

Palmas – TO\
2026

**GEISBELLY VICTÓRIA FEITOSA MORAES DOMICIANO**

**TRAILUP: PLATAFORMA ADAPTATIVA DE APRENDIZAGEM COM PERSONALIZAÇÃO POR PERFIL, GAMIFICAÇÃO, TELEMETRIA E INTELIGÊNCIA ARTIFICIAL**

> Orientador: Prof. Esp. Fábio Araújo
>
> Monografia apresentada ao Curso de Ciência da Computação do Centro Universitário Luterano de Palmas – CEULP/ULBRA, como requisito parcial para obtenção do grau de Bacharel em Ciência da Computação.

Palmas – TO\
2026

# RESUMO

O TrailUp é uma plataforma educacional adaptativa voltada inicialmente a estudantes de graduação, desenvolvida para combinar personalização por perfil, conteúdo produzido pelo professor, questões e cards, gamificação, telemetria e inteligência artificial. O trabalho parte de uma pesquisa preliminar com estudantes universitários e de um artefato de software já desenvolvido, e propõe uma evolução do sistema por meio de uma Evidence Base estruturada e de Retrieval-Augmented Generation (RAG). A Evidence Base tem a função de fornecer fundamentação científica para decisões de apresentação, prática, revisão, feedback e intervenções leves, mantendo separadas a autoridade curricular do professor e as evidências externas utilizadas para orientar a adaptação. O BrainHex é utilizado como dimensão de preferência motivacional e de gamificação, sem ser tratado como diagnóstico cognitivo ou como prova de que determinado estudante aprende melhor por um formato específico. A telemetria é utilizada para observar comportamento no sistema e alimentar decisões adaptativas, sem converter sinais isolados em diagnósticos psicológicos. A metodologia da Evidence Base é organizada com critérios de busca, triagem, elegibilidade, aplicabilidade e limitações, utilizando o PRISMA 2020 como referência para transparência do processo de seleção. A avaliação final será realizada em sala de aula após a implementação do RAG, comparando indicadores de aprendizagem, comportamento, experiência e adequação das estratégias de personalização. Os resultados da pesquisa em sala ainda não são antecipados neste documento.

Palavras-chave: aprendizagem adaptativa. Ensino superior. Gamificação. BrainHex. Inteligência artificial. RAG. Telemetria. Personalização.

# ABSTRACT

TrailUp is an adaptive educational platform initially focused on undergraduate students. It combines profile-based personalization, teacher-authored content, questions and study cards, gamification, telemetry, and artificial intelligence. The project evolves from a preliminary student research stage and an already implemented software artifact toward an evidence-grounded adaptation layer based on an Evidence Base and Retrieval-Augmented Generation (RAG). The Evidence Base is intended to support decisions concerning content presentation, practice, review, feedback, and lightweight interventions, while keeping teacher-authored curricular content separate from external scientific evidence. BrainHex is treated as a motivational and gamification preference dimension rather than a cognitive diagnosis or a fixed learning-style model. Telemetry is interpreted as behavioral evidence rather than as a direct explanation of psychological states. The evidence selection process is documented using explicit search, screening, eligibility, applicability, and limitation criteria, with PRISMA 2020 used as a reporting reference. The final classroom study will evaluate learning, behavior, experience, and personalization indicators after the RAG layer is implemented. No classroom effectiveness results are fabricated or anticipated.

Keywords: adaptive learning. Higher education. Gamification. BrainHex. Artificial intelligence. RAG. Learning analytics. Personalization.

# 1 INTRODUÇÃO

## 1.1 Contextualização

Ambientes de aprendizagem digital ampliaram a possibilidade de disponibilizar materiais e atividades fora do espaço físico da sala de aula, mas a simples digitalização do conteúdo não elimina a heterogeneidade entre estudantes. Em uma mesma turma, indivíduos podem apresentar conhecimentos prévios distintos, diferentes ritmos de estudo, estratégias de aprendizagem, disponibilidade de tempo e formas de interação com recursos digitais. Sistemas que oferecem exatamente a mesma sequência e a mesma apresentação para todos tendem a representar apenas uma parte dessa diversidade.

A área de aprendizagem adaptativa investiga formas de representar características do estudante e utilizar essas informações para adaptar conteúdo, navegação, suporte ou feedback. Revisões sobre modelagem do estudante mostram que sistemas adaptativos podem considerar conhecimento, habilidades, erros, preferências, motivação, aspectos afetivos, características cognitivas e processos metacognitivos, além de combinar diferentes modelos de representação (CHRYSAFIADI; VIRVOU, 2013). Essa perspectiva é particularmente compatível com o TrailUp, cujo propósito não é somente gerar materiais distintos, mas utilizar informações do estudante para orientar a experiência.

O projeto TrailUp surgiu a partir de uma etapa anterior de UX realizada em 2025. O artefato de projeto registra Design Thinking, Lean UX e Design Centrado no Usuário como referências metodológicas, além de questionário, observação em sala, análise de perfis BrainHex, diário de campo, personas, mapa de empatia, matriz CSD, storyboard, protótipo e testes com usuários (MORAES DOMICIANO et al., 2025) (BROWN, 2008; GOTHELF; SEIDEN, 2013).

Na etapa de descoberta, foi realizado um levantamento com 50 estudantes. O relatório do projeto registrou predominância de participantes jovens, percepção de cansaço em aulas excessivamente teóricas, valorização de atividades práticas e interesse por recursos adaptativos e gamificados (MORAES DOMICIANO et al., 2025). A base bruta, entretanto, permite um refinamento importante: 34 dos 50 respondentes, correspondentes a 68%, assinalaram que aprendem em ritmo próprio. Como o relatório anterior havia registrado aproximadamente 90%, a versão definitiva da monografia deve priorizar o dado da base bruta e registrar a divergência como questão de consistência do artefato anterior.

Posteriormente, o protótipo foi submetido a teste preliminar de usabilidade. O artefato registra cinco participantes e avaliações predominantemente positivas, incluindo notas de recomendação 9, 8, 10, 9 e 8 e percepção de adaptação ao ritmo de uso (MORAES DOMICIANO et al., 2025). A média das notas foi 8,8. Entretanto, essa média não corresponde ao Net Promoter Score. Pelo método NPS, notas de 9 e 10 são promotoras, notas 7 e 8 são passivas e notas de 0 a 6 são detratoras; portanto, as cinco respostas apresentadas no artefato resultam em NPS de 60, e a média 8,8 deve ser denominada média da nota de recomendação (BAIN & COMPANY, 2004) (BAIN & COMPANY, \[s. d.\]).

A partir dessa trajetória, o TrailUp avançou de protótipo para um sistema distribuído. O repositório atual reúne uma API em FastAPI, uma aplicação web em React e Vite, um microsserviço em Node/TypeScript e um aplicativo mobile com Expo/React Native. A API já contempla autenticação, personalização por BrainHex, processamento assíncrono, telemetria, chat, progresso e integração com o serviço de geração de materiais (TRAILUP, 2026).

A etapa atual da pesquisa concentra-se na construção da Evidence Base e na integração de RAG ao sistema. O propósito não é criar uma teoria geral sobre aprendizagem humana, mas oferecer ao TrailUp uma camada de conhecimento que permita justificar e flexibilizar decisões de apresentação, reforço e personalização dentro do escopo do MVP.

## 1.2 Problema de pesquisa

Como integrar uma base de evidências científicas ao sistema TrailUp, utilizando o perfil inicial de preferência, o conteúdo pedagógico produzido pelo professor, o desempenho e a telemetria disponível para orientar estratégias de apresentação e intervenção de forma adaptativa, sem transformar características individuais em regras rígidas ou extrapolar os limites das evidências disponíveis?

## 1.3 Hipótese

A integração de uma Evidence Base estruturada a um mecanismo de RAG pode aumentar a fundamentação das decisões de personalização do TrailUp e permitir que estratégias inicialmente orientadas pelo BrainHex sejam ajustadas segundo o contexto, o desempenho e o comportamento observados do estudante.

## 1.4 Objetivo geral

Desenvolver e avaliar uma abordagem adaptativa de aprendizagem para estudantes de graduação no TrailUp, integrando personalização por perfil BrainHex, conteúdo e atividades do professor, telemetria e uma base de evidências recuperável por RAG.

## 1.5 Objetivos específicos

consolidar a fundamentação teórica do TrailUp nos campos de aprendizagem adaptativa, gamificação, modelagem do estudante, autorregulação, feedback e inteligência artificial;

organizar uma Evidence Base com fontes científicas selecionadas por critérios explícitos de relevância, qualidade, contexto e aplicabilidade;

integrar a Evidence Base ao fluxo de geração e adaptação de conteúdos do TrailUp;

preservar o conteúdo curricular original produzido pelo professor como referência principal da disciplina;

utilizar BrainHex como referência inicial de preferência sem tratá-lo como classificação permanente ou determinística;

utilizar telemetria e desempenho como informações complementares para acompanhar a resposta do estudante às estratégias;

definir um protocolo de avaliação em sala de aula capaz de medir aprendizagem, progressão, comportamento e experiência;

documentar limitações e possibilidades de evolução sem ampliar artificialmente o escopo da monografia.

## 1.6 Justificativa

O TrailUp apresenta relevância aplicada por integrar uma plataforma educacional existente a uma camada de fundamentação baseada em evidências. A proposta busca reduzir duas formas comuns de fragilidade em sistemas adaptativos: decisões excessivamente fixas baseadas em perfis e geração livre de recomendações por modelos de linguagem sem referência explícita.

A contribuição acadêmica não depende de afirmar que o BrainHex é um modelo definitivo. Pelo contrário, a literatura apresenta limitações psicométricas e discute alternativas baseadas em traços, o que justifica utilizá-lo como uma referência inicial e complementar essa informação com dados do próprio uso (BUSCH et al., 2016; TONDELLO et al., 2018).

A contribuição prática consiste em levar essa abordagem a uma aplicação concreta para graduação, cujo sistema já possui fluxo funcional de personalização, geração multimídia e telemetria. A documentação de implementação registra pipeline de resolução de contexto, definição do plano, geração de materiais, validação, persistência e publicação (TRAILUP, 2026).

## 1.7 Delimitação

A monografia é delimitada à versão de MVP do TrailUp e ao contexto de estudantes de graduação. Não fazem parte do núcleo experimental diagnóstico psicológico, tratamento clínico, reconhecimento clínico de emoções, EEG, modelagem completa de personalidade, detecção multimodal avançada ou grandes modelos preditivos de evasão. Recursos dessa natureza são tratados como possibilidades futuras. A própria documentação do projeto exclui, neste ciclo, experimento randomizado formal com grupo controle e outras extensões de maior complexidade.

# 2 FUNDAMENTAÇÃO TEÓRICA

## 2.1 Aprendizagem personalizada e adaptação

Aprendizagem personalizada envolve ajustar aspectos da experiência educacional de acordo com características, necessidades ou respostas do estudante. A literatura de modelagem do estudante destaca que a personalização depende de decidir quais características devem ser representadas, como atualizá-las e como utilizá-las para produzir adaptação (CHRYSAFIADI; VIRVOU, 2013). Essa formulação é importante para o TrailUp porque impede que o estudante seja reduzido a um único rótulo.

No sistema proposto, o perfil inicial é uma das informações disponíveis, ao lado do contexto da turma e do tópico, do material curricular, do progresso e dos sinais de uso. A arquitetura existente já resolve o contexto, lê perfil e histórico, monta um plano pedagógico e gera materiais personalizados (TRAILUP, 2026).

## 2.2 Modelagem do estudante

Modelar um estudante significa selecionar e representar informações úteis para orientar uma adaptação. Chrysafiadi e Virvou (2013) identificam como exemplos conhecimento, habilidades, erros e concepções equivocadas, preferências, motivação, emoções, atenção, resolução de problemas e processos metacognitivos. Também distinguem características mais estáveis de características dinâmicas, obtidas pela interação do estudante com o sistema.

Essa distinção oferece uma base conceitual particularmente adequada ao TrailUp. O BrainHex é tratado como informação inicial de preferência; o progresso, os erros e os eventos de uso são atualizados ao longo da interação. A consequência prática é que uma recomendação pode ser modificada sem que o sistema precise redefinir completamente a identidade do estudante.

## 2.3 Autorregulação, prática de recuperação e espaçamento

A aprendizagem autorregulada envolve processos de planejamento, execução, monitoramento e reflexão. Revisões de intervenções para ensino superior mostram que estratégias metacognitivas, cognitivas, motivacionais e emocionais podem ser utilizadas em diferentes fases do estudo, incluindo preparação, execução e avaliação (EDISHERASHVILI et al., 2022).

No TrailUp, cards e questões podem funcionar como mecanismos de recuperação e reforço. A literatura sobre prática de recuperação apresenta evidências de benefícios para a aprendizagem em diversos contextos educacionais, embora seus resultados dependam do desenho da atividade e do contexto (AGARWAL; NUNES; BLUNT, 2021). A revisão de Carpenter, Pan e Butler (2022) também reúne evidências sobre espaçamento e recuperação como estratégias de estudo. O sistema, portanto, pode utilizar questões e cards como recursos de reforço sem afirmar que qualquer repetição será automaticamente eficaz.

## 2.4 Feedback e avaliação formativa

Feedback é relevante quando fornece ao estudante informação que pode orientar a próxima ação. No TrailUp, o feedback aparece como parte do ciclo de personalização, associado a checkpoints, atividades e progressão. A documentação do modelo adaptativo já estabelece como hipótese operacional o uso de microfeedback e checkpoints para favorecer a conclusão de tópicos.

## 2.5 Apresentação multimídia e aprendizagem

A apresentação do conteúdo é uma das dimensões centrais do TrailUp. O serviço atual gera Markdown, áudio e apresentações, enquanto o fluxo pedagógico também inclui cards e quiz. A existência de múltiplos formatos permite experimentar diferentes formas de exposição, mas não autoriza concluir que cada estudante possui um único formato ideal.

Assim, a personalização de formatos será tratada como uma hipótese contextual. Preferência declarada, percepção de utilidade e resultado observado serão armazenados separadamente. Essa distinção impede que uma escolha inicial de formato se transforme em uma classificação permanente do estudante.

## 2.6 Gamificação

Gamificação é comumente definida como o uso de elementos de design de jogos em contextos que não são jogos (DETERDING et al., 2011). Em ambientes educacionais, estudos e meta-análises indicam que a gamificação pode produzir efeitos positivos em resultados cognitivos, motivacionais e comportamentais, mas os efeitos variam segundo elementos, contexto, duração e público (SAILER; HOMNER, 2020).

A meta-análise de Sailer e Homner (2020) encontrou efeitos estatisticamente significativos, porém pequenos, em resultados cognitivos, motivacionais e comportamentais. Isso reforça uma premissa importante para o TrailUp: gamificação não deve ser tratada como intervenção universal, e sim como conjunto de elementos cuja utilidade depende do contexto.

## 2.7 BrainHex

BrainHex é uma tipologia de jogadores apresentada por Nacke, Bateman e Mandryk (2014), baseada em achados neurobiológicos e em modelos anteriores de design de jogos. O modelo descreve sete arquétipos: Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socialiser e Achiever.

O TrailUp seleciona o BrainHex como referência inicial por sua capacidade de representar diferentes preferências de experiência de jogo e por já ter sido aplicado em estudos de personalização e gamificação. Trabalhos como Monterrat, Desmarais, Lavoué e George (2015) investigaram modelos de jogador para adaptar funcionalidades de gamificação, enquanto Monterrat, Lavoué e George (2017) avaliaram uma implementação adaptativa em ambiente de aprendizagem. Os resultados, entretanto, não permitem tratar o modelo como garantia de melhoria de engajamento em qualquer população.

Essa cautela é necessária porque estudos de validação do BrainHex encontraram limitações psicométricas e sugeriram aperfeiçoamentos no instrumento (BUSCH et al., 2016). Posteriormente, Tondello et al. (2018) exploraram um modelo baseado em traços derivado da escala BrainHex, encontrando dimensões relacionadas a ação, estética e orientação a objetivos. Portanto, no TrailUp, o BrainHex é utilizado como referência de personalização inicial e não como diagnóstico de personalidade.

## 2.8 Limitações do uso de perfis

Perfis de usuário são úteis quando simplificam informações complexas sem distorcer o fenômeno. O risco surge quando uma categoria passa a ser utilizada como regra determinística. Uma pessoa que recebe um perfil Mastermind, por exemplo, não precisa receber exclusivamente problemas analíticos, assim como um perfil Seeker não deve obrigatoriamente receber conteúdo exploratório em todas as situações.

A estratégia adotada pelo TrailUp é utilizar o perfil como um prior inicial. O resultado observado após a apresentação pode reforçar, enfraquecer ou modificar a estratégia. Essa lógica aproxima a personalização do conceito de estudante dinâmico discutido na literatura de learner modeling.

## 2.9 Estados acadêmicos e emoções

As emoções relacionadas à realização acadêmica constituem outra dimensão relevante para compreender a interação com atividades. O Achievement Emotions Questionnaire, desenvolvido por Pekrun et al. (2011), contempla emoções como prazer, esperança, orgulho, alívio, raiva, ansiedade, vergonha, desesperança e tédio em contextos acadêmicos. O instrumento foi estudado com universitários e evidencia a necessidade de diferenciar emoções específicas e seus contextos.

Revisões mais recentes indicam associações entre emoções acadêmicas e resultados de aprendizagem online. Wu e Yu (2022) analisaram 23 publicações e encontraram relações gerais entre emoções positivas e aspectos como motivação, desempenho, satisfação e engajamento. Uma meta-análise de Qi et al. (2025), baseada em 21 estudos e 240 tamanhos de efeito, encontrou correlação positiva moderada entre emoções positivas e desempenho online e correlação negativa moderada para emoções negativas.

Apesar disso, o TrailUp não pretende inferir estados clínicos. A utilidade dessas pesquisas para o MVP é orientar conceitos e estratégias de intervenção educacional. A telemetria deve registrar sinais observáveis e probabilidades fornecidas por modelos específicos, quando aplicáveis, sem transformar uma manifestação isolada em diagnóstico.

## 2.10 Telemetria e learning analytics

Learning analytics utiliza dados produzidos em ambientes de aprendizagem para compreender processos e apoiar decisões. A revisão de 159 estudos sobre engajamento em learning analytics no ensino superior mostra, entretanto, grande variedade na definição de engajamento e alerta para o risco de reduzir o conceito a indicadores simples de log, como cliques ou duração de atividade (BERGDAHL et al., 2024).

Esse cuidado é importante para o TrailUp. Tempo de uso, número de interações, revisitas ou conclusão são indicadores úteis, mas nenhum deles deve ser tratado isoladamente como prova de aprendizagem. O sistema já registra tempo ativo, conclusão, acerto e interação com materiais personalizados, formando uma base inicial para análise longitudinal.

## 2.11 Inteligência artificial generativa e RAG

Modelos de linguagem generativa podem produzir explicações, reformulações e materiais, mas a geração livre não garante que uma afirmação pedagógica esteja fundamentada. O RAG será utilizado no TrailUp para combinar recuperação de evidências com geração. Na arquitetura conceitual, a recuperação fornece o conhecimento e seus metadados; o motor de decisão contextualiza esse conhecimento; a LLM gera a resposta ou adaptação.

O conteúdo original do professor permanece separado da literatura científica. Essa separação é necessária porque o material do professor responde à pergunta 'qual é o conteúdo que precisa ser ensinado', enquanto a Evidence Base responde principalmente 'quais estratégias de apresentação, prática ou intervenção possuem respaldo e quais são suas limitações'.

# 3 TRABALHOS RELACIONADOS

## 3.1 Gamificação personalizada

Pesquisas de gamificação personalizada investigam a possibilidade de adaptar elementos de jogo às características do usuário. Monterrat et al. (2015) propuseram um modelo de jogador para ambientes de aprendizagem adaptativos, avaliando uma versão baseada em julgamento de especialistas e outra derivada de dados. O resultado mais favorável para a primeira versão mostrou que conhecimento especializado pode orientar preferências observáveis, mas a indução empírica ainda exige dados adequados.

Monterrat et al. (2017) avançaram nessa direção ao estudar quais funcionalidades podem ser adaptadas e como prever a responsividade a elementos de gamificação. O estudo foi realizado com estudantes do ensino básico, portanto possui utilidade metodológica para o TrailUp, mas não deve ser usado como evidência direta de eficácia em graduação. A própria adaptação não apresentou o aumento esperado de engajamento, reforçando a necessidade de não presumir benefício a partir da personalização.

Santos et al. (2022) estudaram personalização gamificada usando BrainHex e mensuraram flow, motivação e enjoyment no contexto educacional. O estudo é relevante por mostrar uma aplicação experimental do modelo, mas sua população era formada por estudantes do ensino fundamental. Portanto, a fonte será tratada como evidência metodológica e contextual.

## 3.2 Aplicações do BrainHex

A literatura do BrainHex é útil ao TrailUp em duas dimensões. A primeira é sua definição dos sete arquétipos e sua origem como modelo de preferências de experiência de jogo (NACKE; BATEMAN; MANDRYK, 2014). A segunda é a aplicação do modelo em personalização e gamificação. O estudo de Monterrat et al. (2015) é particularmente pertinente para a ideia de relacionar perfil de jogador com funcionalidades adaptativas.

Ao mesmo tempo, Busch et al. (2016) apontam limitações na validade psicométrica do BrainHex, o que impede tratá-lo como instrumento definitivo. Essa tensão entre utilidade operacional e limitação psicométrica é adotada explicitamente como premissa do TrailUp.

## 3.3 Modelagem e adaptação em ambientes educacionais

Chrysafiadi e Virvou (2013) mostram que modelos de estudante podem combinar conhecimentos, preferências, erros, emoções e outras características e que essas representações podem ser atualizadas para apoiar adaptação. Essa literatura fornece um fundamento conceitual para o TrailUp complementar o perfil inicial com progresso e telemetria.

A revisão de Kooij, Falke e Tillema (2024) reforça a importância de interpretar o comportamento de maneira multidimensional. O sistema deve evitar tratar qualquer indicador isolado como sinônimo de engajamento ou aprendizagem.

## 3.4 Síntese e lacuna

Os trabalhos relacionados apresentam partes da solução que inspirou o TrailUp, mas não justificam que todos os componentes devam ser tratados como um único modelo universal. A proposta deste trabalho é integrativa: o sistema já reúne perfil, conteúdo, atividades, telemetria e geração multimídia; o RAG será usado para inserir uma camada de evidência entre os dados do estudante e as decisões de adaptação.

Assim, a lacuna explorada não consiste na criação de uma nova tipologia de usuário, mas na organização de evidências que permita ao sistema utilizar uma referência inicial de perfil e, ao mesmo tempo, revisar suas estratégias com base em contexto e resultados observados.

# 4 METODOLOGIA

## 4.1 Natureza e estratégia da pesquisa

Trata-se de uma pesquisa aplicada e de desenvolvimento tecnológico, com abordagem predominantemente quantitativa na avaliação do comportamento e da aprendizagem, complementada por dados qualitativos de experiência e observações. O projeto possui uma etapa anterior de pesquisa exploratória e prototipação e uma etapa posterior de avaliação do sistema em contexto de sala de aula.

A metodologia não trata a pesquisa preliminar de 2025 como experimento de eficácia. Ela cumpriu a função de descoberta, levantamento de requisitos, identificação de dores, preferências percebidas e validação inicial do conceito. O experimento em sala constitui uma etapa distinta e será definido antes da coleta final.

## 4.2 Etapas do desenvolvimento

descoberta e pesquisa preliminar com estudantes;

definição do problema e levantamento de necessidades;

ideação e construção dos artefatos de UX;

prototipação e testes preliminares de usabilidade;

implementação do sistema distribuído;

curadoria e seleção das evidências para a Evidence Base;

integração do RAG ao fluxo do sistema;

definição do protocolo de avaliação em sala;

coleta e análise dos resultados;

documentação das limitações e trabalhos futuros.

## 4.3 Pesquisa preliminar de descoberta

A pesquisa preliminar utilizou questionário com 50 estudantes, observação em aulas, análise de perfis de jogador por BrainHex e diário de campo. Os instrumentos foram concebidos para compreender experiência de aprendizagem, preferências, fatores motivacionais, ritmo percebido, dificuldades e reação ao conceito de uma jornada personalizada (MORAES DOMICIANO et al., 2025).

Na base bruta, 34 participantes (68%) assinalaram 'Próprio' para a pergunta sobre ritmo, 12 (24%) assinalaram 'Médio', 3 (6%) indicaram 'Mesmo ritmo' e 1 (2%) marcou 'Mais rápido'. Para a monografia, esses percentuais serão tratados como estatística descritiva da amostra preliminar, não como generalização para estudantes universitários.

As preferências de apresentação também foram múltiplas. Na pergunta sobre como o estudante prefere aprender algo novo, 29 dos 50 respondentes (58%) mencionaram exploração por conta própria e 29 (58%) mencionaram instruções passo a passo; 15 (30%) mencionaram aprender com colegas e 15 (30%) competir ou colaborar. Como as respostas permitiam múltiplas opções, os percentuais não devem ser somados (TRAILUP, 2025).

Na pergunta sobre o momento preferido para ser questionado, 19 participantes (38%) preferiram perguntas durante o aprendizado, 13 (26%) indicaram que dependia do conteúdo, 12 (24%) preferiram depois do conteúdo, 5 (10%) antes e 1 (2%) declarou gostar de desafios a todo momento. Esses dados apoiaram a ideia de flexibilidade temporal das atividades (TRAILUP, 2025).

Na seleção de elementos de gamificação, 40 participantes (80%) mencionaram missões, 39 (78%) conquistas, 35 (70%) recompensas e 31 (62%) rankings. Esses dados ajudam a explicar decisões iniciais de design, mas continuam sendo preferências declaradas, e não demonstrações causais de eficácia (TRAILUP, 2025).

## 4.4 Desenvolvimento do sistema

O desenvolvimento atual está organizado em quatro componentes independentes. O repositório registra API, frontend web, microsserviço e aplicação mobile, com gerenciadores de dependências e ciclos de build separados (TRAILUP, 2026).

A API utiliza FastAPI, SQLAlchemy assíncrono, Alembic e LangGraph. O microsserviço multimídia utiliza Node/TypeScript, Gemini e Supabase Storage e possui contingência por OpenAI (TRAILUP, 2026).

## 4.5 Construção da Evidence Base

A Evidence Base será formada a partir de levantamento bibliográfico estruturado, priorizando fontes sobre aprendizagem adaptativa, modelagem de estudantes, gamificação, BrainHex, autorregulação, feedback, emoções acadêmicas, learning analytics e estratégias de apresentação. O levantamento tem natureza de mapeamento de evidências e não pretende produzir uma revisão sistemática única sobre um efeito isolado.

A estratégia de busca deverá ser registrada por base, data, consulta, idioma, período e número de registros encontrados. A seleção deverá privilegiar estudos com estudantes de ensino superior quando a finalidade for fundamentar o MVP; trabalhos de outros níveis podem ser mantidos como evidência contextual quando o mecanismo estudado puder ser transferido com justificativa.

## 4.6 Protocolo de seleção de fontes

Os critérios de inclusão serão: (a) relação direta com pelo menos um domínio do TrailUp; (b) descrição suficiente de método ou fundamentação; (c) possibilidade de identificar população, contexto ou escopo da afirmação; e (d) utilidade potencial para uma decisão, hipótese, limitação ou estratégia do sistema.

Serão excluídos documentos duplicados, textos sem conteúdo verificável, materiais promocionais apresentados como evidência científica, estudos cuja população ou contexto não possa ser delimitado quando essa diferença comprometer a interpretação e fontes que não permitam determinar o que efetivamente sustentam.

## 4.7 PRISMA 2020 e PRISMA-ScR

O processo de busca e seleção será documentado com apoio do PRISMA 2020 para preservar transparência sobre identificação, triagem, elegibilidade e inclusão das fontes (PAGE et al., 2021). O PRISMA 2020 é uma diretriz de relato para revisões sistemáticas e não deve ser descrito como um algoritmo de RAG.

Como a Evidence Base possui escopo amplo e tem por objetivo mapear conceitos e diferentes tipos de evidência, o projeto também adotará os elementos pertinentes do PRISMA-ScR, extensão destinada a revisões de escopo (TRICCO et al., 2018). A escolha entre uma revisão sistemática específica e o mapeamento de escopo será explicitada por domínio na versão final.

Em termos operacionais, o fluxo será: identificação dos registros; deduplicação; triagem de títulos e resumos; leitura do texto completo; exclusões justificadas; avaliação crítica; extração estruturada; classificação; e incorporação à Evidence Base. O fluxo será apresentado em diagrama na versão final após o encerramento das buscas.

## 4.8 Extração e classificação das evidências

Cada evidência será estruturada, sempre que possível, com os seguintes campos: identificação da fonte, domínio, população, contexto, desenho do estudo, variável ou intervenção analisada, resultado, limitações, aplicabilidade ao TrailUp, nível de evidência e afirmações que não podem ser inferidas.

Para fins operacionais, as fontes poderão ser classificadas como CORE, SUPPORT, CONTEXT, LIMITATION ou FUTURE. Essa classificação é uma ferramenta interna do projeto e não constitui uma escala científica de qualidade.

## 4.9 Avaliação da qualidade e aplicabilidade

A avaliação crítica deverá considerar o desenho de cada estudo. Instrumentos apropriados ao tipo de estudo serão utilizados quando disponíveis, em vez de aplicar uma única escala a todos os documentos. Uma meta-análise, um estudo qualitativo e um estudo transversal, por exemplo, apresentam riscos metodológicos diferentes.

A aplicabilidade será registrada separadamente da qualidade. Um estudo de alta qualidade realizado fora do contexto educacional ou com outra faixa etária pode ser muito relevante para compreender um mecanismo, mas não deve ser convertido em evidência direta para estudantes de graduação.

## 4.10 Avaliação em sala de aula

A etapa final de avaliação será realizada com estudantes em contexto de sala de aula, após a integração do RAG e o fechamento do protocolo. Será definido um conjunto de conteúdos e atividades sob responsabilidade do professor, com instrumentos de pré-avaliação, utilização do TrailUp, pós-avaliação e, se viável, uma medida de retenção.

A análise deverá comparar o desempenho inicial e final e, quando o desenho permitir, diferentes estratégias de apresentação. A unidade de análise, a janela de coleta e os critérios de exclusão de dados deverão ser definidos antes do experimento.

## 4.11 Aspectos éticos e proteção de dados

O projeto deverá adotar minimização de dados, finalidade explícita, restrição de acesso e anonimização dos relatórios. A documentação técnica do TrailUp prevê autenticação, autorização por papel, segregação por classe e medidas de proteção de credenciais e dados.

Sinais de telemetria não serão utilizados para diagnóstico clínico. Qualquer informação relativa a emoção ou estado deverá ser tratada como indicador contextual, com cautela na interpretação e respeitando o consentimento e a finalidade de uso definida para o estudo.

# 5 DESENVOLVIMENTO DO TRAILUP

## 5.1 Visão geral

O TrailUp é um ecossistema educacional no qual o professor disponibiliza contexto curricular e o estudante percorre tópicos e atividades. A plataforma gera e disponibiliza materiais personalizados e registra dados de progresso e uso. A documentação atual define como objetivos aumentar conclusão de tópicos, reduzir abandono, melhorar acerto e oferecer ao professor indicadores de acompanhamento (TRAILUP, 2026).

## 5.2 Arquitetura do sistema

A arquitetura distribuída possui quatro componentes principais: aplicativo mobile, web do professor, API Core e ApiBrainHex. O banco e o Storage são utilizados como componentes compartilhados de persistência e distribuição de artefatos (TRAILUP, 2026).

## 5.3 Aplicativo do estudante

A jornada do aluno documentada inclui entrada na turma, seleção de tópico, consumo do conteúdo, realização de atividade, recebimento de reforço personalizado e visualização de progresso e ranking (TRAILUP, 2026).

## 5.4 Interface do professor

A interface do professor permite acionar personalização por classe, aluno e tópico, acompanhar estado e qualidade e utilizar indicadores para orientar intervenções. O professor permanece como agente da decisão pedagógica e não é substituído pelo algoritmo.

## 5.5 API e orquestração

A API central coordena o fluxo de personalização e possui endpoints para consulta e operação, incluindo personalização, progresso, chat, jobs de inscrição e delta de turma e ingestão de telemetria (TRAILUP, 2026).

## 5.6 Microsserviço de geração multimídia

O ApiBrainHex recebe contexto pedagógico e gera Markdown, roteiro de áudio e apresentações. O serviço também realiza validações, armazena artefatos e atualiza o conjunto de materiais personalizados. O repositório registra mecanismos de contingência entre provedores e controle de versão do design das apresentações (TRAILUP, 2026).

## 5.7 Conteúdo, questões e cards

O conteúdo curricular produzido pelo professor constitui a referência central da disciplina. Questões e cards funcionam como recursos de prática, reforço e acompanhamento. Na documentação atual, cards são associados a reforço rápido e revisão, enquanto quiz e questões servem à validação de consolidação e identificação de lacunas.

## 5.8 Personalização por BrainHex

O TrailUp possui regras iniciais de personalização de comunicação, narrativa, estética e formato dominante conforme o perfil BrainHex. A documentação define, por exemplo, uma abordagem mais analítica para Mastermind, orientação a metas para Achiever, descoberta guiada para Seeker e framing de conquista para Conqueror.

A etapa do RAG pretende reduzir o caráter engessado dessas regras. O objetivo não é eliminá-las, mas transformá-las em hipóteses iniciais que possam ser combinadas com contexto e evidências recuperadas.

## 5.9 Gamificação e ranking

A gamificação do TrailUp está relacionada a progressão, conquistas e ranking. A camada SQL realiza consolidação de desempenho e posicionamento, reduzindo duplicação de lógica entre clientes (TRAILUP, 2026).

## 5.10 Telemetria

A telemetria permite registrar tempo ativo, conclusão por item, acerto quando disponível e interação com materiais personalizados. Esses sinais formarão a base para analisar como o estudante responde às estratégias e para observar mudanças no uso sem atribuir significado clínico aos eventos (TRAILUP, 2026).

## 5.11 Persistência e controle de estado

O banco mantém estruturas de domínio, progresso, eventos, gamificação, personalização e views consolidadas. A documentação define estados como pending, processing, completed, partial e failed e utiliza deduplicação e reprocessamento para manter integridade do pipeline (TRAILUP, 2026).

## 5.12 Qualidade, idempotência e reprocessamento

A arquitetura possui mecanismos de dedupe por contexto e perfil, reuso de artefatos compartilháveis e merge seguro do payload. O objetivo é evitar geração duplicada e preservar materiais já concluídos durante reprocessamentos (TRAILUP, 2026).

# 6 EVIDENCE BASE E RAG

## 6.1 Objetivo da base de evidências

A Evidence Base é criada para responder perguntas que o sistema não deve resolver somente por geração livre. Entre elas estão: quais estratégias de apresentação possuem evidência, como adaptar atividades, quando utilizar reforço, quais elementos de gamificação apresentam resultados em determinados contextos e quais limitações devem acompanhar cada recomendação.

O RAG não será tratado como um repositório genérico de PDFs. A unidade de conhecimento útil para a aplicação será a evidência estruturada, acompanhada de metadados e limites de interpretação.

## 6.2 Domínios da Evidence Base

## 6.3 Separação entre fonte curricular e evidência científica

O professor é responsável pela fonte curricular. A literatura científica não deve substituir, alterar ou inventar o conteúdo disciplinar. A Evidence Base atua em uma camada diferente, relacionada às estratégias de ensino e adaptação.

Por exemplo, se uma questão estiver errada segundo o material do professor, o RAG não deve decidir qual conteúdo é verdadeiro a partir de outro artigo. A função do RAG é auxiliar na decisão de como explicar, reforçar ou praticar o conteúdo que foi definido pela disciplina.

## 6.4 Metadados da evidência

## 6.5 Fluxo de recuperação

A recuperação deverá utilizar contexto do estudante, tópico, conteúdo, tipo de atividade e situação observada. O objetivo é retornar poucas evidências altamente pertinentes, e não maximizar o número de documentos retornados.

Um exemplo simplificado é: o estudante apresenta queda de acerto e aumento de tentativas em um tópico. O sistema não deve concluir automaticamente que existe um estado psicológico específico. Ele pode consultar evidências sobre feedback, decomposição da tarefa, recuperação de conhecimento prévio e mudança de representação, selecionar estratégias candidatas e então utilizar a LLM para gerar uma intervenção coerente.

## 6.6 Apoio à tomada de decisão

A cadeia operacional proposta é: dados do estudante → contexto → consulta ao RAG → evidências relevantes → estratégias candidatas → regras do TrailUp → geração/adaptação pela LLM → coleta do resultado. Nessa arquitetura, o RAG responde principalmente 'o que a literatura sustenta?', e não 'qual ação deve ser sempre tomada?'.

## 6.7 Controle de extrapolação

A base deverá preservar as condições em que a evidência foi obtida. Um estudo com educação infantil não poderá ser apresentado como evidência direta para universitários; um estudo sobre aprendizagem de língua estrangeira não deverá ser convertido em uma regra universal para todas as disciplinas; uma associação não deverá ser apresentada como causalidade.

Também serão registradas limitações explícitas. Quando uma fonte não justificar uma inferência, a estrutura da evidência deverá tornar essa restrição recuperável pela LLM.

## 6.8 Aplicação no MVP

O MVP não utilizará o RAG para construir um modelo psicológico abrangente. O uso inicial será restrito a fundamentar apresentação de conteúdo, prática, reforço, feedback, gamificação e pequenas intervenções educacionais coerentes com os dados disponíveis.

Essa delimitação mantém o projeto alcançável e permite testar se a incorporação de evidência realmente melhora a personalização sem exigir que a primeira versão resolva problemas de modelagem multimodal, diagnóstico ou previsão de longo prazo.

# 7 AVALIAÇÃO

## 7.1 Pesquisa preliminar e limites de inferência

A pesquisa preliminar é importante para explicar a gênese do TrailUp, mas não deve ser utilizada para provar eficácia. Seus resultados foram obtidos antes da versão atual do sistema e possuem finalidade exploratória. A monografia utilizará seus dados para justificar requisitos e decisões de projeto.

## 7.2 Teste preliminar de usabilidade

O teste de usabilidade realizado em 2025 contou com cinco participantes e utilizou nota de recomendação e perguntas abertas. O artefato registra boa aceitação do fluxo, percepção de adaptação ao ritmo e sugestões de melhoria em progresso e comunicação da atuação da IA (MORAES DOMICIANO et al., 2025).

As notas 9, 8, 10, 9 e 8 resultam em média 8,8. Considerando a definição padrão de NPS, três respostas são promotoras, duas são passivas e nenhuma é detratora, resultando em NPS de 60. A média 8,8 será mantida apenas como média da nota de recomendação.

## 7.3 Protocolo de teste em sala

Após o fechamento do RAG, o sistema será aplicado em uma situação real ou controlada de sala de aula. O professor definirá os conteúdos e atividades. Os estudantes utilizarão o TrailUp para acessar os materiais e resolver as atividades previstas.

A estrutura mínima deverá contemplar uma medida de conhecimento antes da intervenção, utilização do sistema, medida posterior e coleta de indicadores de comportamento. Quando viável, uma atividade de retenção posterior será aplicada para observar manutenção do conhecimento.

## 7.4 Métricas de aprendizagem

## 7.5 Métricas de comportamento e engajamento

Essas medidas não serão interpretadas isoladamente. Uma pessoa pode permanecer mais tempo no aplicativo porque encontrou dificuldade, e não porque aprendeu mais. A literatura sobre learning analytics reforça a necessidade de distinguir dimensões de engajamento e evitar proxies simplistas (BERGDAHL et al., 2024).

## 7.6 Métricas de personalização

## 7.7 Métricas de experiência

Serão utilizados questionários de percepção e perguntas abertas para registrar clareza, facilidade de uso, percepção de adaptação e intenção de continuidade. A análise qualitativa servirá para explicar resultados quantitativos e identificar efeitos que não aparecem nos logs.

## 7.8 Análise dos resultados

A análise final utilizará estatística descritiva e comparação pré/pós. Quando o desenho amostral permitir, serão realizadas comparações entre condições de apresentação ou grupos. Os resultados serão segmentados por perfil BrainHex apenas quando o número de participantes permitir interpretação responsável.

A discussão deverá separar significância estatística, tamanho do efeito, relevância pedagógica e percepção dos estudantes. Resultados nulos ou negativos também serão reportados, especialmente quando uma estratégia personalizada não superar a abordagem de referência.

# 8 RESULTADOS E DISCUSSÃO

Esta seção será preenchida após a aplicação do protocolo em sala. A monografia não antecipa resultados de eficácia que ainda não foram medidos. O capítulo deverá apresentar os resultados do experimento, relacioná-los às hipóteses e discutir convergências e divergências com a literatura.

## 8.1 Resultados da Evidence Base

> *\[A preencher após o encerramento da busca e seleção: número de registros identificados, removidos, avaliados, excluídos e incluídos; distribuição por domínio; qualidade; população; contexto e aplicabilidade.\]*

## 8.2 Resultados do sistema

> *\[A preencher com métricas reais de personalização, geração de materiais, qualidade dos artefatos, telemetria, estabilidade e uso.\]*

## 8.3 Resultados educacionais

> *\[A preencher após o teste em sala: pré/pós, retenção, conclusão, acerto, progressão e respostas por estratégia.\]*

## 8.4 Discussão

> *\[A preencher confrontando resultados observados com as evidências recuperadas pela base e com as hipóteses do trabalho.\]*

# 9 LIMITAÇÕES E TRABALHOS FUTUROS

A primeira limitação é o caráter evolutivo do sistema. O TrailUp continua sendo desenvolvido e algumas funcionalidades são incrementadas em etapas. Isso torna necessário registrar claramente o estado do sistema utilizado no experimento.

A segunda limitação está relacionada ao BrainHex. Apesar de sua utilidade como referência de preferência, a literatura mostra limitações psicométricas e discute modelos alternativos. O projeto, portanto, não depende da premissa de que BrainHex seja uma representação completa do estudante.

A terceira limitação está relacionada à Evidence Base. Uma fonte científica pode ser de alta qualidade e ainda não se aplicar diretamente ao contexto de graduação, motivo pelo qual contexto e população deverão acompanhar cada evidência.

A quarta limitação diz respeito à telemetria. Logs representam comportamento observado, não explicações psicológicas completas. A interpretação deverá permanecer limitada ao que os dados e a literatura permitem.

Entre os trabalhos futuros estão a ampliação da Evidence Base, experimentos com maior número de turmas, comparação entre diferentes estratégias de apresentação, recomendação adaptativa de próximo passo, calibração individual de dificuldade e integração com outros ambientes educacionais. Recursos de análise multimodal e modelos de previsão mais sofisticados também podem ser considerados, mas não são necessários para validar o MVP.

# 10 CONCLUSÃO

O TrailUp evoluiu de uma proposta de aplicativo educacional para um sistema distribuído que integra professor, estudante, personalização, geração multimídia, gamificação, progresso e telemetria. A etapa preliminar de pesquisa e UX forneceu evidências de interesse do público e orientou decisões de design, mas não deve ser confundida com uma avaliação de eficácia pedagógica.

O uso do BrainHex foi delimitado como referência inicial de preferência e não como classificação permanente do estudante. Essa escolha é coerente com a literatura disponível: o modelo possui aplicação em gamificação e personalização, mas também apresenta limitações de validação. O TrailUp pretende complementar o perfil com dados do uso e desempenho.

A Evidence Base e o RAG representam uma etapa de amadurecimento do sistema. Seu objetivo é inserir evidência científica no processo de decisão e reduzir a dependência de regras rígidas ou de geração livre. A estrutura proposta preserva a diferença entre conteúdo curricular do professor e literatura utilizada para orientar estratégias.

A efetividade do TrailUp ainda será determinada pelo teste em sala. Assim, a contribuição final da monografia dependerá dos dados efetivamente coletados. O projeto está delimitado para demonstrar uma abordagem viável de personalização e para medir seus efeitos, deixando extensões de maior complexidade para fases posteriores.

## 4.18 Delimitação operacional do MVP

A delimitação do MVP é necessária para impedir que a plataforma seja descrita como uma solução para todos os problemas de aprendizagem, saúde mental ou personalização educacional. O TrailUp, nesta etapa, não pretende diagnosticar transtornos, inferir estados clínicos, substituir o professor, produzir autonomamente o currículo de uma disciplina ou provar que um arquétipo de jogador corresponde a uma modalidade de aprendizagem. O objetivo é mais restrito: utilizar informações já disponíveis no sistema para selecionar e ajustar estratégias de apresentação e acompanhamento que sejam plausíveis, explicáveis e fundamentadas por evidências recuperáveis.

O MVP, portanto, pode ser representado por quatro camadas principais. A primeira é a camada curricular, composta pelo conteúdo, questões, cards e demais materiais fornecidos pelo professor. A segunda é a camada de contexto do estudante, que contém perfil BrainHex, histórico de interação e indicadores derivados da telemetria. A terceira é a Evidence Base, que armazena evidências científicas estruturadas, metadados, limitações e condições de aplicabilidade. A quarta é a camada de decisão e geração, na qual regras do sistema, recuperação de evidências e modelos de IA produzem uma ação adaptativa.

| Camada | Entrada principal | Responsabilidade | Limite |
|----|----|----|----|
| Curricular | Conteúdo, questões e cards do professor | Definir o que deve ser estudado | Não deve ser alterada pela literatura automaticamente |
| Estudante | BrainHex e telemetria | Representar contexto e comportamento observado | Não diagnosticar ou explicar psicologicamente o estudante |
| Evidence Base | Artigos, revisões, diretrizes e documentos selecionados | Fundamentar estratégias e explicitar limitações | Não substituir o currículo nem extrapolar população/contexto |
| Decisão/IA | Contexto + evidências + regras | Selecionar ou gerar uma estratégia | Deve manter rastreabilidade e permitir recusa quando não houver evidência |

## 4.19 Plano de análise de efetividade

A efetividade do TrailUp deverá ser analisada como uma propriedade multidimensional. Não é suficiente observar tempo de uso, número de sessões ou quantidade de conteúdo consumido. Um sistema pode aumentar o tempo de permanência porque está tornando a tarefa mais difícil. Da mesma forma, uma redução no tempo de estudo pode representar maior eficiência ou simplesmente abandono. Por isso, a análise deverá cruzar resultados de aprendizagem com comportamento e percepção.

| Dimensão | Indicador principal | Indicadores auxiliares | Interpretação |
|----|----|----|----|
| Aprendizagem | Variação pré-pós | Acertos, erros, retenção, desempenho por tópico | Indica mudança no domínio do conteúdo |
| Comportamento | Conclusão de atividades | Tempo ativo, retornos, tentativas, frequência | Indica padrão de uso, não causa psicológica |
| Personalização | Mudança de estratégia após evidência | Adequação percebida, desempenho após mudança | Avalia se a adaptação foi útil |
| Experiência | Percepção de adequação | Clareza, facilidade, satisfação, intenção de continuidade | Avalia aceitação e experiência |
| Técnica | Disponibilidade e consistência | Latência, falhas, jobs duplicados, erros de geração | Avalia viabilidade do artefato |

## 4.20 Métricas que não devem ser usadas isoladamente

Alguns indicadores serão tratados como sinais contextuais. Tempo de permanência, número de cliques, quantidade de tentativas, abandono de uma atividade e frequência de retorno não possuem interpretação única. A revisão de Bergdahl et al. (2024) mostra que engajamento em learning analytics é um conceito multifacetado e que os indicadores utilizados por estudos variam de acordo com a concepção de engajamento adotada. Dessa forma, o TrailUp deve evitar a equivalência entre 'mais interação' e 'mais aprendizagem'.

A mesma cautela vale para indicadores emocionais. Uma pausa, um retorno frequente ou uma demora podem representar dificuldade, distração, acessibilidade, leitura cuidadosa ou problemas técnicos. O sistema deverá, portanto, produzir sinais de necessidade de apoio, e não rótulos psicológicos. Essa distinção é particularmente importante em um trabalho de graduação, no qual a pretensão metodológica deve permanecer compatível com a amostra e com os instrumentos realmente utilizados.

## 6.17 Estrutura interna de uma evidência

Para que o RAG seja útil ao TrailUp, o documento científico não deve ser tratado apenas como um arquivo textual. A unidade de recuperação deve ser uma evidência contextualizada. Cada registro deve indicar o que o estudo investigou, quem participou, em qual contexto, qual intervenção foi applied, qual comparação foi realizada, quais resultados foram observados e quais limitações impedem generalização. Essa estrutura permite que a recuperação retorne não apenas uma frase aparentemente relevante, mas o conjunto mínimo necessário para que uma decisão seja tomada com cautela.

| Campo | Exemplo de preenchimento | Função no RAG |
|----|----|----|
| claim | A prática distribuída apresentou vantagem sobre prática massiva | Representa a afirmação recuperável |
| population | Estudantes em contexto escolar/educacional | Evita extrapolação automática para outras populações |
| context | Aprendizagem curricular | Permite verificar proximidade com a disciplina |
| intervention | Prática distribuída | Relaciona evidência à estratégia candidata |
| outcome | Desempenho/retensão | Indica qual resultado foi observado |
| evidence_level | Revisão sistemática/meta-análise | Ajuda a priorizar fontes |
| limitations | Moderadores e limites de generalização | Impede afirmações excessivas |
| applicability | Alta/Média/Baixa | Separa qualidade do estudo de adequação ao TrailUp |
| source | DOI/URL | Permite rastreabilidade |

## 6.18 Critérios de inclusão e exclusão

A seleção da Evidence Base deverá privilegiar documentos científicos, revisões sistemáticas, meta-análises, diretrizes institucionais e trabalhos acadêmicos com descrição metodológica suficiente para avaliação. Quando o tema for diretamente relacionado ao ensino superior, será dada preferência a populações universitárias. Estudos de educação infantil ou escolar podem ser mantidos quando investigarem mecanismos gerais de aprendizagem claramente transferíveis, mas deverão receber marcação de aplicabilidade reduzida ao contexto de graduação.

| Critério | Incluir | Excluir ou rebaixar |
|----|----|----|
| População | Graduação, adultos ou população claramente relevante | Contextos muito distantes sem mecanismo transferível |
| Desenho | Revisão sistemática, meta-análise, experimento, estudo observacional bem descrito | Opinião sem método ou fonte não rastreável |
| Resultado | Aprendizagem, retenção, autorregulação, feedback, apresentação, gamificação ou uso educacional | Alegações sem desfecho relacionado |
| Aplicabilidade | Contexto comparável ao TrailUp | Aplicabilidade desconhecida sem justificativa |
| Qualidade | Método transparente e limitações declaradas | Método ausente ou resultados impossíveis de verificar |

## 6.19 PRISMA 2020 como protocolo de transparência

O PRISMA 2020 será utilizado como referência para registrar de forma transparente a identificação, triagem, elegibilidade e inclusão das fontes. PRISMA é uma diretriz de relato de revisões sistemáticas; não é um algoritmo de recuperação e não substitui a avaliação crítica da literatura. No TrailUp, sua função é tornar auditável como a Evidence Base foi construída.

O fluxo mínimo deverá registrar: bases consultadas; data da busca; strings utilizadas; quantidade de registros encontrados; duplicatas removidas; registros avaliados por título e resumo; textos completos avaliados; motivos de exclusão; fontes incluídas; domínios temáticos; qualidade/aplicabilidade; e versão da base utilizada no experimento. A documentação desse processo permitirá reproduzir a construção da base e atualizar o acervo posteriormente.

| Etapa         | Registro necessário                 | Produto                  |
|---------------|-------------------------------------|--------------------------|
| Identificação | Base, data e consulta               | Lista bruta de registros |
| Deduplicação  | Critério de duplicata               | Lista limpa              |
| Triagem       | Título/resumo e decisão             | Pré-selecionados         |
| Elegibilidade | Texto completo e motivo de exclusão | Fontes elegíveis         |
| Extração      | Metadados e resultados              | Registros estruturados   |
| Classificação | Domínio, qualidade e aplicabilidade | Evidence Base            |
| Atualização   | Versão e data                       | Base versionada          |

## 6.20 Hierarquia de confiança da Evidence Base

A hierarquia de confiança será usada para orientar recuperação, e não para transformar um tipo de publicação em verdade absoluta. Uma meta-análise pode ter limitações de heterogeneidade; um experimento pequeno pode ser altamente específico; uma diretriz pode ser adequada para design, mas não medir aprendizagem. Por isso, a classificação deverá combinar força metodológica e aplicabilidade.

| Classe | Uso recomendado |
|----|----|
| CORE | Evidência diretamente relacionada ao mecanismo e ao contexto do TrailUp; prioridade alta |
| SUPPORT | Evidência complementar para apoiar uma decisão específica |
| CONTEXT | Ajuda a interpretar contexto, mas não deve sustentar sozinha uma decisão |
| LIMITATION | Fonte utilizada para delimitar o que não pode ser afirmado |
| FUTURE | Linha promissora sem evidência suficiente para o MVP |

## 6.21 Exemplo de consulta do RAG

Considere o seguinte contexto: um estudante apresenta queda de acertos em determinado tópico, aumenta o número de tentativas e retorna repetidamente ao mesmo conteúdo. A consulta não deve ser 'o aluno está frustrado?'. Uma formulação tecnicamente mais segura seria: 'quais estratégias de prática, feedback ou reapresentação possuem evidência para estudantes que apresentam dificuldade observável em um tópico e como essas estratégias podem ser aplicadas sem alterar o conteúdo curricular?'

A recuperação pode então priorizar estudos sobre prática de recuperação, feedback formativo, prática distribuída e autorregulação. O resultado não é uma resposta clínica; é um conjunto de estratégias candidatas. A camada de decisão verifica se a estratégia é compatível com o tipo de atividade, com o conteúdo do professor e com as restrições do MVP.

### 2.7.1 BrainHex como hipótese de personalização

O BrainHex foi apresentado por Nacke, Bateman e Mandryk como uma tipologia de jogadores baseada em achados neurobiológicos e em modelos anteriores de tipologia de jogadores. A proposta apresenta sete arquétipos: Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socialiser e Achiever. No TrailUp, essa tipologia é utilizada em uma função deliberadamente mais limitada: oferecer uma dimensão inicial de preferência para mecânicas de gamificação, linguagem e possibilidades de apresentação.

A escolha do BrainHex não significa que o sistema considere os perfis permanentes, nem que um estudante de determinado arquétipo possua uma forma biologicamente determinada de aprender. O projeto assume que o perfil é um ponto de partida que pode ser confrontado com o comportamento observado. Essa decisão é especialmente importante porque a literatura sobre personalização educacional mostra que não é adequado converter categorias de preferência diretamente em 'estilos de aprendizagem'.

O estudo de Santos et al. (2022), por exemplo, investigou personalização baseada em BrainHex em um sistema educacional gamificado com 121 estudantes. O estudo não encontrou efeitos principais da personalização sobre todas as dimensões de flow, motivação, percepção da gamificação e enjoyment. Esse resultado é relevante para o TrailUp porque impede que a monografia apresente BrainHex como uma tecnologia já comprovada de aumento de aprendizagem. O valor do modelo, neste trabalho, é funcionar como hipótese de personalização que será observada e avaliada.

| Perfil | Possível uso no TrailUp | Não pode ser inferido |
|----|----|----|
| Seeker | Exploração, conteúdo opcional, descoberta | Que o estudante aprenda melhor visualmente |
| Survivor | Desafios progressivos e feedback de superação | Que medo ou pressão aumentem aprendizagem |
| Daredevil | Missões curtas e desafios com risco controlado | Que risco seja pedagogicamente necessário |
| Mastermind | Problemas abertos, estratégia e otimização | Que o perfil determine capacidade cognitiva |
| Conqueror | Metas, desafios e conquistas | Que competição sempre aumente desempenho |
| Socialiser | Colaboração ou reconhecimento quando disponíveis | Que socialização seja necessária para aprender |
| Achiever | Progresso, metas e conclusão | Que badges sejam suficientes para motivação |

### 7.1.1 Pesquisa preliminar de descoberta

A pesquisa preliminar constitui a origem empírica do problema de projeto. O documento de UX registra questionário applied a 50 estudantes, observação em sala, análise de perfis de jogador pelo BrainHex e diário de campo. Os artefatos derivados incluem persona, mapa de empatia, matriz CSD, storyboard, protótipo, relatório de testes e análise dos dados.

Entre os achados registrados estão predominância de participantes entre 20 e 24 anos, percepção de cansaço em aulas excessivamente teóricas, valorização de atividades práticas, interatividade e gamificação, preferência por ritmo próprio, predominância de Explorador e Conquistador e aceitação da proposta do TrailUp. Esses dados justificaram o problema de projeto, mas não devem ser apresentados como evidência de eficácia da plataforma.

| Achado preliminar | Uso na construção do sistema | Limite de interpretação |
|----|----|----|
| Preferência por ritmo próprio | Justificou trilhas e progressão flexível | Não prova que ritmo próprio melhora aprendizagem |
| Aulas percebidas como cansativas | Motivou microatividades e alternância de formatos | É percepção autorrelatada |
| Predominância Explorador/Conquistador | Orientou primeiras hipóteses de gamificação | Não representa toda a população universitária |
| Aceitação do conceito | Apoiou continuidade do protótipo | Não equivale a eficácia pedagógica |
| Preferência por missões/recompensas | Orientou gamificação inicial | Preferência não garante resultado educacional |

# APÊNDICE A – MATRIZ DE RASTREABILIDADE DO PROJETO

A matriz abaixo conecta os artefatos já desenvolvidos, a função de cada um no projeto e sua posição na monografia. A intenção é evitar que a pesquisa preliminar e os artefatos de UX desapareçam quando o trabalho acadêmico for reorganizado como monografia.

| Artefato | Função | Evidência gerada | Local na monografia |
|----|----|----|----|
| Questionário com alunos | Descoberta | Perfil, dificuldades, preferências | 7.1 / Anexo |
| Diário de campo | Observação contextual | Comportamentos e contexto de sala | Metodologia/Anexo |
| BrainHex | Perfil motivacional | Arquétipo predominante | 2.7 / 7.14 |
| Persona | Síntese qualitativa | Necessidades e dores | Pesquisa preliminar |
| Mapa de empatia | Contextualização | Percepções e necessidades | Pesquisa preliminar |
| Matriz CSD | Priorização de incertezas | Certezas, suposições e dúvidas | Metodologia |
| Storyboard | Modelagem de jornada | Fluxo esperado | Desenvolvimento |
| Protótipo Figma | Validação de UX | Fluxos de interação | Desenvolvimento |
| Teste de usabilidade | Validação preliminar | Percepção e NPS | Avaliação |
| Código do sistema | Implementação | Artefato funcional | Desenvolvimento |
| Evidence Base | Fundamentação | Evidências estruturadas | Cap. 6 |
| Teste em sala | Validação final | Resultados de efetividade | Cap. 8 |

# APÊNDICE B – FORMULÁRIO INICIAL E VARIÁVEIS DE PERSONALIZAÇÃO

O formulário inicial deve ser pequeno o suficiente para não criar uma barreira de entrada e completo o suficiente para registrar informações que tenham função explícita no sistema. A recomendação é separar variáveis estáveis ou de baixa frequência de variáveis que serão observadas continuamente pela telemetria.

| Bloco | Variável | Tipo | Uso |
|----|----|----|----|
| Identificação acadêmica | Curso/semestre | Categórica | Contextualização |
| Preferências | Formatos preferidos | Múltipla escolha | Preferência inicial, não estilo fixo |
| Rotina | Tempo disponível | Ordinal | Planejamento de sessão |
| Autopercepção | Facilidade/dificuldade percebida | Escala | Contexto inicial |
| Gamificação | Elementos preferidos | Múltipla escolha | Hipótese de motivação |
| BrainHex | Perfil resultante | Categórica | Personalização inicial |
| Objetivo | Meta da sessão | Texto/seleção | Autorregulação |
| Conteúdo | Tópico atual | Categórica | Contexto curricular |

A coleta não deve perguntar ao estudante qual é seu 'estilo de aprendizagem' e depois usar a resposta como explicação causal. É mais defensável perguntar sobre preferências, condições de estudo, disponibilidade e experiências anteriores. A apresentação de texto, áudio e slides pode então ser tratada como escolha ou hipótese experimental, cuja efetividade é observada por dados de desempenho e não presumida pelo questionário.

# APÊNDICE C – MATRIZ DE INTERVENÇÕES DO MVP

| Situação observável | Ação candidata | Justificativa | Condição de segurança |
|----|----|----|----|
| Erros consecutivos no mesmo tópico | Revisar conceito + nova questão | Recuperação e feedback | Não alterar conteúdo do professor |
| Retorno repetido ao mesmo material | Oferecer resumo ou card | Reduzir custo de revisão | Oferta, não imposição |
| Sessão muito longa | Sugerir pausa | Autorregulação e gestão da sessão | Não afirmar fadiga clínica |
| Baixa conclusão | Reduzir granularidade da próxima tarefa | Microtarefas | Comparar com desempenho posterior |
| Preferência por áudio | Oferecer áudio como alternativa | Múltiplas representações | Não afirmar que áudio é melhor para o perfil |
| Perfil BrainHex identificado | Ajustar mecânica de gamificação | Hipótese motivacional | Perfil não determina formato cognitivo |
| Evidência insuficiente | Manter estratégia padrão | Evitar alucinação | Registrar ausência de suporte |

# APÊNDICE D – MODELO DE REGISTRO DA DECISÃO ADAPTATIVA

Cada decisão relevante do sistema deverá poder ser reconstruída posteriormente.

| Campo              | Exemplo                             |
|--------------------|-------------------------------------|
| student_context    | perfil + tópico + histórico recente |
| observed_signal    | 3 erros consecutivos                |
| learning_goal      | dominar conceito X                  |
| candidate_strategy | feedback explicativo + nova questão |
| retrieved_evidence | IDs das evidências recuperadas      |
| decision           | aplicar estratégia                  |
| reason             | evidência + regra de decisão        |
| outcome            | acerto na tentativa seguinte        |
| version            | versão do sistema/Evidence Base     |

# APÊNDICE E – PLANO DE ANÁLISE ESTATÍSTICA

A análise inicial deverá privilegiar estatística descritiva, pois o objetivo do primeiro teste é verificar viabilidade e gerar evidência inicial. Serão calculadas médias, medianas, dispersão, proporções e distribuições dos indicadores. Quando houver pré e pós-teste comparáveis, será calculada a diferença individual e, quando adequado, tamanho de efeito. O teste estatístico específico dependerá do tamanho da amostra, distribuição e desenho final.

Comparações por BrainHex deverão ser exploratórias. Perfis com poucos participantes não deverão receber inferência causal. Também será evitada a fragmentação excessiva dos dados, pois dividir uma amostra pequena em sete grupos pode produzir conclusões instáveis. A hipótese mais relevante para trabalhos posteriores é verificar interação entre perfil, estratégia aplicada e resultado, e não simplesmente comparar médias entre arquétipos.

# APÊNDICE F – CHECKLIST DE IMPLEMENTAÇÃO DO RAG

- Definir domínios da Evidence Base.

- Finalizar critérios de inclusão e exclusão.

- Registrar buscas e decisões segundo o fluxo PRISMA.

- Extrair metadados e limitações de cada fonte.

- Separar CORE, SUPPORT, CONTEXT, LIMITATION e FUTURE.

- Criar chunking orientado a afirmações e contexto.

- Associar metadados de população, contexto e nível educacional.

- Implementar recuperação semântica com filtros estruturados.

- Exigir evidências recuperadas para decisões que dependam de literatura.

- Registrar ausência de evidência.

- Manter o conteúdo do professor como fonte curricular.

- Registrar a decisão adaptativa e as evidências utilizadas.

- Testar respostas do RAG contra um conjunto de perguntas de validação.

- Versionar a Evidence Base utilizada no teste.

- Não liberar decisões clínicas ou diagnósticas no MVP.

# APÊNDICE G – ROTEIRO DO EXPERIMENTO EM SALA

Etapa 1 – Preparação: selecionar disciplina, conteúdo, questões e cards; configurar a versão do TrailUp; verificar a Evidence Base; preparar consentimento e instrumentos.

Etapa 2 – Medida inicial: aplicar instrumento de conhecimento e formulário de contexto; registrar perfil BrainHex quando previsto pelo protocolo.

Etapa 3 – Intervenção: estudantes utilizam o TrailUp com conteúdo curricular do professor; o sistema registra telemetria e decisões adaptativas.

Etapa 4 – Medida posterior: aplicar pós-teste equivalente ou comparável; coletar percepção sobre adequação das apresentações e intervenções.

Etapa 5 – Análise: comparar desempenho, conclusão, comportamento e percepção; analisar decisões de personalização; documentar casos de sucesso, falha e ausência de evidência.

Etapa 6 – Retenção, se viável: realizar uma medida posterior para verificar manutenção do conteúdo após intervalo temporal.

# APÊNDICE H – LIMITES QUE DEVEM SER MANTIDOS NA REDAÇÃO

| Evitar afirmar | Preferir |
|----|----|
| BrainHex identifica como o aluno aprende | BrainHex fornece uma dimensão de preferência motivacional |
| O aluno estava ansioso | Foram observados sinais comportamentais compatíveis com necessidade de apoio |
| Áudio é melhor para este perfil | Áudio foi selecionado como alternativa e sua adequação será avaliada |
| A IA sabe o estado emocional | O sistema utiliza sinais observáveis e hipóteses de intervenção |
| Gamificação aumenta aprendizagem | A gamificação é uma estratégia cuja efetividade será avaliada no contexto do sistema |
| O RAG garante respostas corretas | O RAG fornece evidências recuperadas e melhora a rastreabilidade da geração |
| O sistema provou eficácia | O teste fornece evidência inicial sobre viabilidade/efetividade no contexto estudado |

# REFERÊNCIAS

AGARWAL, Pooja K.; NUNES, Ludmila D.; BLUNT, Janell R. Retrieval practice consistently benefits student learning: a systematic review of applied research in schools and classrooms. Educational Psychology Review, 2021.

ALHAZBI, Saleh. Using learning analytics to measure self-regulated learning: a systematic review of empirical studies in higher education. Journal of Computer Assisted Learning, v. 40, n. 4, p. 1658–1674, 2024. DOI: 10.1111/jcal.12982.

BERGDAHL, Nina et al. Unpacking student engagement in higher education learning analytics: a systematic review. International Journal of Educational Technology in Higher Education, v. 21, art. 63, 2024. DOI: 10.1186/s41239-024-00493-y.

CARPENTER, Shana K.; PAN, Steven C.; BUTLER, Andrew C. The science of effective learning with spacing and retrieval practice. Nature Reviews Psychology, v. 1, p. 496–511, 2022.

CAST. Universal Design for Learning Guidelines version 3.0. Wakefield, MA: CAST, 2024. Disponível em: https://udlguidelines.cast.org/. Acesso em: 31 ago. 2026.

CLINTON-LISELL, Virginia; LITZINGER, Christine. Is it really a neuromyth? A meta-analysis of the learning styles matching hypothesis. Frontiers in Psychology, v. 15, 2024. DOI: 10.3389/fpsyg.2024.1428732.

DETERDING, Sebastian; DIXON, Dan; KHALED, Rilla; NACKE, Lennart. From game design elements to gamefulness: defining gamification. In: INTERNATIONAL ACADEMIC MINDTREK CONFERENCE, 15., 2011. Proceedings \[...\]. New York: ACM, 2011.

DRUGOVA, Elena. Learning analytics driven improvements in learning design in higher education: a systematic literature review. Journal of Computer Assisted Learning, v. 40, n. 2, p. 510–524, 2024. DOI: 10.1111/jcal.12894.

EDISHERASHVILI, Natalia et al. Supporting self-regulated learning in distance learning contexts at higher education level: systematic literature review. Frontiers in Psychology, 2022.

HAMARI, Juho; KOIVISTO, Jonna; SARSA, Harri. Does gamification work? A literature review of empirical studies on gamification. In: HAWAII INTERNATIONAL CONFERENCE ON SYSTEM SCIENCE, 47., 2014. Proceedings \[...\]. p. 3025–3034. DOI: 10.1109/HICSS.2014.377.

LEWIS, Patrick et al. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. In: ADVANCES IN NEURAL INFORMATION PROCESSING SYSTEMS, 33., 2020. Proceedings \[...\]. 2020.

MAYER, Richard E.; FIORELLA, Logan (ed.). The Cambridge Handbook of Multimedia Learning. 3. ed. Cambridge: Cambridge University Press, 2021.

MONTERRAT, Baptiste; LAVOUÉ, Élise; GEORGE, Sébastien. Adaptation of gaming features for motivating learners. Simulation & Gaming, v. 48, n. 5, p. 625–656, 2017.

NACKE, Lennart E.; BATEMAN, Chris; MANDRYK, Regan L. BrainHex: preliminary results from a neurobiological gamer typology survey. In: ENTERTAINMENT COMPUTING – ICEC 2011. Berlin: Springer, 2011. p. 288–293.

PAGE, Matthew J. et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ, v. 372, n71, 2021. DOI: 10.1136/bmj.n71.

PAGE, Matthew J. et al. PRISMA 2020 explanation and elaboration: updated guidance and exemplars for reporting systematic reviews. BMJ, v. 372, n160, 2021. DOI: 10.1136/bmj.n160.

SANTOS, et al. The effects of personalized gamification on students’ flow experience, motivation, and enjoyment. Smart Learning Environments, 2022. DOI: 10.1186/s40561-022-00194-x.

VANLEHN, Kurt. The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. Educational Psychologist, v. 46, n. 4, p. 197–221, 2011.

FEITOSA MORAES, Geisbelly Victória dos Santos; CASTRO, Larissa Rocha Cavalcante de; TAVARES, Rafael Nunes; GONÇALVES, Rodrigo Rodrigues. Projeto de UX — TrailUp. Palmas: CEULP/ULBRA, 2025. Documento de projeto.

# ANEXOS – ARTEFATOS DO PROJETO

Os artefatos abaixo já foram produzidos no projeto e devem ser anexados ou vinculados na versão institucional da monografia. Eles não precisam ser reproduzidos integralmente no corpo do texto, mas devem permanecer acessíveis para rastreabilidade.

- Anexo A – Questionário aplicado aos alunos.

- Anexo B – Diário de campo.

- Anexo C – Persona.

- Anexo D – Mapa de empatia.

- Anexo E – Matriz CSD.

- Anexo F – Storyboard.

- Anexo G – Protótipo no Figma.

- Anexo H – Relatório de testes de usabilidade.

- Anexo I – Proposta de pesquisa.

- Anexo J – Base de respostas da pesquisa.

- Anexo K – Documento final do Projeto de UX.

- Anexo L – Análise de perfis de jogador BrainHex.

- Anexo M – Base/arquivo de análise BrainHex.

- Anexo N – Análise dos dados da pesquisa.

- Anexo O – Protótipo funcional.

- Anexo P – Apresentação visual do projeto final.

## NOTA DE FECHAMENTO METODOLÓGICO

Esta versão deliberadamente não inventa os resultados da pesquisa em sala. A monografia já pode ser escrita e submetida à avaliação metodológica com a pesquisa preliminar, o artefato funcional e o protocolo definidos; entretanto, as conclusões sobre efetividade do TrailUp deverão ser preenchidas somente depois da aplicação do experimento. Isso preserva a distinção entre viabilidade do artefato, aceitação preliminar e eficácia educacional.

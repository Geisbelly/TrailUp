---
fonte: Google Drive — TCC 1 / Proposta de TCC
link: https://docs.google.com/document/d/1JHcSE4fKUtWbyxG-HpqoDMoXWy7oqUWE0EZKLB_ndA0/edit
exportado: 2026-10-18
---

> Cópia em texto do documento do Drive (conversão automática docx → Markdown). Imagens, prints e diagramas foram omitidos; o original no Drive é a fonte de verdade.

**Proposta de TCC: Aplicativo Educacional Gamificado Adaptativo Guiado por IA Emocional**

**Funcionalidade Principal: Um Jogo/Simulação Educacional Gamificada**

O **NeuroNauta** será um aplicativo mobile gamificado, projetado para oferecer trilhas de aprendizagem personalizadas. Mais do que um simples jogo, será uma experiência de simulação interativa que se adapta ao perfil e ao estado emocional do aluno em tempo real. O foco é otimizar o processo de aprendizado, especialmente para perfis neurodivergentes (como ansiedade e TDAH), tornando-o mais engajador e menos frustrante.

A ideia central é que o aluno embarque em uma "jornada de conhecimento" onde a narrativa, os desafios e o ritmo são dinamicamente ajustados pelo sistema.

**O que o Sistema Ofereceria ao Usuário**

O **NeuroNauta** busca criar uma experiência de aprendizado profundamente personalizada e empática.**Entrada (Input) do Usuário:**

- **Interações Explícitas:**

  - Respostas a quizzes.

  - Seleções de opções.

  - Tempo de conclusão de tarefas.

  - Navegação no aplicativo.

- **Interações Implícitas (Monitoramento passivo):**

  - **Expressões Faciais:** Capturadas pela câmera frontal (ex: sorrisos, carrancas, testa franzida, indicativos de tédio, confusão, engajamento, frustração).

  - **Padrões de Uso:** Velocidade de digitação, cliques repetitivos, inatividade, abandono de tarefas.

  - **Perfil Inicial:** Um breve questionário ou minijogo no onboarding para identificar o "tipo de jogador" (Bartle/Marczewski) e possíveis características de neurodiversidade (ex: perguntas indiretas sobre preferência de ritmo, nível de distração).

- **Autoavaliação (Opcional/Periódica):** Pequenas perguntas sobre o humor atual ("Como você está se sentindo agora?").

**Saída (Output) para o Usuário:**

- **Trilhas de Aprendizagem Adaptativas:** O sistema reorganiza o conteúdo, a complexidade e o ritmo das atividades em tempo real.

  - **Exemplos:** Se detectar frustração, pode sugerir uma pausa, simplificar a tarefa, oferecer dicas mais diretas ou mudar para um tópico mais leve. Se identificar tédio, pode aumentar o desafio ou introduzir elementos mais interativos.

- **Feedback Personalizado:** Mensagens de encorajamento, dicas ou explicações reformuladas de acordo com o estado emocional detectado.

- **Adaptação da UI/UX:**

  - **Elementos Visuais:** Mudança de tema (cores mais calmas para ansiedade, mais vibrantes para tédio), tamanho de fontes/botões, redução de animações.

  - **Elementos Auditivos:** Alteração da trilha sonora (mais suave para foco, mais energética para engajamento), ajustes no volume.

  - **Navegação e Fluxo:** Simplificação de menus, destaque de informações importantes, desativação temporária de funcionalidades complexas.

- **Gamificação Dinâmica:** Recompensas, conquistas e avatares/mascotes que evoluem com o progresso e o engajamento do usuário.

**Possibilidades (UX Adaptativa):**

- **Redução de Frustração:** Minimizar momentos de desengajamento ou sobrecarga cognitiva.

- **Aumento de Engajamento:** Manter o aluno motivado e focado.

- **Suporte à Neurodiversidade:** Oferecer um ambiente de aprendizado mais inclusivo e eficaz para alunos com TDAH, ansiedade, etc., adaptando-se às suas necessidades específicas de ritmo, estímulo e feedback.

- **Experiência Contínua:** Criar um fluxo de aprendizado que se ajusta, ao invés de forçar o usuário a seguir um caminho rígido.

**Onde a IA entra no Processo**

A Inteligência Artificial é o coração do **NeuroNauta**, atuando em várias camadas:

1.  **Reconhecimento de Expressões Faciais (FER - Facial Expression Recognition):**

    - **Função:** Analisar o vídeo da câmera frontal para identificar emoções discretas (felicidade, tristeza, raiva, surpresa, etc.) ou dimensões afetivas (valência/arousal – quão positivo/negativo e quão ativado/calmo).

    - **IA Atuante:** Modelos de Deep Learning (CNNs treinadas em grandes datasets de expressões).

2.  **Análise de Sentimentos e Interações:**

    - **Função:** Interpretar o texto (se houver interação textual) ou padrões de uso para inferir o sentimento ou o estado do usuário (ex: respostas longas e hesitação podem indicar confusão).

    - **IA Atuante:** Processamento de Linguagem Natural (NLP) com modelos Transformers (como BERT para texto) e algoritmos de análise de padrões comportamentais.

3.  **Módulo de Perfil de Usuário:**

    - **Função:** Analisar as respostas do questionário inicial e o comportamento do usuário ao longo do tempo para construir um perfil dinâmico que inclua o tipo de jogador, estilo de aprendizagem e traços relacionados à neurodiversidade.

    - **IA Atuante:** Algoritmos de clustering ou classificação (ex: K-Means, Árvores de Decisão, ou mesmo redes neurais simples) para categorizar e atualizar o perfil.

4.  **IA Central Orquestradora (Motor de Decisão Adaptativa):**

    - **Função:** Esta é a "IA do seu TCC". Ela recebe e centraliza as informações de todas as outras IAs (reconhecimento facial, análise de sentimentos, perfil do usuário) e decide qual adaptação aplicar na interface ou na trilha de aprendizado.

    - **IA Atuante:** Pode ser um sistema baseado em regras (lógica fuzzy), uma árvore de decisão complexa, ou até um modelo de Aprendizado por Reforço (RL) que aprende a melhor sequência de adaptações ao longo do tempo. Esta IA é responsável por integrar as "percepções" e transformá-las em "ações" de adaptação.

**Exemplos de APIs/Ferramentas que Podem Ser Usadas**

Para prototipar o **NeuroNauta**, você pode usar uma combinação de bibliotecas e SDKs existentes:

- **Reconhecimento Facial e Expressões:**

  - **MediaPipe Face Detection/Face Mesh (Google):** Leve, rodando no dispositivo, bom para detectar *landmarks* faciais e inferir expressões. Pode ser usado com TensorFlow.js para inferência.

  - **DeepFace (Python):** Biblioteca robusta para reconhecimento e análise de expressões faciais. Pode ser usada no *backend* ou para treinar um modelo simplificado para o *mobile*.

  - **Microsoft Azure Face API / Google Cloud Vision AI:** Se houver orçamento ou créditos, oferecem APIs robustas e prontas para uso em nuvem.

- **Análise de Sentimentos e NLP:**

  - **Hugging Face Transformers (via API ou modelo on-device):** Modelos pré-treinados (como BERT, RoBERTa) para análise de sentimentos em texto.

  - **NLTK / SpaCy (Python):** Para processamento de texto e análise de sentimentos mais básica.

- **Desenvolvimento Mobile:**

  - **React Native / Expo:** Frameworks populares para desenvolvimento *mobile multiplataforma* (iOS/Android), facilitando a integração com módulos de ML e câmera.

  - **Flutter:** Outra excelente opção multiplataforma com forte ecossistema.

- **Camada de Orquestração / Backend:**

  - **Node.js (com Express.js):** Para construir a API do *backend* que recebe os dados dos modelos de IA e executa a lógica de decisão.

  - **Python (com Flask/Django):** Alternativa para o *backend*, especialmente se os modelos de IA forem desenvolvidos em Python.

  - **Firebase (Google):** Para autenticação, banco de dados em tempo real (Firestore) e funções *serverless* (Cloud Functions) que podem hospedar sua lógica de orquestração.

**Arquitetura do Sistema: Hexagonal (Ports and Adapters)**

A **Arquitetura Hexagonal** (*Ports and Adapters*) é ideal para o **NeuroNauta** porque ela desacopla o "cérebro" da sua aplicação (a lógica central de decisão e adaptação) das tecnologias externas (APIs de IA, bancos de dados, interfaces de usuário). Isso garante flexibilidade, testabilidade e escalabilidade.**Conceito:**

- **Núcleo (Core/Domain):** Contém a lógica de negócio principal do seu TCC – como a IA orquestradora decide adaptar a experiência, as regras de perfil de usuário e as estratégias de gamificação. Este núcleo não sabe nada sobre como os dados chegam ou como as ações são exibidas

\| +-----------------------------------------------------+ \|

\| \| \|

+-------------------------\|-----------------------------------+

\|

\| (Chamadas de Funções/Eventos)

V

+-------------------------------------------------------------+

\| NÚCLEO DO SISTEMA (DOMÍNIO) \|

\| \|

\| +---------------------------------------------------+ \|

\| \| IA Central Orquestradora / Motor de Decisão \| \|

\| \| (Lógica de Adaptação, Gestão de Perfis) \| \|

\| +---------------------------------------------------+ \|

\| ^ ^ \|

\| \| \| \|

\| +---------\|-------------------------------+---------+ \|

\| \| PORTAS (Interfaces) do Núcleo \| \|

\| \| - IEmotionRecognizerPort \| \|

\| \| - IUserProfileManagerPort \| \|

\| \| - IUxAdaptationPort \| \|

\| \| - IDataPersistencePort \| \|

\| +---------------------------------------------------+ \|

\| \|

+-------------------------------------------------------------+

^ ^ ^ ^

\| \| \| \|

\| \| \| \|

+------------\|-----------+-------------\|-----------+-------------+

\| ADAPTADORES EXTERNOS (Serviços/Bibliotecas) \|

\| \|

\| +---------------------+ +--------------------+ +--------------+

\| \| Adaptador FaceAI \| \| Adaptador NLP/Text \| \| Adaptador DB \|

\| \| (MediaPipe/DeepFace)\| \| (HuggingFace/BERT) \| \| (Firestore) \|

\| +---------------------+ +--------------------+ +--------------+

\| \|

\| Serviços de IA de Terceiros Bancos de Dados \|

+-----------------------------------------------------------------+

**Explicação dos Componentes na Arquitetura:**

- **Aplicativo Mobile (Interface do Usuário):** É a camada que o usuário interage diretamente. Através dos "Adaptadores de Interface", ele envia dados para o núcleo (ex: imagem da câmera, cliques) e recebe as adaptações visuais e funcionais.

- **Núcleo do Sistema (Domínio):** O centro da inteligência. É onde a IA Central Orquestradora reside. Ela processa as informações recebidas pelas "Portas" dos Adaptadores externos, avalia o estado do usuário e toma decisões sobre como adaptar a experiência.

- **Portas (Interfaces):** Contratos que o núcleo define para se comunicar com o mundo exterior. Por exemplo, o núcleo pede "uma emoção" através da IEmotionRecognizerPort, sem saber que é o MediaPipe quem vai fornecer.

- **Adaptadores Externos:** Implementações das Portas. São as pontes para as tecnologias de IA externas (como MediaPipe para reconhecimento facial, modelos de NLP para análise de sentimentos) e o banco de dados. Se você quiser trocar a biblioteca de reconhecimento facial, você muda apenas o Adaptador, não o Núcleo.

Essa estrutura te permite focar no desenvolvimento da lógica de decisão da sua IA Central (o que é o cerne do seu TCC) de forma isolada, enquanto os detalhes de implementação das IAs de reconhecimento e persistência de dados ficam em adaptadores facilmente substituíveis.

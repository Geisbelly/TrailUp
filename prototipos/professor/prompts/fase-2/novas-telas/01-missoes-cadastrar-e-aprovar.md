# Prompt — nova tela: Missões

## Identificação
- Nome da tela: **Missões** (novo item de sidebar, entre "Trilhas" e "Turmas" — uma missão é conteúdo avaliativo, no mesmo grupo conceitual da trilha).
- Fonte de conteúdo: issues **#150** (Missões criadas pelo professor), **#151** (Missões sugeridas pela IA, aprovadas pelo professor) e **#136** (prazo de resposta e avaliação do professor), anexadas a este prompt.

## Referências de estilo
Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md`.

## O que uma missão é, de acordo com a decisão já tomada (#150)
Uma missão **é uma atividade** (`tipo = 'missao'`), não uma entidade separada — ela tem objetivo, itens (conteúdo/questões), prazo, pontuação e recompensa, e reaproveita tudo que uma atividade normal já tem: prazo, pontuação máxima, avaliação do professor. Trate a tela como uma variação da experiência de criar/editar conteúdo avaliativo que a tela de Trilhas já tem — mesma linguagem visual, um propósito diferente (a missão tem "autoria própria": objetivo e recompensa, o que uma atividade solta de tópico não tem).

## Estrutura da tela

### Cabeçalho
Título "Missões" + subtítulo curto (ex. "Objetivos avaliativos com prazo, pontuação e recompensa própria."). Botão principal **"+ Nova missão"**.

### Lista de missões
Cards ou linhas, cada um com: título da missão, turma/tópico a que pertence (uma missão pode ou não estar ligada a um tópico específico), prazo, pontuação máxima, e um indicador de quantos alunos já entregaram/faltam entregar. Ações por item: editar, duplicar, excluir (excluir pede confirmação, seguindo o mesmo padrão já usado em Trilhas/Turmas).

### Formulário "Nova missão" / "Editar missão"
Campos, na ordem:
- **Título** e **Objetivo** (texto livre — o que se espera que o aluno atinja).
- **Turma** e, opcionalmente, **Tópico** vinculado.
- **Itens da missão** — lista de conteúdos/questões que a compõem, reaproveitando o mesmo padrão de "vincular existente" ou "criar novo" já usado no editor de conteúdo de Trilhas.
- **Prazo de resposta** — campo de data/hora, com uma escolha explícita entre **"Com cronômetro por questão"** e **"Sem tempo, tentativas ilimitadas"** (fonte: #136 — o prazo/tempo não pode ser um cronômetro único obrigatório; precisam existir as duas trilhas em paralelo, porque pressão de tempo é contraindicada para parte dos perfis BrainHex). Quando "Com cronômetro" é escolhido, um campo adicional define o limite por questão.
- **Pontuação** — pontuação máxima da missão.
- **Recompensa** (opcional, além dos pontos) — mesmo conceito de recompensa usado em Eventos (ver prompt `02`), sem inventar um segundo tipo de saldo.

### Painel "Sugestões da IA" (dentro da mesma tela, uma aba ou seção separada — fonte #151)
- A IA propõe missões a partir do conteúdo do tópico, do perfil da turma e da telemetria — **sob demanda do professor**, nunca automaticamente ao salvar um tópico (fonte: #151, decisão explícita — gerar automaticamente colocaria a API no caminho do salvamento, e ela hiberna).
- Botão "Pedir sugestões da IA" abre um pequeno formulário: **quantidade de sugestões** desejada (padrão: **3**, dentro de uma faixa configurável, com um teto de sistema que o professor não controla — a interface deve deixar claro que existe um limite de cota, sem expor o número exato como se fosse escolha livre).
- O pedido gera um **job** (mesmo padrão de "Gerar trilha com IA": Configurar → Gerar → Processando → Resultado), não uma resposta imediata — a tela deve deixar claro que a lista de sugestões pode demorar e aparece depois, não travando a tela.
- Cada sugestão aparece como um card: título, objetivo proposto, itens sugeridos, prazo/pontuação sugeridos, e 3 ações: **Aprovar** (vira missão de verdade, editável depois), **Editar antes de aprovar**, **Recusar**.
- **Recusar exige informar o motivo** (mesmo que um motivo curto/categorizado) — fonte #151: "aprovação e recusa gravadas com motivo, desde a primeira versão", porque é o dado que mede se a sugestão da IA presta.
- Mostrar, de forma discreta, a **taxa de aprovação** das sugestões já recebidas (ex. "7 de 10 sugestões aprovadas") — é um critério de aceite explícito da issue.

## Tela de avaliação (grade) — link a partir daqui
Missões que envolvem resposta dissertativa/trabalho entregue pelo aluno são avaliadas na tela **Notas** (prompt `05-notas-correcao-dissertativas-e-trabalhos.md`) — não duplique esse fluxo aqui, só inclua um link/atalho "Corrigir entregas" no card da missão quando ela tiver entregas pendentes de nota.

## O que NÃO fazer
Não desenhe um cronômetro único obrigatório para todas as missões — isso contraria uma decisão explícita da fonte (#136). Não faça a geração por IA ser automática ou instantânea — ela é sob pedido e assíncrona (#151). Não esqueça o campo de motivo ao recusar uma sugestão da IA.

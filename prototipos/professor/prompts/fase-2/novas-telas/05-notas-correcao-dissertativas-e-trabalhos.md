# Prompt — nova tela: Notas (correção de dissertativas e trabalhos)

## Identificação
- Nome da tela: **Notas** (novo item de sidebar).
- Fonte de conteúdo: issue **#136** (Missões com prazo de resposta e avaliação do professor — item 3 da mudança pede explicitamente "tela de avaliação do professor que grava `pontuacao_obtida` + `avaliacao_metadata` e emite evento em `eventos_aluno`") e issue **#150** (schema já existente: `atividades.tipo` inclui `essay`, `questoes.resposta_correta`/`nota_estabelecida`, `atividade_aluno.pontuacao_obtida`/`pontuacao_maxima`/`avaliacao_metadata`), ambas anexadas a este prompt.

## Referências de estilo
Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md`.

## Por que esta tela existe
Nem toda resposta pode ser corrigida automaticamente — questões dissertativas, trabalhos e envios de arquivo dependem do professor ler e dar nota. Essa correção precisa **entrar no mesmo caminho de pontuação que o resto** (gerar evento em `eventos_aluno`, para contar no rank e nas conquistas), não ser um número solto guardado à parte.

## Estrutura da tela

### Cabeçalho
Título "Notas" + subtítulo (ex. "Correção de questões dissertativas, trabalhos e entregas que dependem de leitura."). Filtros: **Turma**, **Tópico/Missão**, e um seletor de status (**Pendentes de correção** / **Já corrigidas** / **Todas**).

### Fila de correção (lista)
Uma linha por entrega pendente: aluno (avatar+nome), o que foi entregue (nome da questão/atividade/missão + tipo: dissertativa, trabalho, etc.), data de entrega, e um indicador de quanto tempo está esperando (ex. "entregue há 3 dias") — priorizar visualmente o que está esperando há mais tempo, já que corrigir tarde é o tipo de atraso que mais incomoda o aluno. Clicar numa linha abre o painel de correção.

### Painel de correção (ao abrir uma entrega)
- **Cabeçalho:** nome do aluno + nome da questão/atividade + pontuação máxima possível (`pontuacao_maxima`).
- **O enunciado da questão**, visível (o professor não deveria precisar lembrar o que foi pedido).
- **A resposta do aluno**, exibida por completo — texto dissertativo renderizado, ou, no caso de trabalho com arquivo anexado, uma pré-visualização do arquivo com opção de abrir/baixar (mesmo padrão de pré-visualização já definido para os anexos de conteúdo em Trilhas).
- Se a questão tiver um **gabarito/resposta esperada** cadastrado (`questoes.resposta_correta`), mostrar como referência lateral discreta para o professor — nunca escondido, mas também nunca como se fosse "a resposta certa" de forma definitiva quando a questão é dissertativa (dissertativa não tem resposta binária certa/errada).
- **Campo de nota** — numérico, limitado à pontuação máxima da questão/atividade.
- **Campo de feedback ao aluno** — texto livre, o que vira parte de `avaliacao_metadata` junto com quem avaliou e quando (a issue exige isso registrado).
- Botão principal **"Salvar avaliação"** — ao salvar, deixar claro na interface que isso **gera pontuação no rank do aluno** (ex. um texto de confirmação "Isso soma X pontos ao desempenho de {aluno} na turma"), já que é um critério de aceite explícito da fonte.

### Navegação entre entregas
Enquanto o painel de correção está aberto, ofereça "Próxima entrega" / "Entrega anterior" para o professor corrigir em sequência sem voltar à lista a cada avaliação — é um fluxo de trabalho repetitivo (potencialmente muitas entregas por turma) e voltar à lista toda vez custa tempo desnecessário.

## Estados
- **Fila vazia:** "Nenhuma entrega aguardando correção." (não mostrar tabela vazia).
- **Entrega sem arquivo/texto** (aluno não respondeu, mas o prazo venceu): tratar como um caso visível na fila, não escondido — o professor precisa decidir o que fazer com quem não entregou, não só com quem entregou.

## O que NÃO fazer
Não deixe a nota "solta" — toda nota salva precisa deixar claro que gera evento no rank do aluno. Não omita o enunciado nem a resposta completa do aluno — o professor não pode ser forçado a abrir outra tela para saber o que está corrigindo.

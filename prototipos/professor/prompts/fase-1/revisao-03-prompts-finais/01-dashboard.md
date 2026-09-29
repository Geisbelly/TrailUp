Prompt final de ajuste — tela **Dashboard**. Isto substitui os apontamentos anteriores sobre esta tela; é a versão consolidada, com a localização exata de cada elemento.

## MANTER exatamente como está

- **Cabeçalho da página:** título "Dashboard de Alunos" + subtítulo, sem mudanças.
- **Primeira fileira de indicadores** (4 cards, com ícone no canto superior direito de cada um): Total de Alunos, Média de Notas, Conclusão Média, Taxa de Acertos. Mantenha o padrão visual — rótulo em cima, ícone no canto, número grande embaixo.
- **Os dois gráficos** "Abandono por Perfil" (barras, com seletor "Majoritário") e "Distribuição de Notas" (rosca) — mantenha os dois, na mesma posição lado a lado, abaixo das fileiras de indicadores.
- **"Lista de Alunos"**, abaixo dos gráficos: busca por nome/e-mail, filtro por classe, e a tabela com colunas Aluno | Classe | Perfil | Nota Média | Progresso | Acertos | Ações (botão de olho abrindo o detalhe). Não mude essa tabela.
- **O modal de detalhe do aluno**, com as 4 abas (Visão Geral, Perfil BrainHex, Trilha Visual, Personalização) — a estrutura de abas continua. Dentro de "Visão Geral": os 4 mini-cards (Nota Média, Concluído, Acertos, Tempo Total) e o gráfico "Evolução do Aluno" (linha, com nota/acertos/progresso ao longo dos dias) — mantenha como está.
- **Aba "Perfil BrainHex"** do modal: a lista de perfis com barra de % e badge "Dominante" no perfil principal — mantenha.
- **Aba "Trilha Visual"** do modal: o toggle Hexágonos/Lista, o card roxo de progresso (XP), e os nós de trilha — mantenha a base visual (hexágonos, cores, ícones de status).

## REMOVER / CORRIGIR (bugs de conteúdo, não de estilo)

1. **Duplicidade no card "Conclusão Média":** hoje existem dois cards com o rótulo idêntico "Conclusão Média" — um na primeira fileira de indicadores (mostrando 38%) e outro na segunda fileira (mostrando 0.0%). Isso é um erro, não uma feature: **dê um rótulo diferente e correto ao segundo card** (ele provavelmente deveria medir outra coisa — ex.: conclusão da turma no período atual vs. conclusão histórica; decida com base no dado real que ele representa) ou **remova um dos dois** se forem redundantes.
2. **A caixa de JSON bruto na aba "Personalização"** do modal (o bloco "CONTEXTO CENTRAL DO ALUNO" mostrando `{ "aluno": {...} }` em texto de código): **isso não deve aparecer para o professor**. Substitua por uma apresentação legível dos mesmos dados — ex.: os campos "Modo de Operação" e "Perfil Dominante" já aparecem formatados acima dessa caixa; o conteúdo do JSON (nome, e-mail, apelido, descrição, perfis com afinidade) deve virar mais campos de texto normais na mesma linguagem visual, não um bloco de código.

## ADICIONAR — o que falta, com posição exata

### 1. Indicadores da segunda fileira precisam de ícone e de contexto (não só cor)

Hoje a segunda fileira (Abandono Médio, Conclusão Média, Uso do Chat Após Erro, Tempo Médio de Uso) não tem ícone, diferente da primeira fileira. **Adicione um ícone a cada um deles**, igual ao padrão da primeira fileira. Além disso, qualquer indicador que hoje dependa só da cor do número para comunicar "bom" ou "ruim" (ex.: um valor em vermelho) precisa ganhar um rótulo curto ao lado ou embaixo explicando o que aquilo significa (ex.: "Abandono Médio — 50.0% · acima do esperado").

### 2. "Quem precisa de atenção" — novo bloco, entre a segunda fileira de indicadores e os gráficos

Um card ou faixa de destaque, **antes dos dois gráficos**, listando os alunos que fogem da média (maior risco de abandono, muito atrasados, ou nota muito abaixo da turma). Pode ser uma lista curta (3-5 nomes) com o motivo do destaque ao lado (ex.: "Otávio Prado — 44% de abandono, sem atividade há 9 dias"), com um link/clique que leva direto ao modal de detalhe daquele aluno.

### 3. Bloco de "Conteúdo" — novo, entre os gráficos atuais e a "Lista de Alunos"

Um card (ou par de cards) mostrando: o conteúdo **mais consumido** da turma, o conteúdo **com mais dificuldade** (mais erros/abandono), e o conteúdo **com maior conclusão**. Pode ser 3 mini-listas lado a lado ou 3 linhas de destaque — o importante é existir, hoje não existe nada equivalente na tela.

### 4. Evolução da turma ao longo do tempo — no nível da turma, não só do aluno

O gráfico "Evolução do Aluno" (linha) já existe, mas só dentro do modal de UM aluno. Falta o equivalente **agregado da turma inteira** na tela principal do Dashboard — pode ser um gráfico de linha adicional próximo ao bloco "Quem precisa de atenção", mostrando a tendência de progresso/desempenho da turma ao longo dos dias/semanas.

### 5. Aba "Trilha Visual" do modal — nó clicável com painel de detalhe completo

Ao clicar num nó da trilha (hexágono ou item da lista), abrir um painel/gaveta com: conteúdo acessado, atividade, resposta dada, acerto/erro, tempo gasto, número da tentativa, ordem em que foi feito, e progresso naquele ponto — os 8 dados. Isso já foi validado como correto em uma versão anterior (com estados "concluído/errou/2ª tentativa/fora de ordem/retorno" nos nós e um painel com esses 8 campos) — **garanta que essa versão está presente**, não a versão mais simples (só "Concluído"/"Disponível" sem clique) que apareceu nos prints mais recentes. A sequência de nós exibida tem que ser a ordem REAL em que o aluno passou por eles (incluindo desvios/retornos), não a ordem cadastrada pelo professor.

### 6. Intervenções do professor — nova funcionalidade, dentro do painel de detalhe do nó (item 5)

Dentro do mesmo painel de detalhe de um passo da Trilha Visual, adicionar a opção de o professor **deixar uma intervenção**: um comentário, uma sugestão de estudo, ou um guia — associado àquele ponto específico da jornada do aluno. Pode ser um campo de texto + botão "Salvar comentário" logo abaixo dos dados do passo (resposta, tempo, tentativa etc.), com um histórico de intervenções já feitas naquele ponto, se houver.

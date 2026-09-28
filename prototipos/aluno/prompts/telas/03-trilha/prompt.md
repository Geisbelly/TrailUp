Próxima tela da mesma área: **Trilha** (tela inicial após login).

A partir daqui, a paleta passa a derivar da cor do perfil BrainHex do aluno (ver fórmula no prompt mestre) — para este prompt, assuma um aluno com perfil dominante **Conqueror** (azul `#1e4fd6`, tema visual "medieval") como exemplo de referência; as próximas telas podem variar o perfil de exemplo.

## O que ela faz

É a tela que o aluno mais abre — a jornada de tópicos de uma turma, como uma progressão visual.

## Conteúdo real de hoje

1. Um cenário de fundo em tela cheia, na arte do perfil ativo (Conqueror, neste exemplo), atrás de toda a tela.
2. Cabeçalho do jogo: nome da turma (ou, no modo mapa, o nome do "mundo" temático da turma) + subtítulo, e uma **barra de progresso/XP** — percentual de conclusão da trilha (0–100), calculado batendo o material do professor com o material personalizado gerado por IA.
3. Botão de atalho para a **Bag** (mochila de itens/recompensas do aluno).
4. Um botão de guia/mentor (ícone), que abre um painel de chat com a IA mentora daquele perfil (só disponível se o perfil do aluno tiver esse recurso liberado).
5. **A trilha em si, em um de três modos visuais** (preferência do aluno, mesmos dados por trás):
   - **Mapa** — um "hero map" temático, com o mundo da turma e os tópicos como pontos no mapa.
   - **Árvore** — os tópicos como uma árvore de nós conectados.
   - **Lista** — os tópicos como uma lista linear.
   Em qualquer modo, cada tópico é um nó com estado visual distinto: **concluído**, **disponível** (pode ser aberto) e **bloqueado** (ainda não liberado, geralmente por depender do anterior). O nó "atual" (onde o aluno parou) tem destaque.
6. Quando existe personalização de IA relevante para o momento (um módulo adaptado ao perfil do aluno), o mentor pode mostrar uma dica contextual explicando a decisão — considere isso como um estado adicional, não uma tela separada.

## Estados

- **Carregando:** mensagem "Carregando trilhas" / "Preparando sua jornada."
- **Erro:** mensagem de erro simples (hoje é só texto cru — pode melhorar aqui).
- **Vazio (sem trilha disponível):** cartão "Sem trilhas" / "Nenhuma trilha disponível no momento."

## O que peço

Desenhe a tela em pelo menos um dos três modos visuais (escolha o que fizer mais sentido para tela larga — pode inclusive propor um só modo "definitivo" para a web, já que num navegador a alternância entre mapa/árvore/lista pode fazer menos sentido do que faz numa tela pequena; se propuser isso, seja explícito sobre a decisão). Estabeleça aqui o estilo de nó de trilha (concluído/disponível/bloqueado), a barra de XP e o botão de guia/mentor — as próximas telas vão reaproveitar esse vocabulário visual de progresso.

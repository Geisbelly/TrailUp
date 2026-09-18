Prompt de ajuste pontual — tela **Trilha**, problema: editor de tópico/conteúdo em modal perde edições.

## O problema

O editor de tópico (e o de conteúdo dentro dele) é hoje uma janela modal sobreposta à tela do mapa. Um modal é uma estrutura frágil para um formulário longo: uma atualização acidental da página, queda de internet, ou fechamento do modal por engano descarta tudo o que o professor já preencheu — título, descrição, conteúdos, cards, questões.

## CORRIGIR

- Converta o editor de tópico/conteúdo de **modal** para **página própria** (rota dedicada, ex.: uma URL específica para "editar tópico X da trilha Y"), em vez de uma sobreposição na mesma tela do mapa.
- Adicione **salvamento automático** das edições enquanto o professor preenche o formulário (ex.: salvar a cada campo perdido de foco, ou em intervalos curtos), com um indicador discreto do tipo "Salvando..." / "Salvo às 14:32" para o professor saber que não vai perder o que já fez.
- Uma atualização de página ou queda de conexão não deve mais apagar edições que já foram salvas automaticamente.

## MANTER

- O conteúdo e a estrutura do editor em si (colunas, campos, seções "Cards vinculados" e "Questões deste conteúdo") — a mudança aqui é só o contêiner (página em vez de modal) e o comportamento de salvamento, não o que está dentro dele.

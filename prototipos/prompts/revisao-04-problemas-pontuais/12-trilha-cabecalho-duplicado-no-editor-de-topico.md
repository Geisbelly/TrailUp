Prompt de ajuste pontual — tela **Trilha**, problema: barra do mapa continua aparecendo dentro do editor de tópico.

## O problema

O editor de tópico já foi corrigido para ser uma página própria (com botão "← Voltar à trilha", contexto "Física I › Cinemática" e indicador de salvamento automático "Salvo às 15:47" — isso está certo). O problema é que, além desse cabeçalho correto, **a barra de ferramentas do Mapa da Trilha continua aparecendo acima dele**: o seletor de classe ("Física I"), e os botões "Gerar trilha com IA", "Novo tópico" e "Salvar dependências" — que são ações do mapa, não fazem sentido nem deveriam estar visíveis enquanto o professor está dentro da página de edição de um tópico específico.

## CORRIGIR

- Ao entrar na página de edição de um tópico, **oculte por completo a barra de ferramentas do Mapa da Trilha** (seletor de classe + "Gerar trilha com IA" + "Novo tópico" + "Salvar dependências"). Ela só deve aparecer na tela do mapa (a visão com os cartões de tópico).
- A página de edição de tópico usa **só o próprio cabeçalho dela**: "← Voltar à trilha", o título/contexto ("Física I › Cinemática"), e o indicador de salvamento — sem nenhuma barra do mapa acima.

## MANTER

- O cabeçalho da própria página de edição de tópico (botão voltar, contexto, indicador "Salvo às HH:MM") — está correto, não precisa mudar.
- A barra de ferramentas do mapa continua existindo normalmente, só que apenas na tela do mapa.

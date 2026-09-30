Apontamento sobre a interação do mapa de tópicos, dentro da tela de Trilha: **a malha precisa virar um canvas de verdade**.

## O problema identificado

A malha (o mapa visual dos tópicos conectados) hoje se comporta como uma página dentro de uma página — com scroll interno. Ela precisa se comportar como um **canvas real**, no estilo de ferramentas como Figma.

## O que precisa mudar

- **Nunca colocar barra de rolagem dentro da malha.** Isso é proibido — o espaço de trabalho não rola como uma página comum.
- **Permitir arrastar (pan)** o canvas livremente.
- **Permitir zoom in/out.**
- **Permitir "ajustar à tela"** (enquadrar todos os nós de uma vez) **e centralizar.**
- Os controles de zoom/pan devem ser **inspirados na interação do Figma**: simples, discretos, e sempre acessíveis (não escondidos atrás de menus) — um cluster pequeno de botões no canto, por exemplo, não uma barra pesada.
- **Ao selecionar um nó** (um tópico), abre um painel com os detalhes daquele nó — isso já deve existir de alguma forma na tela atual; garanta que continua funcionando com a nova interação de canvas.

## O que peço

Redesenhe a interação do mapa da trilha como um canvas com pan e zoom de verdade — sem scrollbar interna, com controles discretos de zoom/ajustar-à-tela/centralizar no estilo Figma, e mantendo a abertura do painel de detalhe ao clicar num nó. Isso vale tanto para o mapa geral de tópicos quanto para qualquer visualização interna que use o mesmo padrão de nós conectados (ex.: a Jornada do Aluno, apontamento 02, que usa uma lógica visual parecida).

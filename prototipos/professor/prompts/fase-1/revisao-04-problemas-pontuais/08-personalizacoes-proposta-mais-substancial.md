Prompt de ajuste pontual — tela **Personalizações**, remodelagem de layout.

**Regra que vale para o prompt inteiro: isto é uma remodelagem visual/estrutural do que já existe — nenhuma função nova, nenhuma função removida.** Tudo que está descrito abaixo já existe hoje na tela (referência exata: `revisao-02-feedback-prototipo/personalizacoes-descricao-detalhada.md`). O trabalho aqui é reorganizar, redimensionar e redistribuir esses mesmos elementos — não inventar recursos nem cortar nenhum dos que já estão listados no inventário abaixo.

## Antes de gerar qualquer mockup: faça um questionário para mim

## Inventário completo do que existe hoje (nada aqui pode ser removido)

- Cabeçalho: título "Personalizações" + subtítulo "Compare como o material fica para cada perfil BrainHex e visualize a personalização efetiva por aluno."
- Barra de filtros: **Classe** (dropdown), **Tópico** (dropdown), **Conteúdo** (dropdown) + botão **Atualizar**, e **Gerar tudo para o perfil** (dropdown de perfil + botão **Gerar tudo**).
- 4 abas em formato de pílula, com ícone cada: **Por perfil**, **Estrutura e paleta**, **Por aluno**, **Turma**.
- **Aba Por perfil:** bloco de resumo do conteúdo selecionado (nome, subtítulo, "Progresso dos perfis" em %, barra de progresso, pílulas "X de 7 pronto(s)" e "Y sem material") + um card por perfil BrainHex, cada um com: barra colorida no topo (cor do perfil), nome do perfil em português + badge de status (ex.: "Sem material"), nome técnico em inglês + contagem de alunos com esse perfil, botão **Gerar**, e lista de formatos (Texto, PDF, Áudio, Apresentação) cada um com seu próprio badge de status.
- **Aba Estrutura e paleta:** os mesmos 7 cards de perfil, mostrando em vez da lista de formatos: campos **Tom**, **Estilo**, **Nível**, **Prioritário**, e uma paleta de 5 círculos coloridos rotulados **Fundo, Superfície, Primária, Borda, Texto**.
- **Aba Por aluno:** seletor de aluno (dropdown) + área que mostra a personalização efetiva do aluno escolhido.
- **Aba Turma:** 5 cards de resumo (**Alunos na turma**, **Perfil predominante**, **Média de acertos**, **Conclusão média**, **Nota média**) + bloco "Distribuição de Perfis BrainHex" (título, subtítulo, e o conteúdo da distribuição em si).

## O que fazer (não fica em aberto — só o que depende das 5 perguntas acima é que eu decido)

1. Aplique o grid escolhido na Pergunta 1 aos cards da aba "Por perfil", e o formato escolhido na Pergunta 2 à aba "Estrutura e paleta" — usando exatamente o grid da Pergunta 1 se a resposta da Pergunta 2 for (A).
2. Aplique o layout escolhido na Pergunta 3 aos 5 cards da aba "Turma".
3. Posicione o controle "Gerar tudo para o perfil" conforme a resposta da Pergunta 4.
4. Ordene as 4 abas conforme a resposta da Pergunta 5.
5. **Consistência entre os 7 cards de perfil (aba "Por perfil"):** garanta que todos os 7 cards mostrem a mesma lista de formatos (Texto, PDF, Áudio, Apresentação), na mesma ordem — hoje alguns cards aparentam mostrar só 3 formatos e outros 4, o que deve ser inconsistência de renderização, não diferença real de dados.
6. **Hierarquia visual dentro de cada card de perfil:** o nome do perfil (em português) deve ser o elemento de maior destaque do card; o badge de status vem logo ao lado, na mesma linha; o nome técnico em inglês e a contagem de alunos formam uma segunda linha, menor e mais discreta; o botão "Gerar" fica alinhado à direita, na mesma altura do nome do perfil ou logo abaixo dele — nunca competindo em tamanho com o nome do perfil.
7. **Barra de progresso do bloco de resumo** (aba "Por perfil"): mantenha a mesma barra e as mesmas duas pílulas de contagem ("X de 7 pronto(s)" / "Y sem material"), só ajustando o espaçamento para não ficar apertada contra o título do conteúdo acima dela.
8. **Filtros:** mantenha os 3 dropdowns (Classe/Tópico/Conteúdo) agrupados visualmente à esquerda e o botão Atualizar logo ao lado do filtro de Conteúdo, como hoje — a única mudança de posição permitida na barra de filtros é a do controle "Gerar tudo para o perfil", conforme a Pergunta 4.

## Fora de escopo deste prompt

- O que fazer com os campos vazios (Tom/Estilo/Nível/Prioritário) da aba "Estrutura e paleta" — dar propósito real a eles ou removê-los — já está em aberto em `04-personalizacoes.md` (rodada anterior) e não é decidido aqui. Este prompt só define **como** essa aba é exibida (card grande ou tabela), não **se** os campos continuam existindo.
- O modal "Ver conteúdo gerado" e o fluxo de regeneração com motivo/impacto, já especificados em `04-personalizacoes.md` — continuam valendo, este prompt não os substitui.

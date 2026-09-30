Prompt mestre — TrailUp, Console do Professor, **Fase 2 do redesign**.

## Situação

Este projeto (console do professor da plataforma TrailUp) já passou por uma primeira rodada de redesign visual ("Fase 1"). Nesta conversa, começamos oficialmente uma **Fase 2**: o produto passou por uma reformulação visual completa — paleta de cores, assets, componentes e estilo geral das interfaces mudaram por inteiro. Qualquer referência visual de conversas ou protótipos anteriores **não vale mais** — trate esta conversa como um recomeço visual, não como um ajuste incremental.

Anexo a este prompt três coisas, que juntas são a **única fonte de verdade** a partir de agora — cada uma com um papel diferente, que não se sobrepõe às outras:

1. **`01-contexto-geral-fase-2.md`** e **`02-paleta-de-cores-fase-2.md`** — de onde vem o **estilo**: identidade visual, layout, tipografia, cores e os padrões globais de header, sidebar, cards, botões, inputs, chips e ícones.
2. **Prints das novas telas** — screenshots reais do novo design, anexados aqui e também, individualmente, junto de cada prompt de tela. Servem **só de referência de estilo** (como cada tela deve parecer) — não são a fonte do que cada tela deve conter.
3. **O código-fonte dos protótipos anteriores (V5)** — os arquivos `.dc.html` de cada tela do protótipo já validado, anexados junto de cada prompt de tela a seguir. É de onde vem **o conteúdo**: cada card, cada aba, cada modal, cada estado, cada texto, cada botão, cada tabela, cada fluxo — tudo que já existe hoje.

Os arquivos `01` e `02` foram construídos a partir da análise dos prints — não do código. Onde uma informação de estilo não pôde ser confirmada visualmente, isso está declarado explicitamente nos próprios arquivos ("não observado", "aproximado", "inferência"). Respeite essas ressalvas: não presuma nem invente nada além do que está documentado ou visível nas prints.

## Regra mais importante desta fase: mudar o estilo, não o conteúdo

**As prints são referência visual, não referência de conteúdo.** Uma print pode ter sido tirada num estado vazio, parcial, ou de carregamento — ela não define o que a tela contém, só como a tela se parece. **O que cada tela contém é definido pelo código-fonte da V5**, anexado a cada prompt de tela.

Isso significa, sem exceção:

- **Nada do que já existe na V5 pode ser removido, resumido, simplificado ou "enxugado"** nesta rodada — nenhum card, nenhuma aba, nenhum modal, nenhum estado (vazio/carregando/erro/com dados), nenhum texto de apoio, nenhum botão, nenhuma coluna de tabela, nenhum fluxo de confirmação. Se a V5 tem 4 abas numa tela, a nova versão tem as mesmas 4 abas, com o mesmo conteúdo dentro de cada uma — só com a aparência da Fase 2.
- **Antes de gerar cada tela, analise o código `.dc.html` daquela tela na íntegra** — não confie só na descrição em texto do prompt daquela tela (mesmo sendo detalhada, ela pode ter deixado passar algo). O código é a fonte primária; o prompt de texto é um resumo dele.
- Se o prompt de uma tela e o código da V5 parecerem divergir em algum ponto, ou se você notar no código algo que o prompt não menciona, **avise antes de prosseguir** em vez de decidir sozinho o que manter.
- **Ao gerar cada tela, analise também as prints enviadas no chat para aquela tela** — elas mostram estrutura, posicionamento e componentes visuais com mais precisão do que qualquer descrição em texto, mas servem exclusivamente para a aparência (cores, espaçamento, formato de card/botão, layout de navegação), nunca para decidir o que incluir ou não.

## O que vai acontecer a partir daqui

Depois deste prompt e dos arquivos anexos, vou enviar os prompts de tela, um de cada vez, nesta mesma conversa — cada um já vem com as prints daquela tela (quando existem) e com o código `.dc.html` correspondente da V5 anexados. **3 das 7 telas são densas demais para caber num prompt só e foram divididas em partes sequenciais** — envie todas as partes de uma tela, na ordem, antes de passar para a tela seguinte. A ordem completa é:

1. Visão geral (Dashboard) — 3 partes: `03-1` (estados da tela + aba "Visão geral"), `03-2` (abas "Evolução" e "Conteúdo"), `03-3` (detalhe do aluno).
2. Trilhas — 5 partes: `04-1` (mapa/canvas + modais de tópico), `04-2` (modal "Gerar trilha com IA"), `04-3` (editor de tópico: estrutura + aba "Conteúdo"), `04-4` (editor de tópico: aba "Atividades"), `04-5` (editor de tópico: aba "Cards").
3. Turmas — prompt único (`05`).
4. Personalizações — 3 partes: `06-1` (filtros/resumo + aba "Por perfil"), `06-2` (abas "Estrutura e paleta"/"Por aluno"/"Turma"), `06-3` (modal "Ver conteúdo gerado").
5. Rankings — prompt único (`07`).
6. Meus dados — prompt único (`08`).
7. Aprovações — prompt único (`09`).

Cada prompt de tela (ou parte de tela) é autossuficiente para aquele pedaço, mas **depende** dos arquivos globais anexados aqui — cor, tipografia, formato de card/botão/input e demais padrões globais **não devem ser redefinidos ou reinterpretados** a cada prompt. Se um prompt não especificar algo (ex. cor de um botão padrão), use o que já está definido no contexto geral e na paleta — não invente uma variação nova. Quando uma tela tem várias partes, elas também precisam parecer consistentes **entre si** — a parte 2 não pode reinventar o cabeçalho ou o padrão de card que a parte 1 já estabeleceu para a mesma tela.

## Regras que valem para todas as telas

- Mantenha os 7 itens de sidebar, nesta ordem e com estes nomes: Visão geral, Trilhas, Turmas, Personalizações, Rankings, Meus dados, Aprovações.
- Mantenha o header (logo + "Console do professor" à esquerda, avatar + nome + instituição + logout à direita) igual em todas as telas.
- Use sempre os mesmos componentes de base (cards, botões primário/secundário/secundário-cobre, selects, chips) — eles devem parecer parte do mesmo sistema em qualquer tela, não uma solução visual diferente por tela.
- **O assistente flutuante "Escriba"** (botão circular dourado/bronze no canto inferior direito, que abre um painel de chat) existe em 6 das 7 telas — todas, exceto Aprovações — e precisa continuar existindo em todas elas, com o mesmo conteúdo (mensagem de abertura, sugestões de pergunta, campo de texto), mesmo não aparecendo com destaque nas prints. Ele é um componente de conteúdo/funcionalidade vindo da V5, não de estilo — mantenha sua função; a aparência dele pode se adaptar à Fase 2, mas ele não desaparece nem muda de comportamento.
- Nenhuma tela deve ter conteúdo reduzido por causa de uma print mostrar um estado vazio, parcial ou de carregamento — o código da V5 de cada tela mostra todos os estados que existem (vazio, carregando, erro, com dados, etc.) e todos eles devem ser recriados, não só o que a print capturou.

## O que eu não quero nesta etapa

Assim como na Fase 1, o objetivo aqui **não é gerar código nem a interface final** — é continuar validando e refinando, com você, como cada tela deve ficar visualmente, uma de cada vez, até chegarmos numa versão consistente das 7 telas.

Confirme que entendeu o contexto e os arquivos anexos — especialmente a regra de que nada do conteúdo da V5 pode ser reduzido — antes de eu mandar o primeiro prompt de tela.

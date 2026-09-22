# Contexto Geral — Fase 2

> **Fonte de verdade desta fase:** 6 prints do console do professor (Visão geral, Trilhas, Turmas, Personalizações — estado de carregamento, Rankings, Meus Dados). Nenhum arquivo original (código, assets, Figma, design tokens) foi fornecido. Tudo abaixo é observado ou inferido diretamente desses prints — quando algo não pôde ser determinado, isso é dito explicitamente em vez de presumido.
>
> **Relação com a Fase 1:** a Fase 1 (pasta `prototipos/prompts/`, exceto esta) fica como referência histórica/funcional. Em qualquer conflito visual, **Fase 2 vence**. Uma mudança visual não implica automaticamente mudança de função — quando uma tela da Fase 2 não mostra um elemento que existia na Fase 1 (ex.: ações de editar/duplicar nos cards de turma), isso é registrado como "não observado neste print", não como "removido".

## Identidade visual

- Direção estética: continua **escura e atmosférica**, no mesmo espírito "arcano/místico" já documentado na Fase 1 — mas com execução mais sóbria e menos ornamentada que os protótipos da Fase 1. Menos textura decorativa em primeiro plano, mais espaço negativo.
- Sensação geral: interface densa em dados (dashboards, tabelas, formulários) tratada com bastante respiro — cards grandes, bem espaçados, poucos elementos por vez visíveis em cada bloco.
- Nível de detalhamento: baixo a médio — ícones lineares simples (thin outline, um peso só), sem gradientes visíveis nos elementos de UI (os únicos gradientes aparentes estão na ilustração de fundo, não nos componentes).
- Um plano de fundo ilustrado, muito escuro e de baixo contraste, aparece atrás de toda a área de conteúdo (sidebar + main): formas geométricas finas (triângulos, losangos, estrelas) e uma silhueta de escadaria/arquitetura, em tom quase preto com leve tingimento violeta — decorativo, nunca compete com o conteúdo em primeiro plano. Fica mais visível em áreas com pouco conteúdo (rodapé das telas Turmas, Personalizações, Meus Dados).

## Layout

- Estrutura de 2 colunas fixas + área de conteúdo: **sidebar esquerda** (largura aproximada 260–265px, fixa, altura total da viewport) + **coluna de conteúdo** (o restante da largura, com scroll vertical independente).
- **Header** no topo, atravessando toda a largura (inclusive por cima da sidebar), altura aproximada de 64–72px, com uma linha divisória horizontal fina logo abaixo separando-o do corpo da página.
- Uma linha divisória vertical fina também separa a sidebar do conteúdo principal.
- Conteúdo principal: padding generoso (aprox. 40px nas laterais, 32–40px no topo), título da página sempre no canto superior esquerdo do conteúdo, controles específicos da tela (filtros, botão de ação principal) alinhados à direita na mesma altura do título quando existem.
- Cards/seções dentro do conteúdo empilham verticalmente com espaçamento generoso entre eles (aprox. 24px), e usam grid interno (2, 3 ou 4 colunas conforme a tela) para os itens dentro de cada seção.
- Responsividade: **não observável** nos prints (todos em resolução desktop larga). Não presumir breakpoints específicos.

## Tipografia

- Dois registros claramente distintos, consistentes em todas as telas:
  - **Títulos** (logo "TrailUp", título de página, títulos de card/seção): uma serifada ornamental, traços com contraste (hastes finas/grossas), peso bold — visualmente compatível com a família serifada já usada na Fase 1 (Cinzel). Não é possível confirmar pelos prints que é exatamente a mesma fonte; trate como uma aproximação razoável, não como certeza.
  - **Corpo/UI** (subtítulos, labels, texto de botão, texto de input, texto de tabela): sans-serif regular/medium, sem serifas, legível em tamanho pequeno — compatível com a família já usada na Fase 1 (Inter). Mesma ressalva: aproximação, não confirmação.
- Hierarquia observada (do maior para o menor):
  1. Título de página (ex. "Dashboard de Alunos", "Turmas") — o maior texto da tela, serifado, bold, branco.
  2. Título de card/seção (ex. "Informações Pessoais", "Tipos de Ranking") — serifado ou sans bold (varia; ver cada prompt de tela), menor que o título de página.
  3. Valor numérico grande em KPI (ex. "2", "28%") — sans bold, tamanho grande, mas visualmente menor que o título de página.
  4. Corpo/label — sans regular, tamanho pequeno, cor muted.
  5. Texto auxiliar/legenda (ex. "id:131", "com acesso liberado") — sans regular, o menor tamanho da hierarquia, sempre em cor muted.
- Letter-spacing e line-height: não determináveis com precisão a partir de print estático; nada aparenta ser condensado ou expandido de forma incomum — tratar como espaçamento padrão do sistema tipográfico.

## Componentes globais

### Header
- Esquerda: ícone de estrela/sparkle de 4 pontas (contorno fino, cor clara) + wordmark "TrailUp" (serifado, bold, branco) +, com espaçamento, "Console do professor" (sans, regular, cor muted, tamanho menor que o wordmark).
- Direita: avatar circular (fundo violeta sólido, iniciais em branco bold, ex. "GA") + bloco de texto de duas linhas (nome em branco bold sobre a instituição em cor muted, menor) + ícone de logout (porta com seta, contorno fino) mais à direita.

### Sidebar
- Lista vertical de itens, cada um como uma linha com ícone (≈20px, thin outline) + label (sans), padding interno generoso, cantos arredondados (pill/rounded-lg).
- **Item inativo:** ícone e texto em cor muted (mesma cor do texto secundário), sem fundo.
- **Item ativo (estado de repouso):** ícone e/ou texto em cor de destaque (observado em teal/menta no item "Visão geral"), possivelmente com leve preenchimento de fundo.
- **Anel de foco:** em quase todos os prints (exceto o de "Visão geral"), o item correspondente à tela atual mostra um contorno retangular arredondado nítido, em teal/menta, ao redor de toda a linha. É observado de forma consistente logo após uma navegação — a interpretação mais provável é que se trate de um estado de **foco de teclado/seleção recente** sobreposto ao estado ativo, não um segundo estilo de "ativo" permanente. Documentar os dois: o preenchimento/cor ativa (repouso) e o anel de foco (transitório).
- Itens, na ordem observada: Visão geral, Trilhas, Turmas, Personalizações, Rankings, Meus dados, Aprovações.

### Cards
- Fundo mais claro que o fundo da página (superfície elevada), borda fina quase imperceptível, cantos bem arredondados (grande raio, na mesma linha do que já era usado na Fase 1), padding interno generoso, sem sombra perceptível nos prints.
- É o contêiner universal: KPIs, cartões de tópico/turma/ranking, formulários, listas — tudo usa a mesma base de card.

### Botões
- **Primário:** preenchimento sólido violeta, texto branco bold, formato pílula (cantos totalmente arredondados). Usado para a ação principal de cada tela (Novo Tópico, Nova Turma, Novo Tipo, Novo Ranking, Gerar tudo).
- **Secundário/neutro:** fundo escuro (na cor do card ou do fundo), borda fina visível, texto branco, mesmo formato pílula, geralmente com ícone à esquerda do texto (Presença, Alunos, Tentar novamente).
- **Secundário de destaque (cobre/bronze):** preenchimento sólido num tom terracota/cobre, texto branco — observado uma única vez ("Salvar dependências", na tela Trilhas), ao lado de um botão primário violeta ("Novo Tópico"). Reservar esse tom para uma ação secundária importante que não deve competir visualmente com a ação primária violeta.

### Inputs, selects e dropdowns
- Fundo escuro (mais próximo do fundo da página que do card), borda fina visível, texto branco, cantos arredondados em raio médio (menor que os botões pílula), ícone de chevron-down à direita quando é um select. Label acima do campo, em branco/quase-branco, pequeno, bold.

### Chips/badges
- Formato pílula pequena, usados para: tag de disciplina em card de turma (contorno violeta, texto violeta, fundo transparente/escuro, uppercase); indicadores "DEP"/"NEXT" no mapa de trilha (círculo de letra colorido + chip de texto colorido); banner de alerta (fundo escuro avermelhado, texto/ícone em tom de alerta).

### Tabelas
- Cabeçalho em texto muted, pequeno, sem fundo destacado. Linhas sem bordas visíveis entre si (separação por espaçamento), primeira coluna por vezes com ícone/medalha (ex. coroa para 1º lugar no ranking).

### Estados vazios / carregamento
- Observado uma vez (Personalizações): ícone de spinner + texto "Carregando [algo]...", dentro de um card, sem decoração adicional. Não há evidência nos prints de como é um estado "vazio" (sem dados) — não confundir com o de carregamento.

### Gráficos
- Barra e rosca/pizza observados na tela de Visão geral, em um tom coral/salmão uniforme (não as cores por perfil BrainHex, nem o violeta/indigo do tema). Grade de fundo do gráfico de barras em linhas pontilhadas finas, cor muted.

## Assets

- Ícone do logo: forma de estrela/sparkle de 4 pontas, contorno fino, sem cor de marca própria aparente (aparenta ser branco/cor de texto, não violeta) — asset original não disponível; ao gerar, recriar como um ícone vetorial simples equivalente (ex. um ícone de "sparkles" de uma biblioteca de ícones lineares), não como uma imagem bitmap.
- Ilustração de fundo (escadaria + formas geométricas): asset original não disponível; ao gerar, recriar como uma ilustração/padrão decorativo de baixíssimo contraste com a mesma linguagem (linhas finas, formas geométricas simples, tom quase preto com leve violeta), nunca reivindicar que é o asset original.
- Avatar do usuário: sem foto, apenas iniciais sobre fundo sólido colorido — não há evidência de suporte a foto de perfil nos prints.
- Ícones de UI: consistentes com um conjunto de ícones lineares de peso único (compatível com bibliotecas como lucide-react, já usada na Fase 1) — sem evidência de um conjunto de ícones customizado/exclusivo.

## Regras cruzadas obrigatórias para os prompts de tela

- Todo prompt de tela desta fase deve referenciar este arquivo e `02-paleta-de-cores-fase-2.md` em vez de redefinir cor, fonte ou padrão de card/botão/input.
- Nenhum prompt de tela deve inventar um componente, asset, cor ou comportamento que não esteja evidenciado nos prints ou listado aqui como inferência explícita.

Tela 03 — **Trilha** (tela inicial depois do login) + **Escolha sua turma**. Arquivo de saída: `v1/03-trilha.html` (substituiu a trilha anterior do v1).

> **Revisão 3 (2026-09-24):** a estrada horizontal virou **serpentina** (os 8 tópicos à vista, sem rolar), o HUD virou **faixa fina**, saíram territórios, placas-caixa, legenda e zoom, e o **hexágono foi redesenhado** em SVG (§5.2).
>
> **Revisão 2 deste prompt (2026-09-24).** A versão anterior punha o mapa num card de 721×640 ao lado de três cards ("Continuar", "Roteiro", "Legenda") que repetiam a mesma informação. A trilha virou um dashboard. Esta versão faz da trilha **o palco da tela**: mapa de borda a borda, HUD flutuante e **um** painel de prévia do tópico selecionado.

Shell com header e sidebar. Item ativo **Trilha**. Perfil de exemplo: **Conqueror**.

## 1. Fonte da verdade
- `mobile/src/screens/TrilhaScreen.tsx` (estados, dica do mentor), `components/trilhas/TrilhaBase.tsx` (título, progresso, Bag, guia).
- Modo **Mapa**: `MapaViewStable.tsx`. **Árvore**: `ArvoreView.tsx`. **Lista**: `ListaSimplesView.tsx`. Nó bloqueado: `LockedNodeModal.tsx` + `utils/lockedNodeMessage.ts`.
- Nomes do mundo: `utils/classMapTheme.ts`. Portão de turma: `screens/SelecionarTurmaScreen.tsx`. Bag: `components/bag/BagModal.tsx`.
- Arte: `trail-<perfil>.webp` (cenário da trilha, `getProfileArtwork(perfil, 'trail')`) e `emblem-<perfil>.png`.

## 2. Regras do app que o desenho respeita
1. **O modo vem do perfil** (`pickVisual`), não é escolha do aluno: **Mapa** para Seeker, Conqueror e Daredevil; **Árvore** para Mastermind e Survivor; **Lista** para Achiever e Socializer. **Não existe alternador de modo.**
2. Quatro estados de nó: **concluído**, **atual** (onde o aluno parou: `useTrailResumeTopic`), **disponível** e **bloqueado**. Clicar no bloqueado **explica**, não navega.
3. Ao abrir, a vista **centraliza o nó atual** (`useTrailAutoFocus`).
4. Mapa: título do nó = **nome do país**, subtítulo = **"Capital: …"**, chip = **"Concluído" / "Bloqueado" / "Disponível"**.
5. Cores do mapa = shell do perfil (tabela de `MapaViewStable`):
   | Estado | Preenchimento | Borda | Chip |
   |---|---|---|---|
   | concluído | `accentStrong` | `accent` | `accent` |
   | atual | `accent` | `text` | `text` |
   | disponível | `accentMuted` | `borderStrong` | `accent` |
   | bloqueado | `surface` | `border` | `textMuted` |

## 3. Dados de exemplo
Mundo **"Reinos de Matemática"** · classe "Matemática" · subtítulo do template "Cartografia de estratégia, padrões e estruturas." · progresso **56%** · **"4 de 8 módulos concluídos"**.

| # | Tópico | País | Capital | Estado | % | Conteúdos | Atividades |
|---|---|---|---|---|---|---|---|
| 1 | Números Naturais | Reino de Números Naturais | Torre de Números Naturais | concluído | 100 | 3 | 2 |
| 2 | Números Inteiros | Ducado de Números Inteiros | Castelo de Números Inteiros | concluído | 100 | 4 | 2 |
| 3 | Frações | Bastião de Frações | Observatório de Frações | concluído | 100 | 4 | 3 |
| 4 | Expressões Algébricas | Marca de Expressões Algébricas | Torre de Expressões Algébricas | concluído | 100 | 3 | 2 |
| 5 | Equações do 1º grau | Reino de Equações 1º Grau | Castelo de Equações 1º Grau | **atual** · personalizado | 43 | 4 | 3 |
| 6 | Razão e Proporção | Ducado de Razão Proporção | Bastião de Razão Proporção | disponível | 0 | 3 | 2 |
| 7 | Porcentagem | Marca de Porcentagem | Torre de Porcentagem | bloqueado (pré-req.: 6) | 0 | 3 | 2 |
| 8 | Geometria Plana | Bastião de Geometria Plana | Observatório de Geometria Plana | bloqueado (pré-req.: 6 e 7) | 0 | 5 | 3 |

Justificativa da personalização do tópico 5: "Reorganizei Equações em desafios curtos antes da leitura, porque você rende mais quando começa praticando."

## 4. Grade: o palco (1440×900)

```
┌────────────────────────────── header 68 (seletor de pré-visualização no centro) ─────────┐
├ sidebar 264 ┬──────────────────── PALCO (1176 × 832, sem padding) ─────────────────────┤
│             │ ┌ faixa do mundo (24,24) · altura 88 ─────────────┐ ┌ painel 360 ───────┐  │
│             │ │ ♛ MAPA DA JORNADA / Reinos de Matemática  56%▬▬ [Bag][?]│ │ prévia do tópico  │  │
│             │ └─────────────────────────────────────────────────┘ │                   │  │
│             │ ┌ tabuleiro (24, 128) até (right 408, bottom 24) ──┐ │                   │  │
│             │ │  ①━━━②━━━③━━━④╮                                  │ │                   │  │
│             │ │               │  serpentina: ida e volta,        │ │                   │  │
│             │ │  ⑧···⑦···⑥···⑤╯  todos os tópicos à vista        │ └───────────────────┘  │
│             │ └──────────────────────────────────────────────────┘          [mentor 56]  │
└─────────────┴───────────────────────────────────────────────────────────────────────────┘
```
- **Shell (revisão 4):** enquanto as outras telas estiverem no v1, a Trilha usa **o mesmo shell delas**, copiado de `v1/07-notificacoes.html`: `.console-shell` em grid `212px / 1fr` × `68px / 1fr`, `console-topbar` (marca em Georgia, "Área do aluno", conta com avatar, nome, perfil, Bag e Sair) e `console-navigation` (itens de 13px, raio 6, ativo com borda `borderStrong`, contador "2"). A Bag sai da faixa do mundo porque já está no topbar, como nas outras telas. Os valores de header 68 / sidebar 264 do mestre (§5) voltam a valer quando todas as telas migrarem juntas.
- `console-main`: sem padding, `overflow: hidden`, o palco ocupa tudo (1228×832 no quadro). **Margens iguais às das outras telas: 28px no topo e no pé, 32px nas laterais.** Faixa do mundo: `top 28, left 32, right 416`. Tabuleiro: `top 140, left 32, right 416, bottom 28` (24px abaixo da faixa). Painel: `top 28, right 32, bottom 28`, **altura toda**, alinhado com o topo da faixa e o pé do tabuleiro. Mentor: canto inferior direito do tabuleiro (`right 432, bottom 44`), não mais embaixo do painel.
- **Distribuição vertical:** cada fileira da serpentina ocupa uma faixa igual da altura do tabuleiro; o hexágono fica 12px acima do meio da faixa (embaixo dele há nome e chip). A árvore se centraliza na vertical, com espaçamento `min(104, (altura − 40) ÷ 7)`. A lista tem 96px de folga no pé para o botão do mentor não cobrir a última linha.
- **Cenário:** `trail-<perfil>.webp` em `object-fit: cover`, opacidade 1, com três camadas: `linear-gradient(90deg, background a 70% 0%, transparent 30%, transparent 60%, background a 85% 100%)`, `linear-gradient(0deg, background a 70%, transparent 35%)` e `linear-gradient(180deg, background a 55%, transparent 25%)`.
- **Tabuleiro:** `position: absolute; top: 128px; left: 24px; right: 408px; bottom: 24px;` (**744×680** no quadro). **Sem rolagem horizontal e sem zoom.** Todos os tópicos cabem na tela (ver §5.3). Só rola na vertical quando a trilha tem mais fileiras do que cabem.
- **Seletor de pré-visualização** (mestre §6): no **centro do header**, com os estados num `<select>` e as 7 bolinhas de perfil. Aceita `?estado=<chave>&perfil=<perfil>&sel=<nº do tópico>` na URL, para revisão por link.

> **Por que serpentina (revisão 3):** a estrada horizontal com rolagem mostrava 4 dos 8 tópicos e deixava metade do palco vazio acima e abaixo dela. A serpentina (fileira 1 da esquerda para a direita, curva, fileira 2 da direita para a esquerda) mostra a jornada inteira de uma vez e ocupa a área toda, como um tabuleiro de jogo.

## 5. Blocos

### 5.1 Faixa do mundo (HUD) (`position: absolute; top: 24px; left: 24px; right: 408px; height: 88px;`)
Fundo `surface` a **82%** + `backdrop-filter: blur(10px)`, `1px solid var(--line)`, raio 20, `padding: 0 20px 0 18px`, flex, `align-items: center`, gap 18:
1. Emblema do perfil **48×48** (`emblem-<perfil>.png`) com `drop-shadow(0 0 10px accentSoft)`.
2. Título (`flex: 1; min-width: 0`): eyebrow 11px **"MAPA DA JORNADA"** (árvore/lista: **"SUA TRILHA"**) e, 4px abaixo, H1 Cinzel 700 **22**/1.15 numa linha: mapa = **"Reinos de Matemática"**, árvore/lista = **"Matemática"**. Sem subtítulo: turma e professora já estão no rodapé da sidebar.
3. Progresso (`margin-left: auto; width: 200px`): linha com "**56%**" (Inter 700 18 `text`) + "concluído" (12.5 `textSubtle`) à esquerda e "4 de 8 módulos" (12.5 `textSubtle`, tabular) à direita; 8px abaixo, barra 8px (trilho `background`, `1px solid var(--line)`, preenchimento `linear-gradient(90deg, accentStrong, accent)` com `box-shadow: 0 0 12px accentSoft`). Cache não sincronizado: chip warning "progresso desatualizado" no lugar de "4 de 8 módulos".
4. Divisória vertical 1×40 `var(--line)`.
5. Ações, gap 8: **Bag** (`object-bag.png` 28×28, `aria-label="Abrir Bag"`) e **Guia** "?" (ícone 18 `accent`, `aria-label="Ajuda sobre este módulo"`), ícone-botões **44×44** redondos, fundo `surface`, `1px solid var(--line)`, hover `surfaceElevated` + borda `borderStrong`.

### 5.2 O hexágono (redesenhado, revisão 3; vale para todos os modos, o painel e o modal)
O hexágono anterior (recorte `clip-path` com anel sólido e ícone pequeno) ficou pesado e "plano". Agora é **SVG** com `viewBox="0 0 100 100"`:
- **Forma:** hexágono de ponta para cima, raio 46, **cantos arredondados** (raio 9, feitos com curva `Q` em cada vértice).
- **Camadas:** (1) corpo com **degradê vertical**; (2) contorno; (3) **anel interno** (o mesmo hexágono com raio 37 e cantos de 7) em traço de 1.5, dando relevo; (4) nos estados cheios, **brilho** no topo: o hexágono interno preenchido com `linear-gradient(#fff 35% → #fff 0% em 50%)` a 55% de opacidade.
- **Conteúdo** centralizado: concluído = check (34% do lado, traço 3); atual e disponível = **número do tópico** em Cinzel 700 (36% do lado); bloqueado = cadeado. **Não existe mais o círculo de número separado.**

| Estado | Degradê do corpo (topo → base) | Contorno | Anel interno | Conteúdo | Extra |
|---|---|---|---|---|---|
| concluído | `accent` → `accentStrong` | 2 `accent` com L+10% | branco 28% | check `background` | brilho |
| atual | `accent` com L+10% → `accent` | **3 `text`** | branco 45% | número `background` | brilho, `drop-shadow` duplo em `accentSoft` (18 e 30px) e halo radial "respirando" (2.6s) atrás |
| disponível | `surfaceElevated` com L+5% → `surface` | 2 `accent` | `accentSoft` | número `text` | — |
| bloqueado | `surface` → `background` | 2 `border`, **tracejado 5 5** | branco 5% | cadeado `inactive` | — |

- **Selecionado:** hexágono externo de raio 53, sem preenchimento, traço 2 `text` **tracejado 3 5**.
- **Hover:** `translateY(-4px) scale(1.04)` em 180ms.
- **Tamanhos:** 88 (mapa), 60 (árvore), 56 (lista e cabeçalho do painel), 84 (modal "Conteúdo selado"), 24 (lista do painel).
- Tópico personalizado: **sem selo sobre o hexágono** (colidia com o marcador). A faísca vai para o chip de estado (§5.3).

### 5.3 Modo **Mapa** (Seeker, Conqueror, Daredevil): serpentina
- **Grade da serpentina:** 4 colunas (3 se o tabuleiro tiver menos de 700px), `colW = largura ÷ colunas` (186px no quadro). Coluna do nó *i* = `i mod 4`, invertida nas fileiras ímpares. `x = colW × (col + 0,5)`. Fileira `r = ⌊i ÷ 4⌋`, espaçamento vertical entre 250 e 320px (`(altura − 150) ÷ (fileiras − 1)`), e o bloco fica centrado na vertical (`topo = max(120, (altura − (fileiras−1) × espaçamento) ÷ 2 − 30)`). No quadro: fileiras em y ≈ 136 e 456.
- **Estrada** (Bézier entre nós consecutivos):
  - na mesma fileira: `C` com os pontos de controle no meio do caminho, deslocados ±22px na vertical, alternando, para a linha ondular levemente;
  - na virada de fileira: curva em "U" para fora do tabuleiro (pontos de controle a `0,62 × colW` para a direita nas fileiras pares e para a esquerda nas ímpares).
  - Camadas: leito 18px `background` a 55%; trecho percorrido (até o nó atual) contínuo 5px `accent` com `drop-shadow(0 0 8px accent)`; trecho futuro tracejado `2 11` 3px `accent`; trecho que chega em bloqueado pontilhado `1 10` 3px `borderStrong` a 60%.
  - Pré-requisito extra (8 depende de 6): arco pontilhado 2px `borderStrong` a 45% **por baixo** da fileira.
- **Sem territórios e sem placas-caixa.** Abaixo do hexágono (gap 10), o **rótulo** solto, centralizado, largura máx. 170: nome do país em Inter 600 13.5/1.3 `text`, 2 linhas no máx., com `text-shadow: 0 1px 10px background` para ler sobre o cenário (bloqueado em `textMuted`). Abaixo (gap 6), o chip de estado de 10.5px com **fundo sólido** (`surface`; no chip accent, `accentMuted` sobre `surface`) e `1px solid var(--line)`: "✓ Concluído" · "▶ Disponível" · "🔒 Bloqueado" · atual "◷ 43% · em andamento". Tópico personalizado: o ícone vira faísca e o atual lê "✦ 43% · personalizado". A capital fica só no painel.
- **Marcador "Você parou aqui"** acima do hexágono atual: **uma pílula única** `accent` (texto `background` Inter 700 11.5) com o retrato 28 da aluna dentro, à esquerda (anel 2px `background`), e rabicho de 7px apontando para o nó. Sombra `0 8px 20px rgba(0,0,0,.4)`.
- Interação: **clique = seleciona** e mostra no painel. **Duplo clique** ou **Enter** abre o tópico (`04-topico.html`); no bloqueado, abre "Conteúdo selado". Setas andam a seleção. Tab percorre os nós em ordem.

### 5.4 Painel de prévia (`position: absolute; top: 24px; right: 24px; bottom: 104px; width: 360px;`)
Card com fundo `surface` a 90% + blur 12px, raio 20, `1px solid var(--line)`, sombra flutuante, coluna com rolagem interna. **Abre com o nó atual selecionado.**
1. **Cabeçalho** (`padding: 22px 22px 18px`): eyebrow conforme o estado (**"VOCÊ PAROU AQUI"** · "CONCLUÍDO" · "PRÓXIMO DISPONÍVEL" · "CONTEÚDO SELADO"), título Cinzel 700 22/1.2 com número ("5. Equações do 1º grau"). No modo mapa, abaixo: país e capital em 12.5 `textSubtle` ("Reino de Equações 1º Grau · Capital: Castelo de Equações 1º Grau").
2. **Progresso do tópico:** barra 8px + "43% do módulo". Concluído: check `success` + "Concluído" e barra cheia.
3. **Composição** (grade 2×1, gap 10; blocos `surfaceElevated`, raio 14, `padding: 12px 14px`): "**4** conteúdos" · "**3** atividades" (valor Inter 700 20 tabular + rótulo 12 `textSubtle`).
4. **Personalização** (só se o tópico tem): bloco `accentMuted`, borda `accentSoft`, raio 14, `padding: 14px`: chip accent com faísca "Módulo personalizado" + a justificativa em 13/1.55 `textMuted`.
5. **Bloqueado** (no lugar dos itens 2 a 4): cadeado 18 + "**Porcentagem está bloqueado**" (Inter 700 15) + "Conclua os módulos anteriores para liberar este conteúdo." (13 `textSubtle`) + bloco `surfaceElevated` com "Pré-requisitos: Razão e Proporção." e um link fantasma "Ver Razão e Proporção" que seleciona o pré-requisito no mapa.
6. **Ação principal**, presa no pé do painel (`margin-top: auto; padding: 18px 22px; border-top: 1px solid var(--line)`), botão primário de largura total, altura 50:
   | Estado | Rótulo (texto do app) |
   |---|---|
   | atual (iniciado) | **"Continuar"** |
   | disponível (não iniciado) | **"Iniciar tópico"** |
   | concluído | **"Revisar tópico"** (secundário, não primário) |
   | bloqueado | sem botão; só a explicação |
7. **Todos os módulos** (acordeão **aberto por padrão**, porque fechado deixava um vazio no painel, entre o conteúdo e o pé): "Todos os módulos (8)" com chevron. Aberto, é a lista compacta (linhas de 40px: hexágono 20 + "n. título" 13 + ícone de estado 14) e o clique seleciona. Serve para teclado e leitor de tela, e é a alternativa acessível ao mapa. `aria-label="Lista de módulos da trilha"`.

### 5.5 Rodapé do palco
- **Sem legenda e sem zoom** (revisão 3): o chip de cada nó já diz o estado, e sem rolagem horizontal o zoom não tem função.
- **Mentor** (mestre §7.10.2): `right: 24px; bottom: 24px`. O painel de prévia termina a 104px do fundo para caber o botão embaixo dele. **Nesta tela a dica proativa não abre como balão**: o balão cobria o botão "Continuar" do painel, e o painel já mostra a mesma justificativa. No lugar dela, o botão ganha um **ponto de 12px `accent`** (mensagem nova, `aria-label` "… (1 mensagem nova)"), e o bloco de personalização do painel ganha o link fantasma **"Conversar com o Guia →"** (Seeker/Socializer: "Conversar com Amara" etc.). Abrir o mentor mostra a dica como primeira mensagem. Conqueror: quem fala é "Guia", título do painel "Amina na trilha".

### 5.6 Modo **Árvore** (Mastermind, Survivor)
Mesmo palco, faixa e painel. A árvore corre **de cima para baixo**, uma **linha por nível** (`grafo.levels`): [1] → [2] → [3, 4] → [5] → [6] → [7] → [8]. Espaçamento vertical = `min(96, (altura − 60) ÷ 7)`. Nó único no centro do tabuleiro (deslocado 90px à esquerda para o rótulo caber); dois nós no mesmo nível a ±120px. Hexágono **60** com o **rótulo ao lado** (gap 12, largura 150, alinhado à esquerda: título do tópico, não o país, + chip). Arestas em Bézier vertical saindo da base de um hexágono e chegando ao topo do outro: concluídas 3px `accent` com brilho; demais 2px `borderStrong` a 50%, pontilhadas. O marcador "Você parou aqui" vai **à esquerda** do hexágono, com o rabicho apontando para a direita.

### 5.7 Modo **Lista** (Achiever, Socializer)
O palco perde o `overflow-x`. A lista rola na vertical numa área que **começa abaixo do HUD** (`top: 306px; bottom: 76px; right: 384px`), com máscara em degradê de 18px no topo e no pé. Nunca por baixo do HUD translúcido: as linhas atrás do vidro ficavam ilegíveis. Coluna `max-width: 640px`, centrada no espaço livre, gap 12, abrindo rolada até a linha atual. Linha (`ListaSimplesView`): altura 84, raio 20, fundo `surface` a 88% + blur, `1px solid var(--line)`, `padding: 0 22px`, gap 18: hexágono 52 (estados §7.11) → título Inter 600 16 + linha de estado 13 → seta 18. Linhas de estado (texto do app): "Concluído" (`success` + check) · **"Você parou aqui · Continuar"** (`accent`; a linha ganha borda `accent`, fundo `accentMuted` e o retrato 32 da aluna à direita) · "Disponível" · **"Clique para saber como desbloquear"** (app: "Toque para…"). Um traço vertical de 2px (`border`; trecho percorrido em `accent`) liga os hexágonos por trás, como uma linha do tempo. O clique seleciona e mostra no painel; duplo clique abre.

### 5.8 Modal da Bag (`BagModal`, G 960)
Igual à versão anterior deste prompt: eyebrow **"SEU INVENTÁRIO"**, busca **"Buscar na Bag"**, filtros **Todos · Salvos · Comprados · Gerados**, botão "Novo item", grade de 3 colunas de `BagItemCard` (selos "ANOTAÇÃO"/"MEU ITEM", ações Compartilhar/Editar/Excluir), 5 itens de exemplo ("Resumo — Frações equivalentes", "Regra de sinais", "Pergunta: o que é incógnita?", "Poção de dica", "Mapa mental de Equações"). Vazios: "Sua Bag está vazia" / "Os itens salvos e comprados aparecerão aqui." · "Nenhuma compra encontrada" / "Os itens comprados na loja aparecerão aqui." · "Nenhum material gerado" / "Os materiais personalizados aparecerão aqui." Erro: "Não foi possível carregar a Bag." + "Tentar novamente". Excluir: "Excluir item" / "Este item será removido da sua Bag."

### 5.9 Guia tutorial
Popover de 360 ancorado no botão "?", título **"Guia tutorial da trilha"**, texto **"Este guia resume como a trilha aparece para o seu perfil hoje."** Quatro passos, cada um destacando o alvo com anel `accent` e o resto do palco escurecido a 60%: (1) HUD de progresso, (2) estrada, (3) painel de prévia, (4) Bag. Botões "Voltar" · "Próximo" (último: "Começar") · "Pular".

## 6. Estados (seletor flutuante)
"Com dados" · "Tópico bloqueado selecionado" · "Tópico concluído selecionado" · "Carregando" · "Vazio" · "Erro" · "Escolha de turma" · "Sem turma" · "Progresso desatualizado"
- **Carregando:** o cenário aparece; faixa do mundo e painel em esqueleto (mesmas dimensões); no tabuleiro, 8 hexágonos-esqueleto (com a forma arredondada do §5.2) nas posições da serpentina. Faixa de mensagem centralizada no palco: **"Carregando trilhas"** / "Preparando sua jornada."
- **Vazio** (`!classes.length`): sem estrada e sem painel. Card vazio do mestre centralizado no palco (largura 520): ícone mapa, **"Sem trilhas"**, **"Nenhuma trilha disponível no momento."** (corrigindo o "disponivel" do app), nota "Quando sua professora publicar a trilha, ela aparece aqui."
- **Erro:** card de erro centralizado (largura 560): "Não foi possível carregar sua trilha" / "Verifique sua conexão e tente novamente." + "Tentar novamente". (Hoje o app mostra "Erro" e a mensagem técnica crua.)
- **Escolha de turma** (`SelecionarTurmaScreen`): o palco mostra só o cenário escurecido e, no centro, H1 **"Escolha sua turma"** + subtítulo "Você está em 3 turmas. Escolha por onde continuar." e uma fileira de 3 cards de 320×220 (chip da matéria, Cinzel 700 20, "6º ano B · Prof. Helena Duarte", barra com o %, botão **"Entrar na turma"**): Matemática 56% · Ciências 12% · História 0% ("Não iniciada"). Abaixo, fantasma **"Atualizar turmas"**. Carregando: "Buscando suas turmas…". Erro: **"Não foi possível carregar suas turmas"** / **"Verifique sua conexão e tente novamente."** / **"Tentar novamente"**.
- **Sem turma:** card vazio centralizado: **"Você ainda não está em uma turma"**, "Peça o código de matrícula para sua professora." (proposto), botão **"Sair da conta"**.
- **Progresso desatualizado:** chip warning no HUD (§5.1).

## 7. Não fazer
- **Não** pôr a trilha dentro de um card menor que o palco nem repetir a lista de tópicos fora do painel.
- **Não** usar territórios, placas-caixa, legenda nem zoom (revisão 3).
- **Não** criar alternador de modo.
- **Não** usar a paleta marrom-pergaminho de `WORLD_TEMPLATES.palette` (a produção usa as cores do shell).
- **Não** abrir o tópico com um clique simples: o clique seleciona, a ação é explícita.

## 8. Aceite
- [ ] A serpentina mostra os 8 tópicos de uma vez, sem rolagem, e o nó atual tem o marcador "Você parou aqui".
- [ ] Hexágonos em SVG com cantos arredondados, degradê e anel interno; número dentro, sem círculo de número à parte.
- [ ] Um único painel de prévia com estado, progresso, composição, personalização e **uma** ação principal.
- [ ] Trocar o perfil troca cores, cenário e modo (Conqueror = mapa, Mastermind = árvore, Achiever = lista).
- [ ] Estados de nó distinguíveis sem cor (conteúdo do hexágono, contorno tracejado no bloqueado e chip com texto).
- [ ] Teclado: Tab chega aos nós; ←/→ andam; Enter abre; lista acessível no acordeão.
- [ ] Os 9 estados no seletor.

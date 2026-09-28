# Contexto geral — Prototipação da área web do aluno (TrailUp)

Este documento é o equivalente, para a área do aluno, do `prototipos/professor/prompts/00-contexto-geral.md` usado no redesign do console do professor. Leia isto (ou cole isto) junto do prompt mestre em qualquer ferramenta de design com IA. Referência da issue: `#219 [Web] Prototipar a área web do aluno a partir do método do console`.

## O que é o TrailUp

TrailUp é uma plataforma de ensino que personaliza o conteúdo de cada aluno com base no "perfil de jogador" dele (metodologia BrainHex: 7 perfis — Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever). Um professor cadastra turmas, tópicos e material didático; uma IA gera texto e áudio personalizados para cada perfil, por tópico; o aluno consome isso pela **área do aluno**.

## Diferença importante em relação ao redesign do console

O console do professor é um frontend próprio (Vite/React, `frontend/`). **A área do aluno não é isso.** É o **mesmo app mobile** (Expo/React Native, `mobile/`), rodando na variante **web** do Expo (`expo export --platform web` / `expo start --web`) — mesmo código, mesmas telas, mesmo roteamento (`expo-router`), só que renderizado num navegador em vez de num app instalado. Não existe hoje um "site" separado para o aluno.

Isso muda o que este redesign está resolvendo: não é inventar uma tela nova do zero, é **repensar como as telas do app mobile (pensadas para toque, tela pequena, uma coluna) deveriam se comportar numa tela de navegador** (mouse/teclado, tela larga, múltiplas colunas possíveis) — mantendo os dados e o comportamento reais de hoje.

## Quem usa esta área

**Alunos** (qualquer faixa etária escolar/universitária atendida pela escola/professor). Consomem trilha de conteúdo, fazem atividades, acompanham progresso e ranking, interagem com colegas. Ao contrário do professor (uso em sessões esparsas), o aluno tende a ter sessões de estudo mais longas e frequentes — a área precisa sustentar uso contínuo, não só consulta rápida.

## Onde essa área vive no código

`mobile/` — Expo + React Native + TypeScript, roteado por `expo-router` (arquivos em `mobile/src/app/`). Ponto de entrada do fluxo autenticado: `mobile/src/app/(tabs)/_layout.tsx` (5 abas). Ponto de entrada do fluxo de autenticação: `mobile/src/app/(auth)/_layout.tsx`.

**Importante:** o cadastro completo do aluno — incluindo o questionário BrainHex de 6 passos que define o perfil — **não acontece dentro deste app**. O botão "Criar conta" da tela de entrada abre uma URL externa (`Linking.openURL`), que leva para o cadastro no `frontend/` (mesmo fluxo que o redesign do console já tocou de leve, em `referencia-visual-extra/` e `telas/09-cadastro-conta/`). Portanto **não está no escopo deste conjunto de prompts** — só o login e a recuperação de senha, que acontecem de fato dentro do app.

> Achado ao levantar as telas: `mobile/src/app/services/tela_de_entrada/login.tsx` é **código morto** — uma tela de login alternativa, sem estilo (cores hardcoded, sem os tokens do app) e sem nenhuma lógica de autenticação real, que não está registrada em nenhuma navegação ativa. Ignorar esse arquivo, igual o redesign do console ignorou `TrilhaSection.tsx`.

## Estrutura de navegação atual (5 abas, barra inferior)

Definida em `mobile/src/app/(tabs)/_layout.tsx`. Duas abas são **portões** (features que podem estar bloqueadas até o aluno atingir algum critério — abrem um modal de "bloqueado" em vez da tela, quando fechadas):

1. **Trilha** (`(tabs)/trilha/index.tsx` → `TrilhaScreen`/`TrilhaBase`) — tela inicial. A jornada de tópicos, em um de três modos visuais (mapa, árvore ou lista — troca é preferência do aluno, mesmo dado por trás).
2. **Notificações** (`(tabs)/notificacoes/`) — caixa de entrada de avisos.
3. **Social** (`(tabs)/social/index.tsx`) — **portão**. Amigos, convites, guildas, chat privado. A Loja (economia de moedas/itens) também é acessada a partir daqui.
4. **Ranking** (`(tabs)/ranking/`) — **portão**. Classificações por categoria, com pódio.
5. **Perfil** (`(tabs)/perfil/`) — identidade do aluno, conquistas, Bag (mochila de itens), configurações.

Fora das abas: **Tópico** (`(tabs)/trilha/[id].tsx`) — tela cheia (some a barra de abas), aberta ao entrar num nó da trilha. É onde o aluno efetivamente estuda.

## Identidade visual — bem diferente do console do professor

O console do professor tem **um** tema fixo (violeta/indigo escuro). A área do aluno **não tem tema único**: cada aluno tem um perfil BrainHex dominante, e a interface inteira — fundo, superfícies, acentos, cenário de fundo — deriva da cor daquele perfil. Isso é ativo (`profileShellPalette.ts`), não um conjunto de 7 paletas prontas.

**A fórmula (não uma paleta fixa — reproduza a fórmula):**
Dada a cor-assinatura do perfil (`accent`), no mesmo matiz (H) e com saturação limitada a 55%:
- `background` = tom com L=10%
- `surface` = tom com L=16%
- `surfaceElevated` = tom com L=22%
- `border` = tom com L=35% · `borderStrong` = tom com L=55%
- `text` = quase branco, mesmo matiz, saturação bem baixa (≤18%), L=96%
- `accent` (usado como texto/ícone/borda) é a cor-assinatura **elevada em luminosidade** (nunca misturada com branco) até atingir contraste AAA (≥4.5:1) contra `surfaceElevated` — a pior superfície em que ele aparece.

**As 7 cores-assinatura dos perfis** (mesmas do console, fonte oficial `microservice/src/constants/brainHex.ts`):
Seeker `#17a398` (teal) · Survivor `#4e5a66` (slate) · Daredevil `#d7263d` (vermelho) · Mastermind `#5b3fd9` (roxo) · Conqueror `#1e4fd6` (azul) · Socializer `#f4623a` (laranja) · Achiever `#c9a227` (dourado).

**Cada perfil também tem um "guardião" (mascote/personagem)** que aparece em carregamento, seletor de perfil e como referência de identidade — não substitui a navegação: Amara (Seeker) · Kenji (Survivor) · Ember (Daredevil) · Idris (Mastermind) · Amina (Conqueror) · Mateo e Zuri, juntos (Socializer) · Kwame (Achiever).

**Três "temas visuais de sistema" por perfil** (`resolveSystemVisualTheme`), que orientam o tom do cenário/moldura desenhados por trás da UI — não são paletas de cor, são um "clima":
- **mágica** — Socializer, Seeker
- **medieval** — Conqueror, Survivor, Daredevil
- **real** (realista/contemporâneo) — Mastermind, Achiever, e o fallback sem perfil

**Antes do login não há cor de perfil** — usa-se uma paleta estática derivada da cor de marca (`#c1a1ff`, roxo do logo, tema "mágica"). É a única situação em que o roxo aparece como cor de tema (fora disso, roxo só é a cor do Mastermind).

**Tipografia:** títulos em serifa ornamental (Georgia/serif do sistema — **não é a mesma fonte "Cinzel" do console**, mas cumpre o mesmo papel visual); corpo em fonte de sistema sem serifa (`system-ui`/Segoe UI/Roboto conforme plataforma).

**Motivo visual:** hexágonos nos nós de progresso e emblemas — mesma origem (brasão BrainHex) do console. Cantos de **raio pequeno** (6px) — bem mais discreto que os 20px do console, cuidado para não copiar a proporção de lá.

**Cenário/arte por função, não um papel de parede por perfil:** banner (topo), mapa (fundo da trilha em modo mapa), trilha (fundo geral autenticado), ranking (arena) — cada contexto tem sua própria arte, todas tingidas pela cor do perfil ativo. Retratos/fotos de perfil ficam dentro de uma moldura (`FramedProfileImage`) na cor do perfil. Personagens (guardiões) só aparecem depois do login — a entrada/login pública usa só logo e cenário, sem guardião.

## Convenções que valem tanto quanto no console

- **Contraste AAA levando a sério, mesma regra:** subir luminosidade HSL da própria cor, nunca misturar com branco (já implementado em `ensureMinContrast`, ver fórmula acima) — reproduzir esse raciocínio ao ajustar qualquer cor, não misturar com branco.
- Cores semânticas fixas para sucesso/aviso/erro (não derivam do perfil).
- Ícones vetoriais usam os tokens do próprio perfil (matriz de luminância aplicada sobre `MaterialCommunityIcons`/`Ionicons`/`Feather` — ver `docs/mobile/visual-design.md`), com contraste invertido em botões preenchidos.

## O que este redesign precisa resolver (motivação)

Diferente do console (que já era usável e só precisava ficar mais claro), aqui o ponto de partida é uma UI pensada só para toque numa tela pequena, agora rodando num navegador:

- Repensar layout para tela larga — o app hoje é praticamente uma coluna única esticada; decidir o que vira multi-coluna (ex.: lista + detalhe lado a lado) sem perder a identidade "app".
- **Estados vazio/carregando/erro tratados com a mesma atenção que os dados reais** — vários pontos do app hoje mostram só spinner ou nada.
- Lacunas conhecidas que valem ser resolvidas no redesign, não só decoradas por cima:
  - **#27** — a URL não reflete a tela em rotas protegidas (afeta navegação direta por link na web).
  - **#28** — o relatório de dados do aluno (`perfil/relatorio.tsx`, geração de PDF) falha em silêncio na web — pense num estado de erro explícito aqui.
  - **#29** — bundle da web do aluno era pesado (4,75 MB); já em correção em paralelo (code splitting + carregamento sob demanda de rotas pesadas como o Tópico). Não é responsabilidade deste redesign, mas informa: rotas pesadas (deck, PDF) devem continuar carregando sob demanda, não é motivo para reempacotar tudo numa tela só.
- Ações destrutivas (excluir conta, desfazer amizade, bloquear) precisas de confirmação visualmente inconfundível — mesma régua do console.

## Como usar os outros arquivos desta pasta

- `MAPEAMENTO.md` — inventário das rotas de `mobile/src/app/` e de qual pasta de `telas/` cada uma faz parte. Não há prints aqui (diferente do console) — a área do aluno ainda não tem protótipo nenhum, então cada `prompt.md` descreve os dados reais por escrito, a partir do código e de `docs/mobile/`.
- `telas/00-entrada/prompt.md` — prompt mestre (contexto + primeira tela: Entrada). Cole numa conversa nova, depois envie os demais **na mesma conversa**, um de cada vez.
- `telas/01-login/` a `telas/11-configuracoes/` — um prompt por tela/grupo de telas, na ordem em que o aluno realmente navega (entrada → login → trilha → tópico → ranking/social/notificações → perfil).
- Assets: a área do aluno tem sua própria arte (cenários, guardiões, molduras, emblemas) em `mobile/src/assets/` e catalogada por `mobile/src/constants/designAssets.ts` — ainda não copiada para esta pasta. Se a ferramenta de design pedir referência visual, usar os prints do app mobile já anexados no PROMPT MESTRE do console (`prototipos/professor/prompts/00-contexto-geral.md`, `assets/app-screenshot-*.jpg`) como tom geral, avisando que são do app nativo, não da web.

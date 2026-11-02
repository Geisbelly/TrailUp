# Tela de carregamento por perfil BrainHex

Data: 2026-11-02 · App mobile 1.0.6 · Código: `mobile/src/components/carregamento/TelaCarregamento.tsx`
e `mobile/src/utils/telaCarregamento.ts`.

## 1. O que existia

| Onde | Componente | Quando aparece | Problemas |
| --- | --- | --- | --- |
| Abertura do app (`_layout.tsx`, `LoadingOverlay`) | `components/funcionais/Loading.tsx` | sessão sendo hidratada, login em andamento | barra que **ia e voltava** (de 12% a 100% e de volta) e parecia progresso determinado sem ser; *flash* de cor em tela cheia; nenhum rótulo para leitor de tela; não respeitava "Reduzir movimento" |
| Antes de saber a sessão (`_layout.tsx`) | `components/LoadingState.tsx` | "Preparando sessão" | spinner genérico; a "variante neutra" era, na prática, a cor do Estrategista (`getProfileShellPalette(null)` cai em `mastermind`) |
| Tópico (`trilha/[id].tsx`) | `LoadingState` com a paleta do perfil | "Carregando trilha" | só a cor mudava por perfil; sem guia, sem voz |
| Detalhe de notificação | `LoadingState` **sem** paleta | "Carregando notificação" | sempre na cor do Estrategista |
| Console do professor (`frontend/`) | `Loader2` girando (`App.tsx`, `ProtectedRoute.tsx`) | rota preguiçosa, sessão | — |
| Splash nativo (`app.json`) | imagem estática | antes do JavaScript | não dá para personalizar: o perfil ainda não é conhecido |

A #795 só esticou o `LoadingState` (faixas brancas na web); não mexeu no desenho.

**Onde a tela nova entra:** nas três telas do mobile que mostram carregamento de página
inteira (abertura, tópico, notificação), por um único componente. O `LoadingState` e o
`Loading.tsx` continuam existindo com a mesma API e passam a desenhar a `TelaCarregamento`,
então nenhuma chamada muda.

**O que fica de fora, e por quê:**

- **Splash nativo:** é uma imagem desenhada pelo sistema antes do JS. A variante neutra
  começa **exatamente** no fundo dele (`#111936`, conferido por teste contra o `app.json`),
  para a passagem splash → JS não piscar.
- **Console do professor:** professor não tem perfil BrainHex. Caberia aplicar a variante
  neutra lá, mas é outro pacote (`frontend/`), outro deploy e outro público. Fica como
  continuação possível.
- **Carregamentos dentro da tela** (listas, cartões, modais, 41 arquivos com
  `ActivityIndicator`): ali o certo é *skeleton* ou spinner local (seção 2.1), não uma tela
  cheia.

## 2. Fundamentação

### 2.1 Qual indicador usar

- **Limiares de tempo.** Até ~0,1 s a resposta parece instantânea; até ~1 s o usuário nota,
  mas não perde o fio; por volta de 10 s a atenção vai embora [1][2]. Daí três decisões:
  o conteúdo da tela só aparece depois de **300 ms** (`ATRASO_PARA_MOSTRAR_MS`), para que
  uma espera curta não pisque um indicador; o fundo entra na hora, para não piscar branco;
  e aos **10 s** (`LIMIAR_DEMORA_MS`) a tela diz que está demorando e sugere conferir a
  conexão, em vez de continuar animando calada.
- **Spinner × skeleton × progresso determinado.** O NN/g indica progresso determinado
  quando há dado real de progresso, *skeleton* quando dá para prever o layout do conteúdo, e
  indicador indeterminado quando não há nem uma coisa nem outra [3][4]. A hidratação da
  sessão e a busca do tópico não têm porcentagem e abrem telas de layouts diferentes, então
  o indicador é **indeterminado**. Sherwin recomenda animação em laço para esperas de 2 a
  10 s e porcentagem acima de 10 s [3]; como aqui não existe dado de porcentagem, o que
  muda aos 10 s é o texto, e não o indicador. Uma barra de porcentagem inventada seria
  pior que nenhuma. A literatura sobre *skeleton* é mista: Mejtoft et al.
  acharam percepção de velocidade melhor que a do spinner [5]; o teste da Viget achou o
  contrário [6]. Isso reforça usar *skeleton* só onde o layout é conhecido (listas), e não
  como tela de abertura.
- **Progresso que regride é o pior caso.** A barra antiga ia e voltava. Harrison et al.
  mostraram que o comportamento da barra muda a duração percebida, e que pausas e recuos
  pesam contra [7]; em outro estudo, animações que andam para a frente encurtam a espera
  percebida [8]. Myers já tinha mostrado que as pessoas preferem ter indicador de
  progresso [9]. Por isso a "trilha de marcos" **nunca representa porcentagem e nunca
  anda para trás**: é uma luz que percorre marcos, sempre no mesmo sentido.
- **Espera ocupada parece menor.** Tempo ocioso parece mais longo que tempo ocupado, e a
  espera incerta parece mais longa que a explicada [10]. Ver o trabalho acontecendo aumenta
  o valor percebido do serviço [11]. Daí a frase do guia ("Amara está mapeando o caminho
  para você"): ela ocupa a espera e diz o que está acontecendo, sem inventar nada.
  Telas de carregamento **interativas** reduzem mais a espera percebida que as passivas
  [12][13], mas a espera aqui costuma ficar abaixo de poucos segundos e a tela precisa sair
  sozinha. Interação fica como ideia para esperas longas (geração de mídia), não para esta.

### 2.2 Contexto educacional e gamificado

- **Wait-learning:** Cai et al. aproveitaram microesperas para microaprendizagem de
  vocabulário, com bom acolhimento, desde que o conteúdo seja curto e não exija ação [14].
  Isso sustenta o tom (o guia fala do que vem a seguir), mas também o limite: numa espera
  de 1 a 3 s não cabe ensinar nada. Não há dica de conteúdo na tela de propósito. Ela
  teria de ser lida em menos de um segundo, e trocá-la a cada poucos segundos criaria
  conteúdo que se atualiza sozinho (2.3).
- **Jogos:** dicas curtas em texto são o padrão de tela de carregamento em jogos, e
  funcionam por serem lidas de relance [13]. A frase do guia segue esse formato: uma linha,
  na voz do personagem.

### 2.3 Acessibilidade

- **Contraste AAA (WCAG 1.4.6):** 7:1 para texto normal, 4,5:1 para texto grande, e sem
  arredondar (4,499 não passa) [15]. A tela exige **7:1 para todo texto, grande ou não**,
  contra o fundo **e** contra a superfície do cartão (o pior caso). O ajuste eleva só a
  luminosidade HSL da cor-assinatura (`ensureMinContrast`, a mesma função que o app já usava,
  agora exportada); matiz e saturação ficam, e os testes conferem. O marco apagado é
  componente de interface e tem 3:1 (1.4.11).
- **Movimento:** "Reduzir movimento" (iOS/Android) e `prefers-reduced-motion` (web) existem
  para quem tem distúrbio vestibular; escala e deslocamento grandes são os gatilhos
  clássicos [16]. Com a preferência ligada, **nada se move**: os marcos ficam parados e
  iguais (um quadro que não sugere porcentagem), o halo fica fixo, e a troca neutra → perfil
  na abertura é instantânea. O texto continua dizendo que está carregando.
  WCAG 2.2.2 exige pausar movimento automático de mais de 5 s, mas o *Understanding* abre
  exceção para animação de pré-carregamento quando não há interação possível naquela
  fase [17]. Mesmo assim a tela não troca de frase sozinha.
- **Leitor de tela:** a tela inteira é um nó `progressbar` ocupado (`busy`), com rótulo
  "título. frase." (e o aviso de demora, quando aparece). Mensagem de status precisa chegar
  à tecnologia assistiva sem mover o foco (WCAG 4.1.3) [18]: no Android isso é a região viva
  (`accessibilityLiveRegion="polite"`); no iOS e na web, `announceForAccessibility` [19].
  O ícone do perfil e a estrela da marca são decorativos e ficam fora da árvore.

### 2.4 Perfil → movimento e voz

BrainHex é uma tipologia de **arquétipos** de experiência de jogo (Nacke, Bateman e
Mandryk), não um tipo psicométrico [20][21]. Por isso a tela não "diagnostica" nada: ela
traduz a experiência que o arquétipo valoriza em ritmo e em voz, usando as fontes oficiais
do repositório:

- cor-assinatura, guia e rótulo: `microservice/src/constants/brainHex.ts`, espelhado em
  `mobile/src/constants/profileImages.ts`;
- **ritmo, tom e marcadores de linguagem:** `_BRAINHEX_EDITORIAL_SIGNATURES` em
  `api/app/services/personalizacao.py`. O ritmo é copiado tal qual, e um teste lê o
  Python e falha se os dois divergirem. As **proibições de estilo** de lá também valem: o
  Sobrevivente não recebe promessa vaga, o Aventureiro não recebe abertura morna.

| Perfil | Assinatura | Destaque (AAA) | Destaque/fundo | Destaque/cartão | Texto suave/cartão | Marco apagado/fundo | Modo | Ritmo editorial |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Explorador (Seeker) | `#17a398` | `#ccf8f4` | 13,61 | 7,24 | 7,36 | 3,87 | viajante | medio (1900 ms) |
| Sobrevivente (Survivor) | `#4e5a66` | `#c3cad1` | 10,66 | 7,17 | 7,70 | 3,40 | respira | medio-lento (2600 ms) |
| Aventureiro (Daredevil) | `#d7263d` | `#f1b0b8` | 10,17 | 7,43 | 7,54 | 3,40 | viajante | dinamico (1200 ms) |
| Estrategista (Mastermind) | `#5b3fd9` | `#b2a5ed` | 8,62 | 7,03 | 8,54 | 3,32 | passo | medio (1900 ms) |
| Conquistador (Conqueror) | `#1e4fd6` | `#a5b9f2` | 9,51 | 7,17 | 7,88 | 3,32 | passo | dinamico (1200 ms) |
| Socializador (Socializer) | `#f4623a` | `#fabeae` | 11,04 | 7,63 | 7,10 | 3,30 | par | medio (1900 ms) |
| Realizador (Achiever) | `#c9a227` | `#f4e9c7` | 13,20 | 7,38 | 7,30 | 3,73 | acumula | medio (1900 ms) |
| Neutro (TrailUp) | `#5b7cff` (estrela da marca) | `#acbdff` | 9,44 | 7,75 | 7,98 | 3,42 | viajante | medio (1900 ms) |

Por que cada modo:

- **Explorador, viajante:** uma luz percorre o caminho, como quem segue pistas.
- **Sobrevivente, respira:** todos os marcos sobem e descem juntos, devagar e com pouca
  amplitude (1,15×). É estabilidade e segurança, o oposto de urgência.
- **Aventureiro, viajante rápido:** o mesmo percurso do Explorador, mas em 1,2 s e com o
  marco crescendo 1,5×. É energia, desafio e ação.
- **Estrategista, passo:** um marco por vez, em degraus secos, sem transição. É precisão,
  uma peça de cada vez.
- **Conquistador, passo dinâmico:** os mesmos degraus em ritmo dinâmico. É avanço
  assertivo, de meta em meta.
- **Socializador, par:** duas luzes andam juntas, separadas por meia volta. São Mateo e
  Zuri, os dois guias. Só este perfil tem dois.
- **Realizador, acumula:** os marcos acendem um a um e ficam acesos até completar a volta.
  São marcos conquistados, sem nunca regredir no meio.
- **Neutro:** viajante, em ritmo médio, com a estrela da marca no lugar do ícone do perfil
  e o cenário público ao fundo (o mesmo da entrada do app).

**O medalhão mostra o ícone do perfil, chapado, não o guia nem o emblema 3D.** É o glifo de
`brainHexConfig[perfil].icon` (`mobile/src/constants/profileImages.ts`, MaterialCommunityIcons),
o mesmo que o app já desenha no Social e nos avisos:

- mapa para o Explorador;
- escudo para o Sobrevivente;
- espadas cruzadas para o Aventureiro;
- cavalo do xadrez para o Estrategista;
- coroa para o Conquistador;
- máscaras para o Socializador;
- cubo para o Realizador.

O ícone vai na cor de destaque AAA do perfil, que passa de 7:1 sobre a superfície do medalhão
(1.4.11 pede 3:1).

Houve duas versões antes desta:

1. A primeira usava o retrato do guia.
2. A segunda usava os emblemas 3D de `profileEmblems`, que destoavam do traço chapado do
   medalhão, do ornamento e da trilha.

Um teste falha se a tela voltar a importar qualquer um dos dois. O guia continua na voz: é
ele quem fala na frase e aparece no rótulo ("Conquistador · Amina").

O conjunto do app mistura glifos de contorno (escudo, coroa, cubo) com glifos cheios (mapa,
espadas, cavalo, máscaras). Ele foi mantido como está, para o aluno ver o mesmo ícone em
todo o app. O espelho oficial (`microservice/src/constants/brainHex.ts`, Lucide) difere no
Estrategista: lá o ícone é uma bússola.

### 2.5 Transição neutro → perfil

Na abertura, a sessão chega depois da tela, então ela começa neutra e só depois sabe o perfil.
Antes, a troca era um *crossfade* de uma tela por cima da outra. Agora ela tem uma
coreografia de **1,2 s** (`TRANSICAO_MS`), com fases em `FASES_DA_TRANSICAO`
(frações do tempo total):

| Fase | Trecho | O que acontece |
| --- | --- | --- |
| `estrelaSai` | 0–0,28 | a estrela da marca gira 90°, cresce 1,3× e some |
| `onda` | 0–0,5 | um anel na cor do perfil se abre a partir do medalhão |
| `circulo` | 0,22–0,66 | um círculo no fundo do perfil cresce do medalhão até cobrir a diagonal da tela |
| `medalhaoEntra` | 0,4–0,7 | o ícone do perfil entra no medalhão, crescendo até o tamanho final |
| `textoEntra` | 0,5–0,85 | rótulo, frase e trilha aparecem |
| `fundoEntra` | 0,68–0,95 | o gradiente e o cenário do perfil aparecem por baixo |
| `circuloSai` | 0,78–1 | o círculo some e deixa o fundo do perfil |

Decisões:

- **O círculo só começa depois de a estrela girar.** Na primeira montagem ele cobria a
  estrela desde o primeiro quadro, e o giro não se via. O teste exige que o círculo comece só
  depois de 70% de `estrelaSai`.
- **As duas camadas têm o mesmo layout.** A neutra reserva a linha do rótulo (um espaço), para
  que título, frase e trilha não pulem quando a do perfil entra.
- **Só neutro → perfil anima** (`deveAnimarTransicao`). Perfil → outro perfil e a primeira
  montagem são instantâneos. Com "Reduzir movimento", a troca também é instantânea.
- **A curva vai embutida nos pontos** (`faseDaTransicao`), porque o *native driver* não aceita
  *easing* em JavaScript dentro de `interpolate`.
- **A decisão é tomada em `useLayoutEffect`,** antes da pintura, para não aparecer um quadro
  do perfil sem a animação.
- **Há um timer de segurança** (`TRANSICAO_MS` + 400 ms) que encerra a transição se o
  `requestAnimationFrame` estiver pausado, como em aba em segundo plano.
- O `Loading.tsx` espera a transição terminar e mais 800 ms antes de liberar o app, para o
  aluno chegar a ver o ícone.

**Microcopy.** Cada perfil tem duas ou três frases na voz do guia, escritas com os
marcadores de linguagem do perfil, e um aviso de demora. As regras, conferidas em teste:

- uma frase por montagem, sem rodízio;
- nenhuma frase passa de 90 caracteres;
- todo aviso de demora fala da conexão;
- **nenhuma frase promete o que a tela não faz.** A tela não salva nem tenta de novo, então
  nenhuma frase diz isso.

Com perfil, a mensagem genérica do contexto ("Organizando conteúdos e atividades…") dá lugar
à frase do guia. Na variante neutra, ela continua.

## 3. Limites conhecidos

- O destaque fica **claro** (pastel) em todos os perfis: é o preço de 7:1 contra a
  superfície do cartão. Matiz e saturação são os da assinatura, então a cor continua
  reconhecível, como se vê nos prints.
- Na web, o react-native-web lê `prefers-reduced-motion` **uma vez**, ao carregar o
  módulo. Trocar a preferência com a página aberta só vale depois de recarregar. No
  aparelho, o evento `reduceMotionChanged` cobre a troca ao vivo.
- O conteúdo aparece por **timer**, não por animação de entrada: com a aba em segundo
  plano o `requestAnimationFrame` para, e um *fade* deixaria a tela vazia até a aba voltar
  (aconteceu na verificação).
- Por um instante, perto do fim de `circulo`, a tela fica toda no fundo do perfil, com o
  símbolo ainda quase transparente: é o círculo cobrindo tudo antes de o símbolo e o texto
  firmarem. Nos quadros em câmera lenta dos prints (transição esticada para 6 s só para
  capturar) isso aparece como um quadro vazio. Na duração real não foi medido quadro a quadro.
- Não conferido em aparelho nativo (Android/iOS): só no preview web. A tela só chega ao
  aluno na **próxima build** do app (hoje 1.0.6).

## Fontes

1. Nielsen, J. *Response Times: The 3 Important Limits* (NN/g, 1993, atualizado). Vídeo: https://www.nngroup.com/videos/3-response-time-limits-interaction-design/ · tópico: https://www.nngroup.com/topic/response-time/
2. Card, S. K.; Moran, T. P.; Newell, A. *The Psychology of Human-Computer Interaction* (1983) e Miller, R. B. *Response time in man-computer conversational transactions* (AFIPS 1968), origem dos limiares (apontada em https://feelsfast.vercel.app/concepts/canonical-thresholds).
3. Sherwin, K. *Progress Indicators Make a Slow System Less Insufferable* (NN/g). https://www.nngroup.com/articles/progress-indicators/
4. NN/g. *Skeleton Screens 101* e *Skeleton Screens vs. Progress Bars vs. Spinners*. https://www.nngroup.com/articles/skeleton-screens/ · https://www.nngroup.com/videos/skeleton-screens-vs-progress-bars-vs-spinners/
5. Mejtoft, T.; Långström, A.; Söderström, U. *The effect of skeleton screens: Users' perception of speed and ease of navigation*. ECCE 2018. doi:10.1145/3232078.3232086
6. Viget. *A Bone to Pick with Skeleton Screens* (2017). https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens
7. Harrison, C.; Amento, B.; Kuznetsov, S.; Bell, R. *Rethinking the Progress Bar*. UIST 2007, p. 115–118. https://www.chrisharrison.net/index.php/Research/ProgressBars
8. Harrison, C.; Yeo, Z.; Hudson, S. E. *Faster Progress Bars: Manipulating Perceived Duration with Visual Augmentations*. CHI 2010, p. 1545–1548.
9. Myers, B. A. *The Importance of Percent-Done Progress Indicators for Computer-Human Interfaces*. CHI '85. Resumo: https://graphicsinterface.org/wp-content/uploads/gi1985-24.pdf
10. Maister, D. H. *The Psychology of Waiting Lines* (1985). https://davidmaister.com/articles/5/52/
11. Buell, R. W.; Norton, M. I. *The Labor Illusion: How Operational Transparency Increases Perceived Value*. Management Science 57(9), 2011, p. 1564–1579.
12. Hohenstein, J. et al. *Shorter Wait Times: The Effects of Various Loading Screens on Perceived Performance*. CHI EA 2016, p. 3084–3090. doi:10.1145/2851581.2892308
13. *Interactive 2D vs. 3D Loading Screens in VR* (SVR, SBC) https://sol.sbc.org.br/index.php/svr/article/view/30541 e Frontiers in Virtual Reality (2025) doi:10.3389/frvir.2025.1540406. Dicas em texto em jogos: Swiegers e Lakier, pôster GI 2026, https://cs.uwaterloo.ca/~dvogel/gi2026/posters/1019c.pdf
14. Cai, C. J.; Guo, P. J.; Glass, J. R.; Miller, R. C. *Wait-Learning: Leveraging Wait Time for Second Language Education*. CHI 2015, p. 3701–3710. https://dspace.mit.edu/handle/1721.1/112662
15. W3C. *Understanding SC 1.4.6: Contrast (Enhanced)*. https://w3c.github.io/wcag/understanding/contrast-enhanced · técnica G174: https://www.w3.org/WAI/WCAG22/Techniques/general/G174
16. MDN. *prefers-reduced-motion*. https://developer.mozilla.org/docs/Web/CSS/@media/prefers-reduced-motion · W3C. *Understanding SC 2.3.3: Animation from Interactions*. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
17. W3C. *Understanding SC 2.2.2: Pause, Stop, Hide*. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide
18. W3C. *Understanding SC 4.1.3: Status Messages*. https://www.w3.org/WAI/WCAG22/Understanding/status-messages
19. React Native. *Accessibility* (`accessibilityRole="progressbar"`, `accessibilityLiveRegion`, `AccessibilityInfo`). https://reactnative.dev/docs/accessibility · https://reactnative.dev/docs/accessibilityinfo
20. Nacke, L. E.; Bateman, C.; Mandryk, R. L. *BrainHex: Preliminary Results from a Neurobiological Gamer Typology Survey*. ICEC 2011. doi:10.1007/978-3-642-24500-8_31
21. Nacke, L. E.; Bateman, C.; Mandryk, R. L. *BrainHex: A neurobiological gamer typology survey*. Entertainment Computing 5(1), 2014. doi:10.1016/j.entcom.2013.06.002

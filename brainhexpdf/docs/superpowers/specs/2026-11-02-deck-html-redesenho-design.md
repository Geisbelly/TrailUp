# Redesenho do deck HTML do aluno (02/11)

O deck HTML é o arquivo que o `POST /api/v1/render-and-store` gera com
`generateInteractiveHtml` e sobe para o R2. O app abre esse arquivo num WebView,
e o console do professor, num iframe. Esta revisão refaz a apresentação: cor por
perfil, claro e escuro, leitura e responsividade. O contrato com o app não muda.

## O que estava errado

Medido nos templates renderizados localmente, com o mesmo pipeline do servidor
(enriquecimento, pontos de reflexão, paginação):

- **Tailwind pelo CDN em tempo de execução.** A própria documentação diz que o
  Play CDN não serve para produção. Sem rede, o deck abria sem estilo nenhum, e
  o WebView às vezes abre do cache.
- **Só escuro, e em âmbar**, não na cor do perfil. O texto do corpo tinha 12px
  no celular e os rótulos, 9 a 11px. No celular o contador de slides era cortado.
- **`hideQuiz`/`hideChecklist`/`hideNotes` não escondiam nada.** A função rodava
  uma vez, antes do primeiro slide entrar no DOM.
- **Espaço e setas dentro da resposta trocavam de slide.**
- **Um apóstrofo no conteúdo quebrava o `onclick`.** O texto ia colado dentro da
  string JavaScript. O conteúdo do modelo também não era escapado.
- **Restauração quebrada:** o segredo revelado voltava vazio (id errado) e as
  ideias-chave marcadas voltavam desmarcadas (classe errada).
- Mojibake (`âœ¦`), "MEDIEVAL BRAINHEX HERITAGE" fixo e bordas fora da paleta
  oficial.
- O laço do confete rodava para sempre, mesmo sem partícula na tela.

## Decisões

### Cor: tokens AAA por perfil e por modo (`deckTheme.ts`)

- A cor-assinatura sai de `microservice/src/constants/brainHex.ts`, espelhada
  em `PROFILE_SIGNATURES`. O teste confere o espelho.
- Superfícies levam o matiz do perfil com saturação contida. O texto fica
  neutro, e o accent é o único ponto de cor forte.
- **O accent só muda a luminosidade HSL**: sobe no escuro e desce no claro, até
  passar 7:1 contra todas as superfícies. Matiz e saturação ficam. Nunca se
  mistura com branco (regra do CLAUDE.md, porque misturar apaga o perfil).
- `success`/`warning`/`danger`/`info` são **fixos por modo**, iguais nos sete
  perfis.
- O teste cobre 7 perfis × 2 modos × 7 cores de texto × 4 superfícies: tudo
  passa em 7:1 (WCAG 1.4.6). Bordas de controle passam em 3:1 (WCAG 1.4.11).

Exemplo: o Seeker `#17a398` (H 175, S 75, L 36) vira L 47 no escuro e L 20 no
claro, com H e S iguais.

### Tema: quem decide

Na ordem:

1. a escolha do aluno no painel "Leitura", guardada no aparelho
   (`localStorage.trailup_deck_prefs`, vale para todos os decks);
2. `?tema=claro|escuro`, que o app pode mandar (hoje não manda; o app é sempre
   escuro);
3. `prefers-color-scheme` do aparelho.

Um script no `<head>` aplica o tema antes do primeiro desenho, então a tela não
pisca. O fallback só com CSS (`@media (prefers-color-scheme: light)`) cobre o
caso de o script não rodar.

### Leitura

- Corpo de 17 a 19px (`clamp`), medida de 66 caracteres, entrelinha de 1,6,
  sem justificar e com espaço entre parágrafos maior que a entrelinha
  (WCAG 1.4.8). Nada abaixo de 14px.
- Painel "Leitura": tema, tamanho (padrão, 1,15×, 1,3×), espaçamento amplo com
  os valores do WCAG 1.4.12, animações ("do aparelho" ou "reduzir") e sons.
- Cinzel fica só no título da capa e do fechamento. O corpo usa a fonte do
  sistema, a mesma do app. A Cinzel vem do Google Fonts e tem substituta local.
- Slide com um parágrafo só e nada ao lado ganha o corpo maior (`prose--lead`).
  A regra de "slide esparso" é a mesma de antes.

### Perfil (`deckProfileIdentity.ts`)

Cada perfil leva emblema, guia, nome do estilo (`presentationThemes.ts`) e um
motivo de fundo discreto:

| Perfil | Estilo | Motivo |
| --- | --- | --- |
| Seeker | Atlas das Descobertas | curvas de nível |
| Survivor | Manual de Campo | grade tática |
| Daredevil | Código de Impacto | diagonais |
| Mastermind | Blueprint Estratégico | nós ligados |
| Conqueror | Tratado de Soberania | arcos |
| Socializer | Mosaico de Conexões | elos |
| Achiever | Portfólio de Maestria | gema e segmentos |

**Um ícone, um significado.** O emblema é o mesmo desenho que o app já usa
para o perfil (`mobile/src/constants/profileImages.ts`). O Mastermind é o
cavalo de xadrez, não a bússola, porque no app a bússola é o "mapa revelado".
Nenhum emblema ou motivo é medalha (conquista) nem rosto de guia ("você parou
aqui"). Os ícones de palavra-chave por slide saíram, porque repetiam desenhos
com outro sentido.

O divisor ornamental do perfil (`generateMedievalSvgDivider`) continua na capa
e no fechamento.

### Navegação e leitor de tela

- Cabeçalho: emblema, "perfil · estilo", título, XP obtido/estimado, Sumário,
  Leitura, Narrar e tela cheia. Todos os alvos têm 44px (WCAG 2.5.5).
- Rodapé: Anterior, "Slide N de M" e Próximo. No último slide, Próximo vira
  "Fim" e fica desabilitado.
- As bolinhas de navegação viraram o diálogo **Sumário**, com o título de cada
  slide.
- Ao trocar de slide, o título recebe foco e uma região viva anuncia "Slide N
  de M: título".
- Quiz, checklist, decisão e ideias-chave são `<button>` com `aria-pressed`.
  Certo ou errado aparece também em texto, não só em cor. O feedback vai numa
  região viva.
- Teclado: setas, PageUp/PageDown, Home/End, `f` e `m`. Nada disso age dentro
  de um campo de texto ou com um diálogo aberto.
- "Reduzir movimento" (do aparelho ou do painel) desliga transição, confete,
  tremida e selo flutuante. O XP ganho é anunciado mesmo assim.

### Responsividade

- O deck ocupa a tela do WebView inteira (`100dvh`, com safe-area). Só em tela
  de 900px ou mais de largura e 560px ou mais de altura ele vira um cartão com
  margem.
- O texto e a coluna lateral (imagem e widget) ficam lado a lado de 960px para
  cima, na proporção 7:5. Abaixo disso, empilham.
- O alternador 16:9/9:16 saiu: o deck segue a tela que tem.
- Conferido sem rolagem horizontal em 390px, em todos os slides.

### Segurança do conteúdo

Todo texto que vem do modelo é escapado. Só `**negrito**` e `` `código` `` viram
marcação. Valores dos handlers vão por `data-*` e são lidos com
`this.dataset`. No JSON embutido, `</` e `<!--` são escapados.

## O que não muda (contrato com o app)

- `const deck = …` e `STORAGE_KEY = 'trailup_deck_save_' + …` embutidos.
- Mensagens `trailup:progress`, com as mesmas chaves e as mesmas regras de XP
  (os testes conferem as linhas).
- Os parâmetros `hideQuiz`/`hideChecklist`/`hideNotes`, agora aplicados de fato.
- `window.__SLIDES__`, `#slide-stage` rolável começando do topo, ids dos
  widgets e assinaturas dos handlers.
- `generatePdfPageHtml` continua exportada. Agora leva a própria folha de estilo
  escopada e o tema escuro.

## Custo e decks existentes

Mudar o template **não chama o Gemini** e **não sobe
`_PERSONALIZACAO_PIPELINE_VERSION`**. Só decks gerados depois do deploy do
BrainHexPDF saem com o desenho novo. Os que já estão no R2 são HTML estático e
ficam como estão.

Como o JSON completo do deck vai embutido em cada arquivo, dá para re-renderizar
os existentes **sem custo de cota**: ler o JSON, chamar `generateInteractiveHtml`
e regravar no mesmo caminho. Isso escreve no R2 de produção, então fica como
passo separado, com aprovação.

## Fontes

- W3C, *Understanding SC 1.4.8 Visual Presentation* (medida, entrelinha, sem
  justificar): https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html
- W3C, *Understanding SC 1.4.6 Contrast (Enhanced)*:
  https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html
- W3C, *Understanding SC 1.4.11 Non-text Contrast*:
  https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- W3C, *Understanding SC 1.4.12 Text Spacing*:
  https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html
- W3C, *Understanding SC 2.5.5 Target Size (Enhanced)*:
  https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- W3C, *Understanding SC 2.3.3 Animation from Interactions*:
  https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
- R. E. Mayer, *Multimedia Learning* (princípios de coerência, sinalização e
  segmentação no ritmo do aluno), que levaram a tirar o decorativo e a manter
  um slide por vez.
- Tailwind CSS, *Play CDN* (feito para desenvolvimento, não para produção):
  https://tailwindcss.com/docs/installation/play-cdn
- MDN, `prefers-color-scheme` e `prefers-reduced-motion`.

## Revisão depois do merge (#863)

Comparei a versão anterior e a nova slide a slide, no navegador. Usei os 7
decks de exemplo e um deck sintético com todos os ramos (batalha, cartões,
números, comparação, inspeção de código, quiz e checklist vindos do
`interactiveElement`, reflexões e fechamento). Saíram estas correções:

- **XP perdido no fechamento.** As ideias-chave tinham virado lista estática, e
  o aluno perdia os 25 XP de cada uma. Elas voltaram a ser marcáveis. Agora as
  fontes de XP por slide (quantidade e valor) batem com a versão anterior.
- **O atalho "Ir para o conteúdo" tirava o deck do iframe do console.** Num
  `srcdoc`, o `#` é resolvido pela página mãe. O atalho agora só move o foco.
- **Render quebrava com caractere cortado ao meio** (surrogate solitário, que
  o `slice` do sanitizador de quiz pode produzir). O `encodeURIComponent` dos
  `data-*` saiu, porque o `dataset` já devolve o texto original.
- **O divisor SVG do estúdio era o único campo que entrava sem filtro.** Agora
  só passa SVG sem script, handler, link ou HTML embutido.
- **O checklist guardava o estado só pelo id do item.** Como o modelo repete
  `c1`, `c2`… entre slides, o segundo checklist abria marcado. A chave agora é
  por slide, e o estado salvo antes da mudança continua valendo.
- **iOS anterior ao 15.4, sem `<dialog>`.** Os dois diálogos ficavam abertos no
  pé do deck. O CSS esconde o diálogo fechado, e o Esc fecha.
- **Foco e teclado.**
  - O Sumário devolvia o foco ao botão em vez do título do slide.
  - As setas num bloco de código trocavam de slide em vez de rolar o código.
- **Texto.** Ficavam `**` visíveis no subtópico, na legenda e nas tags. O
  título do guia voltou à capa.
- **Paisagem no celular.** Cabeçalho e rodapé ficaram mais compactos quando a
  altura é pequena, sempre com alvos de 44px.

Conferido sem mudança: as mensagens `trailup:progress` (as mesmas chaves) e as
regras de XP. O estado salvo por um deck antigo volta no novo (quiz, checklist,
decisão, segredo, ideias-chave), e o quiz já premiado não premia de novo.
Também conferi a narração com a ponte de voz do app (`SCRIPT_PONTE_DE_VOZ`).

**Dentro do app, o deck abre escuro** (decidido em 02/11). O app é sempre
escuro, mas o WebView segue o tema do aparelho (`userInterfaceStyle:
automatic`). Num aparelho em modo claro, o deck aparecia claro dentro do app.
Agora o `DocumentBlock` manda `?tema=escuro` na URL que vira `baseUrl`
(`withTemaEscuroDoApp`), e o aluno ainda pode trocar no painel Leitura.
Fora do app (console, link aberto no navegador), o deck segue o aparelho.

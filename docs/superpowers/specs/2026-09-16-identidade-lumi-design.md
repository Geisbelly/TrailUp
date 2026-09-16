# Identidade visual nova — o mundo da Lumi

> Fonte: pasta de identidade no Drive (Logo, Cards, Molduras, Totens, Emblemas,
> Cenários, Personagens). A peça canônica é a ficha **“LUMI — assistente do
> professor”**, que não é só um personagem: é o sistema inteiro num quadro só —
> fundo, luz, tipografia, ícones, divisores e as variantes do ícone do app.

Todos os valores abaixo foram **medidos nos arquivos** (quantização e amostragem
por região), não estimados a olho.

## 1. O que a identidade diz

| Elemento | O que é |
| --- | --- |
| **Marca** | Estrela de oito pontas — bússola / estrela-guia. Branca com contorno azul luminoso. Reaparece como faísca de quatro pontas nos ornamentos |
| **Mundo** | Azul-meia-noite profundo, matiz 215–220°, saturação alta, luminosidade 5–14% |
| **Luz** | Âmbar quente, uma fonte só — vaga-lume, estrela, lampião. É a única cor quente da paleta |
| **Ilustração** | *Low-poly* facetado: personagem, pedra, cristal e árvore são planos angulares |
| **Tipografia** | Sans leve, caixa alta, **tracking largo** nos rótulos; sans humanista leve no corpo |
| **Ícones** | Traço fino, sem preenchimento, em âmbar ou aço |
| **Divisores** | Fio de 1px em baixa opacidade — nunca caixa, nunca sombra |

## 2. A inversão que a identidade força

**Hoje o perfil BrainHex é o mundo.** `profileShellTheme.ts` mistura a
cor-assinatura no fundo, na superfície e na borda: o Socializer estuda num app
arroxeado-alaranjado (`#160c16`), o Conqueror num azul-escuro (`#04070e`), o
Achiever num cinza quente (`#08090a`). São sete apps diferentes, e três tabelas
de tom (`real`, `medieval`, `magica`) para calibrar isso.

**A identidade nova diz o contrário: um mundo só.** Azul-meia-noite para todos,
com uma luz âmbar. O perfil não desaparece — ele passa a ser **acento e
ornamento** (a moldura de cristal, o emblema, o totem, o accent dos botões e
gráficos), não o chão.

Isto é uma decisão de produto, não de estilo, e vale dizer o que se ganha e o
que se perde.

**Ganha:**

1. **Uma superfície, uma resposta.** O CLAUDE.md registra que backend, frontend
   e mobile partem da mesma cor-assinatura mas **calculam variantes
   diferentes** — o backend deriva o accent dinamicamente contra
   `surface_elevated`, o frontend usa tons clareados fixos feitos à mão, e nada
   garante que os três concordem. Com a superfície FIXA, o accent de cada perfil
   vira **um número só**, calculável uma vez e copiável para os três lugares. A
   divergência deixa de ser possível por construção.
2. **Três tabelas de tom viram uma.** `THEME_TONES` (`real`/`medieval`/`magica`)
   existe para dar chão diferente a grupos de perfil. Com um mundo só, ela sai.
3. **A cor-assinatura fica mais fiel.** Medido: contra o fundo novo,
   **Seeker, Socializer e Achiever passam em AAA sem nenhum ajuste** — o
   `ensureMinContrast` não precisa mexer neles. Hoje os três são clareados.

**Perde:** a sensação de que o app “é seu”. Sete mundos viram um mundo com sete
sotaques. A compensação está no ornamento — moldura, emblema, totem, guia — que
a biblioteca nova entrega justamente para isso, e que hoje não existe.

## 3. Os tokens

### O mundo (igual para os sete perfis)

| Token | Hex | Onde | Cobertura medida |
| --- | --- | --- | --- |
| `noite-950` | `#010819` | poço, trás do conteúdo | 6,6% |
| `noite-900` | `#020d1f` | **fundo da tela** | 34% somado |
| `noite-800` | `#04162b` | superfície (card) | 7,4% |
| `noite-700` | `#082840` | superfície elevada (modal, item em foco) | 11,2% |
| `noite-600` | `#1a2d3c` | borda sólida, divisor | 3,2% |
| `aco` | `#527a8e` | **ícone e ornamento — nunca texto** (§5) | — |

### A luz (a lanterna da Lumi)

| Token | Hex | Onde |
| --- | --- | --- |
| `luz-100` | `#fef5ae` | núcleo do brilho, faísca |
| `luz-200` | `#f7e6a6` | destaque quente |
| `luz-300` | `#e7d189` | âmbar de texto/ícone |
| `luz-400` | `#deb35c` | âmbar cheio (ícone do app) |

### Texto

| Token | Hex | × fundo | × elevada |
| --- | --- | --- | --- |
| `texto` | `#c9d2df` | 12,75 | 9,92 |
| `texto-medio` | `#97a3b4` | 7,61 | 5,92 |
| `texto-fraco` | `#7d8794` | 5,34 | **4,15** |

### O acento por perfil, contra `noite-700`

Calculado com o mesmo `ensureMinContrast` que o app já usa — só que uma vez, e
não por tema.

| Perfil | Assinatura | Acento | × elevada | × fundo |
| --- | --- | --- | --- | --- |
| Seeker | `#17a398` | `#17a398` *(sem ajuste)* | 4,85 | 6,23 |
| Survivor | `#4e5a66` | `#8997a5` | 5,07 | 6,51 |
| Daredevil | `#d7263d` | `#e56a7a` | 4,81 | 6,18 |
| Mastermind | `#5b3fd9` | `#9583e6` | 4,80 | 6,17 |
| Conqueror | `#1e4fd6` | `#6f90eb` | 4,95 | 6,36 |
| Socializer | `#f4623a` | `#f4623a` *(sem ajuste)* | 4,79 | 6,16 |
| Achiever | `#c9a227` | `#c9a227` *(sem ajuste)* | 6,25 | 8,04 |

## 4. Tipografia

A ficha usa **caixa alta com tracking largo** para todo rótulo, e corpo em sans
leve. O app hoje usa serifa (`Georgia`/`Palatino` via `FontFamily.inikaBold`) —
herança do tema medieval, que a identidade nova não pede.

Proposta, mantendo a escala que já existe:

| Papel | Hoje | Novo |
| --- | --- | --- |
| Título de tela | serifa 17 | sans 600, `letterSpacing` 0.5 |
| Rótulo de seção | serifa 12 caixa alta | sans 600 **11, `letterSpacing` 2.4**, caixa alta |
| Título de item | serifa 14 | sans 600 14 |
| Corpo | sans 12/17 | sans 13/19 |
| Número grande | serifa 20 | sans 600 22, `tabular-nums` |

O tracking largo é o que dá o ar da ficha; sem ele o rótulo caixa-alta fica
apertado e some. **`FontFamily.inikaBold` deixa de mapear para serifa** — e como
ele é usado em ~40 arquivos, a troca é no `GlobalStyle.ts`, não nos chamadores.

## 5. Regra de contraste nova, e uma armadilha

O `#527a8e` que a ficha usa nos ícones dá **4,20 sobre o fundo e 3,27 sobre a
elevada**. Ele passa como componente de UI (mínimo 3:1) e **reprova como texto**.

> **`aco` é cor de ícone e ornamento. Texto nunca.** O piso de texto é
> `texto-fraco` `#7d8794`, e mesmo ele **não vale sobre superfície elevada**
> (4,15). Sobre `noite-700`, o texto mais fraco permitido é `texto-medio`.

Isto é o oposto da regra antiga, que derivava tudo do accent do perfil. Com o
mundo fixo, os três níveis de texto são constantes e dá para testá-los uma vez.

A regra que **continua valendo**: correção de contraste eleva luminosidade
HSL, nunca mistura com branco — misturar apaga a cor-assinatura.

## 6. O ornamento é onde o perfil vive agora

A biblioteca traz o que o app não tinha: **molduras** (anel de cristal facetado
com a estrela de oito pontas na coroa), **totens**, **emblemas**, **cenários**,
**personagens**. Medido nas peças: a linguagem é constante (cristal facetado +
filete dourado + brilho) e **o que varia é o matiz** — há moldura ciano e totem
âmbar do mesmo desenho.

Isso encaixa direto: **a moldura do avatar, o emblema da conquista e o totem da
guilda recebem o matiz do perfil**; o chão não. É assim que o aluno continua
reconhecendo o que é dele sem que o app inteiro mude de cor.

Onde cada um entra:

| Peça | Onde | Já existe algo? |
| --- | --- | --- |
| Moldura | avatar no perfil, no ranking, na aba Social | não — hoje é círculo liso |
| Emblema | `biblioteca-conquistas`, no lugar do gradiente 40×40 | hoje é `LinearGradient` + ícone |
| Totem | guilda (aba Social), marco de tópico concluído | não |
| Cenário | fundo de tópico, tela de cerimônia de portão | `HallBackground` faz um papel parecido |
| Personagem | guia BrainHex; **Lumi no console** | guias existem; Lumi não |

## 7. Lumi é do professor, e o console não tem personagem

A ficha diz **“assistente do professor”**, e as sete funções que ela lista —
chat, sugestões, planejamento, materiais, acompanhamento, orientação,
motivação — são funções de console, não de trilha.

Isso preenche um vazio real: os sete Guardiões BrainHex são do **aluno**
(`GUARDIAN_VOICE_PROFILES`, `_BRAINHEX_GUIDE_PERSONAS`), e o professor não tem
ninguém. A Lumi é a voz do lado que hoje é só formulário.

> Fora de escopo deste documento: o que a Lumi *faz*. Aqui ela entra como
> identidade — rosto, voz visual e as quatro expressões (feliz, pensativo,
> animado, sereno) que a ficha define.

## 8. O que muda, arquivo por arquivo

O CLAUDE.md avisa que os três lugares **não** são a mesma variante calculada e
que mexer num não atualiza os outros. Com a superfície fixa isso deixa de ser
verdade — mas só depois de os três passarem a ler a mesma tabela.

| Arquivo | O que muda | Tamanho |
| --- | --- | --- |
| `microservice/src/constants/brainHex.ts` | nada — as sete assinaturas continuam as mesmas | — |
| `mobile/src/utils/profileShellTheme.ts` | `THEME_TONES` sai; o mundo vira constante; `ensureMinContrast` roda contra `noite-700` | núcleo |
| `mobile/src/styles/GlobalStyle.ts` | `Color` ganha os tokens do mundo; `FontFamily` deixa de mapear serifa | núcleo |
| `frontend/src/lib/personalizacao-theme-guide.ts` | tons clareados à mão saem; passa a ler a tabela dos sete acentos | médio |
| `frontend/src/features/signup/brainhex.ts` | idem | pequeno |
| `api/app/api/v1/personalizacao.py` `_build_design_tokens` | `_ensure_min_contrast` passa a receber `noite-700` fixo | pequeno |
| ~40 componentes do mobile | **nenhuma mudança** — todos leem `palette.*` | zero |

O último item é o que torna isto viável: a troca é na fábrica da paleta, não nos
consumidores. `PrazoBadge`, `CardSemDados`, `biblioteca-conquistas` e os outros
continuam pedindo `palette.surface` e recebendo o valor novo.

## 9. Ordem

| Passo | Entrega | Como se vê |
| --- | --- | --- |
| 1 | Tokens do mundo em `GlobalStyle.ts` + `profileShellTheme` com superfície fixa | o app inteiro muda de chão numa PR |
| 2 | Tipografia (tracking, fim da serifa) | os rótulos ganham o ar da ficha |
| 3 | Frontend e backend lendo a mesma tabela de acentos | a divergência dos três fecha |
| 4 | Moldura e emblema (as duas peças com lugar pronto) | o perfil reaparece como ornamento |
| 5 | Totem, cenário, Lumi no console | depende das telas que ainda não existem |

O passo 1 é reversível e mede-se sozinho: se o app ficar ilegível em algum
canto, é porque aquele canto usava cor fora da paleta — e achar esses cantos é
metade do valor da migração.

## 10. Em aberto

1. **O chão é mesmo um só?** É o que a identidade diz, e este documento assume.
   Se a personalização por perfil precisar continuar sendo o mundo, quase tudo
   acima muda — e o ganho da §2 some junto.
2. **O ícone do app tem quatro variantes, não sete.** A ficha mostra azul,
   âmbar, verde e roxo. Os perfis são sete. Ou o ícone não é por perfil, ou
   faltam três.
3. **A serifa sai mesmo?** Ela é herança do tema medieval e carrega parte da
   identidade atual. A ficha não usa serifa em lugar nenhum, mas trocar a fonte
   de ~40 arquivos é a mudança mais visível da lista.
4. **As peças são PNG de 1 MB cada.** Dezenas delas. Moldura e emblema no mobile
   pedem sprite, SVG ou corte por tamanho — servir PNG de 1 MB por avatar não
   sobrevive ao 3G.

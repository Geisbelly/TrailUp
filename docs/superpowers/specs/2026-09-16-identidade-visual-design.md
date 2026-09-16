# Identidade visual nova — o chão, o véu e o sprite

> Fonte: pasta de identidade no Drive (Logo, Cards, Molduras, Totens, Emblemas,
> Cenários, Personagens). Todos os valores abaixo foram **medidos nos arquivos**
> (quantização, amostragem por percentil de luminância e composição alfa), não
> estimados a olho.

## 0. Correção da primeira leitura deste documento

A primeira versão chamava tudo isto de "o mundo da Lumi" e derivava a paleta
inteira da ficha **“LUMI — assistente do professor”**. As duas coisas estavam
erradas, e a segunda mais do que a primeira.

**A Lumi não nomeia o mundo.** `Personagens/` tem cinco pastas irmãs —
`Bosses`, `Lumi Assistente`, `Mascotes`, `Personagens complementares`,
`Variações`. Ela é uma personagem entre várias, e é **do professor**: a ficha diz
"assistente do professor", e as sete funções que lista (chat, sugestões,
planejamento, materiais, acompanhamento, orientação, motivação) são de console,
não de trilha. Nomear o mundo do aluno com o nome da assistente do professor
inverte de quem é o lugar.

**E a ficha dela não é o sistema.** A ficha é a apresentação de *uma personagem*
— fundo escuro de prancha, que é convenção de character sheet. Generalizar dali
"azul-meia-noite para todos" foi ler o cartaz como se fosse o mapa. Os
**Cenários**, que são a arte que o aluno vê, dizem outra coisa — e é o que a §1
mede.

## 1. O que a arte diz, medido

Amostrei três cenários de grupos diferentes da pasta:

| Arquivo | Matiz dominante | Faixa de luminosidade | O que é |
| --- | --- | --- | --- |
| `20_11_39 (9)` | 259–270° (roxo) | L 34 → 73 | campina noturna, caminho ao centro |
| `20_13_04 (10)` | 259–274° (roxo) | L 16 → 71 | variação mais escura da mesma campina |
| `20_11_46 (10)` | 217–219° (azul) | **L 80 → 93** | reino de nuvem, ilhas flutuantes, quase branco |

Dois fatos que derrubam "um chão só, azul-meia-noite":

1. **O matiz varia** — 259° e 218° não são o mesmo mundo.
2. **O valor varia muito mais** — um cenário tem L16 e outro tem L93. Um é noite
   fechada; o outro é dia de neve.

E dois fatos que dizem para que servem:

3. **Todos os cenários são 941×1672 — razão 0,563, que é 9:16 exato.** É tela de
   celular, não ilustração de card.
4. **Eles têm o miolo vazio de propósito.** Composição em moldura: montanha e
   pedra nas bordas, caminho puxando para o centro, e um vazio no meio grande
   demais para ser acidente.

Enquanto isso, logo, moldura, totem e boss são **RGBA com fundo transparente**;
os cenários são **RGB opaco**. Isso não é detalhe de arquivo — é a arquitetura
da arte declarada no formato: **o cenário é chão, o resto é sprite que se
compõe em cima.**

## 2. O que o chão variável exige: um véu

Se o cenário fosse o fundo direto da tela, o texto morreria. Medido, com
`texto` = `#c9d2df`, comparando o percentil 1 (parte mais escura) com o
percentil 99 (parte mais clara) **da mesma imagem**:

| Cenário | Texto sobre a parte escura | Texto sobre a parte clara |
| --- | --- | --- |
| campina roxa | 8,44 | **1,23** |
| campina escura | 13,03 | **1,42** |
| reino de nuvem | 11,62 | **1,33** |

O mesmo texto vai de 13,0 a 1,2 **dentro de uma imagem só**. Não há cor de texto
que resolva: no reino de nuvem o branco dá 1,14, pior que o cinza-claro.

A saída é um véu de `noite-900` entre o cenário e o conteúdo. Quanto é preciso:

| Cenário | Véu p/ AA (4,5) | Véu p/ AAA (7,0) |
| --- | --- | --- |
| campina roxa | α 0,56 | α 0,72 |
| campina escura | α 0,53 | α 0,70 |
| reino de nuvem | α 0,66 | **α 0,79** |

> **Regra: α 0,80 de `noite-900` cobre os três em AAA.** E é exatamente aí que
> está o problema — **a 80% de opacidade você quase não vê a arte.** Um cenário
> de 1,6 MB atrás de um véu que o apaga é custo sem entrega.

**Corolário de produto, não de estilo:** cenário vai onde há pouco ou nenhum
texto — cerimônia de portão, capa de tópico, encontro de boss, estado vazio,
tela de conquista. Onde há leitura, o fundo é o token sólido. Isso é o oposto de
"trocar o fundo do app pelo cenário".

## 3. As quatro camadas

| Camada | O que é | Formato | Varia? |
| --- | --- | --- | --- |
| **Chão** | cenário 9:16 | PNG RGB | sim — por cena |
| **Véu** | `noite-900` com alfa | token | por tela |
| **UI** | card, texto, borda, botão | token | **não** |
| **Sprite** | moldura, emblema, totem, guia, boss, mascote | PNG RGBA | sim — por perfil/evento |

A camada de UI é a única constante, e é dela que saem os tokens da §4. As outras
três variam — de propósito.

## 4. A inversão que sobrevive

O ponto original continua de pé, e agora por um motivo mais limpo.

**Hoje o perfil BrainHex é o chão.** `profileShellTheme.ts` mistura a
cor-assinatura no fundo, na superfície e na borda: o Socializer estuda num app
arroxeado-alaranjado (`#160c16`), o Conqueror num azul-escuro (`#04070e`), o
Achiever num cinza quente (`#08090a`). São sete apps diferentes, e três tabelas
de tom (`real`, `medieval`, `magica`) para calibrar isso.

**A arte nova não pede isso de volta.** O que varia na arte varia por *cena* e
por *evento* — não por perfil. Nenhum cenário é "o cenário do Mastermind". Então
o perfil sai do chão e vai para o **sprite**: moldura do avatar, emblema da
conquista, totem da guilda, accent de botão e gráfico.

O que se ganha, e é o argumento forte:

1. **Uma superfície, uma resposta.** O `CLAUDE.md` registra que backend,
   frontend e mobile partem da mesma cor-assinatura mas **calculam variantes
   diferentes** — o backend deriva o accent contra `surface_elevated`, o
   frontend usa tons clareados fixos feitos à mão, e nada garante que os três
   concordem. Com a camada de UI fixa, o accent de cada perfil vira **um número
   só**, calculável uma vez. A divergência deixa de ser possível por construção.

   Com uma exceção que a §9.1 detalha: o **inimigo** do painel de batalha tem
   paleta própria, vinda da IA ou de quatro presets em hex cravado. Ela nunca
   partiu da cor-assinatura, então não é divergência a reconciliar — é uma
   quinta autoridade a decidir se entra ou não na paleta do perfil.
2. **Três tabelas de tom viram nenhuma.** `THEME_TONES` existe para dar chão
   diferente a grupos de perfil. Com a UI constante, ela sai inteira.
3. **A cor-assinatura fica mais fiel.** Medido: contra a superfície nova,
   **Seeker, Socializer e Achiever passam em AAA sem nenhum ajuste** — hoje os
   três são clareados pelo `ensureMinContrast`.

**Perde:** a sensação de que o app "é seu" ao abrir. Sete chãos viram sete
sotaques sobre um chão. A compensação é o sprite — que a biblioteca nova entrega
e que hoje não existe.

## 5. Os tokens da camada de UI

Medidos na ficha da Lumi, que continua sendo a peça mais completa de **chrome**
da pasta (painel, luz, divisor, ícone) — agora com o escopo certo: ela documenta
a camada de UI, não o mundo.

| Token | Hex | Onde | Cobertura na ficha |
| --- | --- | --- | --- |
| `noite-950` | `#010819` | poço, trás do conteúdo | 6,6% |
| `noite-900` | `#020d1f` | **fundo da tela / véu** | 34% somado |
| `noite-800` | `#04162b` | superfície (card) | 7,4% |
| `noite-700` | `#082840` | superfície elevada (modal, item em foco) | 11,2% |
| `noite-600` | `#1a2d3c` | borda sólida, divisor | 3,2% |
| `aco` | `#527a8e` | **ícone e ornamento — nunca texto** (§7) | — |

### A luz

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

## 6. O acento por perfil, contra `noite-700`

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

## 7. Duas regras de contraste

> **`aco` é cor de ícone e ornamento. Texto nunca.** O `#527a8e` da ficha dá
> **4,20 sobre o fundo e 3,27 sobre a elevada**: passa como componente de UI
> (mínimo 3:1) e **reprova como texto**. O piso de texto é `texto-fraco`, e mesmo
> ele **não vale sobre superfície elevada** (4,15) — ali o mais fraco permitido é
> `texto-medio`.

> **Texto sobre cenário exige véu de α ≥ 0,80, ou não exige cenário.** §2.

A regra que **continua valendo**: correção de contraste eleva luminosidade HSL,
nunca mistura com branco — misturar apaga a cor-assinatura.

## 8. Tipografia

A ficha usa **caixa alta com tracking largo** para todo rótulo, e corpo em sans
leve. O app hoje usa serifa (`Georgia`/`Palatino` via `FontFamily.inikaBold`) —
herança do tema medieval, que a identidade nova não pede.

| Papel | Hoje | Novo |
| --- | --- | --- |
| Título de tela | serifa 17 | sans 600, `letterSpacing` 0.5 |
| Rótulo de seção | serifa 12 caixa alta | sans 600 **11, `letterSpacing` 2.4**, caixa alta |
| Título de item | serifa 14 | sans 600 14 |
| Corpo | sans 12/17 | sans 13/19 |
| Número grande | serifa 20 | sans 600 22, `tabular-nums` |

O tracking largo é o que dá o ar da ficha. **`FontFamily.inikaBold` deixa de
mapear para serifa** — e como ele é usado em ~40 arquivos, a troca é no
`GlobalStyle.ts`, não nos chamadores.

## 9. Onde cada sprite entra

A linguagem é constante nas peças (cristal facetado + filete dourado + brilho) e
**o que varia é o matiz** — há moldura ciano e totem âmbar do mesmo desenho. É
isso que deixa o perfil colorir o sprite sem tocar no chão.

| Peça | Onde | Já existe algo? |
| --- | --- | --- |
| Moldura | avatar no perfil, no ranking, na aba Social | não — hoje é círculo liso |
| Emblema | `biblioteca-conquistas`, no lugar do gradiente 40×40 | hoje é `LinearGradient` + ícone |
| Totem | guilda (aba Social), marco de tópico concluído | não |
| Cenário | cerimônia de portão, capa de tópico, estado vazio | `HallBackground` faz papel parecido |
| Guia | personagem BrainHex do aluno | existe (`GUARDIAN_VOICE_PROFILES`) |
| **Boss** | painel de batalha — **renderizado, esperando URL** (§9.1) | sim |
| Mascote | nada no sistema — ver §13 | não |
| Lumi | console do professor | não |

### 9.1 As quatro camadas já estão implementadas, e recebem `null`

Este é o achado que reordena a §12 inteira. `IAEnemyVisualSpec`
(`mobile/src/interfaces/personalizacao/IAContracts.ts`) tem exatamente os
campos das camadas da §3 — e `IABattlePanel` **renderiza os quatro**:

| Campo | Linha | Camada da §3 |
| --- | --- | --- |
| `visual.backgroundUrl` | `IABattlePanel.tsx:230` | **chão** (cenário) |
| `visual.effectUrl` | `IABattlePanel.tsx:231` | efeito |
| `visual.avatarUrl` | `IABattlePanel.tsx:209` | **sprite** (boss) |
| `visual.frameUrl` | `IABattlePanel.tsx:277` | **sprite** (moldura, `resizeMode="stretch"`) |

O prompt que alimenta esses campos
(`api/app/agent/prompts/personalizacao_comportamental.txt`) declarava os quatro e
emitia **`null` em todos**. Não faltava código para arte de boss, de cenário e de
moldura: faltava conteúdo, e faltava quem preenchesse a URL.

**Isto foi implementado** (`api/app/services/arte_combate.py`): uma tabela
`preset -> peça`, URL montada sobre `settings.arte_base_url`, catálogo fechado
entregue ao modelo e saneamento antes da validação — URL fora da lista é
descartada. Sem a base configurada as quatro voltam a `None`, que é o
comportamento anterior. As onze peças estão em `api/app/assets/combate/`
(1,0 MB no total, de 15,6 MB de originais) e sobem com
`scripts/subir-arte-de-combate.py`.

E o `backgroundLayer` usa **`opacity: 0.16`** — que é o mesmo que um véu de
α 0,84 da superfície sobre a arte. A §2 mediu que o mínimo para AAA sobre o
cenário mais claro é **α 0,79**. O painel já está do lado certo do limite, por
decisão de quem o escreveu e sem referência a esta medição. **Isso deixa de ser
proposta e vira precedente:** qualquer tela que ponha cenário atrás de texto
copia o número do painel de batalha.

As **cores** do inimigo não vêm de `palette.*`, e isso é deliberado: vêm de
`IAEnemyVisualSpec.palette`, enviada pela IA. O boss é o adversário, não o
aluno. O *chrome* do painel lê `palette.*` normalmente.

O que estava quebrado era o **espelho**: `buildFallbackVisual` casava por
substring (`includes("mech")`, `includes("beast")`) sobre quatro presets, e
nenhum dos sete archetypes da API continha nenhuma delas — todo boss caía no
default laranja. Corrigido: duas tabelas copiadas literalmente do Python, com
teste na API lendo o `.tsx` para impedir que divirjam de novo.

## 10. Lumi, e as cinco famílias de personagem

Os sete Guardiões BrainHex são do **aluno**
(`GUARDIAN_VOICE_PROFILES`, `_BRAINHEX_GUIDE_PERSONAS`); o professor não tem
ninguém. A Lumi preenche esse vazio — é a voz do lado que hoje é só formulário.

> Fora de escopo deste documento: o que a Lumi *faz*. Aqui ela entra como
> identidade — rosto, voz visual e as quatro expressões (feliz, pensativo,
> animado, sereno) que a ficha define. Ela é do console, e o console é web:
> nada do que ela precisa passa pelo `profileShellTheme` do mobile.

## 11. O que muda, arquivo por arquivo

| Arquivo | O que muda | Tamanho |
| --- | --- | --- |
| `microservice/src/constants/brainHex.ts` | nada — as sete assinaturas continuam as mesmas | — |
| `mobile/src/utils/profileShellTheme.ts` | **feito** — `THEME_TONES` saiu; a UI é constante; `ensureMinContrast` roda contra `noite-700` | núcleo |
| `mobile/src/styles/identidade.ts` | **feito** — os tokens da §5, sem import nenhum; `GlobalStyle` reexporta | núcleo |
| `mobile/src/styles/GlobalStyle.ts` | `FontFamily` deixa de mapear serifa — **pendente**, ver §12 | núcleo |
| `frontend/src/lib/personalizacao-theme-guide.ts` | tons clareados à mão saem; passa a ler a tabela da §6 | médio |
| `frontend/src/features/signup/brainhex.ts` | idem | pequeno |
| `api/app/api/v1/personalizacao.py` `_build_design_tokens` | `_ensure_min_contrast` passa a receber `noite-700` fixo | pequeno |
| `api/app/agent/prompts/personalizacao_comportamental.txt` | **feito** — os quatro `null` passam a sair do catálogo `arte_de_combate` (§9.1) | pequeno, e é o de maior efeito visível |
| `mobile/src/components/ia/IABattlePanel.tsx` | decidir se a paleta do inimigo passa a sair de `palette.*` ou continua própria | médio |
| ~40 componentes do mobile | **nenhuma mudança** — todos leem `palette.*` | zero |

O último item é o que torna isto viável: a troca é na fábrica da paleta, não nos
consumidores. `PrazoBadge`, `CardSemDados`, `biblioteca-conquistas` e os outros
continuam pedindo `palette.surface` e recebendo o valor novo.

## 12. Ordem

| Passo | Entrega | Como se vê |
| --- | --- | --- |
| ~~1~~ | **feito** — tokens em `mobile/src/styles/identidade.ts` + `profileShellTheme` com UI fixa | o app inteiro mudou de chão |
| 2 | Tipografia (tracking, fim da serifa) — **não é uma linha**: sem fonte empacotada, trocar a serifa por `System` achata o peso de todo título no iOS | os rótulos ganham o ar da ficha |
| 3 | Frontend e backend lendo a tabela da §6 | a divergência dos três fecha |
| 4 | Moldura e emblema (as duas peças com lugar pronto) | o perfil reaparece como sprite |
| ~~5~~ | ~~URL de arte no prompt de combate~~ — **feito**; falta subir as peças e definir `ARTE_BASE_URL` | boss, cenário e moldura aparecem sem uma linha de componente nova (§9.1) |
| 6 | Cenário com véu α 0,84 nas telas sem texto | cerimônia e capa de tópico |
| 7 | Totem, mascote, Lumi no console | depende de decisão de produto, não de estilo |

O passo 1 é reversível e mede-se sozinho: se o app ficar ilegível em algum
canto, é porque aquele canto usava cor fora da paleta — e achar esses cantos é
metade do valor da migração.

## 13. Em aberto

1. **Mascote não tem nada no sistema.** Zero ocorrências em `mobile/src`,
   `frontend/src`, `api/app`, `microservice/src`. Boss tem lugar pronto (§9.1),
   guia tem, moldura e emblema têm — mascote é a única família de personagem sem
   destino. Ou ganha um papel, ou fica parada como as quatro tabelas sociais
   ficaram.
2. **O que escolhe o cenário fora do combate?** Dentro do combate a pergunta
   **já tem resposta**: a IA preenche `visual.backgroundUrl` (§9.1). Fora dele —
   capa de tópico, cerimônia de portão, estado vazio — não há campo, coluna nem
   chave. Vale estender o mesmo contrato, ou inventar outro?
3. **A serifa sai mesmo?** Ela é herança do tema medieval e carrega parte da
   identidade atual. A ficha não usa serifa em lugar nenhum, mas trocar a fonte
   de ~40 arquivos é a mudança mais visível da lista.
4. **O ícone do app tem quatro variantes, não sete.** A ficha mostra azul,
   âmbar, verde e roxo. Ou o ícone não é por perfil, ou faltam três.
5. **As peças são PNG de 1 a 2 MB cada.** Dezenas delas. Moldura e emblema no
   mobile pedem sprite sheet, SVG ou corte por tamanho — e cenário de 1,6 MB
   atrás de um véu de 80% é o pior custo-benefício da lista.

# A loja no mobile — desenho

> Continuação de `2026-09-12-economia-moedas-e-loja-design.md`, que cobre banco,
> razão, RPC e RLS. Aqui é só a superfície: onde a loja aparece no app do aluno,
> com que peças visuais, e como a compra acontece.

Nada disto existe ainda. A fase 1 (razão e ganho) e a fase 2 (itens e
`loja_comprar`) são pré-requisitos; este documento é o que se constrói em cima
delas.

## 1. A decisão principal: a venda não acontece na loja

O #144 traz O'Donovan et al.: extensão de prazo 74 compras, refazer quiz 1,
recompensa coletiva 1, dica quase nada. A leitura fácil é "o item de prazo é
bom". A leitura certa é **onde o item aparecia**: o prazo apertava, a tela
mostrava o aperto, e a saída estava ali. Ninguém foi a um catálogo.

Em TrailUp o que aperta não é o prazo — são 0 de 248 atividades com
`data_entrega`. É a **nota congelada**: 86 revisões em 73 atividades distintas,
65 das 68 linhas de `atividade_aluno` paradas em zero, e refazer nunca contou.
O aluno já volta; o app só não tem o que oferecer quando ele volta.

Então o desenho tem **dois pontos de venda e um catálogo**, e o catálogo é o
menos importante dos três:

| Onde | Quando aparece | Item |
| --- | --- | --- |
| **Faixa na atividade em revisão** | `reviewMode` verdadeiro — o aluno reabriu algo já concluído | `refazer_atividade` |
| **`PrazoBadge` atrasado** | selo já existe e já fica vermelho; ganha toque | `prazo_extra` |
| **`social/loja`** | quando o aluno vai procurar | todos |

`ActivityRenderer` **já recebe `reviewMode`** (`trilha/[id].tsx` passa
`isAtividadeConcluida(...)`), e `QuestionActivity` já ramifica nele. O ponto de
enxerto existe: é uma faixa a mais no mesmo lugar onde hoje a revisão só avisa
que não vale nada.

**A faixa aparece mesmo para quem não tem saldo**, com `faltam N moedas` no
lugar do botão. É onde o aluno descobre para que a moeda serve, e o momento em
que ele quer a coisa é o único momento em que a explicação gruda. O risco
declarado é virar propaganda do inalcançável — o que segura isso é o preço: a 5
moedas, "faltam 3" é uma tarde de estudo, não um mês. Se a calibragem mudar e o
item ficar caro, esta decisão precisa ser revista junto.

## 2. Onde a loja mora — e a aba Social que já era devida

**Decidido: a carteira vive numa aba Social nova.** O que começou como "onde
ponho o chip de moedas" esbarrou numa coisa maior, e vale contar na ordem em
que apareceu.

O app tem quatro abas (Trilha, Notificações, Ranking, Perfil) e um sistema de
portões em `utils/portoes.ts`, que segura funcionalidade até o aluno ter
capacidade de usá-la — Fogg, e o mesmo dano que o corte de 15 posições evita.
São **dois** portões: `rank` e `social`.

O portão `rank` funciona: `_layout.tsx:137` faz `href: aberturas.rank ?
undefined : null`, e a aba aparece quando abre.

**O portão `social` não é lido por ninguém.** `aberturas.social` é calculado,
a cerimônia dispara ao concluir o primeiro conteúdo, e o texto que ela mostra
ao aluno é este:

> **Amizades liberadas** — Agora você pode se conectar com colegas da turma e
> acompanhar o avanço de quem você escolher.
> · Envie um convite para um colega da turma.
> · A amizade só existe quando os dois aceitam.
> · Você pode desfazer ou bloquear quando quiser.

E não há para onde ir. Nenhuma aba, nenhuma tela, nenhum botão.

Pior — ou melhor: **o backend existe e tem dado**. Quatro tabelas no Supabase,
conferidas agora:

| Tabela | Linhas | O que guarda |
| --- | --- | --- |
| `social_relacionamentos` | 3 | `aluno_a`/`aluno_b`, `solicitante_id`, `status`, `blocked_by_id` — exatamente o "só existe quando os dois aceitam" e o "bloquear" da cerimônia |
| `social_mensagens` | 2 | remetente, destinatário, texto |
| `guildas` | 3 | `classe_id`, nome, emblema, `limite_membros`, `perfil_alvo` |
| `guilda_convites` | 5 | convidante, convidado, status |

**Nenhuma linha de código no monorepo lê ou escreve as quatro** — conferido em
`mobile/src`, `frontend/src` e `api/app`. É o padrão que o CLAUDE.md chama de
"módulo com cara de vivo que ninguém chama", só que ao contrário: aqui é o
backend inteiro, com dado dentro, esperando uma tela — e uma cerimônia que já
anuncia a funcionalidade para o aluno.

Então a aba Social não é custo novo do sistema de moedas. Ela é a dívida que o
portão `social` já cobrava, e a carteira é só mais um morador dela:

```
(tabs)/
  index      Trilha
  social     ← NOVA: href = aberturas.social ? undefined : null
  ranking    (já existe, já portãoada)
  notificacoes
  perfil
```

Cinco abas é o teto do que a barra comporta em tela de telefone; mais que isso
e os rótulos começam a truncar. Se apertar, **Notificações é a candidata a
sair** da barra — ela já tem push e o sino pode voltar para o cabeçalho —, mas
isso é decisão de outra conversa e não precisa ser tomada agora.

### O que a aba Social guarda

| Seção | Fonte | Estado |
| --- | --- | --- |
| **Carteira** — saldo, ganho, gasto, atalho para loja e extrato | `vw_moedas_saldo` | a construir (fase 1) |
| **Colegas** — pedidos, amizades, bloquear | `social_relacionamentos` | tabela pronta, sem cliente |
| **Guilda** — membros, convites, emblema | `guildas`, `guilda_convites` | tabela pronta, sem cliente |
| **Recados** | `social_mensagens` | tabela pronta, sem cliente |

A loja em si continua sendo tela de **stack**, não de aba — ela é destino de
momento, não de todo dia:

```
social/
  index.tsx            ← carteira, colegas, guilda
  loja.tsx             ← vitrine
  loja-extrato.tsx     ← o razão do aluno
```

Títulos em caixa alta, como os irmãos do perfil (`"LOJA"`, `"EXTRATO DE
MOEDAS"`), com o mesmo `Stack` que `perfil/_layout.tsx` já configura —
`palette.background` no header, `FontFamily.inikaBold` 15 no título.

**Moeda não é XP, e a barra precisa deixar isso claro.** Ícone diferente do
pódio (`circle-multiple`) e rótulo explícito. Ranking e Social ficam lado a
lado justamente onde a confusão é possível, então a diferença tem de estar no
ícone, não só no número.

> **Alcance:** desenhar a aba Social inteira — amizade, guilda, recados — é
> trabalho maior que a loja, e este documento não faz isso. O que ele fixa é:
> a carteira mora lá, a aba é criada com a carteira, e as outras três seções
> entram quando alguém desenhar cada uma. Uma aba Social que na fase 1 só tem
> carteira é honesta; um chip de moeda perdido no Perfil, não.

## 3. A gramática visual, extraída do que existe

Nada inventado. Estes números saíram de `biblioteca-conquistas.tsx`, que é o
catálogo que já funciona:

| Peça | Valor |
| --- | --- |
| Tela | `paddingHorizontal: 18, paddingTop: 16, paddingBottom: 38`, `HallBackground` |
| Card de resumo | `borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 10` |
| Métrica do resumo | valor `inikaBold 20`, rótulo `interMedium 11`, três por linha |
| Divisória | `OrnamentDivider`, `opacity: 0.75, marginBottom: 12` |
| Título de seção | `inikaBold 17` + subtítulo `interMedium 12` |
| Rótulo de grupo | `inikaBold 12, uppercase, letterSpacing 0.5` |
| Item | `flexDirection: row, borderBottomWidth: 1, paddingVertical: 12` |
| Ícone | wrap `borderWidth 1, borderRadius 22` + `LinearGradient 40×40, borderRadius 20` |
| Título do item | `inikaBold 14`, uma linha |
| Descrição | `interMedium 12, lineHeight 17`, duas linhas |
| Selo | `borderRadius 999, paddingH 7, paddingV 2, fontSize 9, letterSpacing 1` |
| Chip | `borderRadius 999, paddingH 9, paddingV 5, gap 5, fontSize 10` |
| Barra | `height 6, borderRadius 999` |

Cores sempre de `getProfileShellPalette(perfil)` — `background`, `surface`,
`surfaceElevated`, `border`, `borderStrong`, `text`, `textMuted`, `textSubtle`,
`accent`. Nenhum hex solto na tela.

### A barra de progresso vira barra de "quanto falta"

A peça mais reaproveitável do catálogo de conquistas é o `track`/`fill`: uma
barra de 6px que diz o quanto falta para destravar. Na loja ela diz exatamente a
mesma coisa em outra moeda — **saldo contra preço**. Item que o aluno pode pagar
não mostra barra; item caro demais mostra a barra cheia até `saldo / preço` e o
texto `faltam N`. É informação real no lugar de um botão cinza.

### A cor da moeda

`biblioteca-conquistas` já deriva um dourado do accent do perfil
(`tinycolor(shellPalette.accent).lighten(10)`), e é isso que a moeda usa também —
medalha e moeda ficam da mesma família, e a loja não introduz uma terceira
lógica de cor. Vale dizer o que isso implica: **a moeda muda de cor por perfil**
(de `#b9adef` no Mastermind a `#dbb848` no Achiever). Aceitável porque o ícone
carrega o significado e a conquista já se comporta assim; inaceitável seria
misturar com branco, que o CLAUDE.md proíbe por desaturar o accent.

Contraste conferido com o algoritmo real de `ensureMinContrast` nos sete perfis:
o accent sobre `surfaceElevated` fica entre **4,52 e 5,34** — acima do mínimo de
4,5 que a própria função persegue.

## 4. Estados do item, e por que cinco

| Estado | O que o aluno vê | Por que existe |
| --- | --- | --- |
| `disponivel` | preço em dourado, item tocável | o caso normal |
| `sem_saldo` | barra `saldo/preço` + `faltam N` | dizer o quanto falta motiva; "indisponível" não |
| `sem_alvo` | esmaecido + `nada para aplicar ainda` | `refazer_atividade` sem nenhuma atividade concluída não é falta de dinheiro, e confundir os dois faz o aluno juntar moeda para nada |
| `ativo` | selo `EM USO` + onde está aplicado | compra não consumida é posse, e posse invisível parece dinheiro sumido |
| `esgotado` | selo `NO LIMITE` | teto de dias de prazo atingido — o teto é configurável e precisa ser visível, não descoberto no erro |

O `sem_alvo` é o que separa esta tela de uma vitrine genérica: o item **tem
alvo**, e sem alvo elegível ele não deveria estar à venda.

## 5. O fluxo de compra

```
item tocado
   │
   ├─ precisa de alvo? ──► seletor de alvo
   │                        (atividades elegíveis, agrupadas por tópico,
   │                         com a nota congelada visível em cada linha)
   │
   └─► CompraModal ──► confirma ──► loja_comprar() ──► relê saldo ──► toast
                          │
                          └─ cancela
```

`CompraModal` reaproveita a forma de `ConquistaModal` (já existe, mesma
natureza: detalhe de um item sobre a tela). O que ele mostra, nesta ordem:

1. **O que muda** — em uma frase, no concreto: *"Você refaz 'Função do
   Middleware' e a nota nova conta. A de agora é 20%."*
2. **Preço e saldo** — `5 moedas · você tem 28 → ficam 23`.
3. **O que não muda** — *"Seus pontos e sua posição no ranking não mudam."*
   Existe porque a primeira pergunta de quem gasta é se vai perder posição, e o
   #142 separa as duas moedas justamente para que não perca.

Confirmação usa `useDialog()` quando a compra for destrutiva ou irreversível;
para o caso comum, o próprio modal é a confirmação — dois diálogos em sequência
para gastar 5 moedas é cerimônia demais.

## 6. A compra não entra na fila durável

Esta é a decisão técnica que mais importa, e ela cai da estrutura que já existe.

`progressoOutbox` existe porque **progresso já aconteceu**: o aluno concluiu, e
persistir depois é teimosia útil. Por isso a validade é de 30 dias e o teto é
alto — "ponto não estraga", diz o próprio arquivo.

Compra é o contrário em três pontos:

1. **Pode falhar por saldo.** Enfileirar é dizer "comprado!" e descobrir horas
   depois que não deu — e o aluno terá contado com um item que não existe.
2. **`EscritaPendente` nem comporta.** A fila serializa `upsert` e `insert` em
   tabela; `loja_comprar` é RPC. Encaixá-la ali seria alargar a fila para um
   caso que não quer a fila.
3. **O aluno está olhando.** A compra é o único momento do app em que ele espera
   uma resposta imediata. Silêncio aqui é pior que erro.

Então: **compra é síncrona e online**. Sem rede, o botão fica desabilitado com
`precisa de conexão` — honesto e barato.

**A chave de idempotência continua obrigatória**, pelo motivo oposto ao da fila:
o pedido pode ter chegado e a resposta ter se perdido. A chave nasce **antes da
primeira tentativa** e o retry usa a MESMA chave — é a mecânica de
`eventos_aluno.idempotencia_key` (`20260911_02`), onde gerar a chave na hora de
reenviar duplicaria o ponto. No máximo duas tentativas, com o aluno na tela.

## 7. O saldo não é calculado no cliente

O saldo vem de `vw_moedas_saldo`. O app **nunca** soma ou subtrai localmente
para adiantar a interface.

Não é purismo: é a espinha deste repositório. O percentual do tópico, o tempo de
estudo e o ranking já foram calculados no cliente, e as três vezes o número do
cliente passou por cima do número certo — `buildFallbackRankRows` rodava no
caminho normal fazendo a conta errada, e `?? 0` zerava a taxa de acertos de quem
só abriu a tela. Saldo é dinheiro: um número que pisca é um número em que o
aluno não acredita.

Depois de comprar, relê. Enquanto relê, o botão mostra estado de envio — não um
saldo novo chutado.

## 8. Offline, item por item

| O quê | Sem rede |
| --- | --- |
| Catálogo (itens, preços, descrições) | cache local; muda pouco, e vitrine vazia é pior que vitrine velha |
| Saldo | último lido, com `atualizado há X` — nunca apresentado como atual |
| Compra | bloqueada, com o motivo na tela |
| Extrato | último lido |

## 9. O extrato

`social/loja-extrato.tsx` — o razão do aluno, ganho e gasto, do mais novo para o
mais velho. Forma de lista igual à de `notificacoes/index.tsx`: ícone, título,
timestamp, uma linha de detalhe.

Existe por dois motivos. O #142 pede razão append-only para poder auditar de
onde veio a moeda; e no app, é isso que faz o aluno confiar no saldo. Economia
sem extrato é saldo que o aluno não sabe de onde veio nem para onde foi — e a
primeira suspeita cai sobre o app.

Cada linha diz a origem no concreto: `+2 · Concluiu "Sistemas Abertos"`,
`−5 · Refazer "Função do Middleware"`.

## 10. O que mais precisa acontecer

- **Tour.** `SectionGuideButton` + `registrarAlvoTour` já cobrem as telas do
  perfil; a loja entra com os mesmos passos, e o primeiro passo é a carteira.
- **Telemetria.** A loja é tela de estudo? Não. Mas a compra é o evento que a
  métrica do #133 precisa — e ela já cai no razão, com timestamp. Nenhuma
  instrumentação nova.
- **Acessibilidade.** `PrazoBadge` já compõe `accessibilityLabel` a partir do
  rótulo e da data; o item da loja faz o mesmo com preço e estado, senão o leitor
  de tela anuncia "5" sem dizer 5 do quê.

## 11. Ordem de construção

| Passo | Entrega | Dá para ver funcionando |
| --- | --- | --- |
| 1 | **Aba Social** com a carteira + `loja-extrato` | o aluno vê moeda entrando, sem nada para gastar — e o portão `social` deixa de mentir |
| 2 | `social/loja` com catálogo e estados | a vitrine, ainda sem comprar |
| 3 | `CompraModal` + `loja_comprar` + seletor de alvo | a compra |
| 4 | Faixa em `reviewMode` | **o ponto de venda que importa** |
| 5 | Toque no `PrazoBadge` atrasado | depende de o professor marcar prazo |

O passo 1 é entregável sozinho e é o que valida a economia antes de existir
qualquer botão de gastar — mesma lógica da fase 1 do desenho do banco.

## 12. Decidido

As três perguntas que este documento abriu foram respondidas. Ficam aqui com o
que cada resposta arrastou junto.

1. **A faixa de `reviewMode` aparece para quem não tem saldo — sim.** Com
   `faltam N moedas` no lugar do botão (§1). É a tela que ensina para que a
   moeda serve, no único momento em que o aluno quer saber.

2. **Refazer mantém a MELHOR nota, não a última.** O gatilho apara para cima
   (`GREATEST`), e isso alinha `atividade_aluno` com
   `personalizacao_item_progresso`, que já funde acertos por máximo — duas
   tabelas de progresso passam a responder a mesma coisa quando o aluno repete,
   em vez de uma guardar a melhor e a outra a última. Detalhe em
   `2026-09-12-economia-moedas-e-loja-design.md`, §5.2.

   Duas consequências para esta tela: o `CompraModal` ganha a frase que torna o
   item seguro de comprar (*"Se você for melhor, a nota sobe. Se for pior, fica
   a que você já tinha"*), e a tela de resultado **precisa** dizer quando a nota
   não mudou (*"você fez 15%, sua nota continua 20%"*). Sem isso, gastar 5
   moedas e ver o mesmo número parece defeito.

3. **A carteira vive numa aba Social nova** — nem Perfil, nem Ranking (§2). A
   pergunta era onde pôr um chip e a resposta descobriu uma dívida: o portão
   `social` de `portoes.ts` dispara uma cerimônia prometendo amizades, quatro
   tabelas existem no banco com dado dentro, e nada no monorepo as lê. A aba
   nasce com a carteira e abre espaço para o resto.

## 13. Em aberto

1. **A barra comporta cinco abas?** No papel sim; em telefone estreito os
   rótulos podem truncar. Se apertar, Notificações é a candidata a sair da
   barra — ela já tem push e o sino cabe num cabeçalho.
2. **O alvo de `recompensa_coletiva` é a guilda ou a turma?** Com `guildas` já
   existindo, presentear 5 companheiros é um gesto e presentear 40 colegas é
   diluição. Fica para quando a seção de guilda for desenhada.
3. **Quem desenha amizade, guilda e recados?** Este documento não faz isso — ele
   só reserva o lugar. As três seções têm backend pronto e nenhuma tela.

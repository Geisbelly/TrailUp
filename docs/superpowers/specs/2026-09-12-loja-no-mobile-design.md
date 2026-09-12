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
| **`perfil/loja`** | quando o aluno vai procurar | todos |

`ActivityRenderer` **já recebe `reviewMode`** (`trilha/[id].tsx` passa
`isAtividadeConcluida(...)`), e `QuestionActivity` já ramifica nele. O ponto de
enxerto existe: é uma faixa a mais no mesmo lugar onde hoje a revisão só avisa
que não vale nada.

## 2. Onde a loja mora

**Não é uma quinta aba.** São quatro (Trilha, Notificações, Ranking, Perfil) e a
loja não é destino diário — é destino de momento. Uma aba permanente para algo
que se visita uma vez por semana rouba espaço de quem se visita todo dia.

A loja é uma tela do **stack do Perfil**, irmã de `biblioteca-conquistas`: mesma
natureza (catálogo com estado por item), mesmo cabeçalho, mesma navegação.

```
perfil/
  index.tsx            ← chip de carteira no cabeçalho
  biblioteca-conquistas.tsx
  loja.tsx             ← NOVO: vitrine
  loja-extrato.tsx     ← NOVO: o razão do aluno
```

Títulos em caixa alta, como todos os irmãos (`"LOJA"`, `"EXTRATO DE MOEDAS"`),
via `perfil/_layout.tsx`, que já aplica `palette.background` no header e
`FontFamily.inikaBold` 15 no título.

**A carteira aparece onde o ponto já aparece**: chip no cabeçalho do perfil e no
ranking. Mas moeda não é XP — ícone diferente (`circle-multiple` em vez de
`podium`) e rótulo explícito, senão o aluno soma as duas coisas de cabeça.

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

`perfil/loja-extrato.tsx` — o razão do aluno, ganho e gasto, do mais novo para o
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
| 1 | Chip de carteira no perfil + `loja-extrato` | o aluno vê moeda entrando, sem nada para gastar |
| 2 | `perfil/loja` com catálogo e estados | a vitrine, ainda sem comprar |
| 3 | `CompraModal` + `loja_comprar` + seletor de alvo | a compra |
| 4 | Faixa em `reviewMode` | **o ponto de venda que importa** |
| 5 | Toque no `PrazoBadge` atrasado | depende de o professor marcar prazo |

O passo 1 é entregável sozinho e é o que valida a economia antes de existir
qualquer botão de gastar — mesma lógica da fase 1 do desenho do banco.

## 12. Em aberto

1. **A faixa de `reviewMode` aparece para quem não tem saldo?** Proposta: sim,
   mostrando `faltam N moedas` — é o que ensina o aluno de que a moeda serve
   para alguma coisa. O risco é virar propaganda de algo inalcançável.
2. **Refazer substitui a nota ou fica a melhor?** O upsert de `atividade_aluno`
   **sobrescreve** hoje. Sobrescrever é mais honesto (a nota é a da última
   tentativa); "fica a melhor" é mais gentil e é o que `personalizacao_item_progresso`
   faz para percentual. As duas defensáveis, e a escolha muda o texto do
   `CompraModal`.
3. **Chip de carteira no Ranking também, ou só no Perfil?** No Ranking ele fica
   ao lado da pontuação, que é exatamente onde o aluno pode confundir as duas.

Tela 12 — **Loja**. Arquivo novo: `v3/12-loja.html`. Item ativo da sidebar: **Loja**. Perfil de exemplo: Conqueror (Amina T.). Use `v3/06-social.html` e `v3/08-perfil-hub.html` como referência de shell, cabeçalho, card lateral e seletor de estado/perfil.

## 1. O que a página precisa responder

O aluno chega aqui com quatro perguntas, nesta ordem. A página responde todas sem rolar muito:

1. **Quanto eu tenho?** (saldo)
2. **O que dá para pegar, e o que já tenho de graça?** (itens + dotação)
3. **Quanto ainda posso usar?** (limites da turma)
4. **De onde veio e para onde foi?** (extrato)

E uma quinta, que ele não pergunta mas precisa saber: **como ganhar mais**.

## 2. Grade (1164px úteis)

```
[seletor flutuante: estado + perfil]
┌ cabeçalho: eyebrow RECURSOS DA JORNADA / H1 Loja / subtítulo ─────────────────────────────────┐
┌ coluna principal (8/12 = 769,33) ────────────────────┐ ┌ coluna lateral (4/12 = 374,67, sticky top 28) ┐
│ SALDO (card herói)                                    │ │ Na sua Bag                                    │
│   38 + moeda  ·  "Como ganhar" (4 linhas)             │ │ Limites da turma                              │
│ ITENS (4)                                             │ │ Extrato                                       │
│   grade 2 colunas, 4 cards                            │ │                                               │
└───────────────────────────────────────────────────────┘ └───────────────────────────────────────────────┘
```
Mesmo esqueleto do Social e do Ranking: cabeçalho na largura toda, `grid-template-columns: minmax(0,8fr) minmax(0,4fr)`, gap 20. A coluna lateral é **um card** (fundo `surface`, borda `border`, raio 16, `padding 22px 20px`), sticky, com conteúdo até o fim.

## 3. Cabeçalho
- Eyebrow **"RECURSOS DA JORNADA"** (é o eyebrow do `JourneyHeading` da loja no app).
- H1 **"Loja"**.
- Subtítulo: **"Troque moedas por recursos que ajudam no estudo."**
- Sem botões à direita (a Geis já estranhou chip e recarregar sem função no Social).

## 4. Coluna principal

### 4.1 Saldo (card herói)
Card com `linear-gradient(160deg, elev, surface)`, raio 16, `padding 24px 26px`, duas metades lado a lado (grid `1fr 1fr`, gap 24, separadas por `border-left: 1px solid line` na segunda):

**Esquerda, o saldo:**
- Eyebrow **"SEU SALDO"** (texto do app).
- Número **38** em Georgia 700 48, tabular, com `coin-<perfil>.png` 56px ao lado.
- Texto 13 `textMuted`, 2 linhas: **"Suas moedas vêm do estudo. Gastar nunca muda seu XP nem sua posição no ranking."** (decisão 4 do desenho da economia).

**Direita, "Como ganhar":**
- Título 13/700 "Como ganhar".
- 4 linhas de 32px: rótulo à esquerda, valor à direita (Inter 700, tabular, `accent`):

| Ação | Moedas |
|---|---|
| Concluir um conteúdo | +2 |
| Concluir uma atividade | +3 |
| Acertar uma atividade | +1 |
| Revisar uma atividade | +0 |

  Valores da semente de `eventos_pontuacao.moedas` (`20260912_02_ganho_de_moedas.py`).
- Nota 12 `textSubtle`: **"Cada ação paga uma vez só. Revisar não paga, para refazer não virar fonte de moedas."** (decisão 5 e §3.2 do desenho).

### 4.2 Itens
Título de bloco igual ao do Social (eyebrow `accent` 12/600 + chip neutro com o número): **"ITENS"** `4`. Uma seção só; nada de abas Combos/Bônus/Presentes.

Grade de **2 colunas**, gap 16. Cada card: fundo `surface`, borda `border`, raio 16, `padding 18px 20px`, `display:flex; flex-direction:column; gap 12`:

1. **Topo:** arte do item (60×68, `object-fit: contain`) + nome (Georgia 700 18) + descrição (13/1.5 `textMuted`). Arte e textos:

| Ordem | Código | Nome | Descrição (do banco) | Arte |
|---|---|---|---|---|
| 1 | `prazo_extra` | Prazo extra | Adia a entrega de uma atividade em 24 horas, sem penalidade. | `deadline-<perfil>.png` |
| 2 | `segunda_chance` | Segunda chance | Refaz a atividade valendo nota: 90% da melhor tentativa mais 10% da pior. | `retry-<perfil>.png` |
| 3 | `dica` | Dica | Explica por que a alternativa errada está errada. Não entrega a resposta. | `hint-<perfil>.png` |
| 4 | `troca_formato` | Trocar formato | Escolhe como receber o próximo material: áudio, texto ou slides. | `book-<perfil>.png` |

   (O banco grava sem acento; na tela, com acento.) Mapeamento de arte = `storeIconKind` do app.

2. **Chips** (linha, gap 6), só os que se aplicam:
   - Dotação: **"1 grátis restante"** (chip `accent`). Some quando acaba.
   - Já tem na Bag: **"1 na sua Bag"** (chip neutro com `bag-<perfil>.png` 14).
3. **Rodapé do card** (`border-top: 1px solid line`, `padding-top 12`, `display:flex; align-items:center; gap 12`):
   - Preço à esquerda: moeda 20 + valor Inter 700 16. Se a próxima unidade é gratuita: **"Grátis"** e, abaixo, 11.5 `textSubtle`: "Depois: 10 moedas, dobrando a cada unidade" (só nos itens com fator 2).
   - Botão à direita (pílula, altura 38). Rótulo por estado, na tabela 4.3.

**Dados da Amina** (saldo 38, turma 6º ano B):

| Item | Dotação da turma | Usadas | Comprou antes | Próxima unidade | Estado do card |
|---|---|---|---|---|---|
| Prazo extra | 2 | 1 | 0 | grátis | **Disponível · grátis** |
| Segunda chance | 1 | 0 | 0 | grátis | **Bloqueado pelo gate de revisão** |
| Dica | 0 | — | 1 (já usada) | 5 | **Disponível · pago** |
| Trocar formato | 0 | — | 1 (na Bag) | 4 | **Disponível · pago**, chip "1 na sua Bag" |

### 4.3 Estados do card

| Estado | Botão | Extra no card |
|---|---|---|
| Disponível, grátis | primário **"Pegar grátis"** | — |
| Disponível, pago | primário **"Comprar"** | — |
| Saldo insuficiente | desabilitado **"Faltam N moedas"** | barra de 6px `saldo/preço` acima do botão (gramática da biblioteca de conquistas: "quem pode pagar não vê barra") |
| Bloqueado (gate) | desabilitado **"Bloqueado"** | caixa 13 `elev`, raio 12: cadeado + "Libera depois que você revisar o material do tópico por pelo menos 2 minutos." + link **"Revisar Frações →"** (`03-trilha.html`) |
| Indisponível na turma | desabilitado **"Indisponível"** | texto 12 `textSubtle`: "Seu professor desligou este item nesta turma." |
| Limite atingido | desabilitado **"Limite atingido"** | texto: "Você já usou os 4 dias de prazo extra do semestre." |
| Comprando | spinner + **"Comprando..."** | os outros botões ficam desabilitados (trava de compra do app) |

Na Segunda chance, sempre uma nota 12 `textSubtle` no pé: **"Também aparece quando você revisa uma atividade."** (o ponto de venda principal no app é a faixa na atividade em revisão, §9.2 do desenho).

### 4.4 Comprar
1. Clique em "Comprar" ou "Pegar grátis" abre **confirmação** (diálogo pequeno, raio 18, borda `borderStrong`):
   - Título: **"Comprar Dica?"** (ou **"Pegar Prazo extra?"** quando grátis).
   - Texto: **"Fica guardada na sua Bag até você usar numa questão."** Prazo extra: "…até você usar numa atividade com prazo." Segunda chance: "…até você refazer uma atividade." Trocar formato: "…até o próximo material."
   - Linha de conta, tabular: **"Saldo: 38 → 33"** (pago) ou **"Não gasta moedas"** (grátis).
   - Botões: **"Cancelar"** · **"Comprar"** / **"Pegar"**.
2. Confirmou: botão do card em "Comprando..." por ~0,8s.
3. Sucesso: aviso **dentro do card** (borda `accent`, check): **"Dica guardada na sua Bag."** (o app usa "{item} adquirido."; na web o destino importa mais). O saldo muda no herói **e** na sidebar; o extrato ganha a linha "−5 · Compra · Dica · agora"; o chip "1 na sua Bag" aparece; "Na sua Bag" (lateral) ganha o item. Grátis: a dotação desce ("1 grátis restante" some) e o card mostra o preço pago da próxima.
4. Falha de negócio: aviso dentro do card com as mensagens do app (`purchaseErrorMessage`): **"Saldo insuficiente para este item."**, **"Este item não está disponível nesta turma."**, **"Esta compra já está sendo processada."** Nada muda no saldo.

## 5. Coluna lateral

### 5.1 Na sua Bag
- Título de seção (12, `textSubtle`, caixa alta): **"NA SUA BAG"**.
- Lista dos itens comprados ainda não usados, linhas de 48px: arte 32 + nome + "×1" à direita. Dados: **Trocar formato ×1**.
- Botão secundário largura toda: `bag-<perfil>.png` 18 + **"Abrir Bag"** (é o mesmo destino do botão da Bag na topbar).
- Vazio: "Nada guardado ainda. O que você comprar fica aqui até usar."

### 5.2 Limites da turma
- Título: **"LIMITES · 6º ANO B"**.
- **Prazo extra:** "1 de 4 dias usados neste semestre" + barra 6px (25%) + 12 `textSubtle` "Até 2 dias por atividade". (O desenho cita exatamente "2 de 4 dias usados neste semestre" como o que o aluno vê; `prazo_max_dias_total` e `prazo_max_por_ativ` da turma.)
- **Segunda chance:** "Até 1 por tópico" + "24 horas entre uma tentativa e outra".
- Nota 12 `textSubtle`: "Quem define esses limites é seu professor."

### 5.3 Extrato
- Título: **"EXTRATO"**.
- Últimas 6 entradas, linhas de 44px: valor à esquerda (Inter 700 tabular; entrada `success` com "+", saída `textMuted` com "−") + descrição 13 + data 11.5 `textSubtle` à direita.

| Valor | Descrição | Quando |
|---|---|---|
| +3 | Atividade concluída · Equações do 1º grau | Hoje, 18:40 |
| +1 | Acerto · Equações do 1º grau | Hoje, 18:38 |
| +2 | Conteúdo concluído · Equações do 1º grau | Hoje, 18:10 |
| −4 | Compra · Trocar formato | Ontem |
| +3 | Atividade concluída · Expressões algébricas | Segunda |
| −5 | Compra · Dica | Sexta passada |

- Link **"Ver extrato completo"** expande para 10 linhas (acrescente ganhos de conteúdo/atividade de Frações e Números Inteiros e **"+2 · Dotação inicial · Prazo extra"** como entrada de origem "dotacao", sem moeda).

## 6. Estados (seletor flutuante)
"Com dados" · "Saldo baixo" · "Comprando" · "Compra concluída" · "Saldo insuficiente" · "Item desligado" · "Limite de prazo atingido" · "Carregando" · "Erro ao carregar"
- **Saldo baixo:** saldo **3**. Dica: "Faltam 2 moedas" + barra 60%. Trocar formato: "Faltam 1 moeda" → use **"Falta 1 moeda"**. Prazo extra continua "Pegar grátis" (dotação não depende de saldo, §6.3).
- **Comprando:** Dica em "Comprando...", demais desabilitados.
- **Compra concluída:** Dica com o aviso de sucesso e saldo 33 em todo lugar.
- **Saldo insuficiente:** aviso de erro no card da Dica, saldo inalterado.
- **Item desligado:** Trocar formato "Indisponível" com a frase do professor.
- **Limite de prazo atingido:** Prazo extra "Limite atingido", limites mostram "4 de 4 dias".
- **Carregando:** esqueletos (herói 180px, 4 cards 220px, lateral 600px).
- **Erro ao carregar:** card de erro na largura toda: **"Não foi possível carregar a loja."** (texto do app) + "Tentar novamente".

As **bolinhas de perfil** trocam tema e **toda a arte** (moedas, itens, Bag), como no Perfil.

## 7. Não fazer
- Não inventar item, combo, bônus, presente, cosmético ou preço.
- Não calcular saldo "no cliente" de um jeito que pareça mágico: toda mudança de saldo vem de uma compra confirmada.
- Não usar o troféu/objetos genéricos (`object-*.png`) nos itens: a arte é a do perfil.
- Não deixar a coluna lateral com espaço vazio.

## 8. Aceite
- [ ] Item "Loja" na sidebar de todas as telas logadas, com saldo 38 ao lado.
- [ ] Saldo, "Como ganhar", 4 itens com dotação e estados, limites e extrato.
- [ ] Comprar pede confirmação, mostra "Saldo: 38 → 33", guarda na Bag e atualiza saldo, extrato e Bag.
- [ ] Segunda chance bloqueada pelo gate, com o caminho para liberar.
- [ ] Arte troca com o perfil.

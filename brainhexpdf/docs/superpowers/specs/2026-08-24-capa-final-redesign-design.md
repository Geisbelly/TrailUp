# Redesign de capa/conclusão do deck — Design

## Contexto

Usuário reportou, com prints de um deck real, poluição visual concreta na
capa (`s.type === 'cover'`) e no slide final (`s.type === 'epic_conclusion'
| 'reward_certificate'`): badges/cartões redundantes com informação que já
aparece em outro lugar da página, e o widget de reflexão (`interactiveElement`)
espremido no rodapé do slide final em vez de ter espaço próprio.

## Escopo (5 itens)

### 1. XP estimado/obtido só no header

Hoje: cartão "XP Estimado" na capa e "XP Total" no final, ambos calculando
`(deck.slides?.length || 8) * 150`. O header já tem um contador de XP ao
vivo (`id="xp-counter"`, atualizado por `updateXpDisplay()` conforme o
aluno ganha XP nos slides). Passa a mostrar `obtido/estimado` (ex.:
`350/1800 XP`) em vez de só `obtido`. O estimado é injetado como constante
JS (`const ESTIMATED_TOTAL_XP = ...`) calculada uma vez, mesma fórmula de
hoje.

### 2. Remove cartões de Perfil/Rank (capa e final)

Sem substituto — a informação já está no badge do topo da capa
(`MISSÃO DE APRENDIZADO • ${perfil}`) e na fala do mentor/guia. Remove os
`summary-grid` inteiros de ambos os slides (capa mantém só o card de
perfil? Não — remove TUDO do summary-grid nos dois lugares, incluindo o
que sobrar do XP depois do item 1).

### 3. Reflexão final vira slide próprio

Nova função `extractFinalReflectionIntoOwnSlide(slides)`
(`src/utils/finalReflectionSlide.ts`), no mesmo espírito de
`insertReflectionCheckpoints` (`reflectionCheckpoints.ts`): roda depois da
paginação, antes de `generateInteractiveHtml`. Acha o ÚLTIMO slide
(`epic_conclusion`/`reward_certificate`); se ele tem `interactiveElement`,
cria um novo slide (`type: 'pre_conclusion_reflection'`) só com esse
widget, título "Antes de Concluir..." + a `pedagogicalObjective`/prompt do
próprio interactiveElement, e insere ANTES do slide final — que perde seu
`interactiveElement` (fica só o resumo + botões).

`deckExportUtils.ts` ganha um novo bodyHtml especial pro tipo
`pre_conclusion_reflection`: layout centralizado (`max-w-2xl mx-auto`,
mesmo espírito do `reflection_checkpoint` já existente), título + só
`interactiveWidgetHtml` (sem colunas, sem parágrafos - o widget é o
conteúdo inteiro do slide).

Sem `interactiveElement`, o slide final não muda (nada a extrair).

### 4. Preferência do aluno em checklist/anotação (mesma regra do quiz)

`shouldHideQuiz`/`hideQuiz=1` já existe (`mobile/src/utils/quizVisibility.ts`
+ `applyQuizVisibilityFromQuery` em `deckExportUtils.ts`). Não existe
dimensão de preferência nova em `ModoOperacao` (só 3 modos: Conteúdo
Primeiro / Perguntas Primeiro / Misturado) além do já usado ("Misto"
mostra, resto esconde). Estende a MESMA regra pros outros dois widgets que
pedem produção ativa do aluno (não passiva como conteúdo/timeline):

- **Checklist** (`toggleChecklistItem`, `.checklist-widget-container` -
  novo seletor, precisa envolver o widget de checklist existente numa
  classe identificável, hoje sem wrapper próprio).
- **Anotação/revisão** (o widget `unique-interactive-widget` - já tem
  classe própria).

Novos params: `?hideChecklist=1`, `?hideNotes=1` (nomes análogos ao
`hideQuiz` existente). `applyQuizVisibilityFromQuery` (renomeada pra
`applyContentVisibilityFromQuery`, cobre os 3) roda a mesma lógica de
remover o elemento + colapsar coluna vazia pros 3 seletores.

Lado TrailUp (mobile): `quizVisibility.ts` vira `contentVisibility.ts`
(nome genérico), com `shouldHideChecklist`/`shouldHideNotes` (mesma lógica
de `shouldHideQuiz`) e `withHideParams(url, { hideQuiz, hideChecklist,
hideNotes })` substituindo `withHideQuizParam`. Chamado do mesmo lugar que
já monta a URL do deck hoje.

### 5. Vocabulário temático por perfil (capa/final)

Novo `PROFILE_COVER_COPY: Record<string, { missionBadge: string;
conclusionBadge: string }>` em `ThematicDecorations.tsx` (ou novo arquivo
`profileCopy.ts`), 7 entradas com frases no tom de cada arquétipo:

| Perfil | Badge capa | Badge final |
|---|---|---|
| Achiever | MISSÃO DE HONRA | SÍNTESE DE GLÓRIA & CONQUISTA |
| Seeker | EXPEDIÇÃO DE DESCOBERTA | MAPA DA JORNADA CONCLUÍDA |
| Survivor | MISSÃO DE SOBREVIVÊNCIA | FORTALEZA CONSOLIDADA |
| Daredevil | DESAFIO NA FORJA | VITÓRIA FORJADA NO CAOS |
| Mastermind | RITUAL DE APRENDIZADO | SÍNTESE ARCANA & MAESTRIA |
| Conqueror | CAMPANHA DE CONQUISTA | TERRITÓRIO DOMINADO |
| Socializer | CONVITE DA TÁVOLA | CRÔNICA DA CONFRARIA |

`deckExportUtils.ts` troca as strings fixas ("MISSÃO DE APRENDIZADO •
...", "SÍNTESE DE MAESTRIA & PRÓXIMOS PASSOS") por lookup nesse mapa
(fallback pro texto genérico atual se o perfil não bater com nenhuma
chave). Estrutura HTML permanece igual nos 7 perfis - só o texto muda.

## Fora de escopo

- Layouts HTML bespoke por perfil (mudança estrutural, não só de texto) -
  avaliar como sub-projeto futuro se o vocabulário temático não for
  suficiente.
- Corrigir o mismatch `"misto"` vs `"misturado"` em `shouldHideQuiz`
  (bug pré-existente, não relacionado a este pedido - achado incidental
  durante a investigação, reportar separadamente).

## Testes

- `deckExportUtils.test.ts`: capa/final sem summary-grid nem badges
  genéricos quando o perfil tem entrada no dicionário; header injeta
  `ESTIMATED_TOTAL_XP`; novo tipo `pre_conclusion_reflection` renderiza
  centralizado com o widget.
- `finalReflectionSlide.test.ts` (novo): extrai `interactiveElement` do
  último slide pra um novo slide antes dele; não faz nada quando o último
  slide não tem `interactiveElement`; preserva a ordem dos demais slides.
- Mobile (`contentVisibility.test.ts`, renomeado de `quizVisibility.test.ts`):
  `shouldHideChecklist`/`shouldHideNotes` espelham `shouldHideQuiz`;
  `withHideParams` monta os 3 params juntos corretamente.

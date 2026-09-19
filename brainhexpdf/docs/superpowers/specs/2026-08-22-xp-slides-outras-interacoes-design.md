# XP de slides — demais interações (D1b) — Design

## Contexto

Continuação do D1a (XP de quiz via `postMessage`, já mesclado em `main`).
Estende a MESMA ponte já validada pras 5 interações restantes que dão XP no
deck: boss battle, checklist, domínio de conceito-chave (takeaway),
interação livre (reflexão/ação/código) e escolha de decisão.

**Sem mudança nenhuma no lado mobile/TrailUp** — o handler
`onDeckProgressEvent` já é genérico (recebe `{itemKey, pontuacaoObtida,
pontuacaoMaxima}` de qualquer interação, sem saber o tipo). Só o script
exportado do BrainHexPDF (`src/utils/deckExportUtils.ts`) precisa de
`reportProgressToHost(...)` em cada uma das 5 funções.

## Regra de design: só reporta na transição que GANHA XP

Diferente do quiz (resposta certa é definitiva), `toggleChecklistItem` e
`toggleTakeawayMastery` são **toggles** — dá pra marcar e desmarcar, XP sobe
e desce localmente no deck. Como `personalizacao_item_progresso` faz merge
por **máximo** (não sobrescreve), reportar a cada toggle (inclusive ao
desmarcar) faria o backend sempre manter o maior valor já visto — ou seja,
**desmarcar não revoga o XP já gravado**. Isso é intencional: comum em apps
gamificados não tirar pontos por desfazer uma marcação (o aluno já
demonstrou que sabia a resposta uma vez). Por isso, o report só acontece no
`else` (transição não-marcado → marcado), nunca no `if` (marcado →
não-marcado).

## Mapeamento função → itemKey → XP

| Função (`deckExportUtils.ts`) | itemKey | XP |
|---|---|---|
| `attackBoss` (só no golpe final, `currentBossHp === 0`) | `slide:{currentIndex}:boss` | 500 (fixo) |
| `toggleChecklistItem` (só ao marcar) | `slide:{currentIndex}:checklist:{realItemId}` | `xp \|\| 50` (valor já usado localmente) |
| `toggleTakeawayMastery` (só ao marcar) | `slide:{currentIndex}:takeaway:{realKeyId}` | `xp \|\| 75` |
| `saveUniqueInteraction` (só `firstCompletion`) | `slide:{slideIndex}:unique` | `xpReward \|\| 100` |
| `selectDecisionPath` (só `!wasAlreadyChosen`) | `slide:{currentIndex}:decision:{choiceId}` | `xpReward \|\| 100` |
| `revealSecretLore` (só `!wasRevealed`) | `slide:{currentIndex}:secret` | 100 (fixo) |

Todas as 5 funções já têm a checagem de "primeira vez"/"transição de
ganho" pronta no código atual (usada hoje só pro XP local) — o report só
entra dentro do bloco que já existe, no mesmo espírito do quiz no D1a.
`pontuacaoObtida` e `pontuacaoMaxima` usam o mesmo valor (XP é
tudo-ou-nada em cada uma dessas interações, não parcial).

## Testes

Mesmo padrão de asserção em string (sem jsdom) usado no D1a — verificar que
cada função contém a chamada `reportProgressToHost(...)` com o itemKey
esperado, dentro do bloco condicional correto (a transição que ganha, não a
que perde).

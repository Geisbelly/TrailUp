Tela 09 — **Biblioteca de Conquistas**. Arquivo de saída: `v2/09-biblioteca-conquistas.html`.

Shell completo, item ativo **Perfil** (é uma sub-tela dele). Perfil de exemplo: Conqueror.

## 1. Fonte da verdade
- `mobile/src/app/(tabs)/perfil/biblioteca-conquistas.tsx`.
- Arte: `constants/achievementImages.ts` + `utils/achievementArtwork.ts`. Usa `icone_url` quando existe; senão, a arte vem do **tipo**:
  | Tipo | Arte (`assets/object-*.png`) |
  |---|---|
  | simples | steps |
  | tempo | bolt |
  | dias | calendar |
  | acertos | completion |
  | tempo_total | deadline |
  | exploracao | map |
  | brainhex_conqueror_* | gold (termina em `_soberania`: trophy) |
  | brainhex_achiever_* | chest / calendar / trophy |
  | brainhex_mastermind_* | hint / book / compass |
  | brainhex_seeker_* | map · daredevil: bolt · survivor: retry ou deadline · socializer: community |
  | outro | gold |

## 2. Estrutura real (o app não tem filtro: tem **seções** e **grupos**)
- **Resumo** no topo: contagem "X de perfil · Y comuns" + três números **Total**, **Concluídas**, **Progresso** (concluídas ÷ total).
- **Seção "Conquistas de Conqueror"**: "Metas ligadas a um dos seus perfis BrainHex representativos." (uma seção por perfil representativo; a aluna tem Conqueror e Achiever, então são duas).
- **Seção "Conquistas da plataforma"**: "Marcos comuns de estudo e uso do TrailUp."
- Dentro de cada seção, três **grupos**: **"Concluídas (n)"**, **"Em progresso (n)"**, **"Bloqueadas (n)"**.

## 3. Dados de exemplo (18 no total: 6 concluídas, 5 em progresso, 7 bloqueadas)
| Seção | Grupo | Nome | Tipo | Progresso / data |
|---|---|---|---|---|
| Conqueror | Concluída | Primeira conquista | brainhex_conqueror_inicio | 18/09/2026 |
| Conqueror | Em progresso | Estrategista de campo | brainhex_conqueror_campanha | 4/8 tópicos (50%) |
| Conqueror | Bloqueada | Soberania | brainhex_conqueror_soberania | "Chegue ao 1º lugar em qualquer ranking." |
| Achiever | Concluída | Colecionador | brainhex_achiever_colecionador | 20/09/2026 |
| Achiever | Em progresso | Sequência de ouro | brainhex_achiever_sequencia | 5/7 dias (71%) |
| Achiever | Bloqueada | Mestre da trilha | brainhex_achiever_mestre | "Conclua 100% da trilha." |
| Plataforma | Concluída | Primeiros passos | simples | 12/09/2026 |
| Plataforma | Concluída | Relâmpago | tempo | 15/09/2026 |
| Plataforma | Concluída | Sem errar | acertos | 19/09/2026 |
| Plataforma | Concluída | Explorador | exploracao | 21/09/2026 |
| Plataforma | Em progresso | Maratonista | tempo_total | 680/1.000 min (68%) |
| Plataforma | Em progresso | Presença firme | dias | 12/30 dias (40%) |
| Plataforma | Em progresso | Mira certeira | acertos | 32/50 acertos (64%) |
| Plataforma | Bloqueada | + 5 bloqueadas | vários | "Cumprir critérios para desbloquear." |

Resumo: **Total 18 · Concluídas 6 · Progresso 33%** · "6 de perfil · 12 comuns" (o app escreve "{n} comuns" mesmo no singular; mantenha o plural).

## 4. Grade (main de 1096px)
```
[seletor]
┌ cabeçalho: ← Perfil / eyebrow / H1 / subtítulo ─────────────────────────────────────┐
┌ resumo (12/12): 3 KPIs + barra geral + nota ──────────────────────────────────────┐
┌ índice (3/12 = 257, sticky) ┐ ┌ seções (9/12 = 819) ────────────────────────────────┐
│ Conqueror (3)               │ │ Seção → grupo → grade de 4 colunas                   │
│ Achiever (3)                │ │                                                      │
│ Plataforma (12)             │ │                                                      │
│ ─ filtro rápido de estado ─ │ │                                                      │
└─────────────────────────────┘ └──────────────────────────────────────────────────────┘
```

## 5. Blocos

### 5.1 Cabeçalho
Fantasma pequeno "← Perfil" (`margin-bottom: 12px`) → `08-perfil-hub.html`. Eyebrow "CONQUISTAS", H1 **"Biblioteca de Conquistas"**, subtítulo **"As conquistas de perfil são ligadas aos seus perfis BrainHex representativos. As comuns medem estudo e uso geral do TrailUp e valem independentemente do perfil ativo."**

### 5.2 Resumo (`aria-label="Resumo da biblioteca"`)
Card com grade de 3 KPIs (§7.6 do mestre, altura 120): **Total** 18 (ícone estante) · **Concluídas** 6 (ícone check) · **Progresso** 33% (ícone alvo, com barra de 6px). Abaixo, largura total: legenda 12.5 `textSubtle` "6 de perfil · 12 comuns" e a nota "Total conta todas as conquistas disponíveis; Concluídas conta as desbloqueadas; Progresso é concluídas ÷ total."

### 5.3 Índice lateral (sticky `top: 108px`)
Card `padding: 16px`. Links para as seções (linhas de 40px com emblema 20, nome e contagem à direita). Abaixo, eyebrow "MOSTRAR" e caixas de seleção **Concluídas · Em progresso · Bloqueadas**, todas marcadas. Desmarcar esconde aquele grupo em todas as seções. É uma adaptação web; os grupos são os do app.

### 5.4 Seção (`margin-bottom: 36px`)
- Cabeçalho da seção: emblema 40 (`emblem-conqueror.png`; plataforma: `trailup-brand-logo.png`) + título Cinzel 700 22 **"Conquistas de Conqueror"** + subtítulo 13 `textSubtle`.
- Grupo: rótulo **"Concluídas (1)"** (Inter 700 13, caixa alta, `.08em`, `textMuted`, `margin: 20px 0 12px`).
- Grade de 4 colunas (gap 16). **Célula de conquista** (card raio 16, `padding: 16px`, altura mínima 212, `role="button"`, `aria-label` = nome):
  - Arte 88×88 centralizada numa moldura hexagonal de 104 (fundo `surfaceElevated`).
  - Nome Inter 700 14 `text`, centralizado, 2 linhas no máx.
  - Descrição 12.5/1.45 `textSubtle`, 2 linhas.
  - Pé, conforme o estado:
    | Estado | Visual | Pé |
    |---|---|---|
    | Concluída | arte colorida, moldura com anel `accent`, check 18 `background` sobre `accent` no canto superior direito | "Conquistada em 18/09/2026" 11.5 `success` com ícone check |
    | Em progresso | arte colorida a 80%, anel `borderStrong` | barra 6px (`accent`) + "4/8 · 50%" 11.5 tabular |
    | Bloqueada | arte em escala de cinza a 35%, cadeado 16 sobre a moldura, card com borda tracejada `var(--line)` | critério em 11.5 `textSubtle` (ex.: "Cumprir critérios para desbloquear.") |
  - Hover: `translateY(-2px)` e borda `borderStrong`.
- Ajuda de seção (uma vez, no pé da primeira seção), 12 `textSubtle`: "Cada barra compara o valor atual com a meta específica da conquista. O texto da conquista bloqueada informa o critério necessário para avançar."

### 5.5 Modal "Detalhes do marco" (P, `ConquistaModal`)
Arte 128 na moldura hexagonal 148 com brilho de destaque (só se concluída). Chip de categoria ("Conquista de Conqueror" / "Conquista da plataforma"). Título Cinzel 700 22. Descrição 14/1.6 `textMuted`. Linha de estado:
- Concluída: "Conquistada em 18/09/2026 às 20:14" (`success`).
- Em progresso: barra de 10px + "4 de 8 tópicos dominados · 50%".
- Bloqueada: bloco `surfaceElevated` com cadeado e o critério.
Um botão: "Fechar". Nota 12 `textSubtle` no topo da página: "Clique em uma conquista para ver nome, categoria, descrição, data de obtenção e a identidade visual do perfil ou da plataforma." (o app diz "Toque").

## 6. Estados (seletor: "Com dados" · "Só concluídas" · "Modal aberto (concluída)" · "Modal aberto (em progresso)" · "Vazio" · "Carregando")
- **Vazio:** card vazio, ícone troféu 46, título **"Sem conquistas registradas"**, corpo **"Conclua atividades e tópicos para liberar sua biblioteca."**, botão secundário "Ir para a trilha".
- **Carregando:** resumo em esqueleto + 8 células-esqueleto (212px).

## 7. Não fazer
- Não diferenciar estado só por cor: use check, barra, cadeado e borda tracejada.
- Não inventar raridade/nível de conquista (bronze/prata/ouro): o app não tem.

## 8. Aceite
- [ ] Resumo com Total/Concluídas/Progresso e a nota de cálculo.
- [ ] Seções por perfil representativo + plataforma, cada uma com os três grupos.
- [ ] Os três estados reconhecíveis na grade, sem abrir o detalhe.
- [ ] Modal de detalhe nas três variações.

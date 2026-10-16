Tela 05 — **Ranking** ("Sala de honra"). Arquivo: `v2/05-ranking.html` (edite o atual, que anexo). Item ativo da sidebar: **Ranking**. Perfil de exemplo: Conqueror.

## 1. Feedback
> "Gostei, mas tá meio estranho, os ícones errados, falta algo."

Ela não detalhou. Conferindo o v1 contra o app (`mobile/src/app/(tabs)/ranking/index.tsx` e `[id].tsx`), estes são os problemas concretos que explicam cada parte do comentário:

| Comentário | Causa encontrada no v1 |
|---|---|
| "ícones errados" | O v1 usa os objetos genéricos (`object-deadline.png`, `object-book.png`, `object-trophy.png`). O app usa `UtilityIcon`, que tem **uma arte por perfil** em `mobile/src/assets/utility-profiles/<tipo>-<perfil>.png` (a ampulheta do Conqueror é azul-safira com dourado). E a categoria de pontos usa a **medalha** (`medal`), não o troféu |
| "meio estranho" | 1) A aluna logada é Amina T., e o v1 põe Amina T. em **1º no pódio** e, ao mesmo tempo, "Você" em **12º**. 2) A tela é dividida ao meio (`1fr 1fr`): a coluna das categorias tem 3 cards e fica vazia embaixo. 3) A linha "Sua posição" aparece **entre** o pódio e o 4º lugar, quebrando a ordem |
| "falta algo" | 1) A coluna da direita não diz **qual categoria está aberta**. 2) A classificação para no 6º, sem cabeçalho de colunas e sem 7º–11º. 3) O card de categoria não mostra **a posição da aluna** naquela categoria. 4) O pódio não tem o emblema do perfil de cada colega nem pedestal com o número |

## 2. Fica como está (ela gostou)
- Estrutura mestre-detalhe: categorias à esquerda, categoria aberta à direita.
- Eyebrow "RANKING", H1 **"Sala de honra"**, subtítulo "Classificações da turma".
- Cards de categoria com arte à esquerda, nome e descrição; o ativo destacado.
- A **arena** (`arena-conqueror.webp`) como fundo da categoria aberta.
- Filtros **Geral · Meu perfil · Outros perfis**.
- Pódio na ordem visual **2º · 1º · 3º**, retratos redondos com as medalhas `rank-1/2/3.png`.

## 3. O que muda

### 3.1 Ícones (o "ícones errados")
- Copiar para `v2/assets/` os ícones por perfil de `mobile/src/assets/utility-profiles/`: `deadline-*`, `book-*` e `medal-*` dos 7 perfis.
- Regra do app (`ranking/index.tsx`): `criterio === "tempo"` → **deadline**; `"percentual"` → **book**; qualquer outro (pontos) → **medal**. A arte segue o perfil **de quem está olhando**: com o seletor em Seeker, os três ícones trocam para a versão Seeker.
- Tamanho do app: 60×68, `object-fit: contain`.

### 3.2 Dados coerentes (o "estranho")
A aluna logada é **Amina T. (Conqueror)**. Ela **não** está no pódio. Categoria aberta: **Tempo de Estudo**.

| Pos. | Aluno | Perfil | Tempo |
|---|---|---|---|
| 1º | Kwame R. | Achiever | 9h 15min |
| 2º | Marina S. | Seeker | 7h 40min |
| 3º | Zuri & Mateo | Socializer | 6h 55min |
| 4º | Bianca L. | Achiever | 6h 10min |
| 5º | Théo M. | Seeker | 5h 48min |
| 6º | Diego A. | Conqueror | 5h 20min |
| 7º | Lara P. | Mastermind | 4h 52min |
| 8º | Iago F. | Daredevil | 4h 30min |
| 8º | Kenji O. | Survivor | 4h 30min |
| 10º | Rafael N. | Conqueror | 4h 05min |
| 11º | Ana C. | — (perfil não definido) | 3h 41min |
| **12º** | **Amina T. (você)** | Conqueror | **3h 20min** |

(O empate em 8º mostra a regra do app: empatados mantêm a mesma posição e o seguinte pula para 10º.) Formato de tempo do app (`formatRankScore`): "45min" ou "3h 05min".

As outras categorias, para os cards da esquerda: **Progresso** (você: 9º · 56%) e **Pontos** (você: 7º · 1.240).

### 3.3 Proporção da tela
`grid-template-columns: minmax(0,4fr) minmax(0,8fr)` com gap 20 dentro dos 1164px (374,67 + 769,33). A coluna das categorias é sticky (`top: 28px`). Embaixo dos cards, a legenda do app (12.5 `textSubtle`): "Abra uma categoria para ver o pódio, sua posição e os resultados da turma."

### 3.4 O que faltava
1. **Card de categoria** ganha a linha 12 `textMuted`: "Você: 12º · 3h 20min" (posição e valor da aluna naquela categoria) e a seta 20 `accent` à direita (como no app). O card ativo tem fundo `accentMuted` e borda `accent`, `aria-current="true"`. Cada card é `<a href="#tempo">`, `#progresso`, `#pontos`.
2. **Cabeçalho da categoria aberta**, sobre a arena (`padding: 22px 26px`, `border-bottom: 1px solid var(--line)`): eyebrow "CATEGORIA", título Cinzel 700 22 "Tempo de Estudo", descrição 13 `textSubtle` "Quem mais dedicou tempo ativo à trilha este mês", e os filtros à direita. Nota 12 `textSubtle` embaixo: "Os filtros se aplicam à lista. As posições originais da categoria são preservadas."
3. **Pódio completo:** sob cada retrato, nome, valor e o **emblema do perfil** do colega (`emblem-<perfil>.png`, 40px); embaixo, **pedestal** com o número ("1º" em Cinzel 700 40, "2º" 28, "3º" 24) e alturas 120 / 86 / 64. Face do 1º em gradiente `accent` 45% → `elev` com borda `accent`; 2º `elev` + `borderStrong`; 3º `surface` + `border`. Nota centralizada 12 `textSubtle`: "Os três primeiros lugares seguem a classificação geral desta categoria. Empates mantêm a mesma posição." O pódio **não** muda com os filtros.
4. **Tabela "Classificação"** do 4º ao 11º, com cabeçalho de colunas: `#` (48px) · `Aluno` · `Perfil` (180px) · `Tempo` (100px, à direita). Linhas de 56px: posição Inter 700 14 `textMuted`; avatar 32 + nome Inter 500 14; ponto 8 na cor-assinatura + nome do perfil 13 `textMuted` ("Perfil não definido" em `inactive` para Ana C.); valor Inter 700 14 tabular. O título da coluna de valor muda com o critério: "Tempo", "Progresso", "Pontos".
5. **Faixa "Sua posição"** no **pé** do card (sticky `bottom: 0`), não mais no meio: fundo `elev`, `border-top: 1px solid accent`, eyebrow "SUA POSIÇÃO", "12º de 28" (Cinzel 700 20 `accent`), "3h 20min" (Inter 700 14) e a legenda 12 `textSubtle` "Sua colocação geral permanece visível no rodapé, mesmo ao filtrar os colegas." (texto do app).
6. **Filtro "Meu perfil"** mostra só os Conqueror (6º Diego A., 10º Rafael N.) **com as posições originais**; a faixa "Sua posição" continua.

## 4. Estados (seletor flutuante)
"Com dados" · "Filtro: Meu perfil" · "Filtro sem resultado" · "Você no pódio" · "Pódio com 2 alunos" · "Carregando" · "Vazio"
- **Você no pódio:** categoria Pontos com Amina em 3º. Ela aparece no pódio com "(você)" em `accent` **e** na faixa do pé.
- **Filtro sem resultado:** "Nenhum aluno neste recorte." no lugar da tabela.
- **Pódio com 2 alunos:** só 1º e 2º, sem terceiro inventado (regra do app: nunca aluno fictício).
- **Carregando:** esqueletos de 96px nas categorias; pódio (3 colunas de 180/220/160) e 6 linhas de 56px.
- **Vazio:** card vazio na largura toda: "Nenhum ranking ainda" / **"Nenhum ranking disponível nesta turma."** (texto do app).

## 5. Não fazer
- Não trocar a arena nem o layout mestre-detalhe, que ela aprovou.
- Não pintar linhas ou pódio com a cor de outro perfil além do ponto e do emblema.
- Não usar os `object-*.png` genéricos nas categorias.

## 6. Aceite
- [ ] Ícones por perfil (deadline / book / medal), trocando com o seletor de perfil.
- [ ] A aluna aparece uma vez só, na posição certa; pódio sem ela.
- [ ] Categoria aberta nomeada; tabela com cabeçalho e 4º–11º; "Sua posição" no pé.
- [ ] Categorias 4/12, sem área vazia.

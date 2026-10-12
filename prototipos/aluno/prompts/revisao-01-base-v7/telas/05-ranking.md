Tela 05 — **Ranking** ("Sala de honra"). Arquivo de saída: `v2/05-ranking.html`.

Shell completo, item ativo **Ranking**. Perfil de exemplo: Conqueror. No app são duas rotas (lista de categorias → categoria aberta). Na web elas viram **uma tela mestre-detalhe**: categorias à esquerda, categoria aberta à direita. Cada categoria tem âncora na URL (`05-ranking.html#pontos`) para o link direto funcionar (issue #27).

## 1. Fonte da verdade
- `mobile/src/app/(tabs)/ranking/index.tsx` (categorias), `ranking/[id].tsx` (categoria aberta).
- `components/ranking/RankingPodium.tsx` (pódio), `utils/rankingPodium.ts` (`formatRankScore`, empates).
- Assets: `assets/arena-conqueror.webp` (arena = tema de **quem olha**), `rank-1.png`/`rank-2.png`/`rank-3.png` (medalhas), `emblem-<perfil>.png`, `object-deadline.png` (tempo), `object-book.png` (progresso), `object-trophy.png` (pontos).

## 2. Regras do app que o desenho precisa deixar visíveis
1. O pódio é **sempre** a classificação geral da categoria. Os filtros mexem **só na lista**.
2. **Empates mantêm a mesma posição** e todos os empatados entre os três primeiros aparecem. O pódio não corta para caber 3.
3. **Nunca há aluno fictício** preenchendo posição vazia. Com 2 alunos, o pódio tem 2 lugares.
4. **"Sua posição"** fica sempre visível, mesmo filtrando.
5. A arena e as cores seguem o perfil de **quem está olhando**. O perfil de cada colega aparece só como emblema e ponto de cor.

## 3. Dados de exemplo
Categorias da turma (vêm do banco: `nome_rank`, `descricao`, `criterio`):

| Categoria | `criterio` | Métrica (coluna) | Arte | Descrição |
|---|---|---|---|---|
| Pontos da turma | pontos | Pontos | `object-trophy.png` | "Quem mais somou pontos em atividades e presença." |
| Tempo de estudo | tempo | Tempo | `object-deadline.png` | "Minutos de estudo ativo na trilha." |
| Progresso na trilha | percentual | Progresso | `object-book.png` | "Percentual da trilha concluído." |
| Desafios da semana | pontos | Pontos | `object-trophy.png` | "Pontos feitos só nesta semana." |

Categoria aberta: **Pontos da turma**. Classificação (28 alunos; mostre as 10 primeiras linhas + a da aluna):

| Pos. | Aluno | Perfil | Pontos |
|---|---|---|---|
| 1º | Caio Ribeiro | Daredevil | 1.480 |
| 2º | Bianca Lopes | Socializer | 1.310 |
| 3º | **Lívia Moraes (você)** | Conqueror | 1.240 |
| 3º | Theo Martins | Seeker | 1.240 |
| 5º | Maria Eduarda Souza | Achiever | 1.105 |
| 6º | Gustavo Pires | Conqueror | 990 |
| 7º | Ana Clara Mendes | — (perfil não definido) | 940 |
| 8º | Rafael Antunes | Survivor | 910 |
| 9º | Júlia Castro | Mastermind | 875 |
| 10º | Pedro Henrique Lima | Conqueror | 860 |

Formato de valores (`formatRankScore`): pontos inteiros com ponto de milhar; tempo "45min" ou "3h 05min"; progresso "72%"; nulo "--".

## 4. Grade (main de 1096px)
```
[seletor]
[faixa de cenário arena-conqueror.webp 280px]
┌ cabeçalho: eyebrow / H1 "Sala de honra" / subtítulo ──────────────────────────────┐
┌ Classificações (4/12 = 355) ┐ ┌ categoria aberta (8/12 = 721) ─────────────────────┐
│ card por categoria          │ │ cabeçalho da categoria + filtro                     │
│ (lista vertical, gap 12)    │ │ pódio                                               │
│                             │ │ tabela de classificação                             │
│                             │ │ faixa "Sua posição" (sticky no pé do card)          │
└─────────────────────────────┘ └─────────────────────────────────────────────────────┘
```
`grid-template-columns: minmax(0,4fr) minmax(0,8fr); gap: 20px;`. A coluna das categorias é sticky (`top: 108px`).

## 5. Blocos

### 5.1 Cabeçalho da página
Eyebrow "RANKING DA TURMA". H1 **"Sala de honra"**. Subtítulo: "Cada categoria reconhece um resultado diferente da sua jornada." À direita: chip neutro com calendário "Matemática · 6º ano B".

### 5.2 Classificações (coluna esquerda)
Título de seção H2 "Classificações" + legenda 12.5 `textSubtle` "Abra uma categoria para ver o pódio, sua posição e os resultados da turma." (`margin-bottom: 16px`).
Card de categoria (altura mínima 96, `padding: 16px 18px`, raio 16, gap 14, `<a>` com a âncora):
- Arte 60×68 (`object-*.png`, `object-fit: contain`) à esquerda.
- Nome Inter 700 15 `text`, descrição 12.5/1.45 `textSubtle` (2 linhas no máx.), e linha de meta 12 `textMuted`: "Você: 3º · 1.240" (posição e valor da aluna naquela categoria).
- Seta 20 `accent` à direita.
- Selecionado: fundo `accentMuted`, borda `1px solid accent`, `aria-current="true"`. Hover: fundo `surfaceElevated`.

### 5.3 Categoria aberta (card grande, `padding: 0`, `overflow: hidden`)
**a) Cabeçalho** (`padding: 22px 26px`, `border-bottom: 1px solid var(--line)`, flex):
- Eyebrow "CATEGORIA", título Cinzel 700 22 "Pontos da turma", descrição 13 `textSubtle`.
- À direita: filtros segmentados (§7.4 do mestre) **"Geral" · "Meu perfil" · "Outros perfis"**.
- Nota abaixo, largura total, 12 `textSubtle` com ícone info 13: "Os filtros se aplicam à lista. As posições originais da categoria são preservadas."

**b) Pódio** (`padding: 30px 24px 28px`, fundo `radial-gradient(ellipse 60% 80% at 50% 100%, accentSoft, transparent)`):
Título "Pódio da turma" (eyebrow centralizado, `margin-bottom: 20px`). Grid `1fr 1.15fr 1fr`, gap 12, `align-items: end`. Ordem visual: **2º · 1º · 3º**.
- Cada coluna, de cima para baixo, gap 9:
  - **Retrato** circular: 88px no 1º, 66px nos demais. Foto emoldurada na moldura do perfil do colega (`frame-<perfil>.png`) ou iniciais (Inter 800, 1/3 do tamanho, fundo `surfaceElevated`, cor `text`). Medalha 44×44 (`rank-1/2/3.png`) sobreposta embaixo do retrato (`position: absolute; bottom: -22px`).
  - Nome Inter 600 13.5 `text` (1º: Inter 700 15), com "(você)" em `accent` se for a aluna.
  - Valor: 1º em Inter 700 12.5 `accent`, demais em 11.5 `textSubtle`.
  - Emblema do perfil do colega 44×44 (`emblem-<perfil>.png`).
  - **Pedestal hexagonal** (SVG `viewBox="0 0 120 64"`, face superior `0,12 60,0 120,12 60,26` e laterais, como no `RankingPodium`), largura 100%, alturas **120 / 86 / 64** para 1º / 2º / 3º. Face frontal: 1º `linear-gradient(180deg, accent a 45%, surfaceElevated)` + borda `accent`; 2º `surfaceElevated` + borda `borderStrong`; 3º `surface` + borda `border`. Número "1º" em Cinzel 700 40 (1º) / 28 / 24, com o "º" menor (60%).
  - Brilho de destaque (§4 do mestre) só no retrato do 1º.
- **Empates no pódio:** abaixo do pódio, faixa "Empatados em 3º" (eyebrow) com linhas de 56px: "3º" Cinzel 700 18 `accent` + emblema 40 + nome + valor em `textMuted`. No exemplo: Theo Martins, Seeker, 1.240.
- Nota 12 `textSubtle` centralizada: "Os três primeiros lugares seguem a classificação geral desta categoria. Empates mantêm a mesma posição."

**c) Tabela "Classificação"** (padrão V7): cabeçalho `#` (48px) · `Aluno` (1fr) · `Perfil` (180px) · `Pontos` (100px, à direita). Linhas de 56px:
- `#`: "5º" Inter 700 14 `textMuted` tabular (empate repete a posição).
- Aluno: avatar 32 (foto ou iniciais) + nome Inter 500 14 `text`.
- Perfil: ponto 8 na cor-assinatura + nome do perfil 13 `textMuted`. Sem perfil: "Perfil não definido" em `inactive`.
- Valor: Inter 700 14 `text` tabular.
- A linha da aluna tem fundo `accentMuted`, borda esquerda de 3px `accent` e o selo "você" (chip accent 10.5).
- Título da coluna de valor muda com o critério: "Pontos", "Tempo" ou "Progresso".

**d) Faixa "Sua posição"** (`position: sticky; bottom: 0;` dentro do card, `padding: 14px 24px`, fundo `surfaceElevated`, `border-top: 1px solid accent`): eyebrow "SUA POSIÇÃO", "3º de 28" (Cinzel 700 20 `accent`), "1.240 pontos" (Inter 700 14), e à direita a legenda 12 `textSubtle`: "Sua colocação geral permanece visível no rodapé, mesmo ao filtrar os colegas."

## 6. Estados (seletor: "Com dados" · "Filtro: Meu perfil" · "Filtro sem resultado" · "Pódio com 2 alunos" · "Pódio em aberto" · "Carregando" · "Vazio" · "Portão fechado" · "Cerimônia de liberação")
- **Filtro: Meu perfil:** a tabela mostra só os Conqueror (3º Lívia, 6º Gustavo, 10º Pedro Henrique), **com as posições originais**. O pódio não muda.
- **Filtro sem resultado:** no lugar da tabela, texto centralizado 14 `textMuted` com `padding: 36px`: "Nenhum aluno neste recorte."
- **Pódio com 2 alunos:** só 1º e 2º, sem 3º inventado.
- **Pódio em aberto** (ninguém pontuou): símbolo do ranking 84 (`JourneySymbol`, use `object-trophy.png` em 40% de opacidade) + "O pódio está em aberto" (Cinzel 700 20). A tabela lista todos com "--".
- **Carregando:** 4 esqueletos de 96px na coluna esquerda; no card direito, esqueleto do pódio (3 colunas de alturas 180/220/160) e 6 linhas de 56px.
- **Vazio** (turma sem ranking): a grade some e entra o card vazio do mestre: ícone pódio, título "Nenhum ranking ainda", corpo **"Nenhum ranking disponível nesta turma."** Âncora inexistente: "Ranking não encontrado." + botão fantasma "Voltar aos rankings".
- **Portão fechado:** sidebar com cadeado em Ranking. O main mostra a página esmaecida (opacidade .25, `filter: blur(2px)`) com o modal "Ranking liberado indisponível" (§7.8 do mestre) por cima.
- **Cerimônia de liberação:** modal "Ranking liberado" com os 3 passos (§7.8).

## 7. Não fazer
- Não pintar linha nem pódio com a cor de outro perfil além do ponto/emblema.
- Não esconder a posição da aluna quando ela está no pódio (ela aparece no pódio **e** na faixa).
- Não mostrar pontuação com decimais.

## 8. Aceite
- [ ] Mestre-detalhe com âncora por categoria.
- [ ] Pódio 2º-1º-3º com pedestais hexagonais e medalhas, empate em 3º exibido.
- [ ] Filtros alteram só a tabela, com as posições originais preservadas.
- [ ] Faixa "Sua posição" sempre visível.
- [ ] Os 9 estados no seletor.

Tela 08 — **Perfil** (identidade + painel de métricas + conquistas). Arquivo de saída: `v2/08-perfil-hub.html`.

Shell completo, item ativo **Perfil**. Perfil de exemplo: Conqueror. É a tela que mais "veste" o perfil: pode ter mais tratamento visual que as outras, **sem** virar página de marketing (os dados continuam no centro).

## 1. Fonte da verdade
- `mobile/src/app/(tabs)/perfil/index.tsx` (cabeçalho, alternador de perfil, atalhos, grade de conquistas, modais).
- `components/perfil/ProfileMetricsViews.tsx` + `profileMetricsViewModel.ts` (painel de métricas).
- `utils/profileMetricThemes.ts`: **o estilo do painel depende do perfil** (`resolveProfileMetricsTheme`), e o aluno pode fixar outro em Configurações → Estilo das métricas:
  | Estilo | Rótulo | Perfis (automático) |
  |---|---|---|
  | `arena` | Arena Tática | Conqueror, Daredevil, Survivor |
  | `goals` | Metas | Achiever |
  | `mystery` | Mistério | Seeker |
  | `squad` | Squad | Socializer |
  | `analytics` | Painel Analítico | Mastermind (e fallback) |
- `components/FramedProfileImage.tsx`, `ConquistaModal.tsx`, `bag/BagModal.tsx`.

## 2. Dados de exemplo
- Lívia Moraes, apelido "livi". Descrição: "Gosto de desafios rápidos e de ver meu progresso." Foto: use `assets/rosto-conqueror.png` como se fosse a foto (sem foto, o app usa a arte do guardião).
- Perfis representativos: **Conqueror 78%** (ativo) · **Achiever 64%**. Vetor completo: Conqueror 78 · Achiever 64 · Daredevil 51 · Mastermind 40 · Survivor 33 · Seeker 28 · Socializer 22.
- Métricas (Arena): Precisão 81% · Posição 3º · Tempo ativo 11h 20min · Campanha 56%. Tópicos dominados 4/8 · Conteúdos explorados 14/26 · Atividades concluídas 9/15. Dias ativos (7 dias): 5. Dano causado ao boss: 238. Melhor tempo em atividade: 01:12.
- Conquistas: 6 de 18 desbloqueadas (preview de 8).

## 3. Grade (main de 1096px)
```
[seletor]
[faixa de cenário world-conqueror.webp 280px]
┌ cartão de identidade (12/12, 220px) ────────────────────────────────────────────────┐
│ retrato 132 emoldurado │ nome / apelido / descrição │ perfil ativo + afinidades │ atalhos │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ painel de métricas (8/12 = 721) ───────────────┐ ┌ coluna (4/12 = 355) ─────────────┐
│ herói do estilo + 4 KPIs                       │ │ Afinidades BrainHex (7 barras)   │
│ Status da operação (3 barras)                  │ │ Conquistas (grade 4×2 + link)    │
│ Inteligência de combate (radar 5 eixos)        │ │                                  │
│ Tempo de estudo · Boss · Melhor tempo          │ │                                  │
└────────────────────────────────────────────────┘ └──────────────────────────────────┘
```

## 4. Blocos

### 4.1 Cartão de identidade (card `padding: 28px 32px`, grid `160px minmax(0,1fr) 300px auto`, gap 28, `align-items: center`)
- **Retrato** (`FramedProfileImage`): foto circular 116 dentro da moldura `frame-conqueror.png` 160×160, brilho de destaque (§4 do mestre).
- **Nome** Cinzel 700 30 `text`, "@livi" 14 `textSubtle`, descrição 14/1.6 `textMuted` (máx. 2 linhas). Abaixo, fantasma pequeno "Editar perfil" (lápis) → `11-configuracoes.html#informacoes`.
- **Perfil ativo**: eyebrow "PERFIL ATIVO", emblema 48 (`emblem-conqueror.png`) + "Conqueror" Cinzel 700 20 `accent` + "78% de afinidade" 12.5 `textSubtle`. Abaixo, **"Alternar perfil ativo"** (13 `textMuted`, só aparece com mais de um perfil representativo): opções em linha (gap 8), cada uma uma pílula `padding: 8px 12px 8px 8px`, raio 999, emblema 32×36 + nome (Inter 700 13) + afinidade (11.5 `textSubtle`). Selecionada: borda na cor-assinatura daquele perfil e fundo dela a 20%, com check 16. Salvando: "Salvando..." no lugar da afinidade e as outras opções a .55. Erro: toast "Não foi possível trocar o perfil" / "Tente novamente em instantes." **Trocar o perfil aqui troca o tema da área inteira** (no protótipo, reaproveite o seletor de perfil).
- **Atalhos** (coluna, gap 10, botões secundários de 44 com ícone 18, largura 220): **"Configurações"** (engrenagem) → `11-configuracoes.html` · **"Biblioteca de conquistas"** (estante) → `09-biblioteca-conquistas.html` · **"Abrir minha Bag"** (`object-bag.png` 18) → abre o modal da Bag (igual a `03-trilha.md` §5.5).

### 4.2 Painel de métricas: estilo **Arena Tática** (Conqueror)
Selo do estilo no canto superior direito do herói (`DashboardThemeBadge`): chip neutro com ícone mira "Arena Tática".
1. **Herói** (card com `background: linear-gradient(160deg, surfaceElevated, surface)`, `padding: 24px 26px`): eyebrow **"CENTRAL DE DOMÍNIO"**, título Cinzel 700 22 **"Sua campanha está sob controle"**, subtítulo 13/1.55 `textMuted` **"Rank, precisão e avanço da classe aparecem como uma operação em andamento."** Abaixo, 4 **StatTiles** em grade de 4 (gap 12; cada um 100px, raio 16, fundo `background` a 60%, ícone 18 `accent` no canto superior direito, rótulo 12 `textSubtle`, valor Inter 700 24 tabular): **Precisão** 81% · **Posição** 3º · **Tempo ativo** 11h 20min · **Campanha** 56%.
2. **"Status da operação"** (card; H2 com ícone + legenda "Visão rápida da campanha atual."): três `ProgressLine` (rótulo 13 `text` à esquerda, valor "4/8" 13 tabular à direita, barra 8px abaixo, trilho `background`, preenchimento `accent`): **"Tópicos dominados"** · **"Conteúdos explorados"** · **"Atividades concluídas"**.
3. **"Inteligência de combate"** (card; legenda "Visão tática do desempenho nos 5 eixos."): radar SVG de 5 eixos, 280×280, centralizado. Eixos: **Precisão 81 · Progresso 56 · Exploração 54 · Atividades 60 · Presença 71** (presença = dias ativos ÷ 7). Grade em `var(--line)`, 4 anéis (25/50/75/100), polígono com preenchimento `accentSoft` e contorno 2px `accent`, pontos de 5px `accent`, rótulos 12 `textMuted` e valor 11 `textSubtle`. **Tabela equivalente** escondida visualmente para leitor de tela.
4. **"Próximo movimento"** (card, legenda "O que mais aproxima você da próxima vitória."): texto 14 `text`: "Conclua Equações do 1º grau: faltam 4 blocos para dominar o 5º tópico." + botão fantasma "Ir para o tópico".
5. Linha com três cards (grade de 3, gap 20):
   - **"Tempo de estudo"**: 6 mini-KPIs ("Tópicos (total)", "Conteúdos (total)", "Atividades (total)" e as versões "(recente)") + barras horizontais de distribuição **Tópico / Conteúdo / Atividade** (cores: `accent`, `accent` com L+10%, `accent` com L+22%).
   - **"Boss"**: "Dano causado ao boss" 238, com a imagem do último boss 48.
   - **"Melhor tempo"**: "Melhor tempo em atividade" 01:12.
- **Outros estilos** (ao trocar o perfil no seletor, o painel muda junto): Metas (Achiever) = "Meta principal", "Conquistas", "Tempo investido", "Taxa de acerto", "Checklist da jornada" com os 4 itens "Meta da trilha / de conteúdo / de atividades / de presença" e "Anéis de metas" (anéis concêntricos Exploração/Conteúdo/Atividades); Mistério (Seeker) = "Conteúdos revelados", radial de descoberta; Squad (Socializer) = "Energia do grupo", grade de presença de 7 dias; Painel Analítico (Mastermind) = gráfico por tópico **Concluídos / Em andamento / Pendentes** e barras semanais. Desenhe completo **só o Arena**. Para os outros, faça o herói (eyebrow, título, selo) e um card de exemplo, sinalizados com a nota "estrutura completa em revisão futura".

### 4.3 Coluna direita
1. **Afinidades BrainHex** (card; H2 "Afinidades", legenda "Afinidades BrainHex detectadas para orientar a experiência."): 7 linhas de 32px, gap 8: emblema 20 + nome 13 `text` (largura 96) + barra 8px (preenchimento **na cor-assinatura daquele perfil** — aqui é permitido, porque a linha representa o perfil) + valor 12 tabular. Ordem decrescente. Os representativos têm o selo "representativo" (chip neutro 10).
2. **Conquistas** (card; H2 "Conquistas", à direita o fantasma "Ver todas" → biblioteca): contador "6 de 18" + barra 6px. Grade de 4 colunas × 2 linhas (células de 72×72, raio 16, fundo `surfaceElevated`). Desbloqueada: arte colorida + anel `accent`. Bloqueada: arte em escala de cinza a 35% + cadeado 14 no canto. `title` com o nome. Clique abre o **modal de conquista** (`ConquistaModal`, P): arte 120, nome Cinzel 700 20, categoria (chip), descrição 14, data "Conquistada em 18/09/2026", legenda "Toque para ver detalhes." vira "Clique para ver detalhes." na grade.

### 4.4 Celebração "Conquista desbloqueada" (modal P, estado)
Arte 140 com brilho de destaque e partículas (`animate-ember`: 12 pontos de 3px em `accent` subindo 60px em 1.8s, uma vez). Eyebrow "CONQUISTA DESBLOQUEADA", título Cinzel 700 22 com o nome da conquista, texto **"Você realizou um feito incrível."**, botão primário "Continuar".

## 5. Estados (seletor: "Com dados" · "Sem conquistas" · "Sem métricas" · "Um só perfil" · "Trocando perfil" · "Conquista desbloqueada" · "Carregando")
- **Sem conquistas:** o card de conquistas vira vazio compacto: título **"Sem conquistas"**, corpo **"Você ainda não ganhou emblemas."**
- **Sem métricas** (aluno novo): herói com o título do `EmptyState` do estilo, "Nenhuma missão em campo", e corpo "As métricas aparecerão aqui conforme você avançar nos conteúdos, atividades e leituras adaptativas." Os outros cards do painel somem.
- **Um só perfil:** sem "Alternar perfil ativo".
- **Trocando perfil:** a opção Achiever em "Salvando..." e as demais a .55.
- **Carregando:** esqueleto do cartão de identidade (220px), painel com 4 blocos e coluna com 2.

## 6. Não fazer
- Não usar gráfico coral do V7: os gráficos do aluno usam `accent` e variações de luminosidade dele.
- Não mostrar o vetor de afinidades como pizza (7 fatias finas ficam ilegíveis). Use barras.

## 7. Aceite
- [ ] Identidade com retrato emoldurado, perfil ativo, alternador e 3 atalhos.
- [ ] Painel Arena completo, com os textos do app; o seletor de perfil troca o estilo (Achiever → Metas etc.).
- [ ] Radar com alternativa acessível.
- [ ] Conquistas desbloqueadas e bloqueadas distinguíveis sem cor.

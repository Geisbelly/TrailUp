Tela 08 — **Perfil**. Arquivo: `v2/08-perfil-hub.html` (edite o atual, que anexo). Item ativo da sidebar: **Perfil**. Perfil de exemplo: Conqueror (Amina T.).

## 1. Feedback
> "As conquistas até que ficaram bonitinhas, mas falta as métricas do perfil, as leituras, falta a opção de troca de perfil para o user. Falta o banner."

Nada foi criticado no que existe; faltam quatro coisas. É uma tela para **completar**, não para refazer.

## 2. Fica como está (ela gostou ou não criticou)
- **Grade de conquistas** (12 células, desbloqueadas coloridas com anel, bloqueadas apagadas) e o link "Ver biblioteca completa →" → `09-biblioteca-conquistas.html`. Não mexer no visual.
- **"Última atividade"**, com as 2 linhas do v1.
- **Bloco de identidade:** retrato emoldurado (`rosto-conqueror.png` dentro de `frame-conqueror.png`), nome "Amina T.", chip do perfil com emblema + "Conqueror" / "Perfil dominante", barra de afinidade segmentada com a legenda, e o mini-quadro Turma 6º ano B · Sequência 5 dias · Posição no rank 12º.
- Atalhos para Configurações, Biblioteca e Bag.

## 3. O que falta e como fica

### 3.1 Banner
No app, o perfil tem um banner próprio (`usuario.banner_url`, proporção **3:1**, que o aluno envia em Perfil → Informações pessoais, "Trocar banner"). Sem banner enviado, o app usa a arte do perfil (`getProfileArtwork(perfil, 'banner')` = `world-<perfil>.webp`). No v1, o `world-` aparecia só como fundo apagado atrás da página, e por isso não lia como banner.
- Faixa de banner no topo do conteúdo, largura toda (1164px), **altura 240px**, raio 20, `object-fit: cover`, imagem **nítida** (sem véu forte; só um degradê de 40% de `bg` nos 80px de baixo, para o retrato assentar).
- O retrato emoldurado (160px) sobe 72px sobre a borda inferior esquerda do banner (`left: 32px`).
- Canto superior direito do banner: botão secundário pequeno sobre fundo `bg` a 70% com desfoque: câmera 16 + **"Trocar banner"** → `11-configuracoes.html#informacoes`. Os atalhos (Configurações, Biblioteca, Bag) ficam ao lado dele, como ícone-botões 40 no mesmo fundo.
- Estado "Banner próprio": troque a imagem por uma foto qualquer do `assets/` (ex.: `entry-world.webp`) para mostrar que o aluno pode personalizar.

### 3.2 Troca de perfil
No app (`perfil/index.tsx`), quem tem mais de um perfil representativo vê **"Alternar perfil ativo"**. Trocar o perfil troca o tema da área inteira.
- No bloco de identidade, abaixo do chip do perfil: rótulo 13 `textMuted` **"Alternar perfil ativo"** e as opções em coluna (gap 8), cada uma uma pílula de 44px: emblema 28 + nome (Inter 700 13) + afinidade (11.5 `textSubtle`). Opções: **Conqueror 58%** (ativa) · **Mastermind 24%** · **Achiever 12%**, os mesmos números da barra de afinidade do v1.
- Ativa: borda e fundo a 20% na cor-assinatura **daquele** perfil + check 16. Hover: fundo `elev`.
- Clicar numa opção: a opção mostra "Salvando..." no lugar da afinidade por ~0,8s, as outras ficam a .55, e então **a página inteira troca de tema** (cores, banner padrão, moldura, emblema, painel de métricas). No protótipo, reaproveite a mesma função de tema do seletor de pré-visualização.
- Erro (estado do seletor): aviso "Não foi possível trocar o perfil" / "Tente novamente em instantes." (textos do app).
- Com um perfil só, o bloco não aparece.

### 3.3 Métricas do perfil
No app, o painel de métricas (`ProfileMetricsViews.tsx`) muda de **estilo conforme o perfil** (`utils/profileMetricThemes.ts`): Arena Tática (Conqueror, Daredevil, Survivor), Metas (Achiever), Mistério (Seeker), Squad (Socializer), Painel Analítico (Mastermind). Desenhe completo o **Arena Tática**; nos outros perfis mostre o herói do estilo (eyebrow, título e selo) com a nota "estrutura completa em revisão futura".

Arena Tática, na coluna principal, **acima** das conquistas:
1. **Herói** (card, `linear-gradient(160deg, elev, surface)`, `padding: 24px 26px`), selo no canto "Arena Tática" (chip neutro com mira): eyebrow **"CENTRAL DE DOMÍNIO"**, título Cinzel 700 22 **"Sua campanha está sob controle"**, texto 13 `textMuted` **"Rank, precisão e avanço da classe aparecem como uma operação em andamento."** (textos do app). Quatro blocos em grade de 4 (gap 12, 100px, raio 16, fundo `bg` a 60%, ícone 18 `accent`, rótulo 12 `textSubtle`, valor Inter 700 24 tabular): **Precisão 81%** · **Posição 12º** · **Tempo ativo 11h 20min** · **Campanha 56%**.
2. **"Status da operação"** ("Visão rápida da campanha atual."): três barras de 8px com rótulo e valor: **Tópicos dominados 4/8** · **Conteúdos explorados 14/26** · **Atividades concluídas 9/15**.
3. **"Inteligência de combate"** ("Visão tática do desempenho nos 5 eixos."): radar SVG 280×280, eixos **Precisão 81 · Progresso 56 · Exploração 54 · Atividades 60 · Presença 71**, 4 anéis em `line`, polígono `accentSoft` com contorno 2px `accent`. Tabela equivalente escondida para leitor de tela.

Os números da Posição (12º) e da Sequência (5 dias) batem com o resto do protótipo (Ranking e Notificações).

### 3.4 Leituras (painel "Leitura adaptativa")
É o painel do app que mostra **o que a IA leu** da última sessão de estudo (`AnalysisPanel` em `ProfileMetricsViews.tsx`). Card logo abaixo das métricas:
- Título **"Leitura adaptativa"** com ícone radar, legenda **"Última interpretação da IA durante sua sessão de estudo."**
- Dois chips: emoção (ícone rosto) **"Concentrada"** e coleta visual (ícone câmera) **"Coleta visual desligada"**. Os rótulos possíveis da câmera no app: "Coleta visual ativa", "Coleta visual desligada", "Permissão negada", "Câmera indisponível".
- "Ciclo atual: 14" (13 `textSubtle`) e o resumo 14/1.6: **"A IA percebeu concentração e respondeu com desafios curtos antes da leitura."** (padrão do app: "A IA percebeu {emoção} e respondeu com {ação}.")
- Três caixas lado a lado (grade de 3, gap 12, fundo `elev`, raio 14, `padding: 14px 16px`), títulos do app:
  - **"Leituras da IA"**: • Você rende mais quando começa praticando. • Seu ritmo de leitura caiu no fim da sessão.
  - **"Ajustes aplicados"**: • Equações do 1º grau começa por desafios curtos. • Textos divididos em blocos menores.
  - **"Pontos de atenção"** (fundo `accent` a 8%, borda `accent` a 22%): • Frações levou o dobro do tempo médio.
- Estado sem leitura: **"Ainda não há leitura recente. Estude um tópico para gerar análise adaptativa."** (texto do app).

## 4. Grade (1164px úteis)
```
[seletor flutuante: estado + perfil]
┌ banner 3:1 (1164 × 240, raio 20) ....................... [Trocar banner] [⚙] [📚] [🎒] ┐
│  ◎ retrato 160 sobe 72px sobre a borda                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌ identidade (4/12 = 374,67, sticky top 28) ┐ ┌ coluna principal (8/12 = 769,33) ─────────────┐
│ nome · chip do perfil                      │ │ Métricas (herói Arena + 4 blocos)             │
│ Alternar perfil ativo (3 pílulas)          │ │ Status da operação · Inteligência de combate  │
│ afinidade (barra + legenda)                │ │   (lado a lado, 2 colunas)                    │
│ Turma · Sequência · Posição                │ │ Leitura adaptativa                            │
│                                            │ │ Conquistas (a grade aprovada)                 │
│                                            │ │ Última atividade                              │
└────────────────────────────────────────────┘ └───────────────────────────────────────────────┘
```
A coluna de identidade é sticky, então não sobra área vazia ao lado da coluna principal mais longa.

## 5. Estados (seletor flutuante)
"Com dados" · "Banner próprio" · "Um só perfil" · "Trocando perfil" · "Erro ao trocar perfil" · "Sem métricas" · "Sem leitura recente" · "Carregando"
- **Sem métricas** (aluno novo): o herói mostra "Nenhuma missão em campo" / "As métricas aparecerão aqui conforme você avançar nos conteúdos, atividades e leituras adaptativas." (textos do app) e os outros cards de métrica somem.
- **Carregando:** esqueletos do banner, da identidade e dos cards.
- As bolinhas de perfil do seletor trocam o tema **e** o estilo do painel (Achiever → Metas, Seeker → Mistério…).

## 6. Não fazer
- Não mexer no visual da grade de conquistas.
- Não mostrar as afinidades como pizza.
- Não usar cor fixa nos gráficos: `accent` e variações de luminosidade dele.

## 7. Aceite
- [ ] Banner nítido de 240px com "Trocar banner"; retrato sobreposto.
- [ ] "Alternar perfil ativo" troca o tema da página inteira.
- [ ] Painel Arena com herói, 4 blocos, status e radar, textos do app.
- [ ] Painel "Leitura adaptativa" com as 3 caixas e o estado vazio.
- [ ] Conquistas e Última atividade iguais ao v1.

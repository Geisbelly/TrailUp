Tela 04 — **Tópico** (onde o aluno estuda). Arquivo de saída: `v2/04-topico.html`.

É a tela mais importante do produto e a única **em modo foco**: no app, a barra de abas some. Na web, **a sidebar some**, o header do shell fica e a página ganha um layout de leitura em três colunas. Perfil de exemplo: **Conqueror**, que tem **timer** e **modo batalha**, e para quem o mentor fala como "Guia".

## 1. Fonte da verdade
- Tela: `mobile/src/app/(tabs)/trilha/[id].tsx`.
- Intro: `components/TopicoIntroSummary.tsx`. Personalização: `components/PersonalizedTopicView.tsx`.
- Blocos: `ContentRenderer.tsx`, `MarkdownBlock.tsx`, `funcionais/AudioPlayer.tsx`, `PresentationSlidesBlock.tsx`, `DocumentBlock.tsx`, `StudyCardsBlock.tsx`, `VideoBlock.tsx`.
- Atividades: `ActivityRenderer.tsx` → `QuestionActivity.tsx` (múltipla escolha, V/F, lacuna, dissertativa).
- Timer: `components/ia/IAHeaderTimer.tsx`, `IATimerCard.tsx`. Batalha: `IABattleHeaderChip.tsx`, `IABattlePanel.tsx`, `BossVictoryModal.tsx` (imagens em `mobile/src/assets/bosses/boss-01..31.png`).
- Presença: `VigiaDePresenca.tsx`. Bag: `bag/BagEditorModal.tsx`.

## 2. Dados de exemplo
Tópico **"Equações do 1º grau"** (5º da trilha), **personalizado** para Conqueror. 7 blocos, na ordem reorganizada pela IA:

| # | Rótulo do bloco (tag) | Título | Tipo | Estado |
|---|---|---|---|---|
| 1 | Atividade personalizada | Desafio relâmpago: encontre o x | múltipla escolha, 3 questões | concluído |
| 2 | Conteúdo personalizado | Meta: isolar a incógnita em 3 movimentos | texto (markdown) | concluído |
| 3 | Conteúdo personalizado | Narração: equações no campo de batalha | áudio guiado (4:12) | concluído |
| 4 | Apresentação | Estratégia de resolução, passo a passo | deck de 8 slides | **atual** (slide 3) |
| 5 | Conteúdo | Lista de exercícios — Prof. Helena | PDF do professor (4 páginas) | disponível |
| 6 | Cartões de estudo | Revisão rápida | 6 cards | disponível |
| 7 | Atividade | Verdadeiro ou falso: propriedades da igualdade | V/F, 4 questões | disponível |

Progresso: **43%**, "Nesta versão: 3 de 7 blocos concluídos". Boss do conteúdo: 62/100 de vida. Tempo no módulo: 07:42.

## 3. Grade (1440×900, sem sidebar)

```
┌──────────────────────────── header do shell 68px ────────────────────────────────┐
├ barra do tópico 64px: [← Trilha]  5. Equações do 1º grau  ▓▓▓░░ 43%   [⏱][?]   │
├──────────────┬───────────────────────────────────────────┬───────────────────────┤
│ sumário      │ coluna de leitura (máx. 760)              │ trilho do perfil      │
│ 280px        │ card do bloco atual                       │ 300px                 │
│ sticky       │                                           │ Tempo no módulo       │
│              │                                           │ Modo batalha          │
├──────────────┴───────────────────────────────────────────┴───────────────────────┤
│ rodapé fixo 76px: [Voltar]                 Bloco 4 / 7              [Continuar]  │
└──────────────────────────────────────────────────────────────────────────────────┘
```
- `main`: `margin-left: 0; padding: 0;`. Corpo: `display: grid; grid-template-columns: 280px minmax(0, 1fr) 300px; gap: 32px; padding: 164px 40px 116px;` (68 do header + 64 da barra + 32).
- A coluna central centraliza um contêiner de **largura máx. 760**.
- **Sem timer e sem batalha** (Seeker, Socializer): o trilho da direita some, e a grade vira `280px minmax(0,1fr)`. **Só timer** (Mastermind, Achiever): o trilho mostra só o card de tempo.
- Entre 1024 e 1279px: o sumário vira gaveta (botão "Sumário" na barra do tópico) e o trilho da direita desce para o topo da coluna central como faixa horizontal de 72px.

## 4. Blocos

### 4.1 Barra do tópico (`position: fixed; top: 68px; left: 0; right: 0; height: 64px; z-index: 25;`)
Fundo `surface` a 92% com `backdrop-filter: blur(8px)`, `border-bottom: 1px solid var(--line)`, `padding: 0 40px`, flex, gap 20:
- "← Trilha" (botão fantasma pequeno) → `03-trilha.html`.
- Título: número em círculo 26 (Inter 700 12, fundo `accentMuted`, cor `accent`) + "Equações do 1º grau" em Cinzel 700 18 `text`.
- Chip accent com faísca "Módulo personalizado".
- Progresso (`margin-left: auto`): barra de 200×6 (trilho `background`, preenchimento `accent`) + "43%" Inter 700 13 `text` + legenda 12 `textSubtle` "Nesta versão: 3 de 7 blocos concluídos". Carregando a personalização: legenda troca para "Atualizando conteúdo personalizado..." com spinner 12.
- **Timer compacto** (`IAHeaderTimer`): pílula `padding: 6px 12px`, fundo `surfaceElevated`, ícone relógio 14 `accent`, "07:42" Inter 700 13 tabular. Nos últimos 45s de um timer regressivo: borda e ícone `warning`, rótulo 12 "Atenção ao tempo".
- **Guia** (?) 36×36, `aria-label="Ajuda sobre este módulo"`: abre "Guia tutorial do módulo", "Este guia resume como este módulo foi apresentado para o seu perfil.", com passos para progresso → timer → batalha → bloco → mentor.

### 4.2 Sumário (coluna esquerda, `position: sticky; top: 164px`)
Card `padding: 18px 16px`. Eyebrow "NESTE MÓDULO". Lista dos 7 blocos, cada linha 52px (raio 12, `padding: 8px 10px`, gap 12):
- Marcador 28×28 (hexágono): concluído = check em `accent` sobre `accentMuted`; atual = número em `background` sobre `accent`; disponível = número `textSubtle` com borda `border`.
- Texto: tag do bloco (micro, caixa alta, `textSubtle`) sobre o título (Inter 500 13.5 `text`, 1 linha com reticências).
- Linha atual: fundo `accentMuted`, borda esquerda de 3px `accent`, `aria-current="step"`.
- Os blocos são **navegáveis para trás** (revisar) e **só até o atual para frente**. Uma linha à frente de uma atividade não respondida fica com cadeado 12 e `cursor: not-allowed` (regra `bloqueiaAvanco`).
- No pé do card, `margin-top: 14px`: botão fantasma pequeno "＋ Guardar na Bag" (texto do app), que abre o `BagEditorModal` ligado ao bloco atual.
**Por quê:** o app mostra só "Bloco 4 / 7". Na web, com espaço, mostrar a sequência inteira responde "onde estou e quanto falta" sem competir com o conteúdo.

### 4.3 Card do bloco atual (coluna central)
Card `padding: 28px 32px`, raio 20.
- Cabeçalho: chip do rótulo do bloco ("Apresentação"; conteúdo gerado leva o chip accent com faísca) + à direita "Bloco 4 / 7" (12 `textSubtle`, tabular). `margin-bottom: 14px`.
- Título do bloco em Cinzel 700 24/1.25 `text`. Tipo do conteúdo abaixo (13 `textSubtle`): "Apresentação personalizada".
- Divisor ornamental (`OrnamentDivider`, igual ao do Login) com `margin: 20px 0`.
- Corpo, conforme o tipo:

**a) Texto / markdown** (blocos 2 e 5 de texto): Inter 17/1.75 `text`, parágrafos com 16px entre si, H3 do markdown em Inter 700 19 `text` com 28px acima, listas com marcador `accent`, `code` inline em Inter 600 15 sobre `surfaceElevated` raio 6, citações com borda esquerda 3px `accent` e texto `textMuted`, fórmulas em bloco centralizado (`2x + 6 = 14 → x = 4`) em Inter 600 20 tabular. Tom do exemplo (assinatura editorial Conqueror: assertivo, meta explícita, fecha com chamada para execução):
> **Meta deste bloco:** resolver qualquer equação do 1º grau em três movimentos.
> Uma equação é uma balança em equilíbrio. Tudo o que você fizer de um lado, faz do outro, e o resultado continua valendo.
> 1. Junte os termos com x de um lado.
> 2. Leve os números para o outro.
> 3. Divida pelo coeficiente de x.
> Resultado mensurável: ao fim deste bloco, você resolve `3x − 5 = 10` em menos de um minuto. Execute agora no desafio seguinte.

**b) Áudio guiado** (`AudioPlayer`): painel `padding: 20px`, fundo `surfaceElevated`, raio 16. Linha 1: retrato do guardião 48 (círculo, anel `accent`) + "Narração: equações no campo de batalha" (Inter 600 15) + legenda "Pronto para ouvir" (12 `textSubtle`). Linha 2: botão play/pause 52 circular `accent` (ícone `background`, `aria-label` "Reproduzir áudio"/"Pausar áudio"), barra de posição (trilho 6 `background`, preenchimento `accent`, pino 14 `text`, `aria-label="Posição do áudio"`), tempo "1:36 / 4:12" 12 tabular, botão reiniciar 36 (`aria-label="Reiniciar áudio"`). **Sem controle de velocidade**: o app não tem.
- Estados: "Preparando áudio..." (spinner no lugar do play); erro "Não foi possível reproduzir o áudio." (banner compacto de erro dentro do painel + botão fantasma "Tentar de novo" + link "Seguir pelo texto", que vai para o bloco de texto; **o estudo não trava**).

**c) Apresentação** (`PresentationSlidesBlock`, bloco atual): palco 16:9 (largura 100% da coluna = 696, altura 391), raio 14, fundo `background`, `1px solid var(--line)`, com o slide renderizado (iframe). No slide de exemplo: título "Passo 2 — leve os números para o outro lado" e o diagrama da balança. Abaixo (gap 12): "Slide anterior" (ícone-botão 36), contador "3 / 8" tabular, "Próximo slide" (36), à direita "Tela cheia" (ícone expandir, fantasma pequeno). Ao reabrir: pílula acima do palco "Continuar do slide 3" (chip accent clicável). Nome do guardião como assinatura no canto do palco, 11 `textSubtle`: "Apresentação personalizada · Amina".
- Estados: "Montando páginas..." (esqueleto 16:9 com shimmer); erro "Não foi possível carregar a apresentação." + "Tentar novamente" + link "Ler como texto".

**d) PDF / documento** (`DocumentBlock`, bloco 5): barra de ferramentas (altura 44, fundo `surfaceElevated`, raio `14px 14px 0 0`): alternador segmentado "Modo página" / "Modo rolagem", "Página 1 de 4", "Anterior"/"Próxima", "Tela cheia", "Abrir arquivo". Visualizador abaixo (altura 560, fundo `#ffffff` na página, sombra suave). Estados: "Carregando PDF...", "Renderizando página 2...", erro "Não foi possível renderizar o PDF nesta tela." + "Abrir arquivo".

**e) Cartões de estudo** (`StudyCardsBlock`): card grande 560×300 centralizado, raio 20, fundo `surfaceElevated`, borda `borderStrong`. Frente: pergunta em Cinzel 700 22 centralizada. Verso: resposta em Inter 17/1.6. Virar com animação 3D de 400ms. Abaixo: "Anterior" · "3 / 6" · "Próximo" e "Recomeçar" (fantasma). Dica 12 `textSubtle`: "Clique no card para virar." (o app diz "Toque no card para virar.").

### 4.4 Atividade (`QuestionActivity`), exemplo do bloco 7 ou do bloco 1 em revisão
Card igual ao do bloco. Cabeçalho da questão: "Questão 2 de 4" (12 `textSubtle`) + barra segmentada de 4 traços (4px de altura, gap 4; respondida `accent`, atual `text`, futura `border`).
- **Múltipla escolha:** enunciado Inter 600 18/1.5 `text`. Alternativas em coluna, gap 10: botão de largura total, altura mínima 56, raio 14, `padding: 14px 16px`, fundo `surface`, `1px solid border`, letra em círculo 28 (A/B/C/D, Inter 700 13, fundo `surfaceElevated`) + texto 15. Selecionada: borda `accent` 2px, fundo `accentMuted`, letra com fundo `accent` e texto `background`. `role="radiogroup"`.
- **Verdadeiro/Falso:** afirmação + dois botões largos lado a lado (50% cada, altura 64): "Verdadeiro" e "Falso", com ícone check/X. Ajuda 12 `textSubtle`: "Marque se a afirmação estiver correta."
- **Lacuna:** texto com o campo inline (largura 180, altura 38, estilo input), placeholder "Digite a palavra ou expressao" (sic, sem acento no app; corrija para "expressão"). Instrução: "Complete a lacuna no texto abaixo."
- **Dissertativa:** textarea de 160px, placeholder "Digite sua resposta...". Depois de enviar: "Validando resposta com IA..." (spinner) → "Questão registrada" / "Sua resposta foi registrada. Avance para as proximas questoes para concluir a atividade." (corrija os acentos: "próximas questões").
- Botão primário **"Confirmar resposta"** (largura automática, alinhado à direita), desabilitado até escolher.
- **Feedback de acerto:** banner `success` (ícone check 18, fundo `success-bg`, borda `1px solid rgba(95,217,154,.35)`, raio 14, `padding: 14px 16px`): **"Resposta correta!"** e "Você ganhou 30 pontos. Continue assim!". A alternativa certa fica com borda `success` e check. Botão "Próxima".
- **Feedback de erro:** banner `danger` **"Resposta incorreta."**, "Revise o conteudo e tente novamente." (corrija: "conteúdo"). A alternativa marcada fica com borda `danger` + X. Ações: **"Tentar novamente (50% dos pontos)"** (secundário) e **"Ver minha resposta e gabarito"** (fantasma). Gabarito aberto: "Gabarito: B" em chip neutro.
- **Modo pensante** (quando ativo): nota 12.5 `textMuted` num bloco `info-bg`: "Modo pensante ativo: mostramos apenas se está certo ou errado. Quer ver o gabarito ou tentar novamente? A nova tentativa vale metade da pontuação."
- **Resposta não salva:** banner `warning` "Resposta não salva" / "Não foi possível salvar sua resposta. Confirme novamente para tentar sincronizar."
- **Tempo esgotado (atividade com timer):** banner `warning` "Tempo encerrado para esta tentativa" e, ao concluir, "Você concluiu a atividade, mas o tempo expirou antes. Pontuação final: 24 pontos com penalidade de 20%."

### 4.5 Trilho do perfil (coluna direita, `position: sticky; top: 164px`, gap 16)
1. **Tempo no módulo** (`IATimerCard`): card `padding: 18px 20px`. Rótulo "Tempo no módulo" (13 `textSubtle`), valor "07:42" em Inter 700 32 tabular, legenda 12.5 `textMuted` "Tempo suave para manter foco — não afeta sua pontuação." Anel de progresso opcional de 56px à direita (janela sugerida de 4 min, "Janela sugerida de leitura para ajudar no ritmo."). Rodapé: fantasma pequeno "Desativar temporizador".
2. **Modo batalha** (`IABattlePanel`, só Conqueror/Daredevil/Survivor): card `padding: 18px 20px`, borda `1px solid accent` a 35%. Eyebrow "MODO BATALHA". Linha: imagem do boss 72×72 (`assets/bosses/boss-07.png`, raio 14, fundo `background`) + nome "Boss do conteúdo" (Inter 700 15) e arquétipo "Boss arcano" (12 `textSubtle`). Barra de vida: altura 10, raio 999, trilho `background`, preenchimento `danger` (é uma barra, não texto; ok pela §2.3), rótulo "62 / 100" tabular 12 + ícone coração. Texto 13 `textMuted`: "Leia este conteúdo e acerte atividades vinculadas para reduzir a vida do boss." Rodapé: "Desativar" (fantasma pequeno). Cada acerto: a barra desce com animação de 300ms e aparece "−12" em `danger-text` flutuando 600ms.
3. **Decisão de personalização** (`PersonalizedTopicView`): card `padding: 18px 20px`, fundo `accentMuted`, borda `accentSoft`. Eyebrow "DECISÃO DE PERSONALIZAÇÃO". Texto 13/1.55 `textMuted`: "Personalizamos a ordem e o formato deste módulo para que a apresentação fique mais aderente ao seu perfil e ao seu momento de estudo." Linha "A trilha começa por desafios e depois aprofunda o conteúdo." (texto do `TopicoIntroSummary` para ordem prática-primeiro).

### 4.6 Rodapé de navegação (`position: fixed; bottom: 0; left: 0; right: 0; height: 76px; z-index: 25;`)
Fundo `surface` a 95% + blur, `border-top: 1px solid border` (como no app), `padding: 0 40px`, flex `space-between`:
- **"Voltar"** (secundário), desabilitado no bloco 1.
- Centro: "Bloco 4 / 7" 13 `textSubtle` + 7 pontos de 8px (concluído `accent`, atual `text` com anel, futuro `border`).
- **"Continuar"** (primário, ícone seta à direita). No último bloco vira **"Concluir módulo"**. Com atividade não respondida, o botão fica **visualmente** desabilitado mas **clicável**: mostra o toast `warning` **"Responda a atividade"** / "Confirme a resposta da atividade para liberar o avanço." (o app faz isso de propósito, para o botão não parecer travado).
- O botão do mentor (§7.10.2 do mestre) sobe para `bottom: 100px` nesta tela, para não cobrir o rodapé.

## 5. Estados (seletor de pré-visualização)
"Visão geral do módulo" · "Texto" · "Áudio" · "Apresentação (atual)" · "PDF" · "Cartões" · "Atividade" · "Acerto" · "Erro" · "Erro de mídia" · "Você ainda está aí?" · "Módulo concluído" · "Boss derrotado" · "Carregando" · "Sem conteúdos"

- **Visão geral do módulo** (`TopicoIntroSummary`, índice −1, antes de iniciar): o card central vira a intro. Título "Visão Geral do Módulo" (Cinzel 700 24). Três KPIs lado a lado (gap 12, cards internos de fundo `surfaceElevated`, `padding: 16px`, raio 16): "Etapas" 7 · "Conteúdos" 4 · "Atividades" 3. Texto 15/1.6 `textMuted`: "Você vai passar por texto, áudio, apresentação, guias em PDF e cartões." / "Há 2 desafios" / "A trilha começa por desafios e depois aprofunda o conteúdo." / "Use o guia no topo para entender timers, retomada e progresso." Link fantasma "Fazer teste e pular módulo". Rodapé: **"Iniciar tópico"** (primário); se já iniciado: **"Continuar"**; se concluído: + **"Revisar tópico"** (secundário). O sumário mostra todos os blocos com o marcador "disponível".
- **Erro de mídia:** o bloco atual (áudio) mostra o erro do áudio **e** o card ganha, no pé, a faixa `info`: "Este formato está indisponível agora. Você pode seguir pelo texto deste módulo." + botão "Ir para o texto". O rodapé segue habilitado.
- **Você ainda está aí?** (`VigiaDePresenca`): modal P centralizado, ícone ampulheta, título "Você ainda está aí?", botões **"Voltar a estudar"** (primário) e **"Vou pausar"** (secundário). Com o tempo esgotado, título "Tempo esgotado".
- **Pausa sugerida** (timer de leitura): toast `info` "Hora de pausar" / "O tempo desta etapa terminou. Revise o material e avance quando estiver pronto."
- **Módulo concluído:** modal M **"Módulo desbloqueado!"**, subtítulo "Estes módulos foram desbloqueados após a conclusão. Selecione para onde deseja seguir." Lista de opções (linhas de 64px com hexágono e título): "6. Razão e Proporção". Botões: **"Ficar neste módulo"** (secundário) e o primário "Ir para Razão e Proporção".
- **Boss derrotado** (`BossVictoryModal`): modal P, imagem do boss 160×160 em escala de cinza com brilho `accent`, título Cinzel **"Parabéns!"**, "Você derrotou o boss!", botão **"Continuar jornada"**.
- **Pontuação pendente:** toast `warning` "Pontuação pendente" / "A atividade foi salva, mas não foi possível registrar a pontuação agora. Tente sincronizar novamente em instantes."
- **Carregando:** barra do tópico com esqueletos, sumário com 7 linhas-esqueleto e card central de 480px. Mensagem **"Carregando trilha"** / "Organizando conteúdos e atividades para você."
- **Sem conteúdos:** card vazio, título **"Sem conteúdos"**, corpo **"Esta trilha ainda não possui conteúdos cadastrados."**, botão secundário "Voltar para a trilha".
- **Erro ao carregar:** card de erro "Erro ao carregar trilha" + "Tentar novamente". Tópico inexistente: "Trilha não encontrada".

## 6. Não fazer
- Não pôr fundo ilustrado, partículas ou brilho atrás do texto de leitura: esta tela minimiza distração.
- Não misturar a navegação de blocos com a de slides (o deck tem seus próprios controles).
- Não inventar controle de velocidade no áudio.

## 7. Aceite
- [ ] Sidebar oculta. Barra do tópico e rodapé fixos. Três colunas que recolhem conforme o perfil (troque para Seeker e o trilho da direita some).
- [ ] Todos os tipos de bloco e de atividade desenhados, com os textos do app.
- [ ] "Continuar" bloqueado-mas-clicável com a orientação.
- [ ] Falha de mídia oferece caminho alternativo sem travar o estudo.
- [ ] Os 15 estados no seletor.

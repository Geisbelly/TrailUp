Tela 03 — **Trilha**. Arquivo: `v2/03-trilha.html`. **Já aplicado nesta revisão**; este prompt registra o que foi feito e serve para regerar a tela.

## 1. Feedback
> "Sobre as trilhas, a ideia é ser: mapa, árvore e listagem. Apesar de ter gostado muito da trilha linear desenhada, ainda falta o mapa." · "Gostei muito, mas falta o mapa."

## 2. Fica como está (ela gostou)
- A **trilha desenhada**: a estrada em serpentina, com o trecho percorrido aceso em `accent` com brilho, o próximo trecho tracejado e o trecho bloqueado pontilhado.
- Hexágonos SVG dos tópicos (concluído / atual / disponível / bloqueado), o marcador "Você parou aqui" com o rosto do guardião, o chip de status sob cada nó.
- Faixa do mundo (HUD) com emblema, título, 56% e barra de progresso, e o botão do guia.
- Painel de prévia à direita (360px, altura toda), com progresso do módulo, conteúdos/atividades, bloco "Módulo personalizado" e o acordeão "Todos os módulos".
- Mentor flutuante, Bag, modal de tópico selado, guia em passos, todos os estados do seletor.

## 3. O que mudou

### 3.1 O modo Mapa virou um mapa de verdade
No v1, "Mapa" era só a serpentina sobre o cenário. Agora:
- **Fundo:** `assets/map-<perfil>.webp` (a arte de mapa do app, `getProfileArtwork(perfil, 'map')`) em vez do `trail-<perfil>.webp`. Os modos Árvore e Lista continuam com o `trail-`.
- **Mar:** 7 paralelos ondulados e 7 meridianos levemente curvos em `borderStrong` a 10–14%, como o globo do `MapaViewStable.tsx`.
- **Continente:** uma massa de terra irregular atrás de tudo, preenchida com `surface` a 70%, contorno `borderStrong` a 60% e uma segunda linha de costa tracejada por fora (`2 6`, 35%). Sombra deslocada 14px para baixo.
- **Países:** cada tópico é um território de contorno orgânico (14 vértices com raio variando 74%–110%, curvas suaves), centrado no nó da serpentina, largo o bastante para **encostar nos vizinhos**, como fronteiras. Cores = tabela do `MapaViewStable`, em cor **sólida** (`color-mix` com o fundo) para a sobreposição não escurecer:
  | Estado | Preenchimento | Fronteira |
  |---|---|---|
  | concluído | `accentStrong` 62% sobre `bg` | `accent` 2px |
  | atual | `accent` 48% sobre `bg` | `text` 3px |
  | disponível | `accent` 16% sobre `surface` | `borderStrong` 2px |
  | bloqueado | `surface` 92% sobre `bg` | `border` 2px tracejada `6 6` |
  O país selecionado ganha fronteira `text` 1px mais grossa.
- **Posições com deriva:** os nós saem da grade da serpentina com um desvio pequeno (seno/cosseno, ±9% da coluna e ±16px), como o `driftX/driftY` do app, para não parecer tabuleiro.
- **Estrada por cima** dos países, ligando as capitais: é a mesma trilha desenhada do v1.
- **Rótulo do nó:** nome do país (ex.: "Reino de Números Naturais") + linha "Capital: Torre de Números Naturais" (11.5 `textMuted`, uma linha com reticências) + chip de status.
- **Rosa dos ventos** 96px no canto inferior esquerdo do tabuleiro, `text` a 28%.
- Hexágono do nó no mapa: 72px (era 88), para caber o território.
- O tabuleiro do mapa deixa 70px livres no pé, para o botão do mentor não cobrir o país atual.

### 3.2 Seletor de modo: "Ver trilha como"
- Faixa de 44px logo abaixo do HUD (`top: 136px`; o tabuleiro desceu para `top: 192px`).
- "Ver trilha como" (12.5 `textMuted`) + controle segmentado com **Mapa · Árvore · Lista**, cada um com ícone 15 (mapa dobrado, organograma, lista com marcadores). O ativo tem fundo `accentMuted`, contorno `accentSoft` e ícone em `accent`.
- O modo do perfil (`pickVisual`: Mapa para Seeker/Conqueror/Daredevil, Árvore para Mastermind/Survivor, Lista para Achiever/Socializer) leva o selo **"SUGERIDO"** (10/700, `accent` sobre `accentMuted`) e é o que abre primeiro.
- À direita: "Vista sugerida para o perfil Conqueror." ou, se o aluno trocou, o link **"Voltar à vista sugerida"**.
- Trocar de perfil no seletor de pré-visualização volta para o modo sugerido do novo perfil.
- URL: `?modo=mapa|arvore|lista`.
- O guia ganhou o passo "Mapa, árvore ou lista": "A trilha abre na vista sugerida para o seu perfil, mas você pode trocar quando quiser."
- Textos da faixa com `text-shadow` escuro, para ler sobre cenário claro (Achiever).

## 4. Aceite
- [ ] Os três modos trocam pelo seletor; o sugerido muda com o perfil.
- [ ] No Mapa, cada tópico é um país com fronteira, nome e capital, e a estrada liga todos.
- [ ] Nenhum rótulo coberto pelo botão do mentor.

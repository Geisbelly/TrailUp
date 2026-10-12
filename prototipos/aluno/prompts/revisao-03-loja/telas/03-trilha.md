Tela 03 — **Trilha**, ajuste. Arquivo: `v3/03-trilha.html` (edite o atual). Mudança pequena; o mapa, a árvore, a lista e o painel da direita não mudam.

## 1. Feedback
Print da Trilha (modo Mapa, perfil Conqueror) com a fileira "Ver trilha como · Mapa (sugerido) · Árvore · Lista" marcada em vermelho:

> "tirar"

## 2. O que muda
- **Sai o seletor de modo** (`.viewbar`): o rótulo "Ver trilha como", as três pílulas, o selo "sugerido" e o texto "Vista sugerida para o perfil…".
- **O modo vem só do perfil**, sem escolha do aluno:

| Perfil | Modo |
|---|---|
| Seeker, Daredevil, Conqueror | Mapa |
| Survivor, Mastermind | Árvore |
| Socializer, Achiever | Lista |

- O tabuleiro sobe e ocupa o espaço do seletor (`top` de 192 para 136px, logo abaixo da faixa de progresso).
- O guia da trilha perde o passo "Mapa, árvore ou lista". O passo "A jornada" passa a dizer: "A trilha aparece do jeito do seu perfil: no mapa, cada tópico é um país; na árvore, um galho; na lista, uma linha."
- As bolinhas de perfil do seletor de pré-visualização continuam: é por elas que se vê cada modo no protótipo.

## 3. Por que isso revoga uma decisão da revisão 02
A revisão 02 leu "a ideia é ser: mapa, árvore e listagem" como **três vistas à escolha do aluno**, com a do perfil marcada como sugerida (decisão G1). O "tirar" da Geis sobre o seletor resolve a dúvida no outro sentido: **cada perfil tem a sua vista**, que era a regra original da revisão 01.

## 4. Aceite
- [ ] Nenhum seletor de modo na Trilha.
- [ ] Conqueror abre no mapa, Mastermind na árvore, Achiever na lista.
- [ ] Sem espaço vazio onde ficava o seletor.

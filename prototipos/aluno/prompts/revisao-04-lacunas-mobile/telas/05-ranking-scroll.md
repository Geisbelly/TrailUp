Ajuste (pedido da Geis) — **Ranking com um scroll só**. Arquivo: `v4/05-ranking.html`.

## Pedido
"Deixar a parte da esquerda fixa e seus cards mais finos para ficar melhor encaixado, e a parte da direita topar em cima, e deve poder clicar no usuário pra ir pro perfil dele. Hoje a tela tem dois scrolls, a ideia é ser só um."

## O que muda
- **Coluna da esquerda fixa.**
  - O título "Sala de honra", os 3 cards de categoria e "Sua posição" ficam numa coluna da altura da tela, parada (sticky no topo), sem scroll próprio.
  - "Sua posição" fica no pé da coluna.
- **Cards finos.**
  - Ícone de 38px, título de 15,5px e a descrição numa linha só, com reticências. Cada card fica com cerca de 72px, contra os ~110 de antes.
  - Em telas baixas, o protótipo esconde nesta ordem: a legenda e a nota (≤740px), a descrição (≤660px) e o "Próximo acima" (≤580px). Assim nada é cortado.
- **Direita no topo.** O cabeçalho saiu de cima das duas colunas, então a categoria aberta começa no alto da página. Ela é a **única coisa que rola** (o scroll da área principal).
- **Aluno clicável.**
  - Clicar num aluno do pódio, numa linha da tabela ou no "Próximo acima" abre o **perfil público** (`assets/social.js`, o mesmo do Social, item 5).
  - Clicar em você mesmo leva ao seu Perfil (`08-perfil-hub.html`).
  - Aluno sem perfil definido aparece no perfil público com as iniciais, nunca com o rosto de outro perfil (mesma regra da tabela).

## Aceite
- [ ] Um scroll só; a esquerda não rola e não corta em telas de 540px a 900px de altura.
- [ ] A categoria aberta começa no topo.
- [ ] Pódio, tabela e "Próximo acima" abrem o perfil público; você abre o seu Perfil.

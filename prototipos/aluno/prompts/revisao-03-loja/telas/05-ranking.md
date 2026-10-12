Tela 05 — **Ranking**, ajuste. Arquivo: `v3/05-ranking.html` (edite o atual). O resto da revisão 02 (ícones por perfil, pódio, tabela, filtros) fica igual.

## 1. Feedback
Print do Ranking com três marcações: a barra de rolagem cinza da direita, a faixa "Sua posição" no rodapé da tabela e o espaço vazio embaixo das categorias (setas para ele e para o topo da tabela):

> "Corrigir barras de scrolling para deixar no tema e mover o card de posição do user logado deixando mais destacado"
> "duas sugestões de lugares, mas vc vê o que fica melhor"

## 2. Barras de rolagem
Regra geral desta revisão (vale para todas as telas, ver `00-regras-gerais.md` §2.5).

## 3. "Sua posição" sai do rodapé e vai para a coluna das categorias
**Lugar escolhido: embaixo das categorias** (das duas sugestões, a outra era o topo da tabela). Por quê:
- a coluna das categorias é **sticky**: o card fica visível enquanto a classificação rola, que era a função da faixa do rodapé;
- ocupa o espaço vazio que ela também marcou;
- no topo da tabela ele rolaria junto e sumiria.

Card (fundo `linear-gradient(160deg, accent 22%, elev)`, borda `accent`, raio 16, sombra suave, `padding 18px`):
1. Eyebrow **"SUA POSIÇÃO · {categoria aberta}"**.
2. Linha principal: retrato 56 com anel `accent` e brilho + **"12º"** Georgia 700 44 `accent` + "de 28" 14 `textMuted` + o valor à direita (Inter 700 16, tabular).
3. **Próximo acima** (caixa `bg` 55%, raio 12): avatar 28 + "**Ana C.** · 11º" + "Faltam **21min** para passar." A diferença é calculada dos valores da própria tabela: minutos no Tempo, pontos percentuais no Progresso, pontos nos Pontos. Em 1º lugar: "**Você lidera esta categoria.**"
4. Nota 12 `textSubtle`: "Sua posição continua aqui mesmo quando você filtra os colegas."

O card acompanha a categoria aberta (Tempo 12º, Progresso 9º, Pontos 7º) e o estado "Você no pódio" (Pontos 3º).

**Sai:** a faixa `.mine` no rodapé do card da categoria.

## 4. Aceite
- [ ] Barra de rolagem fina, na cor do tema.
- [ ] Card "Sua posição" destacado embaixo das categorias, sempre visível, com quanto falta para o próximo.
- [ ] Sem faixa de posição no rodapé da tabela.

# Parte 4 — Ranking (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/05-ranking.html`.

## De onde vem

- **v4:** `05-ranking.html`. Coluna da esquerda com "Ranking · Sala de honra · Classificações da turma", os três cartões de categoria (Tempo de Estudo, Progresso, Pontos, cada um com a arte do perfil e "Você: Nº · valor") e o bloco **"Sua posição"** (posição de 28, valor, "Próximo acima" com quanto falta para passar). Coluna da direita com a categoria aberta: cena da arena, filtros (Geral, Meu perfil, Outros perfis), pódio de 3 com pedestais e medalhas, e a tabela da classificação (posição, aluno, perfil, valor). Empates mantêm a posição; filtrar não muda as posições; tocar num colega abre o perfil público; tocar em você leva ao seu Perfil.
- **App hoje:** `app/(tabs)/ranking/index.tsx` (lista de categorias) e a categoria aberta em outra tela, com o pódio (`RankingPodium`).

## O que fica igual ao v4 (não mude)

- As 3 categorias com os textos, os 12 alunos de exemplo e os valores; o total de 28; as regras de empate, de filtro e de "Faltam … para passar"; aluno sem perfil aparece com as iniciais e "Perfil não definido".
- Os estados: Com dados, Filtro: Meu perfil, Filtro sem resultado, Você no pódio, Pódio com 2 alunos, Carregando, Vazio. Novo no celular: Sua posição aberta (a folha de baixo à vista).

## O que muda no celular

### Uma tela, não duas colunas
- **Topo:** "Ranking" (eyebrow) e "Sala de honra" (Georgia 22), com a Bag à direita.
- **Categorias como 3 abas** logo abaixo do topo, dividindo a largura: arte do perfil (26px) + nome curto ("Tempo", "Progresso", "Pontos"), para as três caberem em 360px sem rolar. A aba ativa fica preenchida. Os cartões grandes do v4 saem; o nome completo e a descrição aparecem embaixo das abas ("**Tempo de Estudo** · Quem mais dedicou…").
- **Pódio** sobre a cena da arena, numa faixa de ~250px: 2º · 1º · 3º, com retratos de 56/72/48px, a medalha, o nome (uma linha), o valor e o pedestal com a posição. O pedestal encolhe (64/44/32px), para o pódio caber sem rolar.
- **Filtros** (Geral, Meu perfil, Outros perfis) como pílulas de 40px, abaixo do pódio, com a nota "As posições originais da categoria são preservadas."
- **Classificação** como lista de linhas de 60px: posição, retrato, nome em cima e o perfil (bolinha + nome) embaixo, valor à direita. Sem cabeçalho de tabela.

### "Sua posição" fixa embaixo
- No celular, sua posição precisa estar sempre à vista: vira uma **barra fixa acima da barra de abas** (64px), com o seu retrato, "12º de 28", o valor e "Faltam 21min para passar Ana C." (ou "Você lidera esta categoria."). Tocar abre uma folha de baixo com o bloco inteiro do v4 (próximo acima com o retrato, e a nota de que a posição não muda com o filtro).
- Sem pontuar: "Você ainda não pontuou nesta categoria."

### Toques
- Tocar num colega (pódio ou lista) abre o perfil público. O perfil público entra na parte do Social; até lá, mostra um aviso.
- Tocar em você leva à aba Perfil.

## Fora do escopo desta parte

- O perfil público do colega (parte do Social).

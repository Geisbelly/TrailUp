# Parte 9 — Loja (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/12-loja.html`.

## De onde vem

- **v4:** `12-loja.html`. Cabeçalho "Recursos da jornada · Loja"; cartão de saldo com "Como ganhar" ao lado; grade de 4 itens (Prazo extra, Segunda chance, Dica, Trocar formato); coluna lateral com "Na sua Bag", "Limites · 6º ano B" e "Extrato"; confirmação em janela no meio da tela.
- **App hoje:** `app/(tabs)/perfil/loja.tsx`, empilhada na pilha do Perfil.

## O que fica igual ao v4 (não mude)

O catálogo (nomes, descrições, artes, preços, a regra do preço que dobra a cada unidade e as unidades grátis), "Como ganhar" com os 4 valores e a nota "Cada ação paga uma vez só…", a frase do saldo ("Gastar nunca muda seu XP nem sua posição no ranking"), os estados de cada cartão (Comprar, Pegar grátis, Comprando…, Faltam N moedas com a barra do saldo contra o preço, Bloqueado com o portão da Segunda chance e "Revisar Frações →", Indisponível, Limite atingido), os avisos dentro do cartão, os limites, o extrato e a confirmação com "Saldo: 38 → 33".

Estados: Com dados, Saldo baixo, Comprando, Compra concluída, Saldo insuficiente, Item desligado, Limite de prazo atingido, Carregando, Erro ao carregar.

## O que muda no celular

- **Tela da pilha do Perfil**, não aba: topo com voltar (para o Perfil), eyebrow "Recursos da jornada", título "Loja" e o botão da Bag à direita. A barra de abas fica, com Perfil ativo. Chega-se pelo atalho "Loja" do Perfil e pela moeda do topo do Social.
- **Uma coluna só, nesta ordem:** saldo, itens, Na sua Bag, Limites, Extrato. A coluna lateral do v4 desce para o fim.
- **Saldo:** número grande com a moeda e a frase. "Como ganhar" vira uma linha que abre e fecha embaixo do saldo, fechada no início, para os itens aparecerem na primeira tela.
- **Itens:** cartões de largura total, com a arte de 56px à esquerda, nome e descrição; os chips; o portão ou aviso; e no pé o preço à esquerda e o botão de 44px à direita.
- **Confirmação** em folha de baixo, com a arte, "Comprar Dica?", o texto de onde fica guardado, o saldo antes → depois e os botões Comprar (largo) e Cancelar, um embaixo do outro.
- **Depois da compra**, além do aviso no cartão, um aviso no rodapé com "Ver na Bag", que abre a Bag.
- **Na sua Bag:** as linhas com a quantidade e "Abrir Bag" (a mesma Bag das outras telas).
- **Extrato:** as 6 últimas linhas; "Ver extrato completo" abre o extrato inteiro numa folha de baixo.
- **Carregando:** esqueletos do saldo e de 3 cartões. **Erro:** o aviso no meio com "Tentar novamente".

Última tela do mesmo console: **Aprovações**.

Mantenha a linguagem visual já estabelecida. Contexto importante: **esta aba só é visível para uma única pessoa** (a dona do projeto/administradora) — nenhum outro professor vê ou acessa esta tela. É uma tela de administração interna, não uma feature comum do produto.

**Não tenho print desta tela** (só a administradora do projeto consegue acessá-la) — o conteúdo abaixo é descrito integralmente por escrito, com base no código.

## O que ela faz

Lista professores que se cadastraram na plataforma e ainda não foram liberados para usar o console. A administradora aprova ou recusa cada cadastro.

## Conteúdo de hoje

- Um contador de quantos cadastros estão pendentes.
- Um cartão por professor pendente, com: nome, instituição, disciplina, data do cadastro, e uma breve descrição que ele escreveu no cadastro.
- Duas ações por cartão: **Aprovar** (libera o acesso) e **Recusar** (remove o cadastro — ação também irreversível, já que apaga o cadastro).
- Estado vazio: "Nenhum professor aguardando aprovação".

## O que peço

Desenhe a lista de pendentes (com pelo menos 2-3 cartões de exemplo) e o estado vazio. É uma tela simples e de baixíssima frequência de uso — priorize deixar óbvio, num relance, quantos itens pendentes existem e qual ação fazer em cada um. "Recusar" precisa ser visualmente diferenciado o suficiente de "Aprovar" para não ser clicado por engano, já que apaga o cadastro da pessoa.

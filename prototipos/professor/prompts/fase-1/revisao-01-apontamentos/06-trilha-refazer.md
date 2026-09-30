Apontamento sobre a tela que você já gerou: **Trilha**. Este é o apontamento mais importante desta rodada — a leitura é: **refazer**, não ajustar.

## O problema identificado

A proposta anterior não representa a arquitetura real do projeto. **Isto não é uma questão de embelezar — é questão de modelagem de dados.** A estrutura da tela precisa corresponder à estrutura real do sistema, ou ela vira uma interface que promete algo que o sistema não entrega.

## O que preservar do que você já fez

- O estilo visual e as cores do editor de trilha.
- O botão e o fluxo de **"Gerar trilha com IA"** (o apontamento 07 detalha como esse fluxo específico precisa evoluir).

Todo o resto da estrutura pode — e deve — mudar.

## A estrutura correta (isto substitui o que foi desenhado antes)

A hierarquia real é: **trilha → tópicos → conteúdos/cards → questões.**

- **As questões estão ligadas ao conteúdo selecionado** — não ao tópico diretamente, e não a uma "atividade" isolada e genérica.
- **Cards podem ser reaproveitados entre diferentes conteúdos.** Um card não pertence exclusivamente a um único conteúdo — a mesma peça de estudo pode aparecer vinculada a mais de um conteúdo.
- **Não modele isso como uma árvore rígida onde "um tópico possui questões exclusivas".** Essa suposição contradiz a arquitetura real e não pode aparecer na interface, nem visualmente nem na navegação.
- **Todo tópico precisa expor, de forma visível e editável:**
  - nome
  - descrição
  - conteúdos/cards relacionados a ele
  - questões relacionadas (via o conteúdo selecionado)
  - ações de editar e excluir

## O que peço

Redesenhe a tela da Trilha em cima dessa hierarquia corrigida. Ao abrir um tópico, o professor precisa navegar por dentro dele vendo os conteúdos/cards relacionados, e ao selecionar um conteúdo específico, ver as questões daquele conteúdo — não uma lista de questões "do tópico" desconectada de qual conteúdo elas pertencem. Deixe claro na interface que um card pode estar vinculado a mais de um conteúdo (por exemplo, mostrando em quantos conteúdos aquele card aparece, ou permitindo vincular um card existente a um novo conteúdo em vez de forçar a criação de um card novo).

Mantenha visível, para cada tópico: nome, descrição e as ações de editar/excluir — isso não muda em relação ao que já existe hoje, só a forma como o conteúdo por baixo dele se organiza.

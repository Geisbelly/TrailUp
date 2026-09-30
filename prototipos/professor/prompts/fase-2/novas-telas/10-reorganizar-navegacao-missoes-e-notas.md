Prompt de ajuste — reorganizar "Missões" e "Notas" num único item de navegação

## Contexto

Os prompts `01-missoes-cadastrar-e-aprovar.md` e `05-notas-correcao-dissertativas-e-trabalhos.md` foram enviados e gerados como se fossem **2 itens separados de sidebar**. Isso foi um erro meu: nenhuma issue do repositório diz onde essas telas devem ficar na navegação — eu presumi item de sidebar para cada uma, sem base. A estrutura correta, decidida depois, é: **um único item de sidebar "Missões"**, com **2 abas internas** — "Missões" e "Notas" — em vez de 2 itens separados.

## CORRIGIR — navegação

- Remover "Notas" da lista de itens da sidebar.
- O item de sidebar **"Missões"** passa a abrir uma tela com **2 abas no topo** (mesmo padrão de navegação por abas já usado em outras telas do console, ex. Personalizações): **"Missões"** e **"Notas"**.
- Aba **"Missões"**: exatamente o conteúdo já gerado a partir do prompt `01-missoes-cadastrar-e-aprovar.md` (cabeçalho, lista de missões, formulário de nova/editar missão, painel de sugestões da IA) — sem alteração de conteúdo.
- Aba **"Notas"**: exatamente o conteúdo já gerado a partir do prompt `05-notas-correcao-dissertativas-e-trabalhos.md` (cabeçalho, fila de correção, painel de correção, navegação entre entregas) — sem alteração de conteúdo.
- O link/atalho **"Corrigir entregas"**, que já existe no card de missão, deve trocar para a aba "Notas" (dentro da mesma tela), em vez de navegar para um item de sidebar diferente.

## O que NÃO fazer

Não recrie o conteúdo de nenhuma das duas telas — elas já existem e estão corretas. Esta correção é só sobre **onde** as duas vivem na navegação, não sobre o que cada uma mostra.

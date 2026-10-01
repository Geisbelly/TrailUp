Prompt de ajuste — reorganizar "Eventos", "Rank de batalhas" e "Conquistas" num único item de navegação

## Contexto

Os prompts `02-eventos.md`, `03-rank-de-batalhas.md` e `06-conquistas-da-classe.md` foram enviados e gerados como se fossem **3 itens separados de sidebar**. Isso foi um erro meu: nenhuma issue diz onde essas telas devem ficar na navegação — eu presumi um item de sidebar para cada uma, sem base.

Há uma pista real que eu não tinha usado: a issue **#156** se chama literalmente **"Painel do professor para eventos, batalhas e métricas"** — o próprio título já trata os três como parte de um só painel, não telas separadas. A estrutura correta é: **um único item de sidebar "Eventos"**, com **3 abas internas** — "Eventos", "Rank de batalhas" e "Conquistas".

## CORRIGIR — navegação

- Remover "Rank de batalhas" e "Conquistas" da lista de itens da sidebar.
- O item de sidebar **"Eventos"** passa a abrir uma tela com **3 abas no topo** (mesmo padrão de navegação por abas já usado em outras telas do console, ex. Personalizações): **"Eventos"**, **"Rank de batalhas"** e **"Conquistas"**.
- Aba **"Eventos"**: exatamente o conteúdo já gerado a partir do prompt `02-eventos.md` (cabeçalho, lista de eventos, formulário de novo/editar evento, resumo ao abrir, painel "durante o evento", painel "resultado") — sem alteração de conteúdo.
- Aba **"Rank de batalhas"**: exatamente o conteúdo já gerado a partir do prompt `03-rank-de-batalhas.md` (seletor de critério da arena, ranking, confrontos) — sem alteração de conteúdo. Ignore a "nota de posicionamento" que estava naquele prompt sugerindo isso como item isolado ou aba de Eventos — esta correção resolve essa dúvida a favor de aba dentro de "Eventos".
- Aba **"Conquistas"**: exatamente o conteúdo já gerado a partir do prompt `06-conquistas-da-classe.md` (cabeçalho, lista de conquistas da turma, formulário de nova/editar conquista) — sem alteração de conteúdo.
- Se a aba "Rank de batalhas" ou "Conquistas" tiverem, no que já foi gerado, algum link que dependia de estarem "dentro" de um evento específico (ex. a arena só existe dentro de um evento aberto), mantenha esse vínculo — a mudança aqui é só onde as 3 telas vivem na navegação principal, a relação entre elas continua a mesma.

## O que NÃO fazer

Não recrie o conteúdo de nenhuma das três telas — elas já existem e estão corretas. Esta correção é só sobre **onde** as três vivem na navegação, não sobre o que cada uma mostra.

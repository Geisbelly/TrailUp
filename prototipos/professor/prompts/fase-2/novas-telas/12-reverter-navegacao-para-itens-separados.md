Prompt de correção — reverter a navegação agrupada, voltar a itens separados na sidebar

## Contexto

Os prompts `10-reorganizar-navegacao-missoes-e-notas.md` e `11-reorganizar-navegacao-eventos-batalhas-conquistas.md` pediram pra agrupar Missões+Notas num item só e Eventos+Rank de batalhas+Conquistas em outro. A dona do projeto não gostou do resultado — em particular, deixou explícito que **"evento e conquistas são coisas diferentes, não deveriam ficar juntos"**. Este prompt desfaz os dois agrupamentos.

## CORRIGIR — voltar a itens de sidebar separados

Desfazer exatamente o que os prompts `10` e `11` pediram. A sidebar volta a ter um item próprio para cada uma destas telas, sem abas agrupando-as:

- **Missões** — item de sidebar próprio, só com o conteúdo já gerado a partir do prompt `01-missoes-cadastrar-e-aprovar.md` (lista de missões, formulário, painel de sugestões da IA). Remover a aba "Notas" de dentro dela.
- **Notas** — volta a ser item de sidebar próprio, com o conteúdo já gerado a partir do prompt `05-notas-correcao-dissertativas-e-trabalhos.md`.
- **Eventos** — item de sidebar próprio, só com o conteúdo já gerado a partir do prompt `02-eventos.md`. Remover as abas "Rank de batalhas" e "Conquistas" de dentro dela.
- **Rank de batalhas** — volta a ser item de sidebar próprio, com o conteúdo já gerado a partir do prompt `03-rank-de-batalhas.md`.
- **Conquistas** — volta a ser item de sidebar próprio, com o conteúdo já gerado a partir do prompt `06-conquistas-da-classe.md`.

O link "Corrigir entregas" (do card de missão) volta a navegar para o item de sidebar "Notas", em vez de trocar de aba dentro de "Missões".

## Não recrie o conteúdo

Nenhuma das 5 telas muda de conteúdo aqui — só o lugar de cada uma na navegação principal, voltando ao estado de antes dos prompts `10` e `11`.

## Nota sobre a sidebar

Com esta reversão, a sidebar tem os 7 itens originais + **Missões, Notas, Eventos, Rank de batalhas e Conquistas** — 12 itens no total. Se isso ficar visualmente pesado, é uma preocupação válida a levantar de volta com a dona do projeto, mas **não** resolva reagrupando por conta própria de novo — a estrutura foi rejeitada uma vez, uma nova tentativa de agrupamento precisa vir dela.

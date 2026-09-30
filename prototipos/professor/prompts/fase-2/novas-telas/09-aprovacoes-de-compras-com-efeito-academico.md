# Prompt — nova tela: Aprovações de compras com efeito acadêmico

## Identificação
- Nome da tela: proposta como uma **aba dentro de "Aprovações"** (a tela de Aprovações já existe para cadastro de professores — esta seria uma segunda aba, "Extensões de prazo", dentro da mesma tela) em vez de um item de sidebar novo, já que o padrão de "fila de pedidos aguardando decisão do professor" é o mesmo.
- Fonte de conteúdo: issue **#144** (Loja com itens de consequência real), especificamente o trecho "Extensão de prazo exige aprovação do professor. O prazo é dele; uma moeda não pode revogar decisão pedagógica sozinha." — anexada a este prompt.

## Referências de estilo
Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md`.

## Contexto (o que esta tela não é)
A loja em si — onde o aluno gasta moeda para comprar itens — é uma tela do **app do aluno (mobile)**, fora do escopo deste prompt. Esta tela cobre só o lado do professor: **quando um aluno compra um item com efeito acadêmico real** (o exemplo citado na fonte é extensão de prazo), a compra debita a moeda dele na hora, mas o efeito de verdade (o prazo mudar) **só se aplica depois que o professor aprova**.

## Estrutura da tela

### Aba "Extensões de prazo" (dentro de Aprovações)
Lista de pedidos pendentes, cada um com: aluno (avatar+nome), a atividade/missão para a qual o prazo seria estendido, quanto tempo de extensão foi comprado, e quando a compra foi feita. Ordenar pelos mais urgentes primeiro (prazo original mais próximo de vencer).

### Ações por pedido
- **Aprovar** — aplica a extensão de verdade ao prazo daquela atividade para aquele aluno.
- **Recusar** — pede um motivo curto (mesmo padrão de "recusar com motivo" já usado nesta mesma tela para cadastro de professores). Deixe explícito no texto de confirmação que **recusar devolve a moeda gasta ao aluno** — a compra não pode ficar debitada sem o efeito nem o dinheiro de volta.

### Histórico
Uma seção ou filtro para ver pedidos já decididos (aprovados/recusados), para o professor conseguir conferir decisões passadas — mesmo padrão de "estado: pendentes / já decididos" já usado na fila de correção de notas (`05-notas-correcao-dissertativas-e-trabalhos.md`).

## Estados
- **Nenhum pedido pendente:** estado vazio simples, no mesmo padrão das outras telas ("Nenhuma extensão de prazo aguardando aprovação.").

## O que NÃO fazer
Não desenhe a loja do aluno nesta tela — só a fila de aprovação do professor. Não deixe "Recusar" sem deixar claro que a moeda volta para o aluno.

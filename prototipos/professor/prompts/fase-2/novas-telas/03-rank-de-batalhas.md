# Prompt — nova tela: Rank de batalhas (arena)

## Identificação
- Nome da tela: **Rank de batalhas** (novo item de sidebar, ou uma aba dentro de "Eventos" — ver nota de posicionamento abaixo).
- Fonte de conteúdo: issues **#154** (Batalhas em evento: individual, entre guildas e ranqueada) e **#155** (Arenas com rank por tipo), ambas anexadas a este prompt. As duas estão marcadas "em planejamento", com "Decisões tomadas" já registradas — use-as como regra firme.

## Nota de posicionamento
Uma arena **só existe dentro de um evento aberto** (fonte #155: "sem arena permanente" — `ranks.periodo` é fornecido pela janela do evento). Por isso, dependendo de como o Claude Design organizar a navegação, esta tela pode ser uma **aba dentro do evento** (prompt `02-eventos.md`) em vez de um item de sidebar isolado — decida o que ficar visualmente mais claro, mas **não desenhe uma arena "solta", sem estar amarrada a um evento específico**.

## O que uma batalha/arena é, de acordo com o que já foi decidido
- **Arena** é, estruturalmente, um "rank" com um critério e um período — os mesmos 3 critérios que já existem no sistema (**Pontuação**, **Tempo de Estudo**, **Percentual Concluído**). O professor **escolhe entre os critérios existentes**, nunca digita ou inventa um critério novo (fonte #155 — critério é código, não dado; um critério desconhecido faria o ranking inteiro zerar silenciosamente).
- **Batalha** é o confronto em si, dentro da arena: aluno contra aluno, guilda contra guilda, ou modalidade ranqueada.
- **Participação é sempre opt-in** — nunca a única via para XP, medalha ou recompensa (fonte #154). O rank de arena **fica fora do rank principal da turma**.

## Estrutura da tela

### Dentro de um evento com batalha habilitada
- **Seletor de critério da arena** — os 3 já existentes (Pontuação / Tempo de Estudo / Percentual Concluído), sem campo de texto livre.
- **Botão "Entrar na arena"** (para o aluno, se esta parte for reaproveitada em mobile) ou, no console do professor, uma visão de **quem já se inscreveu** — inscrição é sempre explícita, nunca automática.
- **Vitória é definida por acerto, nunca por tempo** — se a interface mostrar tempo, ele só aparece como critério de **desempate**, nunca como métrica principal do confronto (fonte #154 — tempo como critério primário reintroduziria pressão para perfis que não reagem bem a isso).

### Ranking da arena (durante o evento)
- Tabela/pódio no mesmo padrão visual já usado na tela **Rankings** (`07-rankings-fase-2.md`) — reaproveite o componente de pódio (top 3) + tabela, não desenhe um novo componente do zero.
- **Cuidado com o "progresso normalizado":** em rankings pequenos (poucos participantes), normalizar por "% do líder" faz o segundo colocado aparecer com um número enganosamente baixo (ex. 12%) mesmo tendo ido bem. Nesta tela, **não mostre a barra/percentual de progresso do padrão de Rankings** quando a arena tiver poucos participantes — mostre só a posição e o valor bruto do critério (fonte #155, armadilha registrada explicitamente).
- Deixe visualmente claro (ex. um rótulo ou nota) que **este ranking não afeta o rank principal da turma**.

### Confrontos (quando a modalidade for batalha direta, não só ranking corrido)
- Lista de confrontos: dois participantes (ou duas guildas) lado a lado, critério de vitória, resultado.
- **Pareamento por proximidade de desempenho** (nunca aleatório) — para batalha entre guildas, o pareamento é por força agregada da guilda, não por sorteio (fonte #154, decisão explícita contra massacre previsível).
- **Quem perde não perde pontos** — o placar da batalha só soma para quem participa; o perdedor simplesmente ganha menos que o vencedor, nunca um valor negativo. Deixe isso implícito no visual (nenhum valor com "−" aparece nesta tela).

## Estados
- **Nenhuma arena ativa no momento:** estado vazio explicando que arenas só existem dentro de um evento aberto com batalha habilitada, com um link para a tela de Eventos.
- **Arena com poucos participantes:** aplicar a correção de normalização descrita acima.

## O que NÃO fazer
Não permita ao professor digitar um critério de arena livre — só escolher entre os 3 já existentes. Não misture o rank da arena com o rank principal da turma em nenhum componente visual. Não use tempo como critério primário de vitória. Não mostre valores negativos de pontuação para quem perde uma batalha.

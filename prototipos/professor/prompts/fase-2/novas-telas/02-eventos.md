# Prompt — nova tela: Eventos

## Identificação
- Nome da tela: **Eventos** (novo item de sidebar).
- Fonte de conteúdo: issues **#152** (Eventos: criação com pontuação, medalhas e recompensas), **#141** (Desafios de turma — primeira fatia de #152), **#153** (Guildas: grupos persistentes) e **#164** (o cliente não decide o valor do evento), anexadas a este prompt.
- **Estado da decisão de produto:** #152 e #153 estão marcadas "em planejamento", mas ambas têm uma seção "Decisões tomadas" (ou, no caso de #153, "Todas as decisões estão tomadas") que já é suficiente para desenhar a tela — só a implementação de banco/API ainda não começou. Use essas decisões como regra firme, não como sugestão.

## O que um evento é, de acordo com o que já foi decidido
Um evento é **por turma** (nunca transversal a várias turmas), com uma janela de tempo, regras, pontuação, medalhas e recompensas. Pode ter escopo opcional a um tópico específico. Durante o evento, alunos participam **individualmente ou em guilda** (grupo formado livremente pelos próprios alunos, nunca pelo professor) — guilda é sempre opcional.

## Estrutura da tela

### Cabeçalho
Título "Eventos" + subtítulo (ex. "Desafios com janela de tempo, pontuação e recompensas para a turma."). Botão principal **"+ Novo evento"**.

### Lista de eventos
Cards ou linhas, cada um com: nome do evento, turma, janela de tempo (início–fim), status (**Rascunho** / **Aberto** / **Encerrado**), e um resumo de participação (ex. "18 de 34 alunos participando", "3 guildas formadas"). Eventos encerrados mostram um resumo do resultado final direto no card (vencedor/destaque).

### Formulário "Novo evento" / "Editar evento" (só antes de abrir)
- **Nome** e **descrição/regras** (texto livre explicando o desafio).
- **Turma** e, opcionalmente, **tópico** vinculado.
- **Janela de tempo** — início e fim.
- **Modalidades habilitadas:** *Individual* (sempre obrigatória e não pode ser desmarcada — fonte #153/#154: se guilda pontuar e não houver via individual equivalente, "guilda opcional" deixa de ser verdade na prática) e *Em guilda* (opcional, o professor decide se habilita).
- **Tamanho máximo de guilda**, só visível se "Em guilda" estiver habilitada — é o único parâmetro que controla quantas guildas a turma tende a formar (fonte #153).
- **Pontuação** — como o desempenho no evento vale pontos. Deixe explícito na interface que **a pontuação individual do evento entra no rank principal da turma**, mas o **resultado agregado da guilda não** (fonte #152) — isso deveria aparecer como um texto de ajuda ao lado do campo, não só como regra de banco invisível.
- **Medalhas concedidas** — seletor com pelo menos duas: uma de **participação** (todo mundo que participou) e uma de **destaque** (resultado/vencedor). A interface não deve permitir cadastrar só a medalha de vencedor sozinha, sem a de participação — é uma decisão explícita da fonte (dar medalha só ao topo torna o evento "sem valor para os demais participantes").
- **Recompensa** (opcional, além da medalha) — liga à mesma carteira/moeda usada em outras partes do sistema, não um segundo saldo paralelo.

### Ao abrir o evento (mudar de Rascunho para Aberto)
Mostrar um resumo de confirmação antes de confirmar a abertura: quantos alunos serão elegíveis, quantas guildas existem hoje na turma e serão "congeladas" para este evento (fonte #153: a composição das guildas é copiada no momento da abertura; trocar de guilda depois não altera o evento já aberto). Deixe claro nesse resumo que **quem não estiver em nenhuma guilda participa individualmente sem perder pontuação por isso**.

### Painel "Durante o evento" (evento com status Aberto)
Conteúdo pensado para **decisão do professor agora**, não histórico (fonte #156 — o painel do "durante" é curto de propósito):
- Quem ainda não começou a participar.
- Quem começou e parou (abandono no meio do evento).
- Participação por modalidade (quantos indivíduos vs. quantos em guilda, e quantas guildas ativas) — para o professor perceber se alguém ficou sozinho sem ter escolhido isso.

### Painel "Resultado" (evento Encerrado)
- Resultado final, medalhas concedidas (participação + destaque, separadas), e comparação com a média/linha de base da turma.
- Se houver guildas, um ranking de guildas **separado** do resultado individual — nunca misturado como se fosse a mesma lista.

## O que NÃO fazer
Não permita cadastrar um evento onde só a modalidade em guilda existe — a individual é obrigatória. Não misture o resultado agregado da guilda com o rank individual da turma. Não deixe o painel "durante o evento" virar uma tela de histórico/analytics — isso é o painel "resultado", depois do encerramento.

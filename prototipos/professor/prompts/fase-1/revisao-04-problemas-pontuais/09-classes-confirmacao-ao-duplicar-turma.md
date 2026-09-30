Prompt de ajuste pontual — tela **Classes**, problema: duplicar turma não pede confirmação.

## O problema

Ao clicar em duplicar uma turma, a ação é executada imediatamente — a evidência mostra a notificação "Turma duplicada como uma nova entidade... 'Física I (cópia)' foi criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original" aparecendo já como fato consumado, sem nenhum diálogo prévio pedindo para confirmar.

## CORRIGIR

- Antes de duplicar uma turma, mostre um diálogo de confirmação com: o nome da turma original, uma explicação curta do que vai acontecer (uma cópia será criada com a mesma trilha, sem alunos matriculados e sem histórico), e dois botões claramente diferenciados — "Cancelar" e "Duplicar" (ou "Confirmar").
- Só depois dessa confirmação a cópia deve ser criada e a notificação de sucesso deve aparecer.

## MANTER

- O comportamento da duplicação em si (cópia com a mesma trilha, sem alunos, sem histórico) e a notificação de sucesso após confirmar — ambos corretos.
- O diálogo de confirmação de **excluir** turma, já pedido em rodada anterior, segue o mesmo padrão visual deste.

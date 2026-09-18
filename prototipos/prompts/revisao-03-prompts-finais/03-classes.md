Prompt final de ajuste — tela **Classes (Turmas)**. Esta tela está quase certa — é o menor prompt das 4, ajuste fino.

## MANTER

- Título "Turmas" + subtítulo, botão "+ Nova Turma" no canto superior direito.
- Os cards de turma: nome + pílula da matéria + linha "N alunos" + botão "Alunos" — mantenha essa base.
- O modal "Nova Classe / Turma" (Descrição da turma, Matéria existente, Nova matéria opcional, Criar Classe) — está bom, sem mudanças.
- O modal "Gerenciar Alunos" (dropdown de busca + botão Adicionar, lista de "Alunos Matriculados" com botão de remover) — está bom, sem mudanças.
- As ações **duplicar** e **excluir** já existem — mantenha as duas.

## CORRIGIR — visibilidade das ações do card

Hoje os ícones de editar/duplicar/excluir só aparecem quando o card está em hover/selecionado — no estado normal (sem mouse em cima), o card mostra só o nome, a matéria e o rodapé "N alunos / Alunos". Isso é bom para não poluir visualmente, mas em uma tela onde o professor mexe pouco (uso ocasional), pode não ficar óbvio que essas ações existem.

**Ajuste:** deixe os 3 ícones (editar, duplicar, excluir) **sempre visíveis** no canto superior direito do card, discretos (tamanho pequeno, cor neutra) — sem precisar de hover para aparecer. Isso resolve tanto o apontamento antigo (a versão só-texto "Matrículas / Abrir trilha / Duplicar / Excluir" era poluída demais) quanto evita o extremo oposto (esconder tudo atrás de hover, ruim em telas de toque/tablet, onde não existe hover).

## CORRIGIR — texto

- "1 alunos" → corrigir concordância para "1 aluno" quando for exatamente 1 (plural só quando for 2+).

## CONFIRMAR — ainda não testado

- O diálogo de confirmação de exclusão de turma (obrigatório desde a rodada 1) — desenhe-o explicitamente: um modal simples com o nome da turma, um aviso de que a ação é irreversível, e um botão de confirmar claramente diferenciado (cor de destrutivo) do botão de cancelar.

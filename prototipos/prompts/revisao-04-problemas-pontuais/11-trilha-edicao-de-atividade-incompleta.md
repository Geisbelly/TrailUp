Prompt de ajuste pontual — tela **Trilha**, problema: edição de uma atividade/questão está incompleta.

## O problema

Na lista "Atividades vinculadas", cada questão mostra, quando fechada, o tipo (ex.: "Múltipla escolha") e a pontuação (ex.: "2 pontos") como informação já cadastrada. Mas ao clicar em "Editar", o formulário que abre mostra **só o campo "Enunciado"**, com botões "Cancelar" e "Salvar questão" — o tipo, a pontuação, e (quando o tipo for múltipla escolha ou verdadeiro/falso) as alternativas e o gabarito **não aparecem** para edição.

## CORRIGIR

- O formulário de edição de uma questão precisa ter **os mesmos campos que existem na criação de uma nova questão** — no mínimo:
  - Enunciado (já existe).
  - Tipo da questão (múltipla escolha / verdadeiro-falso / dissertativa).
  - Pontuação.
  - Quando o tipo for múltipla escolha ou verdadeiro/falso: a lista de alternativas e qual delas é a correta (gabarito).
- Isso vale tanto para editar uma questão existente quanto para criar uma nova — os dois formulários devem ter o mesmo conjunto de campos, só mudando entre "criar" e "salvar alterações".

## MANTER

- A lista "Atividades vinculadas" com o resumo de cada questão fechada (número, tipo, pontos, enunciado, ações Editar/Duplicar/Excluir).
- Os botões "Cancelar" e "Salvar questão" no formulário de edição, sem mudança de posição.

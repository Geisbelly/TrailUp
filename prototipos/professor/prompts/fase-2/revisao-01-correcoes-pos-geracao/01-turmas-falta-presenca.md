Prompt de correção — tela **Turmas**, problema: falta a ação "Presença" no card de turma.

## Contexto

O protótipo já gerado da tela Turmas (baseado na V5) tem, no rodapé de cada card, só "Matrículas" e "Abrir trilha"/"Montar trilha" + os ícones de editar/duplicar/excluir. Isso está correto em relação à V5 — mas o **código real do console** (que é mais recente que a V5 e já está em produção) ganhou depois uma função de **Presença** que não existe na V5 e por isso não entrou em nenhum prompt anterior desta fase. É essa lacuna que este prompt corrige.

Fonte de verdade desta correção: os arquivos reais `frontend/src/components/console/ClassManagementSection.tsx` e `frontend/src/components/console/PresencaDialog.tsx`, anexados a este prompt.

## ADICIONAR — botão "Presença" no card de turma

No rodapé de cada card de turma, ao lado de "Matrículas", adicione um botão **"Presença"** (ícone de calendário com check, `CalendarCheck`), no mesmo estilo dos botões secundários já usados no card. Ele abre o modal descrito abaixo.

## ADICIONAR — modal "Registrar presença"

Abre ao clicar em "Presença" no card da turma correspondente.

- **Cabeçalho:** ícone de calendário-check + título "Registrar presença". Subtítulo: "Turma: **{nome da turma}**. Os pontos entram no ranking como qualquer outra atividade."
- **Linha com 2 campos lado a lado:**
  - **"O que registrar"** — select com 2 opções: **Presença** / **Participação**.
  - **"Dia da aula"** — campo de data (não pode ser uma data futura).
- **Campo "Pontos"** — numérico, opcional. Placeholder muda conforme o tipo: "padrão da turma" quando o tipo é Presença, "obrigatório" quando é Participação. Nota de ajuda abaixo, também dinâmica: "Em branco usa o padrão configurado da turma." (Presença) ou "Participação é sempre discricionária: informe quanto vale." (Participação).
- **Bloco "Quem esteve presente":**
  - Cabeçalho com o rótulo (ícone de pessoas) + botão pequeno à direita "Marcar todos" / "Desmarcar todos" (alterna conforme o estado atual).
  - **Por padrão, a turma inteira já vem marcada como presente** — o professor desmarca só quem faltou. Isso é intencional, não é um bug: a maioria das aulas tem quase todo mundo presente.
  - Lista rolável com checkbox + nome de cada aluno matriculado na turma. Se a turma não tiver nenhum aluno matriculado, mostrar o texto "Nenhum aluno matriculado nesta turma." no lugar da lista.
- **Rodapé:** Cancelar + botão principal **"Registrar"** (mostra "Registrando..." enquanto envia; fica desabilitado se não houver alunos ou nenhum selecionado).

## O que NÃO fazer

Não troque os botões "Matrículas" e "Abrir trilha"/"Montar trilha" nem os ícones de editar/duplicar/excluir que já foram especificados para o card — esta correção só **adiciona** o botão e o modal de Presença, não remove nem substitui nada que já existe no prompt `05-turmas-fase-2.md`.

# Classes (Turmas) — descrição detalhada do estado atual (com dados reais)

Descrição exata do que aparece nos 6 prints enviados. Duas turmas cadastradas: "SPD - 3N 2026/2" e "2N - 2026", ambas na matéria "Sistemas Paralelos e Distribuídos", cada uma com 1 aluno matriculado ("Aluno Demo").

## Mapa de correspondência entre os prints

| Print (ordem enviada) | O que mostra | Relação com os outros |
|---|---|---|
| 1 | Tela base "Turmas", limpa, com os 2 cards de turma | Estado inicial da tela. |
| 2 | Modal **"Nova Classe / Turma"** aberto sobre a tela base | Acionado pelo botão "+ Nova Turma". |
| 3 | Recorte aproximado dos 2 cards, com o card "SPD - 3N 2026/2" em estado de **hover/seleção**, mostrando 3 ícones de ação (editar, duplicar, excluir) | Mostra uma interação (passar o mouse ou selecionar) sobre o card da tela base — mesmos cards do print 1, sem cabeçalho da página neste recorte. |
| 4 | Tela base "Turmas", com um painel **"Editando Turma"** aberto entre o título da página e os cards | Acionado pelo ícone de editar (lápis) do print 3. |
| 5 | Modal **"Gerenciar Alunos"** aberto sobre a tela base | Acionado pelo botão "Alunos" de um dos cards. |
| 6 | Mesmo modal "Gerenciar Alunos", com o dropdown **"Selecione um aluno..."** aberto, mostrando a lista de opções | Continuação/interação do print 5. |

---

## Tela base "Turmas" (prints 1, 3 e 4)

### Cabeçalho da página

- Título "TURMAS" (fonte serifada), subtítulo "Gerencie suas turmas e os alunos vinculados."
- Botão roxo, canto superior direito: **"+ Nova Turma"**.

### Cards de turma (prints 1 e 4) — lado a lado, mesma largura

Cada card contém:
- Título (nome da turma), em negrito.
- Logo abaixo, uma "pílula" roxa com o nome da matéria em maiúsculas, dentro de uma borda roxa fina — ex.: "SISTEMAS PARALELOS E DISTRIBUÍDOS".
- Uma linha divisória horizontal.
- Rodapé do card: à esquerda, ícone de pessoas + "**1 alunos**" (nota: o texto está no singular "alunos" mesmo quando é só 1 — "1 alunos", sem concordância); à direita, um botão escuro em formato de pílula com ícone de "pessoa com +" e o texto **"Alunos"**.

**Os 2 cards, com seus dados exatos:**

| Card | Matéria | Alunos |
|---|---|---|
| SPD - 3N 2026/2 | Sistemas Paralelos e Distribuídos | 1 alunos |
| 2N - 2026 | Sistemas Paralelos e Distribuídos | 1 alunos |

### Estado de hover/seleção do card (só no print 3)

O card "SPD - 3N 2026/2" aparece com uma **borda roxa contínua** ao redor de todo o card (diferente da borda cinza-escura padrão), e no canto superior direito do título aparecem **3 ícones**, da esquerda para a direita:
1. **Lápis** (editar)
2. **Duas folhas sobrepostas** (duplicar)
3. **Lixeira** (excluir)

O card "2N - 2026", ao lado, permanece no estado normal, sem esses ícones visíveis.

### Painel "Editando Turma" (só no print 4)

Aparece como uma seção própria, com borda, inserida entre o cabeçalho da página e a grade de cards (empurra os cards para baixo):

- Ícone de lápis + título "EDITANDO TURMA".
- Campo **"NOME DA TURMA"** — input preenchido com "SPD - 3N 2026/2".
- Campo **"MATÉRIA"** — dropdown preenchido com "Sistemas Paralelos e Distribuídos".
- Dois botões lado a lado: **"💾 Salvar"** (roxo, preenchido) e **"Cancelar"** (link de texto, sem preenchimento).

---

## Modal "Nova Classe / Turma" (print 2)

- Ícone de capelo + título "NOVA CLASSE / TURMA", botão "×" de fechar.
- Subtítulo: "Crie a turma para gerenciar tópicos e conteúdos no console."
- **"DESCRIÇÃO DA TURMA \*"** — input com contorno roxo (em foco), placeholder "Ex: Turma 2026.1 - Programação Web".
- **"MATÉRIA EXISTENTE"** — dropdown, placeholder "Selecione ou crie uma nova abaixo".
- **"NOVA MATÉRIA (opcional)"** — dois campos: input "Nome da matéria" e textarea "Descrição da matéria".
- Rodapé: link "Cancelar" à esquerda, botão roxo com ícone de capelo **"🎓 Criar Classe"** à direita.

---

## Modal "Gerenciar Alunos" (prints 5 e 6)

- Ícone de pessoas + título "GERENCIAR ALUNOS", botão "×" de fechar.
- Subtítulo: "Turma: **SPD - 3N 2026/2**" (nome da turma em negrito).
- Seção **"ADICIONAR ALUNO"**: um dropdown "Selecione um aluno..." (contorno roxo quando em foco) ocupando a maior parte da largura, e um botão **verde** "+ Adicionar" à direita.
- Seção **"ALUNOS MATRICULADOS"**, com um contador em círculo mostrando **"1"**: uma linha/card por aluno, com avatar circular com iniciais ("AL"), nome em negrito ("Aluno Demo"), e-mail abaixo em cinza ("demo@trailup.app"), e um botão "×" à direita (remover da turma).

### Dropdown "Selecione um aluno..." aberto (só no print 6)

Lista de opções, cada uma mostrando nome completo em negrito + e-mail entre parênteses em cinza:
1. **Guilherme Domiciano Feitosa Silva** (guilhermedomicianosilva@gmail.com) — destacada com fundo roxo sólido (opção em foco/hover).
2. **fer** (geisbellyv@gmail.com)
3. **Geisbelly Test** (geisbelly@rede.ulbra.br)
4. **João Pedro Ribeiro Batista Araújo** (jpedro204jp@rede.ulbra.br)

---

## Observações factuais (sem julgamento de design)

- O texto "1 alunos" (sem concordância de número/plural) se repete nos dois cards — é o texto literal exibido.
- As ações de **duplicar turma** e **excluir turma**, pedidas no apontamento da rodada 1, já existem no card — mas só aparecem em um estado de hover/seleção (print 3), não ficam visíveis por padrão como no print 1/4. O ícone de excluir (lixeira) não foi testado nos prints enviados — não há print mostrando o diálogo de confirmação de exclusão.
- A lista de alunos no dropdown "Selecione um aluno..." mistura nomes completos formais (ex.: "João Pedro Ribeiro Batista Araújo") com um apelido curto isolado ("fer") — são todos alunos reais/de teste cadastrados na base, não um problema da tela em si, só um dado que chama atenção ao olhar a lista.

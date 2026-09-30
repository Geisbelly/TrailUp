Prompt de correção — tela **Personalizações**, aba "Por perfil", problema: nada abre quando não há material gerado.

## Contexto

No código já gerado (`Console Personalizacoes (Fase 2).dc.html`), no estado "Sem material (zeroData)" da aba "Por perfil": o card inteiro de cada perfil e o botão "Gerar" dentro dele **não têm nenhuma ação associada** — visualmente parecem clicáveis (o botão tem `cursor:pointer`), mas clicar neles não faz nada. O modal "Ver conteúdo gerado" existe no código (ele funciona corretamente a partir de outros pontos da tela, como o link "Ver material gerado" na aba "Por aluno"), só não está ligado a este card.

## CORRIGIR

- O **card do perfil**, quando clicado em qualquer área fora do botão "Gerar", deve abrir o modal "Ver conteúdo gerado" para aquele perfil — mesmo estando vazio. Nesse caso o modal abre no estado "Nenhum material gerado ainda para este perfil." (esse estado já existe no modal, só precisa ser alcançável a partir daqui).
- O **botão "Gerar"**, dentro do card, deve continuar sendo uma ação separada — a de disparar a geração do material daquele perfil — e não deve, ao ser clicado, também abrir o modal (evite os dois cliques fazendo a mesma coisa).
- Aplique a mesma lógica aos 7 cards da grade (Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever), não só a um.

## O que NÃO fazer

Não mude a aparência dos cards nem do botão "Gerar" — o problema é só a falta de ação associada a eles, não o visual.

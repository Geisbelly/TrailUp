Prompt de ajuste pontual — tela **Personalizações**, problema: modal não abre ao clicar no card do perfil.

## O problema

Ao clicar no card de um perfil BrainHex (ex.: "Sobrevivente") na aba "Por perfil", o modal "Ver conteúdo gerado" (já especificado em `04-personalizacoes.md`) não abre — o clique não tem efeito.

## CORRIGIR

- Garanta que clicar no card do perfil (fora do botão "Gerar") abre o modal "Ver conteúdo gerado" corretamente, mesmo quando o perfil está com status "Sem material" — nesse caso, o modal pode abrir mostrando o estado vazio ("nenhum material gerado ainda para este perfil"), em vez de simplesmente não reagir ao clique.
- O botão "Gerar" dentro do card continua dedicado a disparar a geração — clicar nele não deve abrir o modal, só clicar no restante do card.

## MANTER

- O restante do card (barra colorida, nome do perfil, badge de status, lista de formatos, botão Gerar) sem mudança.

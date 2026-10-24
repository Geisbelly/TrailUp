# Parte 10 — Tutorial de primeiro acesso (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/assets/tour.js`, ligado nas telas logadas.

## De onde vem

- **v4:** `assets/tour.js` (revisão 04 #7). 16 passos com as falas de `mobile/src/utils/firstAccessTour.ts` (v7), na voz da Amina (Conqueror). O passo atual vai na URL (`?tour=N`) e o tutorial atravessa as telas. Primeiro passo: apresentação da guardiã com a arte grande. Depois: escurece a tela, recorta o alvo e põe um cartão ao lado com Pular, Voltar e Próximo; o último botão é "Começar".
- **App hoje:** `FirstAccessTour` no app do aluno, que já roda no celular.

## O que fica igual ao v4 (não mude)

A ordem dos 16 passos, os títulos, as falas, a guardiã, o contador "N/16", a barra de progresso segmentada, Pular / Voltar / Próximo / Começar, Esc e as setas do teclado, e o passo na URL.

## O que muda no celular

- **Tudo dentro do aparelho**: o véu e o cartão cobrem só a tela do celular, abaixo da barra de status.
- **Apresentação** em tela cheia: a guardiã grande em cima, com o brilho da cor do perfil, e o texto e os botões embaixo.
- **Cartão do passo encostado embaixo** (acima do indicador de início), como uma folha. Se o alvo estiver na metade de baixo da tela, o cartão sobe para o topo. Botões de 44px; "Próximo" ocupa o resto da linha.
- **Os alvos são as peças do celular:**
  - Navegação principal → a barra de abas;
  - Precisou de ajuda? → o botão "?" da Trilha;
  - Seu progresso → o topo da Trilha;
  - Os tópicos → o tabuleiro;
  - Notificações → a lista;
  - Ranking → as abas de categoria;
  - Perfil → a identidade e as métricas;
  - Biblioteca → os números do topo;
  - Configurações → Coleta e acessos, Estilo das métricas e os interruptores de Câmera e Chat;
  - Relatório → o cartão de ação.
- **Fala da navegação**: no celular a Loja não é aba. A fala vira "Trilha, Notificações, Social, Ranking e Perfil. A Loja fica dentro do Perfil", e o resto não muda.
- **O botão "?" da Trilha** abre o tutorial no passo da página (o guia da página de que a fala fala).
- **Configurações → "Rever tutorial inicial" → "Abrir agora"** começa o tutorial do passo 1.
- **Primeiro acesso**: a Trilha ganha o estado "Primeiro acesso (tutorial)", que abre o tutorial no passo 1. O endereço direto é `03-trilha.html?tour=0`.

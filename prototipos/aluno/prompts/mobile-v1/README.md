# Protótipo do aluno no celular — v1

Pedido do Rafael em 23/10/2026: protótipos do **app do aluno no celular**, feitos **a partir do protótipo web v4** (`prototipos/aluno/v4/`), antes de ir para o código. É o caminho inverso da revisão 04: lá o web ganhou o que o celular tinha; aqui o celular ganha a cara e as decisões do v4, adaptadas ao toque e à tela pequena.

Mesmo método das revisões anteriores: **primeiro o prompt, depois a tela**, uma parte por vez, em ordem numérica. As telas ficam em `prototipos/aluno/mobile-v1/`.

Regras que valem em todas as partes: [00-regras-gerais.md](00-regras-gerais.md).

| # | Parte | Telas do v4 de origem | No app hoje | Prompt | Estado |
|---|---|---|---|---|---|
| 1 | Entrada, login e recuperar senha | `00-entrada`, `01-login`, `02-recuperar-senha` | `app/(auth)/index.tsx`, `tela.tsx`, `login.tsx`, `recuperarSenha.tsx` | [telas/00-02-entrada-login.md](telas/00-02-entrada-login.md) | aplicado (`mobile-v1/00`, `01`, `02`) |
| 2 | Trilha | `03-trilha` | `app/(tabs)/trilha/index.tsx` | [telas/03-trilha.md](telas/03-trilha.md) | aplicado (`mobile-v1/03-trilha.html`) |
| 3 | Tópico | `04-topico` | `app/(tabs)/trilha/[id].tsx` | [telas/04-topico.md](telas/04-topico.md) | aplicado (`mobile-v1/04-topico.html`) |
| 4 | Ranking | `05-ranking` | `app/(tabs)/ranking/` | [telas/05-ranking.md](telas/05-ranking.md) | aplicado (`mobile-v1/05-ranking.html`) |
| 5 | Social | `06-social` | `app/(tabs)/social/index.tsx` | [telas/06-social.md](telas/06-social.md) | aplicado (`mobile-v1/06-social.html` + `assets/social.js`; o Ranking abre o perfil público) |
| 6 | Notificações | `07-notificacoes` | `app/(tabs)/notificacoes/` | [telas/07-notificacoes.md](telas/07-notificacoes.md) | aplicado (`mobile-v1/07-notificacoes.html`) |
| 7 | Perfil, Biblioteca, Relatório e Bag | `08`, `09`, `10`, `assets/bag.js` | `app/(tabs)/perfil/`, `components/bag/` | [telas/08-10-perfil.md](telas/08-10-perfil.md) | aplicado (`mobile-v1/08`, `09`, `10` + `assets/bag.js`, ligada em todas as telas logadas) |
| 8 | Configurações | `11-configuracoes` | `app/(tabs)/perfil/settings.tsx` e subtelas | [telas/11-configuracoes.md](telas/11-configuracoes.md) | aplicado (`mobile-v1/11-configuracoes.html`) |
| 9 | Loja | `12-loja` | `app/(tabs)/perfil/loja.tsx` | [telas/12-loja.md](telas/12-loja.md) | aplicado (`mobile-v1/12-loja.html`; o Perfil e a moeda do Social abrem a Loja) |
| 10 | Tutorial de primeiro acesso | `assets/tour.js` | `FirstAccessTour` | [telas/tutorial.md](telas/tutorial.md) | aplicado (`mobile-v1/assets/tour.js`, ligado nas telas logadas; Trilha → estado "Primeiro acesso") |

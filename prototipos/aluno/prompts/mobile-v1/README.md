# Protótipo do aluno no celular — v1

Pedido do Rafael em 23/10/2026: protótipos do **app do aluno no celular**, feitos **a partir do protótipo web v4** (`prototipos/aluno/v4/`), antes de ir para o código. É o caminho inverso da revisão 04: lá o web ganhou o que o celular tinha; aqui o celular ganha a cara e as decisões do v4, adaptadas ao toque e à tela pequena.

Mesmo método das revisões anteriores: **primeiro o prompt, depois a tela**, uma parte por vez, em ordem numérica. As telas ficam em `prototipos/aluno/mobile-v1/`.

Regras que valem em todas as partes: [00-regras-gerais.md](00-regras-gerais.md).

| # | Parte | Telas do v4 de origem | No app hoje | Prompt | Estado |
|---|---|---|---|---|---|
| 1 | Entrada, login e recuperar senha | `00-entrada`, `01-login`, `02-recuperar-senha` | `app/(auth)/index.tsx`, `tela.tsx`, `login.tsx`, `recuperarSenha.tsx` | [telas/00-02-entrada-login.md](telas/00-02-entrada-login.md) | aplicado (`mobile-v1/00`, `01`, `02`) |
| 2 | Trilha | `03-trilha` | `app/(tabs)/trilha/index.tsx` | [telas/03-trilha.md](telas/03-trilha.md) | aplicado (`mobile-v1/03-trilha.html`) |
| 3 | Tópico | `04-topico` | `app/(tabs)/trilha/[id].tsx` | — | a fazer |
| 4 | Ranking | `05-ranking` | `app/(tabs)/ranking/` | — | a fazer |
| 5 | Social | `06-social` | `app/(tabs)/social/index.tsx` | — | a fazer |
| 6 | Notificações | `07-notificacoes` | `app/(tabs)/notificacoes/` | — | a fazer |
| 7 | Perfil, Biblioteca e Relatório | `08`, `09`, `10` | `app/(tabs)/perfil/` | — | a fazer |
| 8 | Configurações | `11-configuracoes` | `app/(tabs)/perfil/settings.tsx` e subtelas | — | a fazer |
| 9 | Loja | `12-loja` | `app/(tabs)/perfil/loja.tsx` | — | a fazer |

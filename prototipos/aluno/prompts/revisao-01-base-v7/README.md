# Revisão 01 — área do aluno sobre a base do V7 do professor

Esta pasta substitui, para a próxima geração do protótipo (`prototipos/aluno/v2/`), os prompts descritivos de `../telas/` (que geraram o `v1`). Os de `../telas/` ficam como histórico.

## O que mudou em relação ao v1

1. **Linguagem visual = V7 do console do professor** (`origin/redesign/13-prototipo-v7`, `prototipos/v7/*.dc.html`): header de 68px, sidebar de 264px, cards de raio 20, botões/chips em pílula, Cinzel + Inter, esqueleto com *shimmer*, estados vazio/erro com o mesmo desenho, seletor "Pré-visualização de estado", modal com fundo desfocado, assistente flutuante no canto. O v1 seguia o `ConsoleShell.tsx` de produção (212px, raio 6); agora a referência é o V7, que é a direção aprovada para a Fase 2.
2. **As cores continuam vindo do perfil BrainHex.** O V7 é violeta fixo; o aluno não tem tema único. Cada papel de cor do V7 foi mapeado para um token da fórmula real de `mobile/src/utils/profileShellPalette.ts`, e os HEX dos 7 perfis foram **calculados rodando a fórmula** com o `tinycolor2` do próprio `mobile/` (ver `00-sistema-visual.md`).
3. **Três correções de fidelidade ao código** que o v1 errava:
   - O modo da trilha (mapa/árvore/lista) **não é preferência do aluno**: é decidido pelo perfil (`pickVisual` em `mobile/src/context/TrilhaContext.tsx`).
   - O mentor de IA existe para os 7 perfis (`mentor_character`, ligado por padrão), mas **só Seeker e Socializer falam como o guardião** (`CHAT_PROFILES` em `mobile/src/utils/brainHexCapabilities.ts`). Nos outros, quem fala é "Guia". O v1 punha a Amina falando em primeira pessoa com um aluno Conqueror.
   - Conqueror tem **timer e modo batalha (boss)** no tópico (`TIMER_PROFILES`, `BATTLE_PROFILES`), que o v1 não mostrava.
4. **Especificação milimétrica**: cada prompt dá a grade em px (quadro de referência 1440×900), a ordem dos blocos, o token de cor e de tipografia de cada elemento, o texto exato (tirado do código) e os estados obrigatórios.

## Ordem de uso

1. Conversa nova na ferramenta de design. Cole **`00-sistema-visual.md` inteiro** primeiro.
2. Na mesma conversa, um de cada vez: `telas/00-entrada.md` → `telas/11-configuracoes.md`.
3. Cada prompt diz o nome do arquivo de saída (`v2/NN-nome.html`), para manter os links `<a href>` entre telas iguais ao v1.
4. Assets: usar os de `prototipos/aluno/v1/assets/` (copiados de `mobile/src/assets/design/`). Para os outros perfis, os arquivos equivalentes estão em `mobile/src/assets/design/` (`arena-*`, `emblem-*`, `frame-*`, `map-*`, `trail-*`, `world-*`) e `mobile/src/assets/guardioes/`.

## Índice

| Prompt | Saída | O que muda em relação ao v1 |
|---|---|---|
| `00-sistema-visual.md` | — | Tokens dos 7 perfis + pré-login calculados; mapeamento V7 → aluno; componentes com medidas |
| `telas/00-entrada.md` | `v2/00-entrada.html` | Dois painéis (cenário + ação); "Bem-vindo(a) de volta" como estado |
| `telas/01-login.md` | `v2/01-login.html` | Erros inline no lugar do diálogo; 6 estados |
| `telas/02-recuperar-senha.md` | `v2/02-recuperar-senha.html` | Sucesso substitui o formulário e mostra o próximo passo |
| `telas/03-trilha.md` | `v1/03-trilha.html` (substituiu a trilha anterior do v1) | Modo pelo perfil (sem alternador); tabuleiro em serpentina com os 8 tópicos à vista; hexágonos SVG novos; painel de prévia; escolha de turma; Bag |
| `telas/04-topico.md` | `v2/04-topico.html` | Modo foco sem sidebar; sumário de blocos; timer e batalha do Conqueror; todos os tipos de bloco e de atividade |
| `telas/05-ranking.md` | `v2/05-ranking.html` | Mestre-detalhe; pódio 2-1-3 com empates; filtros só na lista |
| `telas/06-social.md` | `v2/06-social.html` | Chat e perfil no painel lateral; guildas completas; loja |
| `telas/07-notificacoes.md` | `v2/07-notificacoes.html` | Mestre-detalhe com as 4 seções do detalhe do app |
| `telas/08-perfil-hub.md` | `v2/08-perfil-hub.html` | Painel "Arena Tática" real; alternador de perfil ativo; afinidades |
| `telas/09-biblioteca-conquistas.md` | `v2/09-biblioteca-conquistas.html` | Seções por perfil + plataforma e grupos (o app não tem filtro) |
| `telas/10-relatorio-dados.md` | `v2/10-relatorio-dados.html` | Prévia real + 6 estados da ação; erro da #28 desenhado |
| `telas/11-configuracoes.md` | `v2/11-configuracoes.html` | Grupos reais do hub; painéis com âncora; rotas órfãs fora |

## Assets a copiar para `v2/assets/` (além dos que já estão em `v1/assets/`)
De `mobile/src/assets/design/`: `object-map.png`, `object-retry.png`, `object-gold.png`, `object-silver.png`, `object-bronze.png`, `object-bell.png`, e, para o seletor de perfil, `trail-*`, `world-*`, `arena-*`, `map-*`, `emblem-*` e `frame-*` dos 7 perfis. De `mobile/src/assets/guardioes/`: os 7 guardiões e a pasta `rosto/`. De `mobile/src/assets/bosses/`: `boss-07.png` (exemplo do tópico).

## Decisões que precisam de validação (@Geisbelly) antes de implementar

| # | Decisão | Por quê | Custo de reverter |
|---|---|---|---|
| D1 | Títulos em **Cinzel**, corpo em **Inter** (o app mobile usa Georgia + fonte do sistema) | É a tipografia do V7. Na web o Expo carrega webfont sem custo relevante | Trocar `--font-title`/`--font-body` |
| D2 | Botão primário = **fundo `accent`, texto `background`** (V7 usa violeta + branco) | Com fundo `accentStrong` + branco, Achiever (3,3:1) e Socializer (3,6:1) reprovam. Com `accent` + `background` os 7 perfis passam de 6:1 | Um token |
| D3 | Item ativo da sidebar na cor `accent` do perfil, não no teal `#4fd1c5` do V7 | Teal é a cor do Seeker. No aluno, ele diria "perfil Seeker" para todo mundo | Um token |
| D4 | Cores de estado **fixas do V7** (`#5fd99a`, `#e0b34d`, `#6fb3e0`, `#e2574c`/`#f0847c`) | CLAUDE.md: success/warning/info não derivam do accent | — |
| D5 | Web só a partir de **1024px**. Abaixo disso, o layout do app mobile continua valendo | O V7 não define breakpoints. A área do aluno já tem layout de toque | — |
| D6 | Borda de card = `border` do perfil a **55% de opacidade** (token derivado `--line`) | O `border` da fórmula (L=35%) é bem mais forte que a borda quase invisível do V7. Com opacidade, o card fica com o peso do V7 sem inventar cor nova | Um token |

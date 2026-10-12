# Revisão 02 — feedback da Geisbelly sobre o v1 da área do aluno

Prompts para gerar as telas da pasta `prototipos/aluno/v2/` a partir do que a Geisbelly comentou no v1 (29/09/2026). Cada prompt de tela diz o que **fica como está** (ela gostou), o que **sai ou muda** (ela não gostou) e **como** mudar.

## De onde vem cada decisão

O feedback veio em 5 prints comentados (WhatsApp, 29/09). Resumo, tela por tela:

| Tela | O que ela disse | Veredito |
|---|---|---|
| 03 Trilha | "a ideia é ser: mapa, árvore e listagem"; "gostei muito da trilha linear desenhada"; "ainda falta o mapa" | **Feita** nesta revisão, ver `telas/03-trilha.md` |
| 07 Notificações | "listagem é melhor"; "esse de cima não faz sentido, pode tirar"; "falta a visualização da notificação"; "esse espaço vazio é para q" | Mudar |
| 06 Social | Verde (gostou): card de convite, grade de amigos, coluna "Guilda em destaque / Sua rede". Vermelho/laranja (odiou): etiqueta do topo, fileira de abas, área vazia à direita | Mudar |
| 05 Ranking | "gostei, mas tá meio estranho, os ícones errados, falta algo" | Ajustar |
| 08 Perfil | "as conquistas até que ficaram bonitinhas, mas falta as métricas do perfil, as leituras, falta a opção de troca de perfil para o user. falta o banner" | Completar |
| 11 Configurações | "ótimo" | **Não mexer** |
| 09 Biblioteca de conquistas | "okay" | **Não mexer** |
| 01 Login | "é mobile ou web, tá mal adaptado para web" | Refazer o layout |

00 Entrada, 02 Recuperar senha, 04 Tópico e 10 Relatório de dados não foram comentadas. Ficam como no v1, exceto 02 Recuperar senha, que herda o esqueleto novo do Login (ver `telas/01-login.md` §6).

## Relação com a revisão 01

`../revisao-01-base-v7/` foi escrita para migrar o aluno para o visual do V7 do professor, mas **não foi aplicada**: o que a Geisbelly revisou é o v1. Esta revisão parte do v1 e mantém o shell dele (sidebar 212, topbar 68), porque Configurações e Biblioteca foram aprovadas com ele e não devem mudar.

Da revisão 01 aproveitamos só o conteúdo que responde ao feedback: mestre-detalhe de Notificações, alternador de perfil e painel de métricas do Perfil, dois painéis do Login, regras do pódio no Ranking. Os valores de grade dela (1096px, sidebar 264) **não** valem aqui; os desta pasta vencem.

Duas regras da revisão 01 foram **revogadas** pelo feedback:
1. "O modo da trilha vem do perfil, sem alternador": agora há o seletor Mapa / Árvore / Lista, e o modo do perfil vem marcado como sugerido.
2. "Abas no Social": saem. As seções viram blocos da própria página (ver `telas/06-social.md`).

## Ordem de uso

1. Conversa nova na ferramenta de design. Cole `00-regras-gerais.md` inteiro.
2. Na mesma conversa, um por mensagem: `07-notificacoes` → `06-social` → `05-ranking` → `08-perfil-hub` → `01-login`. Anexe junto o HTML atual da tela (`v2/NN-*.html`), que é a base a editar, não a refazer do zero.
3. `telas/03-trilha.md` já está aplicado em `v2/03-trilha.html`. Serve de registro e para regerar a tela se precisar.

## Índice

| Prompt | Arquivo | Tipo de mudança |
|---|---|---|
| `00-regras-gerais.md` | — | Regras que valem em todas as telas desta revisão |
| `telas/03-trilha.md` | `v2/03-trilha.html` | Mapa de verdade + seletor de modo (**aplicado**) |
| `telas/07-notificacoes.md` | `v2/07-notificacoes.html` | Grade → lista; tela de detalhe; sem coluna vazia |
| `telas/06-social.md` | `v2/06-social.html` | Sem abas e sem etiqueta; página em blocos; largura toda usada |
| `telas/05-ranking.md` | `v2/05-ranking.html` | Ícones do app; "Sua posição" por categoria; o que faltava no pódio |
| `telas/08-perfil-hub.md` | `v2/08-perfil-hub.html` | Banner, troca de perfil, métricas, leitura adaptativa |
| `telas/01-login.md` | `v2/01-login.html` (+ `02-recuperar-senha.html`) | Dois painéis para tela larga |

## Decisões para validar com a Geisbelly

| # | Decisão | Por quê |
|---|---|---|
| G1 | Na Trilha, o aluno **pode trocar** o modo; o do perfil vem marcado como "sugerido" e abre primeiro | Leitura de "a ideia é ser: mapa, árvore e listagem". Se ela quis dizer "cada perfil tem o seu", basta tirar o seletor |
| G2 | No Social, as abas viram blocos da página: Convites no topo, Amigos, Encontrar colegas; Guildas e Bloqueados vão para a coluna lateral | Ela marcou a fileira de abas em vermelho e o card de convite, a grade e a coluna em verde |
| G3 | Em Notificações, a coluna "Seu ritmo / Próximo lembrete" sai; o lugar dela é o detalhe da notificação | "esse espaço vazio é para q" + "falta a visualização da notificação" |
| G4 | No Ranking, o "falta algo" foi lido como: sua posição e valor em cada categoria, pódio com emblema do perfil e pedestal, e tabela completa | Ela não disse o que faltava; confirmar |
| G5 | O Recuperar senha herda o layout novo do Login, mesmo sem ter sido comentado | Senão as duas telas de entrada ficam com linguagens diferentes |

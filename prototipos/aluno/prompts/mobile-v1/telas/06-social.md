# Parte 5 — Social (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/06-social.html` e `mobile-v1/assets/social.js` (chats e perfil público, usados também pelo Ranking).

## De onde vem

- **v4:** `06-social.html` + `assets/social.js`.
  - **Coluna principal:** atalhos (Evento, Arena, Batalhas, Convites, Amigos, Encontrar, Guildas); o **evento** "Semana das Equações" (missões 2 de 3, meta da turma 1.120 de 1.500, seus pontos 38 de 60, modalidade em guilda); a **arena** (seu confronto "64 × 61" contra Bianca L., a classificação, as regras); as **batalhas** (5 modos: Duelo, Duplo, Velocidade, Precisão, Todos, e os desafios abertos: recebido, em andamento, encerrado); a busca; os **convites**; os **amigos** (conversar, Desafiar, "…" com desfazer amizade); **encontrar colegas** (3 e "Ver todos os 9").
  - **Coluna da direita:** online agora, guilda em destaque (Legião Azul, "Abrir chat da guilda"), guildas no evento (pódio, "sua"), sua rede (amigos, guildas, convites, bloqueados) e as guildas da turma.
  - **`social.js`:** chat da guilda (mensagens, desafio e questão compartilhados, questão bloqueada, compartilhar), chat privado e **perfil público** (banner, guilda, dados, sobre, conquistas com pontos, "Conversar em privado").
- **App hoje:** `app/(tabs)/social/index.tsx` com abas (Amigos, Convites, Encontrar, Bloqueados, Guildas, Arena), `EventoDaTurma`, `MissoesDoDia`, `ArenaSection`, `GuildSection`, `GuildChatModal`, `PrivateChatModal`, `SocialProfileModal`.

## O que fica igual ao v4 (não mude)

- Pessoas, guildas, valores, textos, regras da arena e do evento, as mensagens dos chats e as conquistas do perfil público.
- Os estados: Com dados, Sem evento aberto, Fora da arena, Desafio recebido, Sem convites, Sem amigos, Carregando, Erro, Chat da guilda, Chat da guilda vazio, Chat privado, Perfil público, Perfil sem conquistas, Perfil com erro.
- Desfazer amizade pede confirmação, com o botão destrutivo inconfundível.

## O que muda no celular

### Topo e atalhos
- **Topo:** "Social" (Georgia 22) com a **Bag** e a **Loja** à direita: a moeda + "38" num botão de 44px, porque no celular a Loja não tem mais a barra lateral (regras gerais §3).
- **Atalhos** como pílulas roláveis, **grudadas no topo** ao rolar, com os contadores do v4. Tocar rola até a seção.

### Uma coluna, nesta ordem
1. **Aviso de desafio recebido** (quando houver), grudado sob os atalhos: "Diego A. te desafiou para um Duelo" + "Aceitar".
2. **Evento:** o cartão do v4 com as três métricas **empilhadas** (no v4 ficam em 3 colunas), e "Continuar missões" em largura total.
3. **Arena:** seu confronto (os dois retratos e o placar), "Responder rodada · 3 questões" em largura total; a classificação (top 5) logo abaixo; as regras recolhidas em "Como funciona".
4. **Batalhas:** os 5 modos como cartões **roláveis na horizontal** (140px), e os desafios abertos em linhas.
5. **Busca**, **convites**, **amigos** (linhas de 64px; conversar e Desafiar à vista; o "…" abre uma folha com "Ver perfil" e "Desfazer amizade"), **encontrar colegas**.
6. **O que era a coluna da direita vem por último:** online agora (retratos sobrepostos), guilda em destaque, guildas no evento, sua rede e guildas da turma.

### Folhas e telas cheias
- **Lançar desafio** (tocar num modo ou em "Desafiar"): folha de baixo com o modo, com quem (amigos online), o tópico, a nota "Só aparecem tópicos que vocês dois já liberaram na trilha." e "Lançar desafio".
- **Rodada de questões**, **bloqueados**, **desfazer amizade**: folhas de baixo.
- **Chat da guilda** e **chat privado**: tela cheia, com o campo acima do teclado. As partilhas (desafio, questão, questão bloqueada) aparecem como cartões dentro da conversa, como no v4. "Compartilhar" abre uma folha com Desafio e Questão.
- **Perfil público**: tela cheia (banner, retrato, @apelido, online, guilda, dados, sobre o perfil, sobre, conquistas com pontos), com "Conversar em privado" fixo embaixo. O Ranking passa a abrir este perfil ao tocar num colega.

### Para conferir
- `?ir=arena` (ou `batalhas`, `amigos`, `encontrar`, `guildas`) abre a tela já rolada até a seção.

## Fora do escopo desta parte

- A rodada de questões jogável: aparece só a explicação, como no v4.

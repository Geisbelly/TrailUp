Item 5 — **Chat da guilda, chat privado e perfil público**. Arquivos: `v4/06-social.html` (liga os botões) e o componente novo `v4/assets/social.js`.

## 1. O que o app faz (fonte)
`mobile/src/components/social/`:
- **`GuildChatModal`**
  - Título **"Chat da guilda"**, com "Legião Azul · 8 membros" embaixo. Fechar: "Fechar chat da guilda".
  - Mensagens em balão, com o autor na cor do perfil e a hora. As minhas ficam com fundo `accentSoft`.
  - Vazio: "Ainda não há mensagens. Comece a conversa!".
  - Compartilhamentos dentro da conversa:
    - **DESAFIO COMPARTILHADO**, com espadas cruzadas;
    - **QUESTÃO COMPARTILHADA**, com "Toque para responder";
    - **QUESTÃO BLOQUEADA**, com cadeado e o título "Questão bloqueada para você", sem clique.
  - Responder uma questão:
    - verdadeiro/falso mostra os botões **Verdadeiro · Falso**;
    - questão com alternativas mostra um botão por alternativa;
    - questão aberta mostra o campo "Digite sua resposta".
    - Resultado: "Resposta correta!" (verde), "Resposta incorreta." (vermelho) ou "Não foi possível registrar sua resposta.".
  - Compositor, da esquerda para a direita:
    - botão **Compartilhar desafio** (espadas). Abre "Modo do desafio" com todos · velocidade · precisao · duelo · duplo e o botão "Iniciar desafio";
    - botão **Compartilhar questão** (?). Abre "Escolha a questão" com as questões liberadas, ou "Nenhum conteúdo disponível para compartilhar.";
    - campo "Escreva para sua guilda..." (máx. 500) e o botão "Enviar mensagem".
- **`PrivateChatModal`**
  - Conversa com uma pessoa: nome, @apelido e **online/Offline**.
  - Campo "Mensagem privada...".
  - Erros: "Não foi possível carregar esta conversa." e "Não foi possível enviar a mensagem.".
- **`SocialProfileModal`** (perfil público)
  - **Banner** (ou o emblema da guilda) e o avatar 82 com borda na cor do perfil, sobreposto ao banner.
  - **NOME EM CAIXA ALTA**, @apelido e o ponto online/offline.
  - Blocos **GUILDA** ("Exploradores do Norte · 7 pessoas"), **DADOS** (perfil ativo ou "Jornada ativa"), **SOBRE O PERFIL** e **SOBRE**.
  - **CONQUISTAS** com "N pts". Cada conquista mostra nome, categoria, descrição e "+N pts". Sem conquistas: "Nenhuma conquista pública ainda.".
  - Botão redondo **Conversar em privado**.
  - Erro: "Não foi possível carregar este perfil." + "Tentar novamente".

## 2. Na web
Um componente só, `assets/social.js`, com `window.Social = { perfil(nome), privado(nome), guilda(), fechar() }`.

- **Chats em painel lateral à direita**, como num mensageiro de desktop:
  - 440px de largura, altura toda abaixo da barra superior, entra deslizando;
  - a página continua visível à esquerda, com o fundo escurecido;
  - cabeçalho fixo, mensagens rolando e compositor fixo embaixo;
  - Enter envia. A mensagem aparece na hora, à direita, com fundo do acento.
- **Perfil público em janela central** de 520px:
  - banner de 150px com a arte `world-<perfil>.webp`;
  - avatar sobreposto, cabeçalho e blocos na ordem do app;
  - conquistas em **grade de 2 colunas**, não em lista, para usar a largura;
  - o botão "Conversar em privado" vira um botão com texto, embaixo à direita, e abre o chat privado da pessoa.
- **Onde liga no Social:**
  - o botão de balão de cada amigo abre o **chat privado**;
  - clicar no avatar ou no nome de qualquer pessoa (amigos, colegas, convite, "Online agora", arena) abre o **perfil público**;
  - "Abrir chat da guilda" abre o **chat da guilda**.
- As cores seguem o perfil de quem está sendo visto, como no app (`buildProfileShellPaletteFromAccent`). Exemplo: o perfil da Marina (Seeker) usa o verde-água `#17a398`.

### Dados de exemplo
**Chat da Legião Azul** (8 membros):
1. Diego A., 14:02: "Alguém já fez a missão 2 da Semana das Equações?"
2. Rafael N., 14:03, compartilha **DESAFIO COMPARTILHADO** "Precisão · 3 questões de Equações".
3. Diego A., 14:05, compartilha **QUESTÃO COMPARTILHADA** "Se 3x + 7 = 22, quanto vale x?". Alternativas: 3 · 5 · 7 · 15. Certa: 5.
4. Bianca L., 14:06, compartilha **QUESTÃO COMPARTILHADA** "Em 2x = 10, x vale 5." (Verdadeiro/Falso, certa: Verdadeiro).
5. Rafael N., 14:08, compartilha **QUESTÃO BLOQUEADA** "Questão bloqueada para você" (é de Frações, que a Amina ainda não liberou).
6. Amina T. (eu), 14:10: "Fiz! Faltou só a de precisão."

Questões para "Compartilhar questão": "Se 3x + 7 = 22, quanto vale x?" · "Isole o x em 5x − 4 = 21" · "Em 2x = 10, x vale 5.".

**Chat privado com Marina S.** (online):
- Marina: "Viu que abriu a arena?"
- Eu: "Vi! Tô em 4º."
- Marina: "Bora fazer um duelo de Equações depois?"

**Perfil público de Marina S.**
- @marina.s, online.
- GUILDA: Exploradores do Norte · 7 pessoas.
- DADOS: Seeker · Explorador.
- SOBRE O PERFIL: "Curiosidade, conexões inesperadas e exploração: aprende melhor descobrindo caminhos." (`sugestao_material.py`).
- SOBRE: "Gosto de mapas e de achar o caminho mais curto."
- CONQUISTAS, 85 pts:
  - Primeiro Tópico · Jornada · +10;
  - Fronteira Avançada · Desempenho · +40;
  - Explorador de Perfis · Exploração · +35.

Qualquer outra pessoa usa o mesmo modelo, com o nome, o perfil e a guilda dela (dados dos cards do Social). Quem está offline mostra "offline" e o chat diz "Offline".

## 3. Estados (no seletor do Social)
Acrescentar:
- "Chat da guilda";
- "Chat da guilda vazio";
- "Chat privado";
- "Perfil público";
- "Perfil sem conquistas";
- "Perfil com erro".

## 4. Aceite
- [ ] Chat da guilda com mensagens, os três tipos de compartilhamento e resposta a questão com resultado certo/errado.
- [ ] "Compartilhar desafio" com os 5 modos e "Compartilhar questão" com a lista.
- [ ] Chat privado com online/Offline e envio.
- [ ] Perfil público com banner, avatar, blocos, conquistas e o botão que abre o chat privado.
- [ ] Vazio e erro com os textos do app.

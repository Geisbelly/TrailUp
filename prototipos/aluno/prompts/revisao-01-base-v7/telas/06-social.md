Tela 06 — **Social** (amigos, convites, guildas, chats) + **Loja**. Arquivo de saída: `v2/06-social.html`.

Shell completo, item ativo **Social**. Perfil de exemplo: Conqueror.

## 1. Fonte da verdade
- `mobile/src/app/(tabs)/social/index.tsx` (abas, busca, ações, estados).
- `components/social/SocialPersonCard.tsx`, `SocialInviteCard.tsx`, `SocialProfileModal.tsx`, `PrivateChatModal.tsx`, `GuildSection.tsx`, `GuildChatModal.tsx`.
- `services/social/guildModel.ts` (limite padrão de membros; a UI diz "Equipes de até 10 pessoas.").
- Loja: `components/loja/StoreLauncher.tsx`, `StoreModal.tsx`, `services/loja/storeModel.ts`. A compra atômica e a "Segunda chance" estão nos PRs `feat/loja-1-economia` e `feat/loja-2-compra`, ainda sem merge. Os itens da loja vêm do banco; os nomes abaixo são exemplos.

## 2. Dados de exemplo
- **Amigos (4):** Theo Martins (Seeker, "theo.m", guilda "Os Axiomas", online) · Bianca Lopes (Socializer, "bia", sem guilda, online) · Gustavo Pires (Conqueror, "guga", guilda "Os Axiomas", offline) · Júlia Castro (Mastermind, "ju.castro", offline).
- **Convites (2):** recebido de Caio Ribeiro (Daredevil) · enviado para Pedro Henrique Lima (Conqueror), com status "Enviado".
- **Encontrar (6 colegas):** Maria Eduarda Souza (Achiever), Rafael Antunes (Survivor), Ana Clara Mendes (sem perfil: "Aluno"), Pedro Henrique Lima (convite enviado), Lucas Fontes (Seeker), Sofia Almeida (Socializer).
- **Guildas (2):** "Os Axiomas" (mista, emblema constelação, 3/10, a aluna é membro e criadora) · "Frações Furiosas" (perfil: Daredevil, 6/10, com convite para a aluna).
- **Bloqueados (0).**
- Moedas da aluna: **180**.

## 3. Grade (main de 1096px)
```
[seletor]
┌ cabeçalho: eyebrow / H1 / subtítulo ......................... [🪙 180] [Abrir loja] ┐
┌ abas de seção com contador  ·  campo de busca (à direita) ─────────────────────────┐
┌ lista (8/12 = 721) ─────────────────────────────┐ ┌ painel de conversa (4/12 = 355) ┐
│ cards de pessoa (grade de 2 colunas)            │ │ chat privado OU perfil do        │
│                                                 │ │ colega selecionado (sticky)      │
└─────────────────────────────────────────────────┘ └─────────────────────────────────┘
```
No app, perfil e chat abrem em modal sobre a lista. Na web, abrem no **painel da direita**, e a lista continua visível. Sem ninguém selecionado, o painel mostra um estado vazio.

## 4. Blocos

### 4.1 Cabeçalho
- Eyebrow **"CONEXÕES DA JORNADA"**, H1 **"Social"**, subtítulo **"Encontre sua turma e avance em companhia."**
- Ações: chip neutro com moeda (`object-coin.png` 20) e "180" (Inter 700 14 tabular, `aria-label="Seu saldo: 180 moedas"`) + botão secundário **"Abrir loja"** (ícone loja 16, `StoreLauncher`).

### 4.2 Barra de abas e busca (`margin-bottom: 20px`, flex `space-between`)
- Abas de seção (§7.4 do mestre) com contador: **Amigos 4 · Convites 2 · Encontrar 6 · Guildas 2 · Bloqueados**. Bloqueados não tem contador, como no app.
- Campo de busca largura 320, placeholder **"Buscar por nome ou guilda"**, `aria-label="Buscar pessoas"`, botão **"Limpar busca"**. **Some na aba Guildas.**

### 4.3 Card de pessoa (`SocialPersonCard`), grade de 2 colunas, gap 16
Card `padding: 16px 18px`, raio 16, altura mínima 104, flex, gap 14:
- Retrato 56 emoldurado na moldura do perfil do colega (`frame-<perfil>.png`). Sem foto e sem perfil: círculo 56 `surfaceElevated` com ícone pessoa 28.
- Texto (flex 1): apelido ou nome, Inter 700 15 `text` · perfil ("Seeker", ou "Aluno" sem perfil), 12.5 `textMuted`, com o ponto 8 na cor-assinatura · guilda, 11.5 `textSubtle` com ícone escudo 11 (quando houver).
- Status online: ponto 8 (`success` online, `#90949d` offline) + "Online"/"Offline" 11.5, no canto superior direito do card.
- Ações (coluna direita, gap 8, alinhadas ao centro):
  - Ícone-botão chat 40 (balão), `aria-label="Conversar com theo.m"`. Só para amigo ou candidato (`canChat`).
  - Ação principal por status (texto do app): **"Convidar"** (candidato, primário pequeno) · **"Desfazer"** (amigo, destrutivo contorno pequeno) · **"Enviado"** (convite enviado, chip neutro, não clicável) · **"Desbloquear"** (bloqueado, secundário pequeno).
  - Ação secundária em amigo: **"Bloquear"** (fantasma pequeno em `danger-text`).
  - Durante a ação, o rótulo vira "..." com spinner.
- O card inteiro (fora dos botões) abre o perfil (`aria-label="Abrir perfil de theo.m"`).

### 4.4 Convites (`SocialInviteCard`)
Seção "Recebidos" (eyebrow) e seção "Enviados". Recebido: mesmo card, com a ação principal **"Aceitar"** (primário pequeno) e a secundária **"Recusar"** (secundário pequeno). Enviado: chip "Enviado".

### 4.5 Guildas (`GuildSection`)
- Topo da aba: legenda 13 `textSubtle` "Equipes de até 10 pessoas." + botão primário **"+ Criar nova guilda"**. Se a aluna já tem guilda, o botão fica desabilitado com a ajuda "Você já participa de uma guilda nesta turma."
- Card de guilda (grade de 2 colunas, `padding: 20px 22px`, raio 20): logo/emblema 56 em hexágono (fundo `accentMuted`, ícone constelação 28 `accent`) + nome Cinzel 700 18 + chip de composição ("Mista" neutro, ou "Um perfil: Daredevil" com o ponto de cor) + descrição 13 `textMuted` (2 linhas) + fileira de avatares dos membros (28, sobrepostos −8px) com "3/10" tabular + ações:
  - Membro: **"Abrir conversa"** (primário pequeno), "Editar" e "Sair da guilda" (fantasma, o segundo em `danger-text`), e "Excluir guilda" se for criadora (fantasma `danger-text`).
  - Com convite: faixa `info-bg` "Convite para entrar em Frações Furiosas" + **"Aceitar"** / **"Recusar"**.
  - Cheia: chip warning "Guilda completa" / "Esta guilda já atingiu o limite de 10 pessoas."
- **Modal Criar/Editar guilda** (M, 720): título "Nova guilda" / "Editar guilda". Campos: "Nome da guilda", "Descrição" (textarea com placeholder "Descrição da guilda"), "Ícone" (grade de 6 emblemas selecionáveis de 48px), "URL da logo (opcional)", "Composição" (segmentado **"Mista" · "Um perfil"**) e, com "Um perfil", o select "Perfil da guilda". Rodapé: **"Cancelar"** · **"Criar guilda"**. Erro: "Não foi possível concluir a ação."
- **Excluir guilda:** modal P destrutivo, "Excluir guilda", corpo **"Essa ação encerra a guilda e cancela os convites pendentes."**, botões "Cancelar" · "Excluir guilda" (destrutivo sólido).

### 4.6 Painel da direita (sticky `top: 108px`, altura `calc(100vh - 140px)`)
**a) Chat privado** (`PrivateChatModal` → painel): card sem padding interno. Cabeçalho (`padding: 16px 18px`, `border-bottom`): retrato 40 + "theo.m" + "Online" + botão fechar (`aria-label="Fechar conversa"`). Eyebrow no topo: "MENSAGEM PRIVADA". Mensagens (balões do mestre §7.10, hora 11 `textSubtle` abaixo de cada um). Compositor no pé: campo pílula "Mensagem privada..." + enviar 36 (`aria-label="Enviar mensagem"`). Erros: "Não foi possível carregar esta conversa." / "Não foi possível enviar a mensagem." (o balão com falha fica com borda `danger-border` e o link "Tentar de novo").

**b) Chat da guilda** (`GuildChatModal` → painel): cabeçalho com ícone fórum 24 `accent`, "Chat da guilda" e "Os Axiomas · 3 membros". Mensagens com o autor em `accent` 12/700. **Card compartilhado** dentro da mensagem (borda `1px solid accent`, raio 14, `padding: 12px 14px`, ícone 20): eyebrow "QUESTÃO COMPARTILHADA", "DESAFIO COMPARTILHADO" ou "QUESTÃO BLOQUEADA", título, e a dica "Clique para responder" (o app diz "Toque para responder"). Ao clicar numa questão, a resposta abre inline: "Verdadeiro"/"Falso", alternativas ou o campo "Digite sua resposta", com o resultado "Resposta correta!" (`success`) / "Resposta incorreta." (`danger-text`). Compositor: ícone-botões **"Compartilhar desafio"** (espadas cruzadas) e **"Compartilhar questão"** (?) + campo "Escreva para sua guilda..." (máx. 500) + enviar. O seletor de compartilhamento sobe acima do compositor: "Modo do desafio" (chips: todos, velocidade, precisão, duelo, duplo) ou "Escolha a questão" (cards horizontais), com "Fechar". Vazio: "Ainda não há mensagens. Comece a conversa!" / "Nenhum conteúdo disponível para compartilhar."

**c) Perfil do colega** (`SocialProfileModal` → painel): banner de 96px com o `world-<perfil do colega>.webp` a 35%, retrato 88 emoldurado sobreposto, nome Cinzel 700 20, perfil, chip "Jornada ativa", grade de conquistas públicas (4 por linha, 56px) ou "Nenhuma conquista pública ainda.", botão **"Conversar em privado"**. Erros: "Não foi possível carregar este perfil." + "Tentar novamente"; "Perfil indisponível."

**d) Nada selecionado:** ícone balões 46 `textSubtle`, "Escolha alguém para conversar" (Cinzel 700 18) e "Clique no balão de um amigo ou abra o chat da sua guilda." (proposto).

### 4.7 Confirmações destrutivas (modal P, borda `danger-border`)
- **Desfazer amizade:** título "Desfazer amizade com theo.m?", corpo "Vocês deixam de acompanhar o avanço um do outro. Dá para convidar de novo depois." Botões "Manter amizade" · "Desfazer" (destrutivo sólido).
- **Bloquear:** título "Bloquear theo.m?", corpo "theo.m não poderá te convidar nem conversar com você. Você pode desbloquear quando quiser." (o app não pede confirmação; esta é a proposta da issue #219 para ação delicada). Botões "Cancelar" · "Bloquear".
- **Sair da guilda:** "Sair de Os Axiomas?" · "Cancelar" · "Sair da guilda".

### 4.8 Loja (`StoreModal`, modal G de 960)
- Cabeçalho: eyebrow **"RECURSOS DA JORNADA"**, título "Loja", fechar (`aria-label="Fechar loja"`), atualizar (`aria-label="Atualizar loja"`).
- Faixa de saldo (`padding: 18px 26px`, `border-bottom`): eyebrow **"SEU SALDO"**, "180" em Inter 700 32 tabular, moeda 70×76 (`object-coin.png`) à direita.
- Grade de 3 colunas (gap 16) de itens (card raio 16, `padding: 18px`): ícone/efeito 64 (`object-hint.png`, `object-chest.png`...), nome Inter 700 15, descrição 13/1.5 `textMuted`, linha "Disponíveis gratuitamente: 1" (12 `success`) quando houver, rodapé com preço (moeda 24×28 + número 16/700, ou "Grátis") e botão **"Comprar"** (primário pequeno). Estados do botão: "Adquirido" (chip success), "Indisponível" e "Bloqueado" (desabilitado, com `aria-label` "Indisponível Tema do mapa").
- Itens de exemplo: "Segunda chance" (40 moedas, "Refaça uma questão errada valendo 90% dos pontos.") · "Dica extra" (20, grátis restantes: 1) · "Moldura dourada" (Adquirido) · "Tema noturno do mapa" (Indisponível).
- Retorno: aviso inline com borda `accent` e check "Compra concluída." (`aria-live="polite"`); erro com borda `borderStrong`: "Não foi possível concluir a compra." / "Não foi possível carregar a loja."

## 5. Estados da página (seletor)
"Amigos" · "Convites" · "Encontrar" · "Guildas" · "Bloqueados (vazio)" · "Busca sem resultado" · "Chat privado aberto" · "Chat da guilda aberto" · "Loja aberta" · "Carregando" · "Erro" · "Social não ativado" · "Portão fechado" · "Cerimônia de liberação"
- **Vazios por aba** (card vazio do mestre, compacto, `padding: 56px 32px`): Amigos **"Você ainda não tem amigos na jornada."** + botão **"Encontrar colegas"** (vai para a aba Encontrar) · Convites **"Nenhum convite por enquanto."** · Encontrar **"Nenhum colega disponível para convidar."** · Guildas **"Nenhuma guilda criada nesta turma."** + "+ Criar nova guilda" · Bloqueados **"Você não bloqueou ninguém."**
- **Busca sem resultado:** título **"Nenhuma pessoa encontrada"**, corpo **"Tente outro nome ou limpe a busca."**, botão "Limpar busca".
- **Carregando:** 4 esqueletos de card (104px) em 2 colunas + esqueleto do painel.
- **Erro:** card de erro, **"Não foi possível carregar o Social."**, botão **"Tentar novamente"**.
- **Social não ativado:** card `info` (não de erro): "O Social ainda não foi ativado neste ambiente." O app completa com "A migração do banco precisa ser aplicada."; **não** mostre essa segunda frase ao aluno, que é mensagem técnica.
- **Portão fechado / Cerimônia:** §7.8 do mestre, com os textos de Social.

## 6. Não fazer
- Ações destrutivas (Desfazer, Bloquear, Sair, Excluir) nunca como botão primário e nunca sem confirmação.
- Não pintar card de colega com a cor do perfil dele (só moldura e ponto).

## 7. Aceite
- [ ] 5 abas com contadores reais; busca ausente em Guildas.
- [ ] Ação por status do colega exatamente como no app (Convidar/Desfazer/Enviado/Desbloquear/Aceitar-Recusar).
- [ ] Perfil e chats abrem no painel lateral, sem esconder a lista.
- [ ] Loja com saldo, itens em 4 estados e retorno de compra.
- [ ] Todos os vazios com os textos do app.

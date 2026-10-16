Tela 06 — **Social**. Arquivo: `v2/06-social.html` (edite o atual, que anexo). Item ativo da sidebar: **Social**. Perfil de exemplo: Conqueror.

## 1. Feedback
> "Verde = gostei; laranja e vermelho = odiei."

No print:
- **Verde (gostou):** o card de convite ("Kwame R. quer se conectar com você" + Aceitar/Recusar), a grade de amigos e a coluna da direita ("Guilda em destaque" com a Legião Azul + "Sua rede").
- **Vermelho (odiou):** a etiqueta do topo ("SOCIAL — AMIGOS (COM CONVITE PENDENTE)"), a **fileira de abas** (Amigos 6 · Convites 1 · Encontrar 9 · Guildas 2 · Bloqueados) e o enquadramento geral da página.
- **Laranja com X:** a faixa vazia à direita da coluna lateral.

## 2. Fica como está (visual e conteúdo)
- **Card de convite:** fundo `elev`, borda `1px solid accent`, raio 12, avatar + "Kwame R." + "quer se conectar com você" + pílulas **Aceitar** (accent) e **Recusar**.
- **Cards de amigo:** fundo `surface`, borda `border`, raio 12, `padding: 14px`, avatar com ponto verde de online, nome, guilda ou "offline há 2h", e embaixo o botão de conversa + **"Desfazer"**. Os 6 amigos do v1: Marina S. (Seeker, Exploradores do Norte, online) · Zuri & Mateo (Socializer, offline há 2h) · Diego A. (Conqueror, Legião Azul, online) · Bianca L. (Achiever, Exploradores do Norte, online) · Théo M. (Seeker, offline há 1 dia) · Rafael N. (Conqueror, Legião Azul, online).
- **Coluna lateral:** "Guilda em destaque" (emblema, "Legião Azul", "8 membros · 3 desafios compartilhados esta semana", avatares, botão "Abrir chat da guilda"), "Sua rede" (Amigos 6 · Guildas 2 · Convites pendentes 1) e o atalho da Loja ("240 moedas disponíveis").
- Eyebrow "CONEXÕES DA JORNADA", H1 "Social", subtítulo "Encontre sua turma e avance em companhia."
- Campo "Buscar por nome ou guilda" (não foi marcado).

## 3. O que muda
1. **Sai** a etiqueta do topo (regra 2.1 do mestre).
2. **Saem as abas.** O conteúdo delas não some: vira **blocos da própria página**, na ordem de uso (regra 2.3). Tudo o que ela marcou em verde fica no mesmo lugar relativo: convite em cima, amigos no meio, coluna à direita.
   | Aba do v1 | Onde fica agora |
   |---|---|
   | Convites | Bloco **"Convites"** no topo da coluna principal (só aparece se houver convite) |
   | Amigos | Bloco **"Amigos"**, a grade que ela aprovou |
   | Encontrar | Bloco **"Encontrar colegas"**, abaixo dos amigos |
   | Guildas | Coluna lateral: "Guilda em destaque" + nova lista **"Guildas da turma"** |
   | Bloqueados | Linha "Bloqueados" em **"Sua rede"**, que abre um modal |
3. **Sem área vazia** (regra 2.2): a página usa os 1164px. A coluna lateral encosta na borda direita do `console-main` e passa a ter conteúdo até o fim (a lista de guildas e a Loja).
4. As linhas de "Sua rede" viram **links** que rolam até o bloco (`#convites`, `#amigos`, `#guildas`), substituindo a função de navegação das abas.

## 4. Grade (1164px úteis)
```
[seletor flutuante de estado]
┌ cabeçalho: eyebrow / H1 / subtítulo ............................... [🪙 240] ┐
┌ coluna principal (8/12 = 769,33) ─────────────────┐ ┌ coluna lateral (4/12 = 374,67, sticky top 28) ┐
│ busca "Buscar por nome ou guilda" (largura toda)  │ │ Guilda em destaque                             │
│ CONVITES (1)  → card de convite                   │ │ Sua rede (links)                               │
│ AMIGOS (6)    → grade de 3 colunas                │ │ Guildas da turma                               │
│ ENCONTRAR COLEGAS (9) → 3 cards + "Ver todos"     │ │ Loja                                           │
└───────────────────────────────────────────────────┘ └────────────────────────────────────────────────┘
```
A coluna lateral é um card (fundo `surface`, borda `line`, raio 16, `padding: 22px 20px`), não mais a faixa colada com `border-left` que deixava área morta.

## 5. Blocos

### 5.1 Título de bloco (igual para os 3)
Linha com eyebrow (12/600, espaçamento .1em, `accent`) + contador em chip neutro, `margin: 28px 0 12px`. Ex.: "AMIGOS" `6`. Âncora no bloco (`id="amigos"`).

### 5.2 Convites (`#convites`)
O card aprovado, sem mudança visual. Com mais de um convite, os cards empilham com gap 8. Convites **enviados** entram no mesmo bloco, abaixo, com o chip "Enviado" no lugar dos botões.

### 5.3 Amigos (`#amigos`)
A grade aprovada, fixada em **3 colunas** (gap 12) para ocupar a largura. Com a busca preenchida, filtra ao vivo por nome ou guilda. O botão de conversa (hoje uma pílula vazia) ganha o ícone de balão 16 e `aria-label="Conversar com Marina S."`. "Desfazer" pede confirmação: modal "Desfazer amizade com Marina S.?" / "Vocês deixam de acompanhar o avanço um do outro. Dá para convidar de novo depois." / "Manter amizade" · "Desfazer".

### 5.4 Encontrar colegas (`#encontrar`)
Mesmo card de pessoa dos amigos, com o botão **"Convidar"** (pílula accent) no lugar de "Desfazer". Mostra 3 (uma fileira) e o link **"Ver todos os 9 colegas"**, que expande o bloco. Colegas: Kenji O. (Survivor), Lara P. (Mastermind), Iago F. (Daredevil), + 6. Um deles com convite já enviado mostra o chip "Enviado".

### 5.5 Coluna lateral (`#guildas` fica aqui)
1. **Guilda em destaque:** o card aprovado, igual.
2. **Sua rede:** as mesmas linhas, agora `<a>` com seta 14 à direita e hover `elev`: Amigos 6 → `#amigos` · Guildas 2 → `#guildas` · Convites pendentes 1 → `#convites` · **Bloqueados 0** → abre o modal "Pessoas bloqueadas" (vazio: "Você não bloqueou ninguém.").
3. **Guildas da turma** (`id="guildas"`): lista de linhas de 56px: emblema 32 + nome + "8/10 membros". "Legião Azul" (você participa, chip "Sua guilda") e "Exploradores do Norte" (botão pequeno "Pedir para entrar"). No pé, botão secundário "+ Criar guilda", desabilitado com a ajuda "Você já participa de uma guilda nesta turma."
4. **Loja:** o atalho aprovado, igual, no pé da coluna.

### 5.6 Cabeçalho
O do v1 sem a etiqueta, com um chip neutro à direita: `object-coin.png` 20 + "240" (`aria-label="Seu saldo: 240 moedas"`).

## 6. Estados (seletor flutuante)
"Com dados" · "Sem convites" · "Sem amigos" · "Busca sem resultado" · "Carregando" · "Erro"
- **Sem convites:** o bloco Convites some (não fica título vazio).
- **Sem amigos:** no bloco Amigos, card vazio compacto: **"Você ainda não tem amigos na jornada."** + botão "Encontrar colegas" que rola até `#encontrar` (texto do app).
- **Busca sem resultado:** "Nenhuma pessoa encontrada" / "Tente outro nome ou limpe a busca." + "Limpar busca".
- **Carregando:** esqueletos no lugar dos cards (1 convite, 6 amigos, 3 colegas) e da coluna.
- **Erro:** card de erro "Não foi possível carregar o Social." + "Tentar novamente".

## 7. Não fazer
- Não trazer as abas de volta em outro formato (pílulas, segmentado). A navegação agora é a própria página + "Sua rede".
- Não mudar o visual dos elementos verdes.
- Não pintar o card do colega com a cor do perfil dele.

## 8. Aceite
- [ ] Sem etiqueta, sem abas, sem faixa vazia à direita.
- [ ] Convite, grade de amigos e coluna lateral visualmente iguais ao v1.
- [ ] Convites, Amigos e Encontrar como blocos com âncora; Guildas e Bloqueados alcançáveis pela coluna.

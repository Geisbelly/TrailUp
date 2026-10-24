# Parte 3 — Tópico (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/04-topico.html`.

## De onde vem

- **v4:** `04-topico.html`. Cabeçalho com voltar, "Fronteiras do Império", "3. Equações do 1º grau", as 5 bolinhas das partes e "3 de 5". Coluna principal com as partes: **3** = material personalizado (texto, destaque, áudio narrado, "Marcar conteúdo como concluído", "Adicionar à Bag" e uma múltipla escolha com retorno); **4** = atividade de leitura (PDF em modo página ou rolagem, imagem da balança); **5** = atividade de vídeo (player, roteiro em anexo). Coluna da direita com o **modo batalha** (boss "Guardião das Equações", escudo, HP, relógio do encontro, −16 por conteúdo, −24 por atividade, "Desativar") e a vitória. Guia (`assets/mentor.js`), Bag (`assets/bag.js`) e conquista (`assets/celebracoes.js`). Barra de baixo com "Continuar".
- **App hoje:** `app/(tabs)/trilha/[id].tsx` em tela cheia (sem barra de abas). No celular, a batalha é um **chip no cabeçalho** (`IABattleHeaderChip`) que abre o painel numa janela; o guia é um botão flutuante (`IAMentorPanel`); a vitória é o `BossVictoryModal`.

## O que fica igual ao v4 (não mude)

- Os textos das três partes, a pergunta "3x + 7 = 22", o retorno "Conquistado!", as 4 páginas do diário, a balança, o vídeo "Isolando o x em 3 movimentos" e o roteiro anexo.
- A mecânica da batalha: escudo 20, HP 136 (4 conteúdos × 16 + 3 atividades × 24), começando com dois conteúdos já feitos; o dano tira primeiro do escudo; "Parabéns! Você derrotou o boss!" com "Continuar jornada".
- Os textos do guia (abertura, dicas, sugestões e a recusa de entregar resposta), do editor da Bag (Resumo, Anotação, Card) e da conquista "Fronteira Avançada".
- Os estados do seletor: Em batalha, Painel da batalha aberto (novo: a folha da batalha à vista), Boss quase derrotado, Boss derrotado, Batalha desativada, Sem batalha, Batalha suspensa (ansiedade), Conquista desbloqueada, Guia aberto, Guia silenciado, Editor: novo item, Atividade de texto, Atividade de vídeo, Vídeo assistido, Anexo com erro.

## O que muda no celular

### Cabeçalho (fixo, 2 linhas)
- **Linha 1:** voltar (48px) · "Fronteiras do Império" (eyebrow) e "Equações do 1º grau" (Georgia 17, uma linha) · o **chip da batalha** à direita.
- **Linha 2:** as 5 partes como uma **barra segmentada** de largura total (cada segmento é um alvo de 48px de altura, mesmo que o traço tenha 4px) + "3 de 5". Tocar num segmento vai para a parte.

### Batalha (coluna da direita → chip + folha)
- **Chip** (como no app): rosto do boss em 28px, mini barra de HP e o relógio. Ao levar dano, o chip treme e solta "−16" / "−24".
- **Tocar no chip abre a folha de baixo** com o painel do v4 inteiro: arte do boss, tipo, relógio, escudo, HP, a tabela de dano, a ajuda e "Desativar".
- **Batalha desativada:** chip neutro "Batalha desligada · Ligar". **Sem batalha:** sem chip. **Pausada (ansiedade):** chip com pausa, "Batalha pausada"; a folha explica "A batalha foi pausada para você estudar no seu ritmo." (o #598 fez isso na web).
- **Vitória:** tela cheia, como o `BossVictoryModal`.

### Conteúdo (coluna única, rola)
- Margens de 18px; texto em 16px com altura de linha 1,6 (leitura longa no celular).
- **Áudio:** o cartão do v4 em largura total, com o botão de tocar de 48px.
- "Marcar conteúdo como concluído" e "Adicionar à Bag" lado a lado, em botões de 48px.
- **Múltipla escolha:** alternativas como linhas de 52px, de toque inteiro.
- **PDF:** só o **modo página** aparece de cara, com ‹ › de 48px; "Modo rolagem" fica no seletor. "Abrir arquivo" abre o visualizador do sistema.
- **Vídeo:** player em 16:9 na largura toda, com o botão de tela cheia.

### Barra de baixo
- "Continuar" fixo embaixo (largura total, 52px) + área segura. Sem barra de abas: o Tópico é tela cheia, como no app.

### Guia, Bag e conquista
- **Guia:** botão redondo de 56px acima da barra de baixo. Abre o chat em **tela cheia**, com as dicas como chips roláveis, as sugestões e o campo acima do teclado. **Silenciado:** o botão fica cinza e riscado.
- **Editor da Bag:** folha de baixo alta (com o contexto "Equações do 1º grau · Avançando sobre o desconhecido"), tipo em segmentos, título e conteúdo, "Cancelar" e "Salvar". A Bag aberta inteira fica para a parte do Perfil.
- **Conquista desbloqueada:** tela cheia com a arte do troféu, como na cerimônia da Trilha.

## Fora do escopo desta parte

- A Bag aberta (lista de itens): parte do Perfil.
- O tutorial de primeiro acesso.

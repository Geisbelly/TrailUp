# Parte 7 — Perfil, Biblioteca de conquistas, Relatório e a Bag (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/08-perfil-hub.html`, `09-biblioteca-conquistas.html`, `10-relatorio-dados.html` e `assets/bag.js` (a Bag aberta, usada por todas as telas logadas).

## De onde vem

- **v4 `08-perfil-hub.html`:** banner com o retrato emoldurado e os botões de vidro (Trocar banner, Configurações, Biblioteca, Bag); bloco de identidade (Amina T., @AMINA, sobre, turma, guilda, e-mail, "Na jornada desde", "Editar informações", perfil dominante, **alternar perfil ativo** entre Conqueror 58%, Mastermind 24% e Achiever 12%, barra de afinidades, turma/sequência/posição); **conquistas** (14 conquistadas, 42%, 4 recentes, "Quase lá" com 3); **métricas do perfil** no estilo do perfil (Arena Tática para Conqueror: precisão 81%, 12º, 11h 20min, 56%; status da operação; radar de 5 eixos); **leitura adaptativa** (estado, coleta visual, ciclo 14, leituras, ajustes, pontos de atenção); **última atividade**. Estados: Com dados, Banner próprio, Um só perfil, Trocando perfil, Erro ao trocar perfil, Sem métricas, Sem leitura recente, Carregando.
- **v4 `09-biblioteca-conquistas.html`:** 14 conquistadas · 3 em progresso · 42%; filtros Todas, Concluídas, Em progresso, Bloqueadas; grade de 12 conquistas (6 concluídas, 3 em progresso com contagem, 3 bloqueadas); detalhe ao tocar.
- **v4 `10-relatorio-dados.html`:** "Relatório dos seus dados", o que entra, "Gerar e compartilhar o PDF", e o **erro explícito** (#28), com "Tentar novamente"; prévia do PDF.
- **v4 `assets/bag.js`:** uma Bag só, aberta de qualquer tela: busca, abas Todos/Salvos/Gerados/Comprados, filtros Resumos/Anotações/Cards, cards que viram, itens da Loja (disponível/consumido), compartilhar, editar, excluir com confirmação, novo item.
- **App hoje:** `app/(tabs)/perfil/index.tsx`, `conquistas.tsx`, `relatorio.tsx`, `components/bag/BagModal.tsx` e `BagEditorModal.tsx`.

## O que fica igual ao v4 (não mude)

Os dados de exemplo, os textos, os números (que batem entre Perfil, Biblioteca e Ranking: 12º, 42%, 14 conquistadas) e os estados de cada tela.

## O que muda no celular

### Perfil (aba Perfil)
- **Banner** de 160px em largura total, com o retrato (96px, moldura do perfil) sobreposto embaixo, centralizado. Os botões de vidro ficam no canto superior direito do banner, só ícone (44px): Configurações, Biblioteca e Bag. "Trocar banner" vira um ícone de câmera no canto do banner.
- **Identidade** centralizada abaixo do retrato: nome, @, sobre; a lista de informações em linhas (rótulo à esquerda, valor à direita); "Editar informações" como link.
- **Perfil ativo:** o chip do perfil e o **alternar perfil** como 3 opções em linha (emblema + nome + %), de 56px; a barra de afinidades e a legenda logo abaixo.
- **Atalhos** em lista (o que no v4 estava na barra lateral e nos botões do banner): **Loja · 38 moedas**, Biblioteca de conquistas, Relatório dos seus dados, Configurações, Sair. No celular, é aqui (e no Social) que a Loja mora.
- **Conquistas:** contador e barra, as 4 recentes em grade 2 × 2, "Quase lá" em linhas; "Ver biblioteca completa →".
- **Métricas:** os 4 indicadores em grade 2 × 2; status da operação; o radar a 240px.
- **Leitura adaptativa** e **última atividade** em cartões empilhados.
- Tocar numa conquista abre o detalhe em folha de baixo.

### Biblioteca de conquistas (tela empilhada, com voltar)
- Os três números numa linha; filtros em controle segmentado de 4 partes (rola se não couber); grade de **3 colunas** com a arte, o nome e, nas em progresso, a barra e "5/7 dias"; bloqueadas apagadas com cadeado.
- **Detalhe** numa folha de baixo: arte grande, categoria, nome, descrição, "Concluída em …" ou o progresso, ou "Como desbloquear".

### Relatório dos seus dados (tela empilhada, com voltar)
- Coluna única: o que entra, o botão "Gerar e compartilhar o PDF" em largura total, e a prévia do PDF abaixo.
- Estados: Pronto, Gerando… (botão ocupado), **Erro** (o cartão do #28 com "Tentar novamente") e **Compartilhar**: abre a folha de compartilhamento do sistema (simulada).

### Bag (todas as telas logadas)
- Abre em **tela cheia**, por cima da tela atual: "Bag · Seu inventário", busca, abas em controle segmentado (Todos, Salvos, Gerados, Comprados) e filtros em pílulas; itens em **lista de cartões de largura total**; o card vira ao tocar; compartilhar, editar e excluir num menu "…" de cada item (excluir pede confirmação em folha); "+ Novo item" fixo embaixo, que abre o mesmo editor do Tópico.
- Estados novos no Perfil: Bag aberta, Bag vazia, Bag com erro.
- O botão da Bag da Trilha, do Ranking e do Social passa a abrir esta Bag.

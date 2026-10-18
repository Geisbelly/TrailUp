Item 7: **tutorial de primeiro acesso**. Arquivos: o componente novo `v4/assets/tour.js`, ligado em todas as telas logadas. A Trilha ganha o estado "Primeiro acesso"; "Rever tutorial inicial" nas Configurações passa a reiniciar o tour.

## 1. O que o app faz
Fontes: `mobile/src/utils/firstAccessTour.ts` (versão 7) e `components/FirstAccessTour.tsx`.

- O tour **passa pelas telas**: cada passo tem `route`, `page`, `title`, `description` e um `target`, que é o elemento a destacar. Sem alvo, ele destaca uma região aproximada.
- **Primeiro passo:** apresentação do guardião do perfil, com a arte de corpo inteiro (`guardianFullImages`). Para o Conqueror:
  - título: "Amina, a Comandante do Cristal Azul";
  - texto: "Eu sou Amina. Minha armadura azul e dourada, a coroa e o cajado de cristal representam liderança, estratégia e domínio conquistado com propósito. Como guardiã Conquistadora, comando sua campanha, acompanho sua posição e transformo progresso em território dominado."
- **Nos outros passos**, o guardião aparece pequeno ao lado de um balão com:
  - a página;
  - o contador "N/16" e a barra de progresso em segmentos;
  - os botões **Pular** (rótulo acessível "Pular tutorial inicial"), **Voltar** e **Próximo**. No último passo, o botão vira **Começar**.
- **Passos e falas** (as falas são a voz do Conqueror):

| # | Página | Título | Texto |
|---|---|---|---|
| 1 | Apresentação · Amina | Amina, a Comandante do Cristal Azul | (apresentação acima) |
| 2 | Navegação principal | Suas áreas | "Antes da campanha, reconheça o terreno: estes são seus setores de comando." + na web: "Trilha, Notificações, Social, Loja, Ranking e Perfil — trocar de área não perde seu progresso." |
| 3 | Guias da interface | Precisou de ajuda? | "Precisou de inteligência tática? Me acione sem sair do setor. Este botão abre o guia da página em que você estiver." |
| 4 | Trilha | Seu progresso | "Este é o mapa da campanha. Cada território aqui pode ser seu. Aqui ficam a classe e a porcentagem já concluída." |
| 5 | Trilha | Os tópicos | "Avance sobre um tópico. Sua posição fica salva entre as investidas. Cada nó é um tópico: concluído, disponível ou ainda bloqueado." |
| 6 | Notificações | Seus avisos | "As movimentações da sua campanha chegam por aqui." + web: "Abra um aviso para ler, marcar como não lido ou excluir." |
| 7 | Ranking | As classificações | "A Sala de Honra mostra onde você está em cada frente. Cada cartão abre uma tabela com critério próprio." |
| 8 | Perfil | Seu perfil ativo | "Este é o seu posto de comando. Ajuste o estilo, não as vitórias. Trocar de perfil muda cores, guia e recursos — nunca o seu histórico." |
| 9 | Perfil · Métricas | Suas métricas: Arena Tática | "Seu painel prioriza campanha, posição, precisão e domínio da trilha. O guia desta página explica cada número." |
| 10 | Biblioteca de Conquistas | Suas conquistas | "Aqui ficam as insígnias que você conquistou em campo. Concluídas, em progresso e bloqueadas, com o requisito de cada uma." |
| 11 | Configurações | Suas preferências | "Daqui você comanda preferências, acessos e permissões. Conta, estilo das métricas, coleta de dados e privacidade." |
| 12 | Configurações · Métricas | Como suas métricas aparecem | "O modo Automático acompanha o seu perfil ativo. Você também pode fixar outra visualização; isso muda somente a apresentação do painel, nunca seus resultados nem seu histórico." |
| 13 | Configurações · Coleta | Câmera: você mantém o controle | "Este controle ativa ou desativa a análise opcional por câmera. Ativar ainda depende da permissão do navegador; desativar interrompe essa coleta sem bloquear seus estudos, notas ou demais recursos." |
| 14 | Configurações · Coleta | Chat e contexto do mentor | "Aqui você permite ou interrompe o registro das interações com o chat do guia…" |
| 15 | Configurações · Relatório | Seu relatório completo | "O relatório reúne identificação, eventos registrados, posições nos rankings, progresso nas trilhas e conquistas. Este botão gera um PDF para você revisar e compartilhar." |
| 16 | Tutorial concluído | Pronto | "O reconhecimento terminou. A campanha é sua — avance. O botão de ajuda continua em cada página." |

Adaptações para a web:
- O app tem 4 abas e a web tem 6. Por isso o passo 2 cita as 6 áreas, sem o "quatro".
- Em "Câmera", "permissão do Android" vira "permissão do navegador".
- Em "Notificações", "arraste" vira "abra".

## 2. Na web
- **Navegação entre passos.** Os passos de outra tela levam até ela: ao clicar em Próximo, a página muda e o tour continua no passo certo. O passo atual vai na URL (`?tour=N`).
- **Destaque.** Um recorte com borda de 2px na cor do perfil marca o alvo, e o resto da página fica escurecido (box-shadow gigante). Se o alvo não existir, o balão fica no centro.
- **Balão.** Cartão de 380px ao lado do alvo (direita, esquerda ou embaixo, onde couber), com o rosto do guardião de 56px.
- **Passo 1.** Janela central com a arte `guardiao-conqueror.png` à esquerda e o texto à direita.
- **Teclado.** Esc pula o tour; as setas avançam e voltam.

**Alvos:**

| Passo | Tela | Alvo |
|---|---|---|
| 2 | — | `.console-navigation` |
| 3 | Trilha | `#guideBtn` |
| 4 | Trilha | `#hud` |
| 5 | Trilha | `#board` |
| 6 | Notificações | `#md .list` |
| 7 | Ranking | `.cats` |
| 8 | Perfil | `.id-block` |
| 9 | Perfil | `.kpis` |
| 10 | Biblioteca | `.summary` |
| 11 | Configurações | `.side` |
| 12 | Configurações | `.opts`, em `?sub=metricas` |
| 13 | Coleta | 1º `.toggle-row` |
| 14 | Coleta | 4º `.toggle-row` |
| 15 | Relatório | `.action-card` |

## 3. Estados
- Trilha: o seletor ganha "Primeiro acesso (tutorial)".
- Configurações: "Rever tutorial inicial" mostra o aviso do app ("Tutorial reiniciado", "Ele aparece de novo na próxima vez que você abrir a Trilha.") com o botão **"Abrir agora"**, que leva à Trilha já no passo 1.

## 4. Aceite
- [ ] 16 passos com os textos do app, cruzando as telas.
- [ ] O recorte destaca o elemento certo em cada tela.
- [ ] Pular, Voltar, Próximo e Começar funcionam, e o contador e a barra avançam.
- [ ] "Rever tutorial inicial" reinicia o tour.

Próxima tela da mesma área: **Tópico** (dentro da Trilha).

Mantenha a paleta do perfil ativo. Esta é a tela mais importante do produto — é onde o aluno efetivamente estuda. Ao contrário das outras, ela some a barra de navegação inferior (tela cheia), porque o foco deve ser só o conteúdo.

## O que ela faz

Consumo do material de um tópico: o material de base do professor **e** o material personalizado gerado por IA para o perfil BrainHex daquele aluno, lado a lado na jornada — não são fontes concorrentes, o personalizado é uma camada sobre o mesmo tópico.

## Conteúdo real de hoje

Um tópico é composto de **blocos de conteúdo** de tipos diferentes, consumidos em sequência:

1. **Markdown didático** — texto formatado, no tom/linguagem adequado ao perfil BrainHex do aluno (cada perfil tem uma "assinatura editorial" própria: tom de voz, ritmo, abertura).
2. **Áudio guiado** — narração TTS do mesmo conteúdo, com um player (play/pause, progresso, velocidade).
3. **Apresentação/Deck** — um deck de slides (gerado por IA, renderizado como um HTML paginado dentro de um iframe/webview) ou um PDF (visualizado via iframe na web — o leitor nativo de PDF não existe nesta plataforma).
4. **Atividades** — quiz de múltipla escolha, verdadeiro/falso, lacuna (preencher) e dissertativa, com feedback de acerto/erro.
5. **Cards de revisão** — flashcards de reforço rápido.

**Navegação dentro do tópico:** o aluno avança por esses blocos em sequência; cada bloco concluído conta para o progresso do tópico (mistura o que veio do professor com o que veio do material personalizado — a régua de "quanto falta" é sempre a mesma, misturando as duas fontes).

**Se algum formato falhar** (ex.: áudio não carrega, deck não renderiza), o produto prioriza **não bloquear o estudo**: o aluno deve conseguir seguir por outro formato disponível em vez de travar.

## Estados

- **Carregando** um bloco específico (ex.: aguardando o deck renderizar).
- **Erro de mídia** (formato específico indisponível) — sem travar o restante do tópico.
- **Bloco concluído** — feedback visual claro de que aquele passo terminou.

## O que peço

Desenhe a tela de consumo de conteúdo cobrindo pelo menos: um bloco de texto/markdown, o player de áudio, e uma atividade de múltipla escolha com feedback de acerto. Pense em como orientar o aluno sobre "onde estou dentro do tópico" (quantos blocos faltam) sem competir visualmente com o próprio conteúdo — esta tela deve minimizar distração, ao contrário das outras (trilha, ranking, social), que podem ser mais "de jogo".

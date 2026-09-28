PROMPT MESTRE — cole isto primeiro, numa conversa nova. Os prompts seguintes (01, 02, 03...) devem ir na MESMA conversa, depois deste.

---

Quero prototipar a área **web do aluno** de uma plataforma educacional chamada **TrailUp**. Ela já existe como app mobile (Expo/React Native) — o que eu quero é repensar como essas mesmas telas, hoje pensadas só para toque numa tela pequena, deveriam se comportar num navegador (mouse/teclado, tela larga). Vou te dar o contexto completo, a identidade visual real do produto (não é pra inventar uma nova) e depois pedir a primeira tela. Nas próximas mensagens desta mesma conversa vou pedir as outras telas, uma de cada vez — mantenha a linguagem visual consistente entre todas.

**Não há prints para anexar aqui** — diferente de um redesign normal, esta área ainda não tem protótipo nenhum. Vou descrever os dados reais de cada tela por escrito, a partir do código do app.

## O produto

TrailUp personaliza conteúdo de ensino para cada aluno com base no "perfil de jogador" dele (metodologia BrainHex, 7 perfis: Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever). Um professor cadastra turmas e a trilha de conteúdo; uma IA gera material personalizado por perfil; o aluno consome isso nesta área (hoje só como app mobile — o console do professor é outro produto, não faz parte deste redesign).

## Quem usa esta área

Alunos de escola/universidade, em sessões de estudo longas e frequentes (diferente do professor, que só consulta às vezes). A área precisa sustentar uso contínuo.

## Identidade visual — não é um tema único, é uma fórmula por perfil

Cada aluno tem um perfil BrainHex dominante, e a interface inteira (fundo, superfícies, acentos, cenário) deriva da cor daquele perfil — não é uma de 7 paletas prontas escolhidas por um `switch`, é uma fórmula:

Dada a cor-assinatura do perfil (`accent`), no mesmo matiz (H), saturação limitada a 55%:
- Fundo (`background`): esse tom com luminosidade 10%
- Superfície de card (`surface`): luminosidade 16%
- Superfície elevada (`surfaceElevated`): luminosidade 22%
- Borda (`border`): luminosidade 35% — borda forte (`borderStrong`): 55%
- Texto principal: quase branco, mesmo matiz, saturação baixa (≤18%), luminosidade 96%
- **O accent em si** (usado como texto/ícone/borda de destaque) é a cor-assinatura **elevada em luminosidade até atingir contraste AAA (≥4.5:1)** contra a superfície elevada — nunca misturada com branco (isso desatura a cor).

**As 7 cores-assinatura:**
Seeker `#17a398` (teal) · Survivor `#4e5a66` (slate) · Daredevil `#d7263d` (vermelho) · Mastermind `#5b3fd9` (roxo) · Conqueror `#1e4fd6` (azul) · Socializer `#f4623a` (laranja) · Achiever `#c9a227` (dourado).

**Cada perfil tem um "guardião"** (mascote/personagem) que aparece em carregamento, seletor de perfil e como referência de identidade: Amara (Seeker) · Kenji (Survivor) · Ember (Daredevil) · Idris (Mastermind) · Amina (Conqueror) · Mateo e Zuri, juntos (Socializer) · Kwame (Achiever).

**Antes do login não existe cor de perfil ainda** — usa-se uma paleta estática derivada do roxo de marca (`#c1a1ff`), a única situação em que esse roxo aparece como cor de tema (depois do login, roxo é só a cor do Mastermind).

**Tipografia:** títulos em serifa (família Georgia/serif do sistema); corpo em fonte de sistema sem serifa (system-ui/Segoe UI/Roboto conforme plataforma).

**Motivo visual:** hexágonos nos nós de progresso e emblemas (mesma origem do brasão BrainHex que o console usa). Cantos de raio pequeno (6px) — bem mais discreto que um design "cartão grande arredondado".

**Cenário:** cada contexto (banner, mapa da trilha, ranking) tem sua própria arte de fundo, tingida pela cor do perfil ativo. Fotos/retratos de perfil ficam dentro de uma moldura na cor do perfil.

## Regras de design que importam pra esse produto especificamente

- Contraste: ao melhorar legibilidade de uma cor, **suba a luminosidade dela** — nunca misture com branco (desatura e descaracteriza a identidade do perfil).
- Repense o layout pra tela larga — o app hoje é uma coluna única esticada; decida o que vira multi-coluna (ex.: lista + detalhe lado a lado) sem perder a sensação de "app", não de site institucional.
- Trate estados vazio/carregando/erro com a mesma atenção que o estado com dados.
- Ações destrutivas (excluir conta, desfazer amizade, bloquear) precisam de confirmação visualmente inconfundível.
- Rotas pesadas (o Tópico, com deck/PDF) devem continuar podendo carregar sob demanda — não é motivo de design, mas não proponha nada que force tudo numa única tela gigante carregada de uma vez.

---

## Primeira tela: Entrada

**Sobre os dados que vou descrever:** não há print — é a descrição fiel do que a tela faz hoje, direto do código.

**Contexto:** é a primeira tela que qualquer visitante vê, antes de qualquer login — ainda sem perfil BrainHex, então usa a paleta estática roxa da marca (tema "mágica").

**Conteúdo real de hoje:**
1. Logo/marca do TrailUp centralizada, sobre um cenário de fundo (arte pública, não ligada a nenhum perfil).
2. Um título/chamada: "Sua próxima conquista começa aqui."
3. Botão primário **"Já tenho conta"** — leva à tela de "Bem-vindo(a) de volta" (ver abaixo) e dali para o login.
4. Botão secundário **"Criar conta"** — abre uma URL **externa** (fora deste app, no site do TrailUp) onde acontece o cadastro completo, incluindo um questionário de 6 passos que determina o perfil BrainHex do aluno. Esse fluxo de cadastro **não faz parte deste protótipo** — só represente o botão como saída externa, não desenhe o que tem depois dele.

**Estado secundário — "Bem-vindo(a) de volta":** ao tocar "Já tenho conta", aparece por ~2 segundos uma tela de transição: título "BEM VINDO(A) DE VOLTA!", subtítulo "Sentimos sua falta, ficamos felizes que tenha voltado.", e um elemento decorativo (estrela/emblema numa moldura). Depois disso, some sozinha e vai para o Login. Pode desenhar como uma variação/estado da mesma tela de Entrada, não precisa ser uma tela totalmente separada.

## O que peço

Desenhe a tela de Entrada (estado principal) e o estado de transição "Bem-vindo(a) de volta", já pensando em tela larga de navegador — não é só a tela mobile esticada. Estabeleça aqui o sistema de espaçamento, os estilos de botão/card e o tratamento de cenário de fundo que as próximas telas vão reutilizar.

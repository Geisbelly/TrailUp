PROMPT MESTRE — cole isto primeiro, numa conversa nova. Os prompts seguintes (01, 02, 03...) devem ir na MESMA conversa, depois deste.

---

Quero redesenhar o console web de um professor, de uma plataforma educacional chamada **TrailUp**. Vou te dar o contexto completo, a identidade visual real do produto (não é pra inventar uma nova) e depois pedir a primeira tela. Nas próximas mensagens desta mesma conversa vou pedir o redesign das outras telas do mesmo console, uma de cada vez — mantenha a linguagem visual consistente entre todas.

## O produto

TrailUp personaliza conteúdo de ensino para cada aluno com base no "perfil de jogador" dele (metodologia BrainHex, 7 perfis: Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever — cada um com cor própria, ver abaixo). O professor cadastra turmas e a trilha de conteúdo (tópicos → conteúdos → atividades → questões); uma IA gera material personalizado por perfil; o aluno consome isso num app mobile separado (não faz parte deste redesign).

## Quem usa esta tela

Professores, geralmente sem letramento técnico avançado, em sessões de uso (não uso contínuo o dia todo). Precisam entender rápido o que estão vendo sem treinamento prévio.

## Identidade visual (use exatamente estas cores — não invente uma paleta nova)

Tema único, escuro, estética "grimório místico medieval": violeta arcano + indigo frio, tipografia serifada ornamental nos títulos.

**Cores base (HSL):**
- Fundo: `hsl(225 32% 8%)` — quase preto, tom azulado
- Fundo de card: `hsl(226 28% 12%)`
- Texto principal: `hsl(40 20% 94%)` — quase branco, tom quente
- Texto secundário: `hsl(230 10% 72%)`
- **Primária (violeta, cor de marca):** `hsl(266 95% 66%)` — amostrada do logo oficial
- Primária clara (gradientes/links): `hsl(266 90% 77%)`
- Primária escura (gradientes): `hsl(265 65% 50%)`
- Secundária (bronze/cobre escuro): `hsl(25 35% 26%)`
- Accent (indigo frio, complementar): `hsl(239 84% 67%)`
- Destrutivo/erro: `hsl(0 70% 55%)`
- Bordas: `hsl(226 20% 22%)`
- Sucesso (fixo): `hsl(142 65% 50%)` — Aviso (fixo): `hsl(45 90% 58%)` — Info (fixo): `hsl(205 70% 58%)`
- Cantos bem arredondados em tudo (raio grande, ~20px)
- **Sem dourado na paleta base** — dourado só aparece como cor de um perfil BrainHex específico (Achiever), nunca como cor do tema.

**As 7 cores dos perfis BrainHex** (aparecem quando o perfil de um aluno é mostrado):
Seeker `#17a398` (teal) · Survivor `#4e5a66` (slate) · Daredevil `#d7263d` (vermelho) · Mastermind `#5b3fd9` (roxo) · Conqueror `#1e4fd6` (azul) · Socializer `#f4623a` (laranja) · Achiever `#c9a227` (dourado)

**Tipografia:** títulos em serifa ornamental estilo "Cinzel" (evoca grimório medieval); corpo de texto em sans-serif humanista estilo "Inter".

**Motivo visual recorrente:** hexágonos (badges, nós de progresso) — vem do brasão do BrainHex. Efeitos de "glow" (halo luminoso) nas cores de marca são usados com moderação em elementos de destaque.

Vou anexar imagens de referência: o logo oficial, as ilustrações dos 7 "guardiões" (mascotes de cada perfil) e screenshots do app mobile (que já usa essa identidade) — use como referência de tom, não como algo a copiar literalmente para a web.

## Regras de design que importam pra esse produto especificamente

- Ao melhorar contraste de uma cor, aumente a luminosidade dela — nunca clareie misturando com branco (isso desatura e descaracteriza a cor de marca).
- Hierarquia visual clara: separe visualmente o que é resumo/KPI, o que é gráfico, e o que é lista de ação — hoje tudo tende a ter o mesmo peso visual.
- Trate estados vazio/carregando/erro com a mesma atenção que o estado "com dados".
- Ações destrutivas (excluir, recusar, remover) precisam ser visualmente inconfundíveis e difíceis de acionar sem querer.
- A base de componentes de destino é shadcn/ui (Radix + Tailwind) — pense em termos de Card, Dialog, Tabs, Badge, Progress, Select etc., não em elementos totalmente livres, pra facilitar a implementação depois.

---

## Primeira tela: Dashboard

É a tela que o professor mais provavelmente abre primeiro — visão geral de desempenho de uma turma.

**Sobre os prints que vou anexar desta tela:** são só para você entender como ela funciona e se organiza hoje — não é o visual a replicar, é a base a redesenhar. Foram tirados numa conta sem turma/aluno cadastrado, por isso os gráficos e a lista aparecem vazios; os dados reais que essa tela mostra quando populada estão descritos abaixo.

**Conteúdo que precisa existir (dados reais que a tela mostra hoje):**

1. Um seletor de turma (o professor pode ter várias turmas).
2. Uma linha de indicadores-resumo da turma inteira: Total de Alunos, Média de Notas, Conclusão Média (%), Taxa de Acertos (%), Abandono Médio (%), Uso do Chat após Erro (%), Tempo Médio de Uso.
3. Um gráfico de **barras**: "Abandono por Perfil" — abandono (%) comparado entre os 7 perfis BrainHex (use as cores oficiais de cada perfil nas barras).
4. Um gráfico de **pizza/rosca**: "Distribuição de Notas" — quantos alunos em cada faixa de nota.
5. Uma **lista/tabela de alunos** da turma (nome, perfil BrainHex dominante, indicadores rápidos), clicável — ao clicar, abre um painel de detalhe do aluno.
6. **Painel de detalhe do aluno** (ao clicar num aluno da lista), organizado em 4 sub-abas:
   - **Visão Geral** — indicadores individuais do aluno.
   - **Perfil BrainHex** — o perfil dominante do aluno e a distribuição de afinidade entre os 7 perfis (é um vetor de 0–100% por perfil, não só um rótulo).
   - **Trilha Visual** — a trilha de tópicos do aluno como uma sequência de nós hexagonais conectados (concluído / disponível / bloqueado, cada estado com estilo visual distinto), com uma barra de progresso de XP no topo. É a tela mais "gamificada" do console — pode ganhar mais personalidade aqui.
   - **Personalização** — progresso dos itens de material personalizado desse aluno (o que já foi consumido).
   - Além disso, um card de "Última Atividade" e um gráfico de **linha**: "Evolução do aluno" ao longo do tempo.

**O que peço:**
Desenhe esta tela completa (visão geral da turma + o painel de detalhe do aluno, pode ser como um estado alternativo/expandido da mesma tela ou uma view separada — você decide o que for mais claro). Estabeleça aqui o sistema de espaçamento, os estilos de card, de gráfico e de badge que as próximas telas do console vão reutilizar.

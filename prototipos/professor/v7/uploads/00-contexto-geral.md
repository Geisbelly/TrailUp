# Contexto geral — Redesign do console do professor (TrailUp)

Este documento reúne tudo que é útil saber antes de desenhar qualquer tela nova. Leia isto (ou cole isto) junto do prompt mestre em qualquer ferramenta de design com IA.

## O que é o TrailUp

TrailUp é uma plataforma de ensino que personaliza o conteúdo de cada aluno com base no "perfil de jogador" dele (metodologia BrainHex: 7 perfis — Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever). Um professor cadastra turmas, tópicos e material didático; a IA gera texto e áudio personalizados para cada perfil, por tópico; o aluno consome isso pelo app mobile.

## Quem usa a tela que estamos redesenhando

**Professores universitários/escolares**, geralmente sem letramento técnico avançado. Eles usam o console para: criar turmas, montar a trilha de conteúdo (tópicos → conteúdos → atividades → questões), acompanhar o desempenho e engajamento dos alunos, e configurar rankings. Não é uma ferramenta de uso diário intenso — é usada em sessões (montar a trilha do semestre, checar o dashboard de vez em quando).

## Onde essa tela vive no código

`frontend/` — Vite + React + TypeScript + Tailwind + shadcn/ui. É o **mesmo frontend** da landing page pública do TrailUp (`/`, `/sobre`, `/blog`...) — o console do professor é só uma parte dele, atrás de login, nas rotas `/console` e `/console/:secao`. Arquivo de entrada do console: `frontend/src/pages/Console.tsx`.

**Importante:** este frontend é só o **console do professor** + a landing page. A experiência do aluno é outro app inteiro (mobile, Expo/React Native) — não faz parte deste redesign.

## Estrutura de navegação atual (7 abas, barra superior)

Todas as abas vivem em `frontend/src/components/console/`. A navegação é por botões na barra superior (não é sidebar), cada botão é uma rota própria (`/console/dashboard`, `/console/trilha`, etc.) — dá pra atualizar a página ou compartilhar o link de uma aba específica.

1. **Dashboard** (`DashboardSection.tsx`) — visão de desempenho da turma: KPIs, gráficos, lista de alunos, drill-down por aluno.
2. **Trilha** (`trilha/TopicsManager.tsx`) — editor visual da trilha de tópicos de uma turma (a tela mais complexa e mais "de trabalho" do console).
3. **Classes** (`ClassManagementSection.tsx`) — CRUD de turmas e matrícula de alunos.
4. **Personalizações** (`personalizacoes/PersonalizacoesSection.tsx`) — acompanhamento de como a IA gerou/está gerando material por perfil, por aluno e por turma.
5. **Ranks** (`RanksSection.tsx`) — configuração de tipos de ranking e visualização de posições.
6. **Meus Dados** (`ProfileSection.tsx`) — perfil do professor, trocar senha, excluir conta.
7. **Aprovações** (`ProfessorApprovalSection.tsx`) — **só visível para a dona do projeto** (aprovar/recusar cadastro de novos professores). Não redesenhar como se fosse uma tela comum — é uma tela de administração de um único usuário.

> `TrilhaSection.tsx` existe no código mas é **código morto** (não é importado em lugar nenhum) — ignore esse arquivo, a aba "Trilha" real é `TopicsManager.tsx`.

## Fora do console: o fluxo de autenticação (por último, mas também neste redesign)

Antes de chegar no console, tem toda uma jornada de login/cadastro — está incluída aqui também, nas pastas `telas/07-` a `10-`, deliberadamente **por último** na fila. Vale saber desde já: o cadastro tem duas etapas bem separadas no código —

1. **Criar a conta** (`/cadastro-aluno`, `/cadastro-professor`) — só e-mail + senha. Curto.
2. **Finalizar o cadastro** (depois de confirmar o e-mail, em `/auth/confirmacao`) — é aqui que o **aluno faz o questionário BrainHex** (wizard de 6 passos) e o professor preenche instituição/disciplina. É a tela de maior "impacto de marca" de toda a jornada de autenticação.

Não confundir as duas ao desenhar — são prompts separados (09 e 10).

## Identidade visual

- Tema único, escuro, "grimório místico medieval": violeta arcano + indigo frio, tipografia serifada ornamental (Cinzel) nos títulos, Inter no corpo.
- Ver `paleta-cores.md` nesta mesma pasta para os tokens exatos (HSL/hex), as 7 cores dos perfis BrainHex, e os efeitos (glow, gradientes, hexágonos) já existentes.
- Cantos bem arredondados (`--radius: 1.25rem`) em tudo.
- O hexágono é um motivo visual recorrente (badges de conquista, nós da trilha do aluno) — vem do brasão/logo do BrainHex.

## Convenções que o redesign deve respeitar

- **Contraste AAA é levado a sério neste projeto.** Ao ajustar uma cor pra melhorar legibilidade, sempre subir a luminosidade HSL da própria cor — nunca misturar com branco (desatura e descaracteriza a cor de marca). Ver comentário em `paleta-cores.md`.
- **Sem dourado no tema base** — foi removido de propósito por não representar a identidade do produto. Dourado só aparece como cor de perfil (Achiever).
- Cores semânticas (`success`/`warning`/`info`) são fixas, não derivam do primary — não inventar variações delas.
- shadcn/ui é a base de componentes (Radix). Um redesign realista deve pensar em termos de variantes desses componentes (Card, Dialog, Tabs, Badge...), não em componentes totalmente customizados do zero — isso facilita a implementação depois.

## O que o redesign precisa resolver (motivação)

O objetivo não é só "deixar mais bonito" — é deixar **mais fácil de entender e usar**. Ao desenhar cada tela, priorize:
- Hierarquia visual clara entre o que é KPI/resumo, o que é gráfico, e o que é lista/tabela de ação.
- Reduzir a quantidade de informação exibida de uma vez sem esconder o que importa (várias telas hoje empilham muitos cards pequenos do mesmo tamanho, sem hierarquia).
- Estados vazios, de carregamento e de erro tratados de forma intencional (hoje a maioria é só um texto cinza "Carregando...").
- Ações destrutivas (excluir conta, recusar professor, excluir turma) devem ser visualmente distintas e difíceis de acionar por engano.

## Como usar os outros arquivos desta pasta

- `paleta-cores.md` — tokens de cor, tipografia, efeitos.
- `assets/` — logo oficial, imagens dos 7 guardiões BrainHex, screenshots do app mobile (referência de tom visual, não da tela em si).
- `telas/00-dashboard/` — abra `prompt.md` e cole numa conversa nova da ferramenta de design, anexando junto os prints que estão na mesma pasta. Esse é o prompt mestre: dá todo o contexto acima e já pede a primeira tela (Dashboard).
- `telas/01-trilha/`, `telas/02-turmas/`, `telas/03-personalizacoes/`, `telas/04-ranks/`, `telas/05-meus-dados/`, `telas/06-aprovacoes/` — um prompt (`prompt.md`) por tela do console, cada um já com seus prints na mesma pasta (exceto Aprovações, que não tem print — só a administradora do projeto acessa essa tela). Envie um de cada vez, **na mesma conversa** onde o prompt mestre já rodou, anexando os prints daquela pasta específica.
- `telas/07-login/`, `telas/08-recuperar-senha/`, `telas/09-cadastro-conta/`, `telas/10-finalizar-cadastro/` — o fluxo de autenticação (login, recuperar senha, criar conta, e o wizard de finalização com o questionário BrainHex). Deixe por último, como pedido — mas são prompts completos, prontos para quando chegar a vez deles.
- `referencia-visual-extra/` — prints da landing page pública, cadastro, login e blog (fora do escopo deste redesign, mas mostram a identidade visual "por fora" — anexar é opcional, só no prompt mestre, se quiser reforçar o tom visual).
- `MAPEAMENTO.md` — explica de onde veio cada print e o que ele mostra.

Todo `prompt.md` já avisa, na própria mensagem, que os prints anexados mostram só "como a tela está hoje" (muitos em estado vazio, pois a conta de teste não tinha turma/aluno cadastrado) — não é o visual a replicar.

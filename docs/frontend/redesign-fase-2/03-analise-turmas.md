# Análise — Turmas do console do professor: código atual × protótipo V9

> Só análise. Nenhum arquivo de código foi alterado.
>
> **Protótipo analisado:** `prototipos/professor/v9/Console Turmas (Fase 2).dc.html` (PR #256), lido por inteiro (640 linhas, incluindo o script com os dados fictícios).
> **Revisões consideradas:** `prototipos/professor/prompts/revisao-01-apontamentos/05-classes.md`, `revisao-02-feedback-prototipo/classes-descricao-detalhada.md`, `revisao-03-prompts-finais/03-classes.md` e `revisao-04-problemas-pontuais/09-classes-confirmacao-ao-duplicar-turma.md`.
> **Código analisado:** `frontend/src/components/console/ClassManagementSection.tsx`, `PresencaDialog.tsx`, `trilha/ClassManagerDialog.tsx`, `trilha/classDeletion.ts`, `trilha/personalizacaoJobsApi.ts`, `trilha/TopicsManager.tsx` (só a escolha de turma), `frontend/src/pages/Console.tsx`, `frontend/src/lib/presencaDaTurma.ts`.
> **Banco conferido ao vivo** (somente leitura, 30/09/2026): colunas de `classe`, `materia`, `professor_aluno`, `topicos`, `conteudos`, `atividades`, `questoes`, `cards`; triggers de `classe` e `classe_aluno`; policies de `classe`, `classe_aluno`, `materia`, `professor_aluno`; funções `excluir_classe`, `inscrever_aluno_em_classe`, `trg_classe_aluno_after_insert`.
>
> **Regra usada em toda a análise:** a mesma do dashboard (`01-analise-dashboard.md`). A estrutura e o conteúdo da tela atual são a base; o protótipo manda na estilização. Quando o protótipo tem algo que a tela atual não tem, entra como proposta de "criar", com a fonte de dados avaliada. Quando o protótipo tira algo que a tela atual tem, a recomendação padrão é manter.
>
> **O que já está pronto e não se repete aqui:** a moldura do console (topbar, sidebar, fundo, tokens com escopo em `.console-shell`, Cinzel nos títulos) entrou na Fase 1 do dashboard (#258). O Escriba (linhas 404-438 do protótipo) entrou na Fase 10 (#268). Esta análise cobre só o conteúdo da seção Turmas.

---

## 1. Resumo

| Categoria | Quantidade | Exemplos |
|---|---|---|
| **Só estilo** (mesmo conteúdo, visual novo) | 6 blocos | cabeçalho, card da turma, estado vazio, painel de edição, modal de presença, lista de matriculados |
| **Modificar** (estrutura ou comportamento mudam) | 11 pontos | ações do card sempre visíveis; "1 alunos"; exclusão e remoção de aluno saem do `window.confirm`; duplicar pede confirmação; erro de carga deixa de parecer "nenhuma turma"; adicionar aluno por busca; **duplicação vira transação no banco e para de perder dados**; **matrícula passa a enfileirar a personalização pelo banco** |
| **Criar** (não existe hoje) | 7 itens | situação da turma, nº de tópicos e conclusão no card; botão "Abrir trilha" / "Montar trilha"; card tracejado "Nova turma"; perfil e data de matrícula na lista de alunos; faixas de "turma criada" / "turma duplicada" |
| **Apagar** | 2 itens | `TrilhaSection.tsx` e `trilha/ClassesManager.tsx` (código morto, com uma segunda cópia abandonada da gestão de turmas) |
| **Não levar para a tela real** | 6 itens do protótipo | seletor "Pré-visualização de estado", dados fictícios, campo "Período", texto "histórico guardado por 30 dias", borda roxa no primeiro card, links extras da sidebar |

Diferente do dashboard, **quase tudo aqui tem fonte de dado**. A tela é pequena e as revisões 01 a 03 já aprovaram a estrutura. O trabalho caro não é visual: são dois defeitos de encanamento que a análise encontrou no código e confirmou no banco (seções 2.3-6 e 2.3-7).

---

## 2. Como a tela é montada hoje

### 2.1 Encaixe no console

- `Console.tsx:22` carrega `ClassManagementSection` com `lazy()`; `Console.tsx:195` a monta quando a rota é `/console/turmas` (`consoleSections.ts:12`, `view: "classes"`).
- A moldura (topbar, sidebar, fundo, tokens) já é a do redesign (Fase 1 do dashboard). O Escriba já aparece nesta tela (Fase 10).
- A seção usa componentes shadcn (`Card`, `Dialog`, `Select`, `Input`, `Badge`, `Avatar`, `ScrollArea`) e herda os tokens do console. Ainda tem classes de estilo locais (`darkInputClass`, `darkLabelClass` etc., linhas 78-81) e cores fora do tema (`bg-emerald-600`, `text-violet-500`, `text-white`, `hover:text-red-400`).

### 2.2 Estrutura do `ClassManagementSection.tsx` (570 linhas, um componente só)

| Trecho | Linhas | O que é |
|---|---|---|
| Carga | 104-138 | `classe` (do professor), `materia` (todas), `professor_aluno` com `has_acesso` (os alunos que o professor pode matricular), depois `classe_aluno` das turmas |
| Criar turma | 143-173 | chamado pelo modal `ClassManagerDialog`; cria a matéria nova se preenchida |
| Editar turma | 176-190 | painel inline "Editando turma" (nome + matéria) |
| Excluir turma | 192-202 | `window.confirm` + RPC `excluir_classe` (`classDeletion.ts:303-308`) |
| Duplicar turma | 204-278 | copia a trilha **no cliente**, linha por linha, sem confirmação |
| Presença | 281-288, 477-483 | monta a lista de alunos da turma e abre `PresencaDialog` |
| Adicionar aluno | 290-326 | `INSERT` em `classe_aluno` + `enqueueEnrollmentJob` **pela API** |
| Remover aluno | 328-338 | `confirm()` + `DELETE` em `classe_aluno` (o trigger limpa o resto) |
| Cabeçalho | 349-361 | "Turmas" + subtítulo + botão "Nova Turma" |
| Painel de edição | 363-394 | card inline entre o cabeçalho e a grade |
| Estados | 397, 399-410 | "Carregando turmas..." e "Nenhuma turma ainda" |
| Grade de cards | 412-461 | nome, pílula da matéria, "N alunos", botões Presença e Alunos; editar/duplicar/excluir **só no hover** (429-439) |
| Modal "Gerenciar Alunos" | 485-567 | `Select` com os alunos disponíveis + "Adicionar" verde; lista de matriculados com "×" |

### 2.3 Comportamentos atuais que valem registro

1. **Erro de carga vira "Nenhuma turma ainda".** `loadData` (108-112) desestrutura só `data` e ignora o `error` do Supabase; se a leitura falha, `classes` fica `[]` e a tela mostra o estado vazio, com o botão "Criar primeira turma". O `catch` (133-134) só dispara em exceção de rede, e aí mostra um toast **e** o estado vazio. Um professor com turmas pode achar que as perdeu.
2. **As ações do card só aparecem no hover** (`opacity-0 group-hover:opacity-100`, linha 429). Em tablet e celular não existe hover. A revisão 03 pediu "sempre visíveis, discretos".
3. **"1 alunos"** (linha 446) — sem concordância. Pedido da revisão 03.
4. **Excluir e remover aluno usam `window.confirm`/`confirm`** (193 e 329): caixa do navegador, fora do tema, sem o nome da turma no destaque. As revisões 01 e 03 pediram um diálogo próprio com botão destrutivo diferenciado.
5. **Duplicar não pede confirmação** (433 → 204). Pedido da revisão 04.
6. **A duplicação perde dado e não é atômica.** `handleDuplicate` (204-278) faz dezenas de `INSERT` separados, sem transação: se um falhar no meio, fica uma turma pela metade e o toast diz só "Não foi possível duplicar". Além disso, **copia menos colunas do que existem** (conferido no banco):

   | Tabela | Colunas que o banco tem e a cópia **não** leva | Efeito na turma duplicada |
   |---|---|---|
   | `conteudos` | `metadata` | somem os **arquivos anexados** e a configuração do conteúdo |
   | `atividades` | `pontuacao_maxima`, `metadata` | a atividade perde a **pontuação** e as regras de correção |
   | `questoes` | `midia_url` | some a **imagem/mídia** da questão |
   | `cards` | `cor`, `ordem`, `conteudo_origem_id` | os cards perdem cor e ordem |

   O nome da cópia é `"<nome> (copia)"`, sem acento, e duplicar duas vezes gera dois "(copia)" iguais — a revisão 01 pediu que a cópia fique "claramente identificada como uma entidade nova".
7. **A matrícula depende da API para gerar o material do aluno.** Depois do `INSERT` em `classe_aluno`, o console chama `POST /api/v1/personalizar/jobs/enrollment` (`personalizacaoJobsApi.ts:145-153`). O trigger do banco (`trg_classe_aluno_after_insert`) só provisiona a estrutura (`provisionar_estrutura_aluno_classe`) — **não enfileira nada** (conferido no banco). Com a API do Render dormindo, a matrícula grava e o aluno fica **sem material personalizado**, sem aviso (o `try` inteiro cai no `catch` e mostra só a mensagem de erro da API). É exatamente o caso que o CLAUDE.md descreve para `class_delta_sync` e `class_theme_sync`, que já foram movidos para trigger. Enfileirar não tem modelo de linguagem no meio: pela regra de fronteira, é banco.
8. **A matéria nova é criada mesmo se a turma falhar** (151-154 antes de 155): se o `INSERT` em `classe` der erro, fica uma `materia` órfã.
9. **Duas cópias da gestão de turmas no código.** `trilha/ClassesManager.tsx` (360 linhas) é outra tela de turmas, importada só por `TrilhaSection.tsx` (50 linhas), que **não é importado por ninguém** — `Console.tsx:173` monta `TopicsManager` direto na rota da trilha. As duas são código morto. (Pela mesma razão `ContentsManager`, `ActivitiesManager` e `QuestionsManager` também estão mortos — 1.903 linhas —, mas são da Trilha e ficam para a análise dela.)
10. **O texto do protótipo ao remover aluno é falso para o sistema real.** O protótipo diz "o histórico de notas fica guardado por 30 dias" (262). No banco, o trigger `limpar_dados_aluno_classe` apaga o progresso do aluno na turma **na hora** — o próprio `confirm` atual diz "limpar seu progresso nesta turma".

---

## 3. Como o protótipo é montado

Uma página com a lista de turmas e quatro sobreposições:

1. **Cabeçalho** — "Turmas" em Cinzel 32px, subtítulo e botão "Nova turma".
2. **Faixas de retorno** — "Turma criada" (verde) e "Turma duplicada como uma nova entidade" (azul), no topo da lista.
3. **Formulário inline** — "Nova turma" / "Editar turma" como card com borda roxa entre o cabeçalho e a grade (substitui o modal de criação atual).
4. **Grade de cards** — cada turma com sigla, nome, meta, situação, três números (Alunos, Tópicos, Conclusão), botões Matrículas / Presença / Abrir trilha e três ícones sempre visíveis (editar, duplicar, excluir); no fim, um card tracejado "Nova turma".
5. **Modais** — Matrículas (busca + matriculados com remoção confirmada na própria linha), Registrar presença, Duplicar turma (confirmação) e Excluir turma (confirmação destrutiva).

O protótipo **mantém tudo o que a tela atual faz** (criar, editar, duplicar, excluir, presença, matricular, remover). O que ele acrescenta é informação no card, confirmações e a ponte para a trilha.

---

## 4. Inventário bloco a bloco

Legenda: 🎨 só estilo · 🔧 modificar · ➕ criar · 🗑️ apagar · ⛔ não levar para a tela real

### 4.1 Moldura e Escriba

| Item | Situação |
|---|---|
| Topbar, sidebar, fundo, tokens | ✅ já feitos na Fase 1 do dashboard (#258) — a tela herda |
| Escriba (404-438) | ✅ já feito na Fase 10 (#268) — aparece nesta tela |
| Links extras da sidebar (Missões, Notas, Eventos, Rank de batalhas, Conquistas) | ⛔ mesmas razões do dashboard (seção 7 de `01-analise-dashboard.md`) |

### 4.2 Cabeçalho

| Item | Hoje (349-361) | Protótipo (64-73) | Categoria |
|---|---|---|---|
| Título | "Turmas", `text-2xl font-bold` | "Turmas", Cinzel 700 32px | 🎨 |
| Subtítulo | "Gerencie suas turmas e os alunos vinculados." | "Crie turmas, matricule alunos e abra a trilha de cada uma." | 🔧 — o texto do protótipo só é verdade quando o botão "Abrir trilha" existir (4.10); troca junto com ele |
| Botão "Nova Turma" | `Button` primário | pílula 13×22px com ícone "+" | 🎨 — "Nova turma" em caixa de frase |

### 4.3 Estados da página

| Estado | Hoje | Protótipo | Categoria |
|---|---|---|---|
| Carregando | texto "Carregando turmas..." (397) | não desenha | 🔧 — skeleton de 3 cards com a mesma classe `console-skeleton` do dashboard |
| Vazio | ícone de livro + "Nenhuma turma ainda" + "Crie sua primeira turma para comecar." (sem acento) + botão (399-410) | ícone de capelo, "Nenhuma turma ainda" em Cinzel 24px, "A turma é o ponto de partida: é dela que saem a trilha de conteúdo, as matrículas e o dashboard de desempenho." + "Criar primeira turma" (136-146) | 🎨 — texto do protótipo (é verdadeiro e corrige o acento) |
| Erro | **não existe** — vira o estado vazio (2.3-1) | não desenha | 🔧 — bloco de erro de página inteira com "Tentar novamente", no padrão de `DashboardErro` |
| "Pré-visualização de estado" (57-62) | — | pílulas "Com turmas / Nenhuma turma" | ⛔ ferramenta do protótipo |

### 4.4 Card da turma

| Item | Hoje (412-461) | Protótipo (151-184, dados 441-445 e 531-547) | Categoria |
|---|---|---|---|
| Grade | 1 / 2 / 3 colunas, `gap-4` | `auto-fit minmax(320px,1fr)`, `gap 20px`, card 20px de raio, `min-height 230px` | 🎨 |
| Sigla | não existe | círculo 40px com as iniciais do nome ("FI", "LB") | ➕ simples — derivada do nome, sem dado novo |
| Nome | negrito, `truncate` | Cinzel 20px, `ellipsis` | 🎨 |
| Matéria | pílula roxa em caixa alta ("SISTEMAS PARALELOS…") ou "Geral" | linha secundária "2026/1 · Engenharia Civil" (período · matéria) | 🎨 — a matéria vira texto secundário; **sem o período** (⛔, seção 7) |
| Situação | não existe | chip "Ativa" (verde) / "Rascunho" (amarelo) | ➕ — **derivada**: turma sem tópico é "Sem trilha", com tópico é "Com trilha". Ver decisão 3 |
| Alunos | "N alunos" com ícone (446) | número 20px com rótulo "ALUNOS" | 🎨 + 🔧 concordância (revisão 03) |
| Tópicos | não existe | número de tópicos da trilha; `0` em cinza | ➕ — `COUNT` de `topicos` por `classe_id`, direto do Supabase |
| Conclusão | não existe | "62%" ou "—" | ➕ — **mesma fonte do KPI "Conclusão média" do dashboard** (média de `classe_aluno.porcentagemConcluida` dos matriculados); "—" sem aluno. Ver decisão 4 |
| Ações de texto | "Presença" e "Alunos" (449-454) | "Matrículas" (roxo), "Presença", "Abrir trilha" / "Montar trilha" | 🎨 "Alunos" vira "Matrículas" (o protótipo é mais preciso: a ação é matricular) + ➕ "Abrir trilha" (4.10) |
| Editar / duplicar / excluir | ícones só no hover (429-439) | três círculos 30px **sempre visíveis**, lixeira em vermelho | 🔧 (revisão 03) — com `aria-label` e alvo de toque de 44px no celular |
| Borda do card | `border-border`, roxa no hover | roxa **só no primeiro card** (`border:'#9b5de5'` na turma 1) | ⛔ a borda do primeiro card não tem significado no protótipo (não é "selecionada" nem "mais recente"); manter a borda neutra com destaque no hover/foco |
| Card tracejado "Nova turma" | não existe | último item da grade, borda tracejada roxa, "nome, período e curso" (186-192) | ➕ — abre o mesmo formulário; texto "nome e matéria" (sem período) |

### 4.5 Formulário de turma (criar e editar)

| Item | Hoje | Protótipo (101-134, 563-567) | Categoria |
|---|---|---|---|
| Criar | **modal** `ClassManagerDialog`: descrição*, matéria existente, nova matéria (nome + descrição) | **card inline** com borda roxa entre o cabeçalho e a grade: nome da turma, período, matéria | 🔧 — ver decisão 1. Valor padrão: o formulário inline do protótipo **com os campos da base** (descrição, matéria existente, nova matéria opcional) |
| Editar | card inline "Editando turma" (363-394): nome + matéria | o mesmo card do criar, título "Editar turma", sem o período | 🎨 — criar e editar passam a ser **um componente só** |
| Período | não existe | select "2026/2" | ⛔ `classe` não tem coluna de período (conferido); ver seção 7 e decisão 2 |
| Texto de ajuda | não existe | "Você pode matricular alunos agora ou depois, pelo botão 'Matrículas' no card da turma." | ➕ texto verdadeiro |
| Matéria nova órfã | cria a matéria antes da turma (2.3-8) | — | 🔧 criar a matéria só se o `INSERT` da turma puder seguir; se a turma falhar, não deixar matéria solta |
| `ClassManagerDialog` também é usado por `TopicsManager` (1227) | — | — | manter o componente para a Trilha; Turmas deixa de usá-lo |

### 4.6 Retorno das ações (faixas)

| Item | Hoje | Protótipo | Categoria |
|---|---|---|---|
| Turma criada | toast "Classe criada." | faixa verde "Turma criada — [nome] já aparece na lista. O próximo passo é matricular os alunos." + "Fechar" (75-86) | 🔧 — faixa no topo com botão "Matricular alunos" que abre o modal de matrículas da turma criada |
| Turma duplicada | toast "Classe duplicada com estrutura." | faixa azul "Turma duplicada como uma nova entidade — '[nome] (cópia)' foi criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original." (88-99) | 🔧 — texto é verdadeiro: a cópia não leva matrículas nem progresso |
| Demais retornos (salvar edição, excluir, erros) | toasts `sonner` | — | manter os toasts |
| Vocabulário | "Classe" nos toasts, "Turma" na tela | só "Turma" | 🔧 "Turma" em todos os textos da seção |

### 4.7 Duplicar turma

| Item | Hoje | Protótipo (363-376, 499-503, 574-580) | Categoria |
|---|---|---|---|
| Confirmação | nenhuma | modal "Duplicar turma — Duplicar '[nome]'? Uma cópia será criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original." + Cancelar / Duplicar | 🔧 (revisão 04) |
| Nome da cópia | "[nome] (copia)" | "[nome] (cópia)", "(cópia 2)", "(cópia 3)"… | 🔧 — numeração pelo que já existe no banco, não por contador em memória |
| Como copia | dezenas de `INSERT` no cliente, sem transação, perdendo colunas (2.3-6) | — | 🔧 **função no banco** `duplicar_classe(p_classe_id)` com `SECURITY DEFINER`, conferindo a posse por `app_classes_do_professor()`, numa transação só, copiando **todas** as colunas da trilha e remapeando `next`/`depende` e os vínculos. Sem modelo de linguagem → banco (regra de fronteira) |
| Tema da trilha | não copiado | — | manter: o `INSERT` em `classe` já dispara `trg_classe_mapa_tema_job`, que gera o tema da cópia |

### 4.8 Excluir turma

| Item | Hoje (192-202) | Protótipo (378-402) | Categoria |
|---|---|---|---|
| Confirmação | `window.confirm` com texto longo | modal com ícone de lixeira, "Excluir '[nome]'?", aviso de irreversível, "Cancelar" e botão vermelho "Excluir turma" | 🔧 (revisões 01 e 03) |
| Texto | "…conteúdos, matrículas, progressos e dados de guildas…" | "…a turma, sua trilha, as matrículas e o histórico de desempenho dos alunos nela. Esta ação não pode ser desfeita." | 🎨 — o do protótipo, acrescentando "e os dados de guilda" (a base avisava isso e a RPC apaga) |
| Execução | RPC `excluir_classe` (transacional) | — | manter |
| Botão destrutivo | — | fundo `#e2574c` com texto branco (**3,68:1, falha**) | 🔧 texto escuro sobre `--destructive` do tema (seção 6) |

### 4.9 Matrículas (modal)

| Item | Hoje (485-567) | Protótipo (198-285, 446-457, 549-555) | Categoria |
|---|---|---|---|
| Título | "Gerenciar Alunos" + "Turma: [nome]" | sigla da turma + rótulo "MATRÍCULAS" + nome em Cinzel | 🎨 |
| Adicionar aluno | `Select` com todos os alunos disponíveis + botão verde "Adicionar" | **campo de busca** com contagem ("3 resultados") e lista de resultados; cada um com avatar na cor do perfil, e-mail · perfil e botão "Matricular"; quem já está na turma aparece apagado com "já matriculado nesta turma" | 🔧 — busca por nome e e-mail sobre a mesma lista de hoje (`professor_aluno` com `has_acesso`). Some o verde fora do tema |
| Matriculados | avatar cinza com iniciais, nome, e-mail, "×" | avatar **na cor do perfil**, nome, "**Perfil · desde dd/mm/aaaa**", "Remover" | 🎨 + ➕ perfil (`aluno_perfil`/`perfil`, dominante) e data (`classe_aluno.created_at`); o e-mail continua (base) |
| Remover aluno | `confirm()` | confirmação **na própria linha** (fundo vermelho escuro): "Remover [nome] da turma?", texto de consequência, "Cancelar" / "Remover mesmo assim" | 🔧 — com o texto **verdadeiro**: "Ele perde o acesso à trilha desta turma e o progresso dele aqui é apagado." (⛔ o "guardado por 30 dias" do protótipo, seção 7) |
| Rodapé | não existe | "Alterações de matrícula são aplicadas na hora." + "Fechar" | ➕ texto verdadeiro |
| Material do aluno novo | `enqueueEnrollmentJob` pela API (2.3-7) | — | 🔧 **enfileirar pelo banco** (trigger em `classe_aluno`), como `class_delta_sync`. O console para de chamar a API ao matricular |
| Aviso "sessão expirada" | toast quando não há token (310-317) | — | 🗑️ junto com a chamada à API — o banco enfileira sem sessão |

### 4.10 Atalho para a trilha

| Item | Hoje | Protótipo | Categoria |
|---|---|---|---|
| Botão no card | não existe | "Abrir trilha" (turma com tópicos) / "Montar trilha" (sem tópicos) | ➕ |
| Destino | — | — | `/console/trilha?turma=<id>`. Hoje `TopicsManager` escolhe sempre a primeira turma (`TopicsManager.tsx:365`) — precisa ler `?turma=` (mudança pequena, só na seleção inicial) |

### 4.11 Registrar presença (modal)

| Item | Hoje (`PresencaDialog.tsx`) | Protótipo (287-360, 588-633) | Categoria |
|---|---|---|---|
| Cabeçalho | ícone + "Registrar presença" + "Turma: … Os pontos entram no ranking como qualquer outra atividade." | igual, com círculo roxo e Cinzel | 🎨 |
| "O que registrar" | `Select` Presença / Participação | duas pílulas | 🎨 — pílulas com `aria-pressed` (ou `SegmentedPills`) |
| Dia da aula, pontos, ajuda do valor | ✅ | igual | 🎨 |
| Quem esteve presente | lista com `Checkbox` + "Marcar/Desmarcar todos" | igual, caixa escura | 🎨 |
| Regras (todos marcados = turma inteira; data não futura; participação exige pontos) | ✅ `presencaDaTurma.ts` | — | manter, sem mudança |

### 4.12 Código morto

| Item | Situação | Categoria |
|---|---|---|
| `TrilhaSection.tsx` (50 linhas) | não é importado por nenhum arquivo | 🗑️ |
| `trilha/ClassesManager.tsx` (360 linhas) | só `TrilhaSection` o importa; é uma segunda tela de turmas, abandonada | 🗑️ |
| `trilha/ContentsManager.tsx`, `ActivitiesManager.tsx`, `QuestionsManager.tsx` (1.903 linhas) | só `TrilhaSection` os importa | fica para a análise da Trilha — registrar no PR |

---

## 5. Estilização: de → para

Os tokens do protótipo já existem no console desde a Fase 1 do dashboard (`frontend/src/styles/console-theme.css`). O que esta tela precisa é **usar os tokens e os componentes que o dashboard criou**, não inventar novos:

| Necessidade | Usar |
|---|---|
| Cores de perfil no avatar | `COR_DO_PERFIL`, `chaveDoPerfil`, `nomeExibidoDoPerfil`, `iniciaisDe`, `corDoIconeSobre` (`dashboard/perfilCores.ts`) — já resolvem a cor das iniciais pela luminância |
| Skeleton, erro de página | `console-skeleton` e o padrão de `DashboardErro` (`dashboard/DashboardEstados.tsx`) |
| Pílulas segmentadas | `SegmentedPills` (`dashboard/SegmentedPills.tsx`) |
| Rótulo em caixa alta | `console-label-sm` |
| Verde / amarelo / azul / vermelho | `--success`, `--warning`, `--info`, `--destructive` (texto) e as mesmas com opacidade para fundo |
| Bronze | não se usa nesta tela |
| Raios | cards 20px, caixas internas 14px, botões e chips em pílula (tokens da Fase 1) |

Cores literais a eliminar do componente: `bg-emerald-600`, `hover:bg-emerald-700`, `text-violet-500`, `focus:bg-violet-600`, `text-white`, `hover:text-red-400`, `hover:bg-red-950/20` e as constantes `dark*Class` (78-81).

---

## 6. Contraste (WCAG AAA é regra do projeto)

Medido com a fórmula WCAG a partir das cores do protótipo, com os fundos translúcidos compostos sobre o card (`#1b1728`) ou a página (`#0d0b16`):

| Par | Razão | Resultado | Correção |
|---|---|---|---|
| Chip "Ativa" `#5fd99a` / verde .16 | 7,49 | AAA | — (`--success`) |
| Chip "Rascunho" `#e0b34d` / amarelo .16 | 6,52 | **só AA** | usar `--warning` do tema (já com luminosidade elevada) e conferir ≥ 7 |
| Número apagado `#7a7488` (Tópicos 0, Conclusão —) | 3,90 | **falha** | `--muted-foreground` (texto secundário corrigido) |
| Botão "Matrículas" `#c1a7ec` / roxo .16 | 6,93 | **só AA** (por pouco) | `--console-violet-text` sobre fundo .12, ou subir a luminosidade do texto |
| Faixas "Turma criada" / "duplicada" | 12,1 | AAA | — |
| **Branco / botão vermelho `#e2574c`** ("Excluir turma", "Remover mesmo assim") | **3,68** | **falha** | texto escuro (`--destructive-foreground`) sobre `--destructive` |
| Texto da confirmação de remoção `#e8d8d8` / `#3a1e22` | 10,98 | AAA | — |
| **Iniciais `#1b1120` / Conqueror `#1e4fd6` e Mastermind `#5b3fd9`** | **2,74 – 2,75** | **falha** | `corDoIconeSobre` (já decide branco ou escuro pela luminância) |
| Iniciais `#1b1120` / Seeker, Socializer | 5,8 | só AA | idem |
| Nome "já matriculado" `#7a7488` / `#0d0b16` | 4,35 | **falha** | `--muted-foreground` + o rótulo "já matriculado" em texto, não só pela cor |
| Card tracejado `#c1a7ec` / roxo .05 | 8,93 | AAA | — |

Regra do CLAUDE.md para corrigir: **elevar a luminosidade HSL** da cor, nunca misturar com branco.

---

## 7. O que do protótipo NÃO deve ir para a tela real

1. **Seletor "Pré-visualização de estado"** (57-62) — ferramenta do protótipo.
2. **Todos os nomes e números** (Física I, Engenharia Civil, "34", "62%", Marina Corrêa, Lucas Meireles, e-mails `@ulbra.br`…) — fictícios, do script (441-457).
3. **Campo "Período" e o "2026/1" da linha de meta** — `classe` não tem coluna de período (conferido no banco: `id, materia_id, professor_id, descricao, created_at`). Criar a coluna é decisão do time (decisão 2); até lá, o período continua fazendo parte do nome da turma, como os professores já escrevem ("SPD - 3N 2026/2").
4. **"O histórico de notas fica guardado por 30 dias"** (262) — falso: o trigger `limpar_dados_aluno_classe` apaga o progresso na hora. Guardar por 30 dias seria uma funcionalidade nova no banco, não um texto.
5. **Borda roxa só no primeiro card** (441, `border:'#9b5de5'`) — sem significado definido.
6. **Links da sidebar para telas que não existem** — mesma regra do dashboard.

---

## 8. Decisões que precisam do time

1. **Criar turma: modal (hoje) ou formulário inline (protótipo)?** A revisão 03 disse "o modal está bom, sem mudanças"; o V9, feito depois, trocou por formulário inline e o usa também para editar.
2. **Período da turma**: criar a coluna em `classe` (e o campo no formulário), ou continuar dentro do nome?
3. **Situação da turma** ("Ativa" / "Rascunho"): não existe esse estado no banco. Derivar da trilha ("Sem trilha" / "Com trilha") ou criar um estado de verdade (arquivar turma, por exemplo)?
4. **Conclusão no card**: mesma conta do KPI do dashboard (média de `classe_aluno.porcentagemConcluida`) ou a da view `vw_metricas_turma_geral_classe.taxa_media_conclusao_pct`? As duas podem divergir; o dashboard já decidiu pela primeira.
5. **Duplicação no banco**: aceitar uma função `duplicar_classe` nova (migration), que também corrige a perda de dados da seção 2.3-6?
6. **Matrícula enfileira pelo banco**: aceitar o trigger que enfileira `student_enrollment` ao inserir em `classe_aluno` (migration), e o console parar de chamar a API?
7. **Apagar `TrilhaSection.tsx` e `trilha/ClassesManager.tsx`** (código morto)?

---

## 9. Valores padrão adotados nos prompts

Para os prompts da seção 11 poderem ser executados sem esperar reunião, cada decisão da seção 8 tem um valor padrão abaixo. **Se o time decidir diferente, troque o valor aqui antes de rodar a fase correspondente** — os prompts mandam ler esta seção.

| # | Decisão | Valor padrão | Por quê | Afeta a fase |
|---|---|---|---|---|
| 1 | Criar turma | **Formulário inline do protótipo, com os campos da base** (descrição, matéria existente, nova matéria opcional). Criar e editar viram o mesmo componente | O editar já é inline hoje; um componente só para os dois tira a duplicação. Os campos da base prevalecem | 2 |
| 2 | Período | **Não criar** — fica no nome da turma | Não há coluna; inventar o campo seria prometer um dado que não é gravado | 1, 2 |
| 3 | Situação | **Derivada da trilha**: "Com trilha" (verde) / "Sem trilha" (amarelo) | Um rótulo que diz exatamente de onde vem; "Ativa/Rascunho" sugeriria um estado que o banco não tem | 1 |
| 4 | Conclusão no card | **Mesma conta do KPI do dashboard** (média de `classe_aluno.porcentagemConcluida` dos matriculados; "—" sem aluno) | O professor não pode ver dois números diferentes para a mesma turma em duas telas | 1 |
| 5 | Duplicação | **Função `duplicar_classe` no banco**, transacional, copiando todas as colunas | Corrige a perda de dados e a turma pela metade; sem IA → banco | 5 |
| 6 | Enfileirar matrícula | **Trigger no banco** enfileira `student_enrollment`; o console deixa de chamar a API | Regra de fronteira; mesma solução já adotada para `class_delta_sync` e `class_theme_sync` | 6 |
| 7 | Código morto | **Apagar** `TrilhaSection.tsx` e `trilha/ClassesManager.tsx`, depois de conferir de novo com busca que nada importa; os outros três managers ficam para a Trilha | O git guarda o histórico | 1 |

---

## 10. Fases de implementação (da mais fácil para a mais difícil)

| Fase | Nome | Dificuldade | Categoria | Backend | Depende de |
|---|---|---|---|---|---|
| 1 | Cabeçalho, cards e estados | Fácil | 🎨 🔧 ➕ 🗑️ | leitura de `topicos` e `classe_aluno` (já legíveis) | — |
| 2 | Formulário de turma e exclusão confirmada | Fácil–média | 🔧 🎨 ➕ | não | 1 |
| 3 | Atalho para a trilha | Fácil | ➕ 🔧 | não | 1 |
| 4 | Matrículas e presença | Média | 🔧 🎨 ➕ | leitura de `aluno_perfil`/`perfil` | 1 |
| 5 | Duplicar turma com confirmação, no banco | Difícil | 🔧 | função SQL nova (migration) | 1, 2 |
| 6 | Matrícula enfileira a personalização pelo banco | Difícil | 🔧 | trigger novo (migration) | 4 |

**Fases 1 a 4** deixam a tela com a cara do protótipo usando só dado que já existe. **Fases 5 e 6** corrigem os dois defeitos de encanamento (2.3-6 e 2.3-7) — são as que mais importam para o professor, mesmo sem mudar quase nada visualmente.

Cada fase = **uma branch, um PR**. Nenhuma fase faz merge (regra do `CLAUDE.md`).

---

## 11. Prompts de cada fase

### 11.0 Regras comuns (todos os prompts mandam ler esta seção)

**As três referências obrigatórias**

1. **Protótipo principal:** `prototipos/professor/v9/Console Turmas (Fase 2).dc.html`.
   Enquanto o PR #256 não estiver no `main`, o arquivo não existe no checkout. Leia com:
   `git fetch origin redesign/14-prototipo-v9 && git show "origin/redesign/14-prototipo-v9:prototipos/professor/v9/Console Turmas (Fase 2).dc.html"`
   O HTML tem duas partes: a marcação (linhas 1-438, com `sc-if`/`sc-for` e `{{ }}`) e o script com os dados e a lógica (linhas 440-638). Os valores de estilo estão inline no `style=`. As revisões que originaram a tela estão em `prototipos/professor/prompts/revisao-0{1,2,3,4}-*/` (arquivos de "classes"), no mesmo ramo.
2. **Tela atual:** `frontend/src/components/console/ClassManagementSection.tsx` (a tela), `PresencaDialog.tsx`, `trilha/ClassManagerDialog.tsx`, `trilha/classDeletion.ts`, `trilha/personalizacaoJobsApi.ts`, `frontend/src/lib/presencaDaTurma.ts`, `frontend/src/pages/Console.tsx`.
   **Componentes do redesign para reaproveitar** (não recriar): `frontend/src/components/console/dashboard/perfilCores.ts`, `contraste.ts`, `DashboardEstados.tsx`, `SegmentedPills.tsx`, as classes `console-skeleton` e `console-label-sm` e os tokens de `frontend/src/styles/console-theme.css`.
3. **Especificação:** este arquivo, `docs/frontend/redesign-fase-2/03-analise-turmas.md` — seções 2.3 (comportamentos atuais), 4 (inventário), 5 (componentes e tokens), 6 (contraste), 7 (o que não levar) e 9 (valores padrão). Para o que vale em todo o console, `01-analise-dashboard.md` seções 5 e 6.

**Regras de conteúdo**

- A **estrutura e o conteúdo da tela atual são a base**; o protótipo manda no **estilo**. Nada que existe hoje some, a não ser o que a seção 4 marca com 🗑️.
- Nomes, ícones e textos da tela atual continuam valendo quando o protótipo não traz substituto claro.
- **Nenhum dado fictício do protótipo entra no código** (Física I, "34 alunos", "62%", nomes e e-mails). Os itens da seção 7 não entram.
- **Sem dado, sem número.** Onde a fonte não existe, mostre "—" ou estado vazio explícito. Nunca desenhe valor inventado.
- **Texto verdadeiro.** Toda frase que descreve o que o sistema faz tem que bater com o que o banco faz (ex.: remover aluno apaga o progresso na hora — seção 7, item 4).
- Vocabulário: **"turma"** em todos os textos da seção (hoje há "classe" em toasts).

**Regras do projeto (`CLAUDE.md`)**

- **Só abrir PR. Nunca fazer merge**, push direto no `main` ou qualquer caminho que faça o `main` avançar.
- Encoding **UTF-8 sem BOM** em todo arquivo com texto em português.
- **Contraste WCAG AAA** em todo texto. Para corrigir uma cor, **eleve a luminosidade HSL**, nunca misture com branco (seção 6 tem os pares que falham).
- **Regra de fronteira:** leitura, CRUD, fila e agregação que não usam modelo de linguagem vão **direto do console para o Supabase** (ou para função/trigger no Postgres), nunca por endpoint novo na API.
- Função nova no banco: `SECURITY DEFINER` com `SET search_path = public, pg_temp` e posse conferida pelos helpers (`app_classes_do_professor()`…). View nova nasce com `security_invoker = on`.
- Migration nova **não é aplicada** pela sessão: fica no PR para o time rodar `alembic upgrade head`. Testes da migration no estilo de `api/tests/test_migrations.py` (SQL renderizado offline).
- Os rótulos do enum `status_atividade` têm acento (`não iniciado`, `em andamento`, `concluido`); `COALESCE` com coluna enum exige `coluna::text` antes.

**Verificação antes de abrir o PR** (no diretório `frontend/`)

- `npx tsc --noEmit -p tsconfig.app.json` (sem erro novo além da linha de base)
- `npm run lint`
- `npm test` (inclui `src/components/pageSurfaces.test.ts`)
- `npm run dev` e **abrir `/console/turmas` no navegador**: com turmas, sem turmas, com erro de rede (desligar a rede no DevTools) e em largura de celular (~400px). Ações que **escrevem** no banco (criar, duplicar, excluir, matricular, remover, presença) **não** devem ser testadas contra o banco real sem autorização: use interceptação das requisições no navegador ou uma turma de teste combinada com o time. Se não for possível abrir o navegador, dizer isso explicitamente no PR em vez de afirmar que funciona.

**Entrega**

- Branch a partir do `main` atualizado (ou empilhada na fase anterior, se ela ainda não entrou). Commits com a mensagem explicando o porquê.
- PR com: o que mudou, o que ficou de fora e por quê, e os itens da seção 4 que a fase cobre.

---

### Fase 1 — Cabeçalho, cards e estados

```text
Implemente a Fase 1 do redesign da tela Turmas do console do professor: cabeçalho, cards e
estados da página.

Antes de começar, leia a seção 11.0 (regras comuns) e as seções 2.3, 4.2, 4.3, 4.4, 4.12, 5, 6
e 9 de docs/frontend/redesign-fase-2/03-analise-turmas.md.

Referências:
- Protótipo: prototipos/professor/v9/Console Turmas (Fase 2).dc.html
  (se não estiver no main, leia pelo git show descrito na seção 11.0).
  Cabeçalho: 64-73. Estado vazio: 136-146. Grade e card: 148-194. Dados do card: 441-445 e
  531-547.
- Tela atual: frontend/src/components/console/ClassManagementSection.tsx (349-461).
- Reaproveitar: dashboard/DashboardEstados.tsx (padrão de erro), console-skeleton,
  console-label-sm, tokens de console-theme.css.

O que fazer:
1. Cabeçalho no estilo do protótipo: "Turmas" em Cinzel 32px, subtítulo atual (o do protótipo
   entra na Fase 3, junto com o botão de trilha), botão "Nova turma" em pílula.
2. Estados:
   - carregando: skeleton de 3 cards (não mais o texto "Carregando turmas...");
   - erro: loadData passa a conferir o `error` de cada leitura do Supabase; qualquer falha mostra
     um bloco de erro de página inteira com "Tentar novamente" — nunca o estado vazio
     (seção 2.3-1);
   - vazio: texto e visual do protótipo (136-146).
3. Card da turma no estilo do protótipo (seção 4.4):
   - sigla (iniciais do nome) no círculo, nome em Cinzel 20px com reticências, matéria como
     linha secundária ("Geral" quando não houver) — sem período (valor padrão 2);
   - situação derivada da trilha: "Com trilha" (verde) / "Sem trilha" (amarelo) (valor padrão 3);
   - três números: Alunos (concordância "1 aluno"/"N alunos" onde houver texto), Tópicos
     (COUNT de topicos por classe_id, direto do Supabase) e Conclusão (média de
     classe_aluno.porcentagemConcluida dos matriculados; "—" sem aluno — valor padrão 4);
     número ausente ou zero de tópicos em texto secundário do tema, não em #7a7488;
   - botões "Matrículas" (abre o modal atual de alunos, só troca o rótulo) e "Presença";
   - editar / duplicar / excluir SEMPRE visíveis, discretos, com aria-label e alvo de toque de
     44px no celular (revisão 03). Por enquanto mantêm o comportamento atual.
   - card tracejado "Nova turma" no fim da grade, abrindo o mesmo fluxo de criar.
   - borda neutra; sem a borda roxa no primeiro card (seção 7).
4. Trocar "classe" por "turma" nos textos e toasts da seção.
5. Apagar TrilhaSection.tsx e trilha/ClassesManager.tsx (valor padrão 7), depois de confirmar com
   busca que nada importa os dois. Registrar no PR que ContentsManager, ActivitiesManager e
   QuestionsManager ficam órfãos e são da análise da Trilha.
6. Tirar as cores literais listadas na seção 5 do trecho que esta fase toca.

Fora do escopo: formulário de criar/editar (Fase 2), modal de exclusão (Fase 2), botão de
trilha (Fase 3), modal de matrículas (Fase 4), duplicação (Fase 5).

Critérios de aceite:
- Com a leitura de turmas falhando (rede desligada), a tela mostra erro, não "Nenhuma turma".
- Números do card batem com o dashboard para a mesma turma (Alunos e Conclusão).
- Ações do card visíveis sem hover e acessíveis por teclado.
- Nenhum texto abaixo de 7:1; celular (~400px) sem rolagem horizontal.

Branch: feat/turmas-fase-1-cards-e-estados. Abra o PR, não faça merge.
```

### Fase 2 — Formulário de turma e exclusão confirmada

```text
Implemente a Fase 2 do redesign da tela Turmas: o formulário de criar/editar turma e a
confirmação de exclusão.

Antes de começar, leia a seção 11.0 e as seções 2.3 (itens 4 e 8), 4.5, 4.6, 4.8, 6 e 9 de
docs/frontend/redesign-fase-2/03-analise-turmas.md.

Referências:
- Protótipo: Formulário 101-134 e 563-567. Faixa "Turma criada" 75-86. Excluir 378-402.
- Tela atual: ClassManagementSection.tsx (143-202, 363-394, 464-474) e
  trilha/ClassManagerDialog.tsx (continua existindo para a Trilha — TopicsManager.tsx:1227 usa).

O que fazer:
1. Um componente de formulário de turma, inline entre o cabeçalho e a grade, no estilo do
   protótipo (valor padrão 1), usado para criar e para editar:
   - campos da base: nome/descrição da turma (obrigatório), matéria existente e, só ao criar,
     nova matéria opcional (nome + descrição); sem período (valor padrão 2);
   - título "Nova turma" / "Editar turma", texto de ajuda do protótipo, "Cancelar" e
     "Salvar turma"; foco no primeiro campo ao abrir, Esc cancela;
   - a matéria nova só é criada se a turma puder ser criada — não deixar matéria órfã quando o
     INSERT da turma falhar (seção 2.3-8; a forma mais simples é criar a matéria, criar a turma
     e, se a turma falhar, apagar a matéria que acabou de ser criada).
2. Depois de criar: faixa verde no topo (75-86) com o nome real da turma e um botão
   "Matricular alunos" que abre o modal de matrículas dessa turma. "Fechar" some a faixa.
3. Excluir: substituir o window.confirm por um diálogo próprio (378-402) com o nome da turma e o
   texto da seção 4.8 (inclui dados de guilda). Botão destrutivo com texto escuro sobre
   --destructive (branco sobre #e2574c dá 3,68:1). Foco começa em "Cancelar"; Esc cancela.
   A execução continua sendo a RPC excluir_classe.
4. Toasts continuam para salvar edição, excluir e erros, com o vocabulário "turma".

Fora do escopo: duplicação (Fase 5), matrículas (Fase 4).

Critérios de aceite:
- Criar e editar usam o mesmo componente; o modal ClassManagerDialog não é mais aberto pela tela
  Turmas, mas continua funcionando na Trilha.
- Excluir nunca acontece sem passar pelo diálogo; o diálogo é navegável por teclado.
- Falha ao criar a turma não deixa matéria nova sem turma.
- Teste unitário para a regra de montar/validar o formulário (nome obrigatório, matéria nova
  opcional) e para o nome exibido na confirmação.

Branch: feat/turmas-fase-2-formulario-e-exclusao. Abra o PR, não faça merge.
```

### Fase 3 — Atalho para a trilha

```text
Implemente a Fase 3 do redesign da tela Turmas: o botão "Abrir trilha" / "Montar trilha" no
card, levando para a trilha da turma certa.

Antes de começar, leia a seção 11.0 e as seções 4.2 e 4.10 de
docs/frontend/redesign-fase-2/03-analise-turmas.md.

Referências:
- Protótipo: botão no card, linha 171 (trailCta nos dados 441-445).
- Tela atual: ClassManagementSection.tsx (card), frontend/src/pages/consoleSections.ts,
  frontend/src/components/console/trilha/TopicsManager.tsx (escolha inicial da turma na linha
  365 e o seletor na 915).

O que fazer:
1. No card: "Abrir trilha" quando a turma tem tópicos, "Montar trilha" quando não tem (o número
   de tópicos já vem da Fase 1). É um link de verdade (<a>/Link), não um botão com navigate,
   para funcionar com abrir em nova aba.
2. Destino: /console/trilha?turma=<id>.
3. TopicsManager passa a ler ?turma= na escolha inicial: se o id for de uma turma do professor,
   começa nela; senão, mantém o comportamento atual (primeira turma). Trocar de turma no seletor
   da trilha atualiza o ?turma= (replace, sem empilhar histórico). Não mexer em mais nada da
   Trilha — ela tem análise própria.
4. Trocar o subtítulo do cabeçalho de Turmas pelo do protótipo ("Crie turmas, matricule alunos e
   abra a trilha de cada uma."), que agora é verdadeiro.

Critérios de aceite:
- Clicar em "Abrir trilha" de qualquer turma abre a trilha dessa turma, inclusive com
  refresh da página e com o voltar do navegador.
- ?turma= de turma alheia ou inexistente cai no comportamento atual, sem erro.
- Teste unitário da função que resolve a turma inicial a partir da URL e da lista de turmas.

Branch: feat/turmas-fase-3-atalho-trilha. Abra o PR, não faça merge.
```

### Fase 4 — Matrículas e presença

```text
Implemente a Fase 4 do redesign da tela Turmas: o modal de matrículas e o visual do modal de
presença.

Antes de começar, leia a seção 11.0 e as seções 2.3 (item 10), 4.9, 4.11, 5, 6 e 7 de
docs/frontend/redesign-fase-2/03-analise-turmas.md.

Referências:
- Protótipo: Matrículas 198-285 (dados 446-457 e 549-555). Presença 287-360 (lógica 588-633).
- Tela atual: ClassManagementSection.tsx (290-344 e 485-567), PresencaDialog.tsx,
  frontend/src/lib/presencaDaTurma.ts.
- Reaproveitar: dashboard/perfilCores.ts (COR_DO_PERFIL, chaveDoPerfil, nomeExibidoDoPerfil,
  iniciaisDe, corDoIconeSobre), SegmentedPills.

O que fazer:
1. Modal de matrículas no estilo do protótipo:
   - cabeçalho com a sigla e o nome da turma;
   - "Adicionar aluno": campo de busca (nome e e-mail, sem acento e sem caixa) sobre a mesma
     lista de hoje (professor_aluno com has_acesso), com a contagem de resultados; cada
     resultado com avatar na cor do perfil dominante, "e-mail · Perfil" e botão "Matricular";
     quem já está na turma aparece com o rótulo "já matriculado nesta turma" em texto (não só
     pela cor) e sem botão;
   - "Alunos matriculados" com contador; cada linha com avatar na cor do perfil, nome, e-mail,
     "Perfil · desde dd/mm/aaaa" (aluno_perfil/perfil e classe_aluno.created_at, direto do
     Supabase) e "Remover";
   - remover pede confirmação NA PRÓPRIA LINHA (256-273) com texto verdadeiro: "Ele perde o
     acesso à trilha desta turma e o progresso dele aqui é apagado." — NÃO usar o texto de 30
     dias do protótipo (seção 7). Botão destrutivo com texto escuro sobre --destructive;
   - rodapé "Alterações de matrícula são aplicadas na hora." + "Fechar".
   A chamada que enfileira a personalização na matrícula continua como está nesta fase (ela sai
   na Fase 6).
2. Cores das iniciais pelo corDoIconeSobre (Conqueror e Mastermind falham com iniciais escuras).
3. Modal de presença: só visual (287-360). "O que registrar" em pílulas com aria-pressed;
   regras de presencaDaTurma.ts sem nenhuma mudança.
4. Tirar o verde literal do botão "Adicionar" e as demais cores fora do tema do modal.

Critérios de aceite:
- Busca encontra por nome e por e-mail, ignorando acento e maiúsculas (teste unitário da função
  de busca/ordenação).
- Remover aluno nunca acontece sem a confirmação da linha; teclado funciona (Tab, Esc).
- Presença registra exatamente como antes (testes existentes de presencaDaTurma continuam
  passando).
- Verificação no navegador sem escrever no banco real: interceptar as requisições de INSERT/
  DELETE/RPC, ou usar turma de teste combinada com o time.

Branch: feat/turmas-fase-4-matriculas-e-presenca. Abra o PR, não faça merge.
```

### Fase 5 — Duplicar turma com confirmação, no banco

```text
Implemente a Fase 5 do redesign da tela Turmas: a duplicação de turma com confirmação,
executada por uma função no banco.

Antes de começar, leia a seção 11.0 e as seções 2.3 (item 6), 4.6, 4.7 e 9 de
docs/frontend/redesign-fase-2/03-analise-turmas.md.

Referências:
- Protótipo: confirmação 363-376, faixa de sucesso 88-99, nome da cópia 499-503.
- Tela atual: ClassManagementSection.tsx handleDuplicate (204-278).
- Banco: api/alembic/versions/20260920_06_class_deletion_atomic.py (excluir_classe — mesmo
  padrão de função transacional com posse conferida), 20260827_03 (triggers de class_delta).
  Colunas reais: topicos (classe_id, nome, descricao, ordem, next, depende), conteudos (…,
  metadata), atividades (…, pontuacao_maxima, metadata, data_entrega), questoes (…, midia_url,
  nota_estabelecida), cards (…, cor, ordem, conteudo_origem_id), atividade_conteudos.

O que fazer:
1. Migration (não aplicar) com a função public.duplicar_classe(p_classe_id bigint) RETURNS
   bigint (id da cópia):
   - SECURITY DEFINER, SET search_path = public, pg_temp; recusa se p_classe_id não estiver em
     app_classes_do_professor();
   - uma transação: cria a classe com professor_id = auth.uid(), mesma materia_id e nome
     "<nome> (cópia)", "(cópia 2)", "(cópia 3)"… conforme o que já existir entre as turmas do
     professor;
   - copia topicos, conteudos, atividades, questoes, atividade_conteudos e cards com TODAS as
     colunas de conteúdo (as da seção 2.3-6 incluídas), remapeando ids, next/depende,
     conteudo_origem_id e os vínculos;
   - NÃO copia matrículas, progresso, telemetria, guildas, ranking nem personalizações;
   - GRANT EXECUTE para authenticated.
   Atenção: inserir em topicos/conteudos/atividades/questoes/cards dispara
   fn_enqueue_class_delta_job; a coalescência dele funde tudo num job pending da classe nova —
   conferir que a cópia gera um job só, não um por linha. O INSERT em classe dispara o tema
   (trg_classe_mapa_tema_job): é o esperado.
2. Testes da migration (SQL renderizado): posse conferida, SECURITY DEFINER, search_path, lista
   de colunas copiadas, ausência de cópia de classe_aluno/progresso, downgrade.
3. Frontend:
   - confirmação antes de duplicar (363-376) com o nome da turma e o texto do protótipo;
   - chamar supabase.rpc("duplicar_classe", …) no lugar de handleDuplicate (apagar o código de
     cópia no cliente);
   - faixa azul (88-99) com o nome real da cópia devolvido pelo banco;
   - erro da RPC em toast com a mensagem, sem turma pela metade (a transação garante).

Critérios de aceite:
- A cópia leva arquivos anexados, pontuação das atividades, mídia das questões e cor/ordem dos
  cards (teste da migration + conferência do SQL da função).
- Duplicar duas vezes gera "(cópia)" e "(cópia 2)".
- Nada é duplicado sem confirmação.
- Se o time não puder aplicar a migration antes do merge do frontend, o botão Duplicar mostra
  erro claro ("duplicação ainda não disponível neste ambiente") em vez de quebrar.

Branch: feat/turmas-fase-5-duplicar-no-banco. Abra o PR, não faça merge.
```

### Fase 6 — Matrícula enfileira a personalização pelo banco

```text
Implemente a Fase 6 do redesign da tela Turmas: a matrícula passa a enfileirar a geração do
material do aluno pelo banco, sem depender da API.

Antes de começar, leia a seção 11.0 e as seções 2.3 (item 7), 4.9 e 9 de
docs/frontend/redesign-fase-2/03-analise-turmas.md, e a parte de personalizacao_jobs do
CLAUDE.md (class_delta_sync enfileirado pelo banco, coalescência, escopo na fusão).

Referências:
- Tela atual: ClassManagementSection.tsx (290-326, fetchClassContextIds 83-101),
  trilha/personalizacaoJobsApi.ts (enqueueEnrollmentJob, 145-153).
- API: o endpoint POST /api/v1/personalizar/jobs/enrollment e o worker que processa
  kind = 'student_enrollment' (api/app/…/personalizacao_jobs*; conferir o formato exato de
  payload e de personalizacao_job_targets que o worker espera).
- Banco: trigger atual trg_classe_aluno_after_insert (só provisiona a estrutura);
  20260827_03 (fn_enqueue_class_delta_job — padrão a seguir: SECURITY DEFINER, coalescência
  com FOR UPDATE, job em processing nunca reaproveitado).

O que fazer:
1. Antes de escrever código, levantar e registrar no PR: que colunas/targets o worker lê para
   student_enrollment, o que a API grava hoje ao enfileirar (trigger_source, reason, ids de
   tópicos/conteúdos) e se há deduplicação no endpoint. O job criado pelo banco tem de ser
   indistinguível para o worker do que a API cria hoje.
2. Migration (não aplicar): função + trigger AFTER INSERT em classe_aluno que enfileira
   student_enrollment para (classe, aluno) com os tópicos e conteúdos da turma naquele momento;
   não duplica se já houver job pending do mesmo aluno e turma; turma sem tópicos não enfileira.
3. Testes da migration (SQL renderizado) e, se o worker tiver testes, um teste de que ele aceita
   o formato gravado pelo trigger.
4. Frontend: tirar a chamada a enqueueEnrollmentJob (e fetchClassContextIds, se ficar sem uso)
   e o toast de "sessão expirada" do fluxo de matrícula. Manter enqueueEnrollmentJob exportado
   se outro lugar usar.
5. Não remover o endpoint da API: outros clientes podem usá-lo; registrar no PR como dívida,
   como o CLAUDE.md faz com telemetria.

Critérios de aceite:
- Com a API desligada, matricular um aluno grava a matrícula E cria o job (conferir pelo SQL da
  função e pelo teste; não testar escrevendo no banco real sem autorização).
- Matricular o mesmo aluno duas vezes não cria dois jobs pending.
- O CLAUDE.md ganha uma linha sobre student_enrollment enfileirado pelo banco, junto de
  class_delta_sync.

Branch: feat/turmas-fase-6-matricula-pelo-banco. Abra o PR, não faça merge.
```

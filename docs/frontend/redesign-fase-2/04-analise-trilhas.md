# Análise — Trilhas do console do professor: código atual × protótipo V9

> Só análise e plano. A implementação vem em 5 PRs empilhados (seção 6).
>
> **Protótipo:** `prototipos/professor/v9/Console Trilhas (Fase 2).dc.html` (mapa, editor de tópico com 3 abas, modal "Gerar trilha com IA", modais de duplicar/excluir). Prompts de origem: `prototipos/professor/prompts/fase-2/04-1` a `04-5`.
> **Código:** `trilha/TopicsManager.tsx` (1325 linhas, o mapa), `trilha/TopicEditDrawer.tsx` (1698, o editor), `useTopicGraph.ts`, `useTopicCrud.ts`, `useTopicDataLoaders.ts`, `topicsApi.ts`, `personalizacaoJobsApi.ts`, `GenerateTrailDialog.tsx`, `Console.tsx` (rotas).
> **Banco / backend:** `duplicar_classe` (`20261011_01`) como modelo; edge function `frontend/supabase/functions/generate-content-ai` (`mode: "trail"`).
> **Regra:** a mesma das análises anteriores — estrutura e regras atuais são a base; o protótipo manda na estilização; o que o protótipo traz sem fonte de dado entra como "criar" avaliado, nunca inventado.

---

## 1. O que a leitura do código revelou (e muda o plano)

| # | Achado | Consequência |
|---|---|---|
| 1 | **`GenerateTrailDialog.tsx` (378 linhas) não é montado em lugar nenhum.** O mapa não tem botão "Gerar trilha com IA"; o diálogo é código órfão desde o `Init`. | A Parte 2 do protótipo não é restilização: é **religar uma funcionalidade**. |
| 2 | O diálogo órfão envia anexos com `supabase.storage.from("conteudos").upload(...)`. | **Errata (conferido na T2):** é o mesmo caminho que o editor de tópico em uso (`TopicEditDrawer`) já usa para os arquivos do professor. A regra do R2 vale para o **material personalizado gerado**, não para o que o professor anexa. Mantido como está. |
| 3 | O diálogo órfão tem um passo `confirm-delete` que **apaga a trilha existente** (`deleteClassTrailCascade`) antes de criar. | O protótipo diz "nada é publicado sem a sua confirmação" e permite **revisar e ajustar item a item**. Apagar a trilha antes de o professor aprovar a proposta é o oposto. Aplicar precisa ser a última etapa, e só ali se toca no que existe. |
| 4 | **Duplicar tópico não existe.** Só há excluir (`handleDeleteWithConfirm`, um `window.prompt` pedindo para digitar o nome). | Criar. A duplicação de turma já foi feita como função transacional (`duplicar_classe`); duplicar tópico segue o mesmo molde (`duplicar_topico`), não cliente com dezenas de INSERT. |
| 5 | `ContentsManager`, `ActivitiesManager`, `QuestionsManager`, `ContentDialog`, `ClassStudentsDialog` não são importados por ninguém. | Código morto (mesmo caso de `TrilhaSection` na análise de Turmas). **Não restilizar**; remover em PR próprio. |
| 6 | O editor (`TopicEditDrawer`) **já tem a estrutura do protótipo**: coluna esquerda (título, classe, ordem, descrição + "Gerar com IA", lista de nós de conteúdo com arrastar) e coluna direita com abas Conteúdo / Atividades / Cards, em rota própria `/console/trilha/:id/editar`. | Para o editor o trabalho é de **estilo e de pontos de comportamento**, não de estrutura. Isso reduz muito o risco. |
| 7 | O editor tem **56 ocorrências** de cores fixas (`violet-*`, `text-white`, `emerald-*`, `red-*`) fora do tema do console. | Troca por tokens (`primary`, `foreground`, `success`, `destructive`). |
| 8 | Já existe a pílula de status das gerações (jobs) e o "Tentar novamente". | Mantém; só muda o desenho. |
| 9 | "Moedas (opcional)" do protótipo (tópico e questão) não existe em lugar nenhum do código da trilha. O prompt `novas-telas/16-campo-de-moedas.md` trata disso como funcionalidade nova. | **Fora desta entrega.** Não se desenha campo que não grava. |

---

## 2. Mapa (Parte 1) — protótipo × atual

| Item | Atual | Protótipo | Categoria |
|---|---|---|---|
| Barra superior | título "Trilha de Tópicos" + subtítulo + seletor de classe + botões soltos | seletor de turma em cartão (iniciais, nome, "N tópicos · N alunos") à esquerda; à direita **Gerar trilha com IA** (primário), **Novo tópico**, **Salvar dependências** | 🎨 + 🆕 (botão de IA, ver §3) |
| Estado sem turma | caixa tracejada "Nenhuma classe selecionada" | ícone + "Escolha uma turma para abrir o canvas" + texto + botões "Gerar trilha com IA" / "Selecionar turma" | 🎨 |
| Pílula de status das gerações | existe | idem, no cabeçalho do cartão do mapa | 🎨 |
| Legenda | texto + bolinhas D/N | "— Sequência" (cheia) / "- - Pré-requisito" (tracejada) + ícone `?` com a dica de pan/arrastar/clicar | 🎨 |
| Conectores | cores `info`/`success`; **só `next` e `depende` com bolinhas D/N** | linha cheia roxa = sequência, tracejada azul = pré-requisito | 🎨 (cores/tracejado; **a interação D/N continua** — é como o professor cria as ligações) |
| Cartão do tópico | ícone de arquivo, nome, chips, rodapé `#ordem id:N`; lápis/lixeira no cabeçalho | selo `#seq`, hexágono com o número, título, pílulas DEP/NEXT, rodapé com **Editar tópico · Duplicar · Excluir sempre visíveis** | 🎨 + 🆕 (duplicar) |
| Adicionar tópico | só pelo botão da barra | cartão tracejado "Adicionar tópico ao final" no canvas | 🆕 pequeno (abre o mesmo formulário) |
| Zoom | − / % / + / resetar | − / % / + / **ajustar à tela** / **centralizar** | 🔧 (`fitToScreen` = calcular zoom e offset pelos extremos das posições) |
| Excluir tópico | `window.prompt` digitando o nome | modal com Cancelar / "Excluir tópico" | 🔧 — vira `AlertDialog`. **Mantenho o campo de digitar o nome**: a exclusão em cascata apaga conteúdos, cards e questões, e o protótipo não pede mais cuidado, mas o código atual já pede e tirar seria regressão de segurança. |
| Duplicar tópico | não existe | modal + cópia com conteúdos, cards e questões, sem progresso de aluno | 🆕 (migration `duplicar_topico`) |

## 3. "Gerar trilha com IA" (Parte 2)

Fluxo do protótipo: **Configurar → Gerar → Processando → Resultado → Revisar → Ajustar**. Atual (órfão): `form → confirm-delete → preview → creating`.

Decisões:
- Religar o botão no mapa e no estado sem turma.
- Reaproveitar a lógica de geração/criação do diálogo atual (chamada à edge function com `mode: "trail"`, montagem dos tópicos) e trocar a **casca** pelo stepper de 6 passos.
- **Aplicar = última etapa.** Se a turma já tem tópicos, o aviso e a substituição acontecem **só ao clicar "Aplicar trilha"**, depois da revisão; nunca antes.
- Upload de anexos: mantido (bucket `conteudos`, como o editor). Os anexos só sobem na hora de **Aplicar**; gerar a proposta envia as fontes à edge function e não grava nada.
- **"Pedir ajuste" / "Regerar só este item"**: resolvido sem mexer na edge function — chama o mesmo `mode: "trail"` com 1 tópico, o nome dele e a instrução como contexto; o resultado assume o lugar do antigo (ordem, next, depende preservados). A qualidade depende do prompt existente; se ficar fraca, o caminho é um modo próprio na função.
- **Aplicar sem perda:** a trilha nova é criada **primeiro**; os tópicos antigos só são removidos depois que tudo foi criado (se a criação falhar, o rollback remove só o que foi criado e a trilha antiga continua).
- **"Já gerar atividades?"** não muda o que a IA devolve: com "Não", as atividades da proposta são descartadas ao aplicar.

## 4. Editor de tópico (Partes 3–5)

| Item | Atual | Protótipo | Categoria |
|---|---|---|---|
| Cabeçalho | "Voltar", título, botão "Salvar Trilha" violeta | "Voltar à trilha", "Editar Trilha de Conhecimento", `Física I › Tópico · gerenciamento…`, indicador "Salvo às HH:MM" | 🎨 + 🔧 (o horário vem do último salvamento bem-sucedido, não de relógio) |
| Coluna esquerda | existe | idem; **"Fonte deste tópico"** (arquivo origem, tamanho, páginas extraídas) | 🎨; "Fonte" 🆕 só com o que `conteudos.metadata` já guarda (nome/tamanho). "Páginas extraídas" **não** se mostra se não houver dado |
| Lista de nós | arrastar para reordenar, excluir só no hover | arrastar, tipo, nº de questões, editar | 🎨 + 🔧 (ações visíveis sem hover) |
| Aba Conteúdo | formulário por tipo (texto/vídeo/link/arquivo) | idem, com pré-visualização do link, "Sugerir cards e atividades", "Atualizar conteúdo" | 🎨 (comportamento atual preservado) |
| Aba Atividades | atividades + questões, vínculos | "Atividades vinculadas" com Editar / **Duplicar** / **Excluir…** por questão (confirmação inline que diz que só sai deste conteúdo), "Vincular existente", "Criar nova questão" | 🎨 + 🔧 (confirmação inline) + 🆕 (duplicar questão: um INSERT copiando a linha) |
| Aba Cards | cards com reaproveitamento | cards com rótulo de reaproveitamento, editar/duplicar/excluir inline, "Reaproveitar card de outro conteúdo" | 🎨 + 🔧 + 🆕 (duplicar card) |
| Moedas | — | campo | ⛔ fora (§1.9) |

## 5. Não levar para a tela real

Seletor "Pré-visualização de estado"; dados fictícios (Física I, 34 alunos fixos); "Salvo às 15:47" fixo; campo Moedas; links extras da sidebar; "Páginas extraídas" sem fonte.

## 6. Plano de entrega — 5 PRs empilhados

| PR | Conteúdo | Risco |
|---|---|---|
| **T1 Mapa** | barra superior, estado sem turma, cabeçalho/legenda/conectores, cartão do tópico, zoom fit/center, excluir em `AlertDialog`, **duplicar tópico** (+ migration `duplicar_topico`), cartão "Adicionar tópico" | médio — o canvas tem lógica de ponteiro/arraste que **não se toca**; muda só o que é desenhado |
| **T2 IA** | religar e redesenhar "Gerar trilha com IA" em 6 passos | **alto** — é feature, não estilo; ver §3 |
| **T3 Editor** | cabeçalho, coluna esquerda, aba Conteúdo | baixo/médio — troca de classes |
| **T4 Atividades** | aba Atividades + duplicar/excluir questão com confirmação inline | médio |
| **T5 Cards** | aba Cards + duplicar card | baixo |
| (à parte) | remover código morto do §1.5 | baixo |

Princípios: nenhuma lógica de ponteiro/zoom/arraste, de persistência ou de `useTopicCrud`/`useTopicGraph` é reescrita; o que é desenhado sai de blocos de JSX pequenos e testáveis; o que é cálculo (fit à tela, rótulos, datas) vira função pura com teste.

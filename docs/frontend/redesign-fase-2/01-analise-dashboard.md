# Análise — Dashboard ("Visão geral") do console do professor: código atual × protótipo V9

> Só análise. Nenhum arquivo de código foi alterado.
>
> **Protótipo analisado:** `prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html` (PR #256), lido por inteiro (1209 linhas, incluindo o script com os dados fictícios).
> **Código analisado:** `frontend/src/pages/Console.tsx`, `frontend/src/pages/consoleSections.ts`, `frontend/src/components/console/ConsoleShell.tsx`, `DashboardSection.tsx`, `useTurmaKpis.ts`, `StudentTrailVisualization.tsx`, `frontend/src/lib/turmaResumo.ts`, `frontend/src/styles/page-surfaces.css`, `frontend/src/index.css`.
>
> **Regra usada em toda a análise:** a estrutura e o conteúdo da tela atual são a base; o protótipo manda na estilização. Quando o protótipo tem algo que a tela atual não tem, entra como proposta de "criar", com a fonte de dados avaliada. Quando o protótipo tira algo que a tela atual tem, a recomendação padrão é manter.

---

## 1. Resumo

| Categoria | Quantidade | Exemplos |
|---|---|---|
| **Só estilo** (mesmo conteúdo, visual novo) | 9 blocos | cabeçalho, KPIs, gráfico de abandono, rosca de notas, tabela de alunos, abas do detalhe do aluno |
| **Modificar** (estrutura ou comportamento mudam) | 8 pontos | detalhe do aluno sai do modal e vira página; seletor de turma sobe para o topo; busca para de alterar os KPIs; KPI "Conclusão média" duplicado some |
| **Criar** (não existe hoje) | 11 itens | bloco "Precisam de atenção"; abas Evolução, Conteúdo e Insights; jornada real do aluno; intervenções do professor por passo; Escriba |
| **Apagar** | 3 itens | dump de JSON cru na aba Personalização; KPI duplicado; pasta `components/dashboard/` (código morto) |
| **Não levar para a tela real** | 5 itens do protótipo | seletor "Pré-visualização de estado", botão "Ver status do serviço", dados fictícios, um bug de navegação do protótipo |

A maior parte do que é "criar" depende de **dado que ainda não existe ou nunca foi consultado** (abandono por aluno, data da última atividade, histórico semanal, log de passos da jornada). A parte de estilo pode ser feita quase toda sem tocar em banco.

---

## 2. Como a tela é montada hoje

### 2.1 Encaixe no console

- `Console.tsx:165-200` — monta `ConsoleShell` e troca a seção pela URL. O dashboard é a rota `/console` sem slug (`consoleSections.ts:10`).
- `DashboardSection` é carregado com `lazy()` (`Console.tsx:20`) porque traz o `recharts` inteiro.
- `ConsoleShell.tsx` já tem **topbar + sidebar** (herança do redesign imersivo, PR #211) — a estrutura geral do protótipo já existe; o que muda é o visual.

### 2.2 Estrutura do `DashboardSection.tsx` (1216 linhas, um componente só)

| Trecho | Linhas | O que é |
|---|---|---|
| Tipos + carga de dados | 64-477 | `loadData` busca `classe`, `classe_aluno`, `alunos`, `modoOperacao`, `aluno_perfil`, `topicos`, `topico_aluno`, `atividades`, e monta a lista de `Aluno` no cliente |
| KPIs de turma | 156-157 | `useTurmaKpis` lê 3 views: `vw_metricas_turma_geral_classe`, `vw_metricas_turma_perfil_classe`, `vw_metricas_distribuicao_turma_classe` |
| Cabeçalho | 481-505 | título "Dashboard de Alunos" + seletor "Janela temporal" (4 opções) |
| KPIs linha 1 | 507-560 | Total de alunos, Média de notas, Conclusão média, Taxa de acertos (calculados da lista de alunos) |
| KPIs linha 2 | 562-613 | Abandono médio, Conclusão média, Uso do chat após erro, Tempo médio de uso (da view de turma) |
| Gráficos | 615-703 | Abandono por perfil (barras, com filtro Majoritário / 2º perfil / Afinidade ≥ 20%) e Distribuição de notas (pizza) |
| Lista de alunos | 705-804 | busca + filtro de classe + tabela (Aluno, Classe, Perfil, Nota, Progresso, Acertos, botão de olho) |
| Detalhe do aluno | 806-1213 | **modal** (`Dialog`, `max-w-4xl`) com 4 abas: Visão Geral, Perfil BrainHex, Trilha Visual, Personalização |

Estados de carregamento/erro/vazio hoje existem **só dentro do card da lista** (736-800). Os KPIs e gráficos mostram "Sem dados ainda" cada um por conta própria.

### 2.3 Comportamentos atuais que valem registro

1. **A busca por nome altera os KPIs da linha 1.** `filteredAlunos` (389-399) filtra por busca e classe, e os KPIs da linha 1 (401-413) usam essa lista. Digitar um nome muda "Total de alunos". No protótipo o filtro de turma fica no topo e a busca só filtra a tabela.
2. **"Conclusão média" aparece duas vezes** (535-545 e 575-586), com duas fontes diferentes: a média da lista de alunos e a view de turma. Os números podem divergir na mesma tela.
3. **A janela temporal não filtra nada** (145-148, comentário do próprio código). Os KPIs vêm de views sem coluna de data por evento. Depende do endpoint de KPIs da #12.
4. **O XP da trilha visual é inventado**: `xp = porcentagemConcluida * 10` de `1000` (997-998).
5. **A aba Personalização despeja o JSON cru de `contexto_aluno`** para o professor (1053-1057).
6. **`StudentTrailVisualization.tsx` usa cores de perfil próprias** (`PROFILE_COLORS`, linhas 24-32), diferentes das oficiais de `microservice/src/constants/brainHex.ts` (ex.: Seeker azul em vez de `#17a398`).
7. **`frontend/src/components/dashboard/`** (5 arquivos, 1530 linhas: `ActivitiesTab`, `ClassesTab`, `ContentTab`, `StudentsTab`, `TopicsTab`) **não é importado por nenhum arquivo** — é código morto.

---

## 3. Como o protótipo é montado

Tela única com duas visões alternadas por estado (`view: 'class' | 'student'`):

1. **Visão da turma** — seletor de turma no topo, janela temporal, 4 estados (carregando / vazio / erro / com dados) e, com dados, **4 abas**: Visão geral, Evolução, Conteúdo, Insights.
2. **Detalhe do aluno** — página inteira (não modal), com botão de voltar, cartão-resumo e **as mesmas 4 abas de hoje**: Visão geral, Perfil BrainHex, Trilha visual, Personalização.
3. **Escriba** — botão flutuante no canto inferior direito que abre um chat com a IA.

As abas do detalhe do aluno têm **os mesmos nomes** das abas do modal atual. A base foi preservada; o que muda é o formato (modal → página) e o conteúdo de cada aba.

---

## 4. Inventário bloco a bloco

Legenda: 🎨 só estilo · 🔧 modificar · ➕ criar · 🗑️ apagar · ⛔ não levar para a tela real

### 4.1 Moldura (topbar, sidebar, fundo) — `ConsoleShell.tsx` + `page-surfaces.css`

Vale para todas as telas, não só o dashboard. Entra aqui porque é a primeira tela a ser feita.

| Item | Hoje | Protótipo | Categoria |
|---|---|---|---|
| Topbar | logo + "TrailUp" + "Console do professor" + avatar + nome/instituição + sair | igual, com divisor vertical entre marca e "Console do professor", avatar roxo sólido | 🎨 |
| Nome "TrailUp" | Inter (o console força Inter em títulos, `page-surfaces.css:86`) | Cinzel 700 22px | 🎨 |
| Sidebar | 212px (`page-surfaces.css:64`), item ativo com fundo `primary/.13` e borda | 264px, item ativo em **teal `#4fd1c5`** com fundo `rgba(79,209,197,.08)`, sem borda | 🎨 |
| Itens da sidebar | 7 (Visão geral, Trilhas, Turmas, Personalizações, Rankings, Meus dados, Aprovações) | 12 (acrescenta Missões, Notas, Eventos, Rank de batalhas, Conquistas) | ⛔ **nesta parte** — essas telas não existem; não entram links para páginas vazias. Ficam para quando cada tela for implementada. |
| Fundo | `world-mastermind.webp` com opacidade .12 | `bg-forest-crystal.webp` com opacidade .34 + gradiente escuro + brilho roxo radial | 🎨 (a imagem já está em `prototipos/professor/v9/assets/`; precisa entrar em `frontend/src/assets/design/`) |

### 4.2 Cabeçalho da seção

| Item | Hoje (481-505) | Protótipo (72-92) | Categoria |
|---|---|---|---|
| Título | "Dashboard de Alunos" + subtítulo | Não tem título. No lugar, um bloco "TURMA SELECIONADA" com o nome da turma em Cinzel 24px e "3 turmas · 74 alunos" | 🔧 |
| Seletor de turma | fica dentro do card da lista (721-733) e controla **a tela inteira** sem deixar isso claro | sobe para o topo como cartão clicável (ícone de grade + nome + contagem + seta) | 🔧 — mesma função, lugar certo. Resolve o comportamento 2.3-1 |
| Janela temporal | `Select` com 7 dias / 30 dias / Este mês / Todo o período | pílulas segmentadas: 30 dias / Semestre / Tudo | 🎨 + decisão: manter as 4 opções atuais (base) no formato de pílulas. Continua sem filtrar até a #12 |
| "Atualizado há 4 min" | não existe | texto ao lado das pílulas | ➕ simples — hora da última carga, guardada no cliente |

### 4.3 Estados da página

| Estado | Hoje | Protótipo | Categoria |
|---|---|---|---|
| Carregando | "Carregando alunos..." só dentro da lista (744) | skeleton da página inteira (3 cards + 2 gráficos com shimmer) + "Consultando o desempenho da turma…" (95-111) | 🔧 |
| Vazio | "Nenhum aluno matriculado ainda." dentro da tabela (794-800) | bloco centralizado com ícone, título Cinzel, texto e dois botões: "Convidar alunos" e "Montar a trilha" (114-124) | 🔧 — os botões viram links para `/console/turmas` e `/console/trilha` |
| Erro | mensagem + "Tentar novamente" dentro da lista (736-742) | bloco vermelho de página inteira com texto tranquilizador e "Tentar novamente" (127-139) | 🔧 |
| Botão "Ver status do serviço" | — | aparece no estado de erro | ⛔ não existe página de status |
| "Pré-visualização de estado" (Carregando / Vazio / Erro / Com dados) | — | pílulas no topo (62-68) | ⛔ **ferramenta do protótipo**, marcada como `dev-only` no próprio HTML |

### 4.4 Abas da visão da turma

| Item | Hoje | Protótipo (144-148) | Categoria |
|---|---|---|---|
| Abas "Visão geral / Evolução / Conteúdo / Insights" | não existem — tudo numa página só | pílulas no topo do conteúdo | ➕ a navegação; o conteúdo atual inteiro vai para "Visão geral" |

### 4.5 Aba "Visão geral" (turma)

#### KPIs principais (linha de 3)

| Item | Hoje (507-560) | Protótipo (154-177, dados 995-999) | Categoria |
|---|---|---|---|
| Layout | 4 cards pequenos (número 2xl) | 3 cards grandes (número 44px, rótulo em caixa alta, ícone roxo à direita) | 🎨 |
| Total de alunos | ✅ | ✅ | 🎨 |
| Média de notas | ✅ | ✅ "7.4 de 10" | 🎨 |
| Conclusão média | ✅ (duas vezes, ver 2.3-2) | ✅ com barra de progresso e **marca da meta** ("60% esperado nesta semana") | 🎨 + ➕ a meta — **não há dado de "progresso esperado"**. Precisa de decisão (seção 8) |
| Taxa de acertos | na linha 1 | desce para a linha de 4 | 🔧 só muda de lugar |
| Selo de variação ("+3 matrículas nesta semana", "+0,3 vs período anterior") | não existe | pílula verde embaixo de cada KPI | ➕ **sem fonte hoje** — as views não têm série histórica. Só "+N matrículas nesta semana" é viável agora, se `classe_aluno` tiver data de matrícula |

#### Bloco "Precisam de atenção" (179-205)

| Item | Hoje | Protótipo | Categoria |
|---|---|---|---|
| Lista de alunos fora da curva | não existe | cartão com borda bronze, contador, texto "A média esconde estes casos", critério explícito e uma linha por aluno (avatar, perfil, gravidade Crítico/Atenção, motivo, comparação com a turma, "Abrir jornada") | ➕ |
| Critério | — | abandono > 30%, nota < 5,0, progresso 20 pontos abaixo do previsto, ou 7 dias sem atividade | ➕ — ver disponibilidade abaixo |

Disponibilidade de dado por critério:

| Critério | Temos hoje? |
|---|---|
| Nota < 5,0 | ✅ `classe_aluno.notaMedia` |
| Abandono > 30% **por aluno** | ❌ no dashboard atual só existe abandono **por turma e por perfil**. Pode existir em `vw_metricas_engajamento_aluno_classe` / `vw_metricas_comportamento_aluno_classe` (views que já existem no banco, mas o dashboard não lê) — **confirmar as colunas no Supabase** |
| Progresso 20 pontos abaixo do previsto | ❌ não há "previsto" |
| 7 dias sem atividade | ❌ `classe_aluno.ultimaAtividade` é o **id** de uma atividade, não uma data. Dá para tirar de `aluno_atividade_diaria` ou `telemetria_sessoes` |

Relação: é a mesma ideia do prompt `08-sinal-de-risco-de-reprovacao.md` (Fase 2, novas telas). Dá para lançar primeiro só com o critério de nota e ir ligando os outros conforme o dado aparecer.

#### KPIs secundários (linha de 4)

| Item | Hoje (562-613) | Protótipo (207-221, dados 1001-1006) | Categoria |
|---|---|---|---|
| Taxa de acertos | linha 1 | aqui, com barra e "Bom · meta 70%" em verde | 🎨 + 🔧 (muda de linha) |
| Abandono médio | ✅ | com barra e "Atenção · acima da meta de 15%" em amarelo | 🎨 + decisão sobre metas |
| Chat após erro | ✅ "Uso do Chat após Erro" | com "Informativo · quem pede ajuda erra menos depois" em azul | 🎨 |
| Tempo médio de uso | ✅ | "min/sessão" + "mediana 21 min · estável" | 🎨 — a mediana e a comparação não existem na view; manter só a média |
| Conclusão média (2ª cópia) | ✅ (575-586) | não existe | 🗑️ apagar a duplicata |

As **metas** (70% acertos, 15% abandono) e as cores de tom (verde / amarelo / azul) não existem hoje. Precisam ser constantes definidas pelo time ou configuração por turma (seção 8).

#### Gráfico "Abandono por perfil"

| Item | Hoje (616-659) | Protótipo (224-250, dados 1016-1019) | Categoria |
|---|---|---|---|
| Filtro Majoritário / 2º perfil / Afinidade ≥ 20% | ✅ `Select` | pílula "Majoritário ▾" | 🎨 — manter as 3 opções |
| Barras | `recharts`, **uma cor só (vermelho)**, ordenadas do maior para o menor, até 8 | 7 barras em **ordem fixa dos perfis**, **cada uma na cor-assinatura do perfil**, valor em cima, bolinha colorida + nome embaixo | 🎨 + 🔧 leve (ordem fixa e cor por perfil) |
| Linha tracejada "média 18,5%" | não existe | linha horizontal com rótulo | ➕ simples — a média já existe em `turmaResumo.taxa_media_abandono_pct` |
| Eixos e grade | eixos X/Y com grade tracejada | sem eixos | 🎨 |

Dá para continuar com `recharts` (barra com `Cell` por cor + `ReferenceLine` para a média) em vez de desenhar à mão como o protótipo.

#### Gráfico "Distribuição de notas"

| Item | Hoje (661-702) | Protótipo (252-273, dados 1021-1027) | Categoria |
|---|---|---|---|
| Tipo | pizza com rótulo de percentual em cada fatia | **rosca** com a média no centro ("7.4 média") + legenda ao lado com contagem por faixa | 🎨 |
| Faixas | as que a view `vw_metricas_distribuicao_turma_classe` devolve (a descrição diz "baixa, média e alta" = 3) | 4 faixas: 9–10, 7–8, 5–6, 0–4 | 🔧 **decisão**: manter as faixas da view (base) e só trocar o visual — ou mudar a view para 4 faixas |
| Cores | ciclo vermelho/amarelo/verde por índice (684-689) — a cor depende da ordem, não da faixa | cor fixa por faixa (verde, azul, amarelo, vermelho) | 🔧 mapear cor pelo nome da faixa, não pelo índice |
| Frase de leitura ("4 alunos na faixa baixa concentram 62% do abandono") | não existe | caixa embaixo do gráfico | ➕ depende do abandono por aluno (mesma lacuna do bloco de atenção) |

#### Tabela "Alunos da turma"

| Item | Hoje (705-804) | Protótipo (276-330, dados 1029-1043) | Categoria |
|---|---|---|---|
| Título | "Lista de Alunos" | "Alunos da turma" | 🎨 |
| Busca | `Input` com lupa | pílula escura com lupa | 🎨 |
| Filtro ao lado da busca | **classe** | **"Todos os perfis"** (a classe subiu para o topo) | 🔧 filtro de classe sobe (4.2); ➕ filtro por perfil |
| Coluna Aluno | nome + e-mail | **avatar com iniciais na cor do perfil** + nome + e-mail | 🎨 |
| Coluna Classe | ✅ | não existe | 🔧 **manter quando "Todas as turmas" estiver selecionado** (base); esconder quando uma turma específica estiver selecionada |
| Coluna Perfil | `Badge` cinza | chip com bolinha e texto na cor do perfil | 🎨 |
| Coluna Nota | `Badge` verde/vermelho (≥ 7) | número em negrito | 🎨 |
| Coluna Progresso | `Progress` + % | barra roxa + % | 🎨 |
| Coluna Acertos | % | % | 🎨 |
| Coluna Abandono | não existe | % colorido + rótulo "saudável / atenção / crítico" | ➕ depende do abandono por aluno |
| Ação | botão com ícone de olho | **linha inteira clicável** + seta à direita | 🔧 — manter acessível por teclado (`button`/`role`, foco visível) |
| Paginação | não existe (lista inteira) | "Mostrando 8 de 34 alunos" + Anterior / Próxima | ➕ |
| Cabeçalho da tabela | `TableHeader` padrão | faixa `#231d33`, texto em caixa alta 11px | 🎨 |

### 4.6 Aba "Evolução" (turma) — ➕ toda nova (334-405)

| Bloco | Conteúdo | Dado disponível? |
|---|---|---|
| 4 KPIs com variação | Conclusão da trilha, Nota média, Atividades entregues, Abandono — cada um com delta e nota ("era 51%") | ❌ série histórica não existe nas views de turma |
| Gráfico semanal | linha de conclusão (%), linha tracejada de nota média, barras de atividades entregues, anotação "semana da prova" | 🟡 `vw_metricas_evolucao_desempenho_aluno_dia` tem nota e progresso **por aluno por dia** (já usado no detalhe do aluno) — agregando por turma e semana dá as duas linhas. Atividades entregues sairiam de `atividade_aluno` por data. A anotação "semana da prova" não tem fonte |
| "Mudanças relevantes" | linha do tempo com etiquetas Melhora / Queda / Estrutura / Risco | ❌ não existe registro de eventos. "Tópico liberado" e "material regerado" poderiam vir de `topicos` e `personalizacao_jobs`; as leituras ("recuperou na semana seguinte") exigem IA |

No protótipo o gráfico é SVG fixo desenhado à mão; na tela real seria `recharts` (`ComposedChart` com `Line` + `Bar`).

### 4.7 Aba "Conteúdo" (turma) — ➕ toda nova (407-461)

| Bloco | Conteúdo | Dado disponível? |
|---|---|---|
| 3 cards de destaque | Mais consumido (borda neutra), Maior dificuldade (borda vermelha), Maior conclusão (borda verde) | 🟡 derivado da tabela abaixo |
| Tabela "Conteúdo por tópico" | Conteúdo + tópico, Formato, Consumo (barra + "31 de 34 alunos"), Dificuldade (% de erro + "pior que a média"), Conclusão | 🟡 consumo e conclusão: `conteudo_aluno` / `personalizacao_item_progresso`; erro por conteúdo: exige ligar questões ao conteúdo. Consulta nova — **pelo banco, não pela API** (regra de fronteira do CLAUDE.md: não tem LLM no meio) |

### 4.8 Aba "Insights" (turma) — ➕ toda nova (464-538)

| Bloco | Conteúdo |
|---|---|
| Faixa superior | "Gerado há 2h", "68% das sugestões aceitas nos últimos 30 dias", botão "Atualizar agora" |
| Filtro | Tudo / Turma / Alunos |
| Cards | dois tipos: **Sugestão** (borda roxa, botões Aceitar / Ignorar; Ignorar abre motivos opcionais "Já resolvido / Não se aplica agora / Vou revisar depois" + Cancelar / Confirmar) e **Observação** (borda neutra, botão "Ver detalhe"). Todos mostram "com base em: …" |
| Estados | gerando (spinner + texto), vazio ("Ainda sem sínteses geradas") |

**Fonte de dados:** a tabela **`intervencoes`** já existe (`api/alembic/versions/20260829_03_rag_schema_pgvector.py:101-113`: `aluno_id`, `tipo`, `motivo`, `contexto jsonb`, `acao`, `status pending/applied/dismissed`, `created_at`, `resolved_at`) e **nenhum código usa**. Encaixa em "Aceitar / Ignorar" (`applied` / `dismissed`); o motivo de ignorar pode ir em `contexto`. Faltam: vínculo com turma (hoje é só `aluno_id`, e o protótipo tem insights de escopo "turma") e policy de RLS para o professor.

Pela regra de fronteira: **gerar** a síntese é IA → API. **Listar, aceitar e ignorar** é banco → o console fala direto com o Supabase.

Relação: é o item `05-dashboard-historico-de-sugestoes-e-intervencoes-da-ia.md` da revisão 04 da Fase 1.

### 4.9 Detalhe do aluno

#### Formato geral

| Item | Hoje (806-1213) | Protótipo (545-843) | Categoria |
|---|---|---|---|
| Container | **modal** (`Dialog`, `max-w-4xl`, rolagem interna) | **visão de página inteira**, no lugar da visão da turma | 🔧 — o aluno aberto fica na URL (`/console?aluno=<id>`) para o voltar do navegador e o link funcionarem. Ver decisão 4 na seção 9 |
| Voltar | fechar o modal | "← Física I · todos os alunos" | ➕ |
| Cabeçalho | nome no título do modal | cartão: avatar 52px na cor do perfil, nome em Cinzel 26px, e-mail, "matriculada em 04/03/2026", chip do perfil | 🎨 + ➕ data de matrícula (confirmar se `classe_aluno` tem essa coluna) |
| Números do cabeçalho | 4 cards dentro da aba Visão Geral (Nota, Concluído, Acertos, **Tempo total**) | 5 números no cabeçalho: Nota média, Trilha concluída, Acertos, **Abandono vs turma**, **Tempo/sessão** | 🔧 sobem para o cabeçalho; ➕ abandono do aluno (mesma lacuna); "Tempo total" é o dado atual — manter, trocar para "tempo por sessão" só se houver fonte |
| Abas | Visão Geral, Perfil BrainHex, Trilha Visual, Personalização | mesmos nomes | 🎨 (pílulas) |

#### Aba "Visão geral" (aluno)

| Item | Hoje (824-940) | Protótipo (585-655) | Categoria |
|---|---|---|---|
| E-mail, Classe, **Modo de operação**, Perfil dominante | grade no topo da aba | e-mail e perfil vão para o cabeçalho; **Classe e Modo de operação não aparecem** | 🔧 manter os dois (base), no cabeçalho como texto secundário |
| Gráfico de evolução | linhas de acertos, progresso e nota **por dia** | linha da nota **por semana** do aluno × linha tracejada da **média da turma** | 🎨 + ➕ a comparação com a turma (dá para calcular com a mesma view, agregando todos os alunos da classe) — manter as 3 séries atuais |
| Última atividade | só o nome (930-939) | cartão com status, quando, acertos, duração, "Usou o chat de apoio 1 vez após erro" e o que fez antes | 🎨 + ➕ os detalhes dependem de dado de sessão |
| Cartão "Atenção" | não existe | "Dois tópicos consecutivos ficaram sem atividade nos últimos 9 dias" | ➕ |
| Cartão "Sinal de atenção" | não existe | fatores de risco, aviso "Visível só para você", sugestão de conversa, link para intervenções | ➕ — mesma regra do bloco "Precisam de atenção" |

#### Aba "Perfil BrainHex"

| Item | Hoje (942-972) | Protótipo (657-686) | Categoria |
|---|---|---|---|
| Barras de afinidade | `Progress` monocromático + selo "Dominante" | barra **na cor de cada perfil**, bolinha colorida, % à direita | 🎨 |
| Cartão do perfil dominante | não existe | ícone, nome em Cinzel, descrição de como o aluno aprende, 3 etiquetas | ➕ — descrição e etiquetas podem vir de `frontend/src/features/signup/brainhex.ts` / `DESIGN_ART`, sem backend |

#### Aba "Trilha visual"

| Item | Hoje (974-1003) | Protótipo (688-800) | Categoria |
|---|---|---|---|
| Visualização | `StudentTrailVisualization` com modos Hexágonos / Lista: tópicos na ordem da trilha com status | **"Jornada real"**: passos na **ordem em que o aluno realmente fez**, com conectores "seguiu / voltou / pulou / repetiu", cores por tipo, legenda | ➕ grande |
| XP | inventado (`% × 10` de 1000) | barra "3.480 / 5.000" | 🔧 usar XP real (existe no sistema de pontos) ou tirar |
| "Desvios detectados" | não existe | chips: retornos, fora de ordem, abandonos + "10 passos registrados" | ➕ |
| Detalhe do passo | não existe | 8 campos: conteúdo acessado, atividade, **resposta dada × esperada**, resultado, tempo, tentativa, ordem, progresso + leitura da IA + "Ver conteúdo entregue" / "Abrir conversa do chat" | ➕ |
| "Intervenções do professor neste passo" | não existe | caixa de comentário + "Salvar comentário" + histórico com entradas da IA e do professor | ➕ — **não existe tabela** de comentário do professor por passo |

**Recomendação:** manter Hexágonos / Lista (base) e acrescentar "Jornada" como um terceiro modo, liberado só quando o dado de passos existir. A jornada precisa de uma sequência cronológica de eventos por aluno (conteúdo aberto, atividade respondida, tentativa, tempo). As peças estão espalhadas em `conteudo_aluno`, `atividade_aluno`, `personalizacao_item_progresso` e `telemetria_lotes`, mas nada as junta hoje. É a entrega mais cara desta tela.

#### Aba "Personalização"

| Item | Hoje (1005-1209) | Protótipo (802-841) | Categoria |
|---|---|---|---|
| "Contexto central do aluno" com **JSON cru** | ✅ (1053-1057) | não existe | 🗑️ apagar o dump; manter os chips de perfil e o modo de operação |
| Resumo de uso (personalizações, itens, tempo) | ✅ | "Consumo total: 68% do material gerado · 13 de 19 itens" | 🎨 + 🔧 reformular como percentual consumido (dá para calcular com `progresso_itens`) |
| Material personalizado por tópico | não existe nesse formato | lista com barra de consumo e status (Consumido / 3 de 4 / Em espera) | ➕ derivável de `personalizacoes` + `progresso_itens`, que a tela já carrega |
| Histórico de personalizações | ✅ lista detalhada | não aparece | 🔧 manter (base), restilizar |
| Tabela de progresso dos itens | ✅ | não aparece | 🔧 manter (base), restilizar |
| Ações | não existem | "Regerar material pendente", "Ver conteúdo gerado", "Descartar personalizações…" (com confirmação por escrito) | ➕ — descartar pode usar o job `student-cleanup` que já existe; regerar e ver conteúdo já existem na seção Personalizações e podem ser reaproveitados |

### 4.10 Escriba (847-878) — ➕

Botão flutuante bronze que abre um chat: "O guia do professor · lê os dados desta turma", sugestões rápidas ("Quem precisa de atenção?", "Onde a turma mais erra?") e campo de pergunta.

- Não existe nada disso no frontend hoje.
- Aparece em 6 das 7 telas base → pertence ao `ConsoleShell`, não ao dashboard.
- Precisa de endpoint de IA na API (é IA, então a API é o lugar certo) que leia os dados da turma.
- Relação: item `06-dashboard-tutor-de-ia-para-o-professor.md` e `14-global-assistente-de-ia-nome-e-persona.md` da revisão 04 da Fase 1.
- **Recomendação:** fora da primeira entrega do dashboard; tratar como parte própria.

---

## 5. Estilização: de → para

Valores do protótipo lidos direto do HTML. Tokens atuais de `frontend/src/index.css:12-33`.

| Token | Hoje | Protótipo | Observação |
|---|---|---|---|
| Fundo da página | `--background` 264 43% 10% (≈ `#170f24`) | `#0d0b16` | mais escuro |
| Sidebar | `--background / .85` | `#170e24` | ≈ o `--background` atual |
| Topbar | `--card` 268 29% 14% (≈ `#24192e`) | `#23192e` | praticamente igual |
| Card | `--card` | `#1b1728` | um pouco mais escuro que o card atual |
| Superfície interna (cabeçalho de tabela, caixas dentro de card) | `--muted` 268 23% 20% | `#231d33` | |
| Borda | `--border` 268 22% 29% (≈ `#4a3b5b`) | `#2b2438` | **bem mais discreta** |
| Primária | `--primary` 270 57% 73% (lilás claro) | `#9b5de5` (violeta saturado) + `#c1a7ec` para texto/links | troca de tom |
| Destaque (item ativo) | `--accent` 162 54% 73% (menta) | `#4fd1c5` (teal) | |
| Texto | `--foreground` 280 50% 97% | `#f4f2f8` | igual |
| Texto secundário | `--muted-foreground` 272 18% 76% | `#a29cb3` | um pouco mais escuro |
| Sucesso / Atenção / Info / Perigo | `#22c55e` / `#f59e0b` / azul claro / vermelho claro (constantes do próprio `DashboardSection.tsx:57-61`) | `#5fd99a` / `#e0b34d` / `#6fb3e0` / `#f0847c` | fixos, não derivados da primária — bate com a regra 4 do CLAUDE.md |
| Bronze (Escriba, "Precisam de atenção") | não existe | `#9c6b4f`, `#c9924f`, `#d9a67f` | novo |
| Raio | `--radius` .5rem (8px) | cards **20px**, cards pequenos 16px, caixas internas 12-14px, botões e chips **999px** (pílula) | mudança visual grande |
| Título de card | Inter semibold (`page-surfaces.css:86` força Inter no console) | **Cinzel 700**, 18-20px | a fonte já está carregada (`index.html:20`, `tailwind.config.ts:20`); é tirar a regra que força Inter |
| Rótulo de métrica | `text-sm font-medium` | 11-12px, caixa alta, letter-spacing .08-.1em, `#a29cb3` | |
| Número de KPI | `text-2xl` (24px) | 44px (principais), 26px (secundários) | |
| Botão primário | `Button` shadcn | pílula `#9b5de5`, texto branco 700 | ver contraste |
| Abas | `TabsList` shadcn | trilho pílula `#1b1728` com aba ativa preenchida `#9b5de5` | |

**Onde aplicar:** o dashboard usa componentes shadcn (`Card`, `Table`, `Tabs`, `Select`, `Badge`, `Progress`, `Button`) e os mesmos componentes servem o console inteiro. Duas opções:

1. **Ajustar os tokens globais** (`index.css`) e o raio → o console inteiro muda de uma vez. É o caminho mais coerente com "o estilo do protótipo vale para todas as telas", mas afeta Trilha, Turmas e as outras seções antes delas serem revisadas.
2. **Tokens com escopo** em `.console-shell` → só o console muda, a landing e o app do aluno não.

**Recomendação:** opção 2 (escopo `.console-shell`). As páginas públicas têm identidade própria e não entram neste redesign.

---

## 6. Contraste (WCAG AAA é regra do projeto)

Medido com a fórmula WCAG a partir das cores do protótipo:

| Par | Razão | Resultado | Correção sugerida |
|---|---|---|---|
| Texto principal `#f4f2f8` / card `#1b1728` | 15,76 | AAA | — |
| Texto secundário `#a29cb3` / card | 6,62 | **só AA** | subir a luminosidade (ex.: `#b3aec2`) |
| Texto secundário / superfície interna `#231d33` | 6,13 | **só AA** | idem |
| "com base em" / escopo `#7a7488` / card | 3,90 | **falha** | usar o texto secundário corrigido |
| Branco / botão primário `#9b5de5` | 4,13 | **falha** | texto escuro no botão, ou primária mais escura no fundo do botão |
| Rótulo roxo `#9b5de5` ("TURMA SELECIONADA") / card | 4,24 | **falha** | usar `#c1a7ec` (8,34 — AAA) |
| Iniciais escuras `#1b1120` / avatares Survivor, Conqueror, Mastermind, Daredevil | 2,7 – 3,7 | **falha** | iniciais brancas nesses perfis (decidir a cor do texto pela luminância do fundo) |
| Vermelho `#e2574c` (números de erro) / card | 4,75 | só AA | usar `#f0847c` (6,91 — AA; subir mais para AAA) |
| Item ativo `#4fd1c5` / sidebar | 10,01 | AAA | — |
| Verde, amarelo, azul de tom / card | 7,7 – 9,9 | AAA | — |

Regra do CLAUDE.md para corrigir: **elevar a luminosidade HSL** da cor, nunca misturar com branco.

Cores de perfil no protótipo: batem com as oficiais de `microservice/src/constants/brainHex.ts`, **exceto Survivor** (protótipo `#5c6875`, oficial `#4e5a66`). Usar a oficial. E `StudentTrailVisualization.tsx:24-32` precisa passar a usar as oficiais também.

---

## 7. O que do protótipo NÃO deve ir para a tela real

1. **Seletor "Pré-visualização de estado"** (62-68) — ferramenta para ver os estados no protótipo, marcada `dev-only`.
2. **Botão "Ver status do serviço"** (135) — não existe página de status.
3. **Links da sidebar para telas que ainda não existem** (Missões, Notas, Eventos, Rank de batalhas, Conquistas) — entram com cada tela.
4. **Todos os números e nomes** (Marina Corrêa, Física I, "34 alunos", "18,5%"…) — fictícios, do script do protótipo.
5. **Bug do protótipo:** o link "Ver o que pode ajudar — Intervenções do professor →" leva para a aba **Perfil BrainHex** (`goToInterventions: stuTab: 1`, linha 1122), mas as intervenções ficam na aba **Trilha visual** (775-797). Na tela real, o link deve ir para Trilha visual.

---

## 8. Decisões que precisam do time

1. **Meta de progresso esperado** ("60% esperado nesta semana"): de onde vem? Configuração por turma, calendário do tópico, ou tira a marca?
2. **Metas das métricas** (70% acertos, 15% abandono): constantes globais ou configuráveis por turma?
3. **Faixas de nota**: manter as da view atual ou mudar para as 4 do protótipo (9–10, 7–8, 5–6, 0–4)?
4. **Detalhe do aluno**: como guardar o aluno aberto na URL?
5. **Trilha visual**: a "Jornada real" substitui Hexágonos / Lista ou vira um modo a mais? (recomendação: modo a mais)
6. **Tokens**: estilo novo só no console (`.console-shell`) ou no sistema inteiro?
7. **Apagar `frontend/src/components/dashboard/`** (código morto, 1530 linhas)?

---

## 9. Valores padrão adotados nos prompts

Para os prompts da seção 11 poderem ser executados sem esperar reunião, cada decisão da seção 8 tem um valor padrão abaixo. **Se o time decidir diferente, troque o valor aqui antes de rodar a fase correspondente** — os prompts mandam ler esta seção.

| # | Decisão | Valor padrão | Por quê | Afeta a fase |
|---|---|---|---|---|
| 1 | Meta de progresso esperado | **Sem marca de meta** na barra de "Conclusão média" até existir fonte real | Não há dado de progresso esperado; desenhar a marca seria inventar número | 2 |
| 2 | Metas das métricas | **Constantes num único arquivo** (`frontend/src/components/console/dashboard/metas.ts`): acertos 70%, abandono 15% | Valores do protótipo, fáceis de trocar num lugar só; configuração por turma fica para depois | 2 |
| 3 | Faixas de nota | **As que a view `vw_metricas_distribuicao_turma_classe` devolver** — só muda o visual | A base prevalece; mudar faixa é mudar view | 3 |
| 4 | Aluno aberto na URL | **Query string: `/console?aluno=<alunoId>`** | `consoleSections.ts` trata o primeiro segmento depois de `/console` como uma seção do menu; `/console/alunos/:id` exigiria um item "alunos" no menu. A query string mantém o dashboard em `/console`, funciona com o voltar do navegador e com link compartilhado | 4 |
| 5 | Jornada real | **Modo a mais** ao lado de Hexágonos e Lista | A base prevalece | 9 |
| 6 | Escopo dos tokens | **Só dentro de `.console-shell`** | Páginas públicas e app do aluno não entram neste redesign | 1 |
| 7 | `components/dashboard/` | **Apagar**, depois de conferir de novo com busca que nada importa | Código morto; o git guarda o histórico | 2 |

---

## 10. Fases de implementação (da mais fácil para a mais difícil)

| Fase | Nome | Dificuldade | Categoria | Backend | Depende de |
|---|---|---|---|---|---|
| 1 | Fundação visual do console | Fácil | 🎨 | não | — |
| 2 | Visão geral da turma: estrutura, indicadores e estados | Fácil–média | 🔧 🎨 🗑️ | não | 1 |
| 3 | Gráficos e tabela de alunos | Média | 🎨 🔧 ➕ | não | 2 |
| 4 | Detalhe do aluno como página | Média | 🔧 🎨 🗑️ ➕ | não | 1 (cores de perfil da 3) |
| 5 | "Precisam de atenção" e abandono por aluno | Média–difícil | ➕ | leitura de views existentes | 3, 4 |
| 6 | Aba Conteúdo | Difícil | ➕ | consulta nova no banco | 2 |
| 7 | Aba Evolução | Difícil | ➕ | consulta nova no banco | 6 (navegação por abas) |
| 8 | Aba Insights | Difícil | ➕ | migration + RLS + endpoint de IA | 6 |
| 9 | Jornada real do aluno + intervenções por passo | Muito difícil | ➕ | modelagem de eventos + tabela nova | 4 |
| 10 | Escriba | Muito difícil | ➕ | endpoint de IA com contexto da turma | 1 |

**Fases 1 a 4** deixam a tela com a cara do protótipo usando só dado que já existe. **Fases 5 a 10** trazem funcionalidade nova e cada uma depende de dado ou de backend novo.

Cada fase = **uma branch, um PR**. Nenhuma fase faz merge (regra do `CLAUDE.md`).

---

## 11. Prompts de cada fase

### 11.0 Regras comuns (todos os prompts mandam ler esta seção)

**As três referências obrigatórias**

1. **Protótipo principal:** `prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html`.
   Enquanto o PR #256 não estiver no `main`, o arquivo não existe no checkout. Leia com:
   `git fetch origin redesign/14-prototipo-v9 && git show "origin/redesign/14-prototipo-v9:prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html"`
   O HTML tem duas partes: a marcação (linhas 1-880, com `sc-if`/`sc-for` e `{{ }}`) e o script com os dados e a lógica (linhas 883-1205). Os valores de estilo estão inline no `style=`.
2. **Tela atual:** `frontend/src/components/console/DashboardSection.tsx` (a tela), `frontend/src/components/console/ConsoleShell.tsx` (moldura), `frontend/src/pages/Console.tsx` e `frontend/src/pages/consoleSections.ts` (roteamento), `frontend/src/components/console/useTurmaKpis.ts`, `frontend/src/lib/turmaResumo.ts`, `frontend/src/components/console/StudentTrailVisualization.tsx`, `frontend/src/styles/page-surfaces.css`, `frontend/src/index.css`.
3. **Especificação:** este arquivo, `docs/frontend/redesign-fase-2/01-analise-dashboard.md` — seções 4 (inventário), 5 (tokens), 6 (contraste), 7 (o que não levar) e 9 (valores padrão).

**Regras de conteúdo**

- A **estrutura e o conteúdo da tela atual são a base**; o protótipo manda no **estilo**. Nada que existe hoje some, a não ser o que a seção 4 marca com 🗑️.
- Nomes, ícones e textos da tela atual continuam valendo quando o protótipo não traz substituto claro.
- **Nenhum dado fictício do protótipo entra no código** (nomes de alunos, "Física I", "34 alunos", percentuais). Os itens da seção 7 não entram.
- **Sem dado, sem número.** Onde a fonte não existe, mostre estado vazio explícito ("Sem dados ainda"), como `DashboardSection` já faz com `hasAlunoKpis` / `hasTurmaKpis`. Nunca desenhe valor inventado.

**Regras do projeto (`CLAUDE.md`)**

- **Só abrir PR. Nunca fazer merge**, push direto no `main` ou qualquer caminho que faça o `main` avançar.
- Encoding **UTF-8 sem BOM** em todo arquivo com texto em português.
- **Contraste WCAG AAA** em todo texto. Para corrigir uma cor, **eleve a luminosidade HSL**, nunca misture com branco (seção 6 tem os pares que falham).
- **Regra de fronteira:** leitura, CRUD e agregação que não usam modelo de linguagem vão **direto do console para o Supabase**, nunca por endpoint novo na API. Só geração com IA vai para a API.
- View nova nasce com `security_invoker = on`. Policy nova usa os helpers `SECURITY DEFINER` (`app_classes_do_professor()`, `app_alunos_do_professor()`…).
- Migration nova **não é aplicada** pela sessão: fica no PR para o time rodar `alembic upgrade head`.
- `text()` do SQLAlchemy: `CAST(:param AS tipo)`, nunca `:param::tipo`. `COALESCE` com coluna enum: `coluna::text` antes.

**Verificação antes de abrir o PR** (no diretório `frontend/`)

- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run lint`
- `npm test` (inclui `src/components/pageSurfaces.test.ts`, que testa o `ConsoleShell`)
- `npm run dev` e **abrir `/console` no navegador**: conferir a tela com dados, sem turma, com erro de rede (desligar a rede no DevTools) e em largura de celular (~400px). Se não for possível abrir o navegador, dizer isso explicitamente no PR em vez de afirmar que funciona.

**Entrega**

- Branch a partir do `main` atualizado. Commits com a mensagem explicando o porquê.
- PR com: o que mudou, o que ficou de fora e por quê, e os itens da seção 4 que a fase cobre.

---

### Fase 1 — Fundação visual do console

```text
Implemente a Fase 1 do redesign do dashboard do console do professor: a fundação visual.

Antes de começar, leia a seção 11.0 (regras comuns) e as seções 4.1, 5, 6 e 9 de
docs/frontend/redesign-fase-2/01-analise-dashboard.md.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  (se não estiver no main, leia pelo git show descrito na seção 11.0).
  Moldura: linhas 20-60 (fundo, topbar, sidebar) e 969-976 (estilo do item ativo).
- Tela atual: frontend/src/components/console/ConsoleShell.tsx,
  frontend/src/styles/page-surfaces.css (linhas 64-87), frontend/src/index.css (linhas 10-33).

O que fazer:
1. Criar os tokens de cor da seção 5 com escopo em .console-shell (valor padrão 6 da seção 9):
   fundo da página, card, superfície interna, borda, primária, texto de destaque roxo, destaque
   teal do item ativo, texto, texto secundário, sucesso, atenção, info, perigo e bronze.
   Aplique já as correções de contraste da seção 6 (texto secundário, rótulo "com base em",
   rótulo roxo, texto sobre o botão primário). Redefina as variáveis que os componentes shadcn
   usam (--background, --card, --primary, --border etc.) dentro de .console-shell, para os
   componentes existentes herdarem o visual sem reescrita.
2. Raio: cards 20px, cards pequenos 16px, caixas internas 12-14px, botões e chips em pílula.
3. Títulos de card e de seção em Cinzel 700 dentro do console: remover a regra que força Inter
   (page-surfaces.css:86). A fonte já está carregada (index.html:20).
4. Topbar e sidebar no estilo do protótipo: divisor entre a marca e "Console do professor",
   "TrailUp" em Cinzel, avatar roxo sólido com iniciais, sidebar de 264px, item ativo em teal com
   fundo translúcido e sem borda. Manter os 7 itens atuais do menu e a regra de Aprovações só
   para a dona — NÃO acrescentar Missões, Notas, Eventos, Rank de batalhas, Conquistas (seção 7).
5. Fundo: trocar a imagem por bg-forest-crystal.webp (copiar de prototipos/professor/v9/assets/
   para frontend/src/assets/design/ e registrar em DESIGN_ART) com opacidade e gradiente do
   protótipo.
6. Manter o layout responsivo que já existe (page-surfaces.css:97-133).

Fora do escopo: qualquer mudança dentro do DashboardSection além do que herdar dos tokens;
Escriba; itens novos no menu.

Critérios de aceite:
- Todas as seções do console herdam o visual novo sem quebrar (abrir cada item do menu).
- Página pública (/) e app do aluno não mudam.
- Nenhum texto abaixo de 7:1 nas cores novas.
- pageSurfaces.test.ts passa.

Branch: feat/console-fase-1-fundacao-visual. Abra o PR, não faça merge.
```

### Fase 2 — Visão geral da turma: estrutura, indicadores e estados

```text
Implemente a Fase 2 do redesign do dashboard: estrutura, indicadores e estados da visão da turma.

Antes de começar, leia a seção 11.0 e as seções 2.3, 4.2, 4.3 e 4.5 (só "KPIs principais" e
"KPIs secundários") e 9 de docs/frontend/redesign-fase-2/01-analise-dashboard.md.
A Fase 1 (tokens) já deve estar no branch base.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Cabeçalho e seletor de turma: 72-92. Estados: 95-139. KPIs: 154-177 e 207-221.
  Dados de exemplo dos KPIs (só para ver o formato, não copiar valores): 995-1006.
- Tela atual: frontend/src/components/console/DashboardSection.tsx
  Cabeçalho 481-505, KPIs 507-613, filtros 389-413 e 711-734, estados 736-800.

O que fazer:
1. Quebrar DashboardSection.tsx em componentes numa pasta
   frontend/src/components/console/dashboard/ (cabeçalho, KPIs, estados, e o que mais fizer
   sentido). Mesmo comportamento de carga de dados — não reescreva loadData nem useTurmaKpis.
2. Cabeçalho: tirar o título "Dashboard de Alunos" e colocar o bloco "TURMA SELECIONADA" com o
   seletor de turma (o filtro de classe que hoje está no card da lista sobe para cá, mesmo
   estado selectedClassFilter), nome da turma ou "Todas as turmas" e "N turmas · N alunos".
3. A busca por nome passa a filtrar SÓ a tabela. Os KPIs passam a depender só da turma
   selecionada (hoje dependem da busca — seção 2.3, item 1).
4. Janela temporal em pílulas segmentadas, mantendo as 4 opções atuais. Continua sem filtrar
   (manter o comentário que explica a dependência da #12). Acrescentar "Atualizado há X min"
   com a hora da última carga bem-sucedida.
5. KPIs principais (3): Total de alunos, Média de notas, Conclusão média com barra de progresso.
   Sem marca de meta na barra (valor padrão 1 da seção 9). Selo de variação só se houver dado
   real; senão, não mostrar.
6. KPIs secundários (4): Taxa de acertos (desce da linha 1), Abandono médio, Chat após erro,
   Tempo médio de uso — com barra e frase de tom (Bom / Atenção / Informativo) comparando com
   as metas de frontend/src/components/console/dashboard/metas.ts (valor padrão 2).
   Não mostrar mediana nem "estável vs período anterior" (não há dado).
7. Apagar a segunda "Conclusão média" (575-586).
8. Estados de página inteira: carregando (skeleton com shimmer + frase), vazio (com links para
   /console/turmas e /console/trilha) e erro (bloco vermelho com "Tentar novamente" chamando
   loadData). Sem o botão "Ver status do serviço" e sem o seletor de pré-visualização (seção 7).
9. Apagar frontend/src/components/dashboard/ (valor padrão 7), depois de confirmar com busca que
   nada importa esses arquivos.

Fora do escopo: gráficos e tabela (Fase 3), detalhe do aluno (Fase 4), abas da turma, bloco
"Precisam de atenção".

Critérios de aceite:
- Digitar na busca não muda nenhum KPI.
- Trocar a turma muda KPIs, gráficos e tabela.
- Sem turma cadastrada → estado vazio de página; erro de rede → estado de erro com retry.
- Nenhum KPI mostra 0 fabricado quando não há dado.
- Teste unitário para a função que decide o tom de cada métrica em relação à meta.

Branch: feat/dashboard-fase-2-estrutura-indicadores. Abra o PR, não faça merge.
```

### Fase 3 — Gráficos e tabela de alunos

```text
Implemente a Fase 3 do redesign do dashboard: os dois gráficos e a tabela de alunos.

Antes de começar, leia a seção 11.0 e as seções 4.5 ("Abandono por perfil", "Distribuição de
notas", "Alunos da turma"), 6 e 9 de docs/frontend/redesign-fase-2/01-analise-dashboard.md.
As Fases 1 e 2 já devem estar no branch base.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Abandono por perfil: 224-250 (cores e ordem: 1016-1019). Rosca de notas: 252-273
  (1021-1027). Tabela: 276-330 (1029-1043).
- Tela atual: frontend/src/components/console/DashboardSection.tsx 615-804 (ou os componentes
  que a Fase 2 extraiu).
- Cores oficiais dos perfis: microservice/src/constants/brainHex.ts (fonte da verdade, ver
  CLAUDE.md). Variantes clareadas para texto: frontend/src/features/signup/brainhex.ts.

O que fazer:
1. Criar um módulo único de cores de perfil no frontend (ex.:
   frontend/src/components/console/dashboard/perfilCores.ts) espelhando as cores oficiais do
   microservice. Cor oficial para marcas (barra, bolinha, fundo de avatar); variante com
   contraste AAA para texto na cor do perfil. Survivor usa a oficial (#4e5a66), não a do
   protótipo. Cor do texto das iniciais do avatar decidida pela luminância do fundo (seção 6).
2. Abandono por perfil (continuar com recharts): barras em ordem fixa dos 7 perfis, cada barra
   na cor do perfil (Cell), valor em cima, bolinha + nome embaixo, linha tracejada de média
   (ReferenceLine com turmaResumo.taxa_media_abandono_pct), sem eixos. Manter o filtro
   Majoritário / 2º perfil / Afinidade ≥ 20% com visual de pílula.
3. Distribuição de notas: rosca com a média de notas no centro e legenda com contagem por faixa.
   Faixas = as da view (valor padrão 3). Cor por NOME da faixa, não por índice
   (hoje 684-689). Sem a frase "N alunos na faixa baixa concentram X% do abandono" (depende de
   abandono por aluno — Fase 5).
4. Tabela "Alunos da turma":
   - avatar com iniciais na cor do perfil + nome + e-mail;
   - chip de perfil com bolinha e texto na cor do perfil;
   - nota, barra de progresso, acertos no estilo do protótipo;
   - coluna Classe visível só com "Todas as turmas" selecionado;
   - SEM coluna Abandono por enquanto (Fase 5);
   - filtro "Todos os perfis" ao lado da busca;
   - linha inteira clicável abrindo o aluno, com foco por teclado e Enter/Espaço funcionando
     (continua abrindo o modal atual — a Fase 4 troca por página);
   - paginação de 8 por página com "Mostrando X de Y alunos" + Anterior / Próxima.

Fora do escopo: detalhe do aluno, abandono por aluno, bloco "Precisam de atenção".

Critérios de aceite:
- As 7 cores de perfil saem de um lugar só.
- Mudar o filtro de segmento continua mudando o gráfico de abandono.
- Tabela navegável só com teclado.
- Testes unitários para a paginação/filtro e para a escolha da cor do texto do avatar.

Branch: feat/dashboard-fase-3-graficos-tabela. Abra o PR, não faça merge.
```

### Fase 4 — Detalhe do aluno como página

```text
Implemente a Fase 4 do redesign do dashboard: o detalhe do aluno deixa de ser modal e vira página.

Antes de começar, leia a seção 11.0 e as seções 2.3 (itens 4, 5 e 6), 4.9 e 9 de
docs/frontend/redesign-fase-2/01-analise-dashboard.md.
As Fases 1 e 3 (módulo de cores de perfil) já devem estar no branch base.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Voltar + cabeçalho do aluno: 545-577. Abas: 579-583. Visão geral: 585-655.
  Perfil BrainHex: 657-686. Trilha visual: 688-800 (só como referência de estilo; a jornada é
  da Fase 9). Personalização: 802-841.
- Tela atual: frontend/src/components/console/DashboardSection.tsx 806-1213 (modal e abas),
  frontend/src/components/console/StudentTrailVisualization.tsx.

O que fazer:
1. O aluno aberto fica na URL como /console?aluno=<alunoId> (valor padrão 4). Abrir um aluno
   troca a visão da turma pela do aluno; o voltar do navegador e o botão "← <turma> · todos os
   alunos" retornam. Recarregar a página com ?aluno= abre direto no aluno.
2. Cabeçalho do aluno: avatar na cor do perfil, nome em Cinzel, e-mail, chip do perfil
   dominante, e como texto secundário Classe e Modo de operação (não somem — base).
   Números: Nota média, Trilha concluída, Acertos, Tempo total (o dado atual). Abandono e data
   de matrícula só se houver fonte confirmada; senão, não mostrar.
3. Abas em pílula, mesmos 4 nomes de hoje.
4. Visão geral: gráfico de evolução mantendo as 3 séries atuais, no estilo do protótipo, e com
   a linha tracejada da média da turma se der para calcular com
   vw_metricas_evolucao_desempenho_aluno_dia (todos os alunos da classe) sem endpoint novo.
   Cartão "Última atividade" no estilo novo com o dado que existe hoje (só o nome).
   Sem cartões "Atenção" e "Sinal de atenção" (Fase 5).
5. Perfil BrainHex: barras na cor de cada perfil + cartão do perfil dominante com descrição e
   etiquetas vindas do que já existe no frontend (features/signup/brainhex.ts / DESIGN_ART).
   Não inventar texto.
6. Trilha visual: manter Hexágonos / Lista, restilizar, trocar PROFILE_COLORS de
   StudentTrailVisualization pelas cores oficiais (módulo da Fase 3) e remover o XP inventado
   (xp = porcentagem * 10 de 1000). Se houver XP real acessível pelo Supabase, usar; senão,
   não mostrar barra de XP.
7. Personalização: apagar o dump de JSON de contexto_aluno (1053-1057). Manter chips de perfil,
   modo de operação, histórico de personalizações e tabela de progresso dos itens, no estilo
   novo. Acrescentar "Consumo total" (% de itens concluídos sobre os gerados, a partir de
   progresso_itens que a tela já carrega) e a lista de material por tópico com barra e status.
   Ações (regerar / ver / descartar) ficam fora desta fase.

Fora do escopo: jornada real, intervenções por passo, sinal de atenção, ações de personalização.

Critérios de aceite:
- Nenhuma informação que o modal mostrava some (conferir item por item contra 824-1209),
  exceto o JSON cru.
- /console?aluno=<id> abre direto no aluno; voltar do navegador funciona.
- Teste unitário para o cálculo do consumo total.

Branch: feat/dashboard-fase-4-detalhe-aluno. Abra o PR, não faça merge.
```

### Fase 5 — "Precisam de atenção" e abandono por aluno

```text
Implemente a Fase 5 do redesign do dashboard: o bloco "Precisam de atenção", a coluna de
abandono por aluno e o "Sinal de atenção" no detalhe do aluno.

Antes de começar, leia a seção 11.0 e as seções 4.5 ("Bloco Precisam de atenção", coluna
Abandono da tabela, frase da rosca) e 4.9 (cartões de atenção da Visão geral do aluno) de
docs/frontend/redesign-fase-2/01-analise-dashboard.md. Leia também
prototipos/professor/prompts/fase-2/novas-telas/08-sinal-de-risco-de-reprovacao.md
(no branch da reorganização, PR #257, se ainda não estiver no main).

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Bloco: 179-205 (dados 1008-1014). Coluna Abandono: 316-319. Frase da rosca: 272.
  Cartões do aluno: 625-652. Link "Intervenções do professor" (1122) tem bug — seção 7, item 5.
- Tela atual: os componentes extraídos nas Fases 2-4.

Passo 1 — descobrir o dado (antes de escrever UI):
- Descobrir as colunas reais de vw_metricas_engajamento_aluno_classe,
  vw_metricas_comportamento_aluno_classe e vw_metricas_desempenho_aluno_classe (consulta
  select * limit 1 pelo cliente Supabase autenticado como professor, ou pelos tipos gerados).
- Descobrir a melhor fonte para "dias sem atividade" (aluno_atividade_diaria ou
  telemetria_sessoes) e se classe_aluno tem data de matrícula.
- Registrar o resultado no PR. Se não conseguir acessar o banco, PARAR e pedir as colunas em
  vez de supor nomes.

Passo 2 — implementar só o que o dado sustenta:
1. Função pura (com testes) que classifica cada aluno em Crítico / Atenção / nenhum, com os
   critérios do protótipo: abandono > 30%, nota < 5,0, progresso 20 pontos abaixo do previsto,
   7 dias sem atividade. Critério sem fonte fica desligado (e o texto do critério no bloco só
   lista os critérios ligados). "Progresso abaixo do previsto" fica desligado (seção 9, valor 1).
2. Bloco "Precisam de atenção" entre os KPIs principais e os secundários, só com alunos
   classificados; some quando não houver nenhum. Cada linha abre o aluno (Fase 4).
3. Coluna Abandono na tabela com rótulo saudável / atenção / crítico — só se houver abandono
   por aluno.
4. No detalhe do aluno: cartão "Sinal de atenção" com os fatores que dispararam, aviso
   "Visível só para você" e o link levando para a aba Trilha visual (não Perfil BrainHex).
5. Frase da rosca ("N alunos na faixa baixa concentram X% do abandono") só se houver abandono
   por aluno.

Fora do escopo: criar view ou migration nova. Se faltar dado essencial, descreva no PR o que
seria preciso e pare nisso.

Branch: feat/dashboard-fase-5-precisam-de-atencao. Abra o PR, não faça merge.
```

### Fase 6 — Aba Conteúdo

```text
Implemente a Fase 6 do redesign do dashboard: a navegação por abas da visão da turma e a aba
Conteúdo.

Antes de começar, leia a seção 11.0 e as seções 4.4 e 4.7 de
docs/frontend/redesign-fase-2/01-analise-dashboard.md.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Abas: 144-148 e 989-993. Aba Conteúdo: 407-461 (formato dos dados: 1059-1071).
- Tela atual: componentes das Fases 2 e 3.
- Banco: conteudos, conteudo_aluno, personalizacao_item_progresso, questoes,
  atividade_aluno. Regras de progresso em CLAUDE.md, seção "Progresso".

O que fazer:
1. Abas em pílula no topo da visão da turma. Nesta fase só "Visão geral" (tudo o que existe) e
   "Conteúdo". Evolução e Insights entram quando as fases 7 e 8 existirem — não criar aba vazia.
   A aba ativa fica na URL (ex.: ?aba=conteudo), no mesmo padrão da Fase 4.
2. Fonte de dados: uma consulta por conteúdo da turma com consumo (alunos que abriram / total),
   conclusão (% que concluiu) e, se der para ligar questões ao conteúdo, taxa de erro.
   Pela regra de fronteira, NADA de endpoint novo na API: ou consulta direta pelo cliente
   Supabase, ou uma view nova via migration Alembic com security_invoker = on (não aplicar).
   Documente no PR qual caminho foi escolhido e por quê.
3. Tabela "Conteúdo por tópico": conteúdo + tópico, formato, consumo (barra + "N de M alunos"),
   dificuldade (% de erro com cor por faixa e comparação com a média), conclusão.
   Coluna sem fonte = não mostrar.
4. Três cards de destaque (mais consumido, maior dificuldade, maior conclusão) derivados da
   tabela por uma função pura com testes. Frases de leitura só quando derivadas do dado
   (ex.: "pior que a média da turma (X%)"); nada de texto interpretativo fixo.

Branch: feat/dashboard-fase-6-aba-conteudo. Abra o PR, não faça merge.
```

### Fase 7 — Aba Evolução

```text
Implemente a Fase 7 do redesign do dashboard: a aba Evolução da visão da turma.

Antes de começar, leia a seção 11.0 e a seção 4.6 de
docs/frontend/redesign-fase-2/01-analise-dashboard.md. A navegação por abas da Fase 6 já deve
estar no branch base.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Aba Evolução: 334-405 (formato dos dados: 1045-1057). O gráfico do protótipo é SVG fixo;
  na tela real use recharts (ComposedChart com Line + Bar).
- Tela atual: componentes das Fases 2, 3 e 6.
- Dado: vw_metricas_evolucao_desempenho_aluno_dia (já usada no detalhe do aluno, por aluno por
  dia), atividade_aluno (entregas por data).

O que fazer:
1. Série semanal da turma: agregar a view por semana e pela turma selecionada (nota média e
   progresso médio) e contar atividades entregues por semana. Sem endpoint novo na API
   (consulta direta ou view nova com security_invoker = on, via migration não aplicada).
   Agregação em função pura com testes (semana começando na segunda, turma sem dado na semana
   = ponto ausente, não zero).
2. Gráfico: linha de conclusão (%), linha tracejada de nota (0-10, eixo próprio), barras de
   atividades entregues, legenda do protótipo. Sem a anotação "semana da prova" (não há fonte).
3. 4 KPIs de evolução (conclusão, nota, entregas, abandono) com delta calculado da própria série
   (último período × anterior). Se o abandono não tiver série, não mostrar o delta dele.
4. "Mudanças relevantes": só eventos determinísticos com fonte no banco, se existirem com data
   (ex.: material regerado em personalizacao_jobs). Sem leitura interpretativa gerada por IA
   nesta fase. Se nenhuma fonte servir, deixe o bloco de fora e registre no PR.
5. Abrir a aba "Evolução" entre "Visão geral" e "Conteúdo", como no protótipo.

Branch: feat/dashboard-fase-7-aba-evolucao. Abra o PR, não faça merge.
```

### Fase 8 — Aba Insights

```text
Implemente a Fase 8 do redesign do dashboard: a aba Insights, com sugestões e observações da IA
que o professor aceita ou ignora.

Antes de começar, leia a seção 11.0 e a seção 4.8 de
docs/frontend/redesign-fase-2/01-analise-dashboard.md, e também
prototipos/professor/prompts/fase-1/revisao-04-problemas-pontuais/05-dashboard-historico-de-sugestoes-e-intervencoes-da-ia.md
(no branch do PR #257 se ainda não estiver no main).

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Aba Insights: 464-538. Dados e comportamento: 884-890 e 1154-1185.
- Tela atual: componentes das Fases 2, 6 e 7.
- Banco: tabela intervencoes (api/alembic/versions/20260829_03_rag_schema_pgvector.py:101-113),
  hoje sem nenhum uso. Pipeline de análise: api/app/services/linear_analysis_pipeline.py.

Esta fase atravessa três camadas. Pode ser dividida em dois PRs (banco+API, depois frontend).

1. Banco (migration Alembic, não aplicar):
   - acrescentar a intervencoes o que falta para o protótipo: classe_id, escopo
     (turma | aluno), natureza (sugestao | observacao), texto, base ("com base em"), motivo de
     ignorar (ou usar contexto jsonb — justificar a escolha);
   - aluno_id passa a aceitar nulo quando o escopo for turma;
   - RLS: professor lê e atualiza (status, motivo) só das classes dele, usando
     app_classes_do_professor(); aluno não lê.
2. API (é IA, então é o lugar certo): endpoint que gera sínteses para uma turma a partir dos
   dados que o pipeline já lê, grava em intervencoes e devolve o status. Tratar a API fria /
   hibernando: o console mostra o último resultado do banco e dispara a geração em segundo
   plano (mesmo padrão que personalizacoesApi.ts usa para classe_perfil_summary — ver CLAUDE.md).
3. Frontend:
   - listar do Supabase direto; filtro Tudo / Turma / Alunos;
   - Aceitar → status applied; Ignorar → motivos opcionais (Já resolvido / Não se aplica
     agora / Vou revisar depois) → status dismissed + motivo; tudo direto no Supabase;
   - "Gerado há X", "X% das sugestões aceitas nos últimos 30 dias" calculado do banco,
     "Atualizar agora" chamando o endpoint;
   - estados gerando / vazio / com dados / erro;
   - "Ver detalhe" da observação: se não houver destino real, não mostrar o botão.

Critérios de aceite:
- Sem API no ar, a aba ainda lista o que já foi gerado.
- Professor de outra turma não vê as intervenções desta (testar a policy).
- Testes na API para a geração (com o modelo mockado) e no frontend para o cálculo de aceitação.

Branch: feat/dashboard-fase-8-aba-insights. Abra o PR, não faça merge.
```

### Fase 9 — Jornada real do aluno e intervenções por passo

```text
Implemente a Fase 9 do redesign do dashboard: a "Jornada real" do aluno na aba Trilha visual e
as intervenções do professor por passo.

Antes de começar, leia a seção 11.0 e a seção 4.9 ("Aba Trilha visual") de
docs/frontend/redesign-fase-2/01-analise-dashboard.md. Esta é a fase mais cara: comece por um
documento de desenho curto e só depois implemente.

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Jornada: 688-800. Estrutura de cada passo e tipos de desvio: 891-910. Lógica dos conectores
  (seguiu / voltou / pulou / repetiu): 1076-1123. Histórico de intervenções: 913-918, 1195-1202.
- Tela atual: detalhe do aluno da Fase 4, StudentTrailVisualization.tsx.
- Banco (fontes candidatas dos passos): conteudo_aluno, atividade_aluno,
  personalizacao_item_progresso, telemetria_lotes / telemetria_sessoes, respostas às questões.
  Atenção às regras de telemetria no CLAUDE.md (dwell/active/idle são por lote; filtrar por scope).

1. Desenho (docs/frontend/redesign-fase-2/02-desenho-jornada-real.md): de onde vem cada campo do
   passo (conteúdo acessado, atividade, resposta dada × esperada, resultado, tempo, tentativa,
   ordem, progresso), como detectar retorno / fora de ordem / repetição / abandono, e o que
   NÃO dá para obter. Abra o PR só com esse documento se houver lacuna que exija decisão.
2. Banco (migration não aplicada):
   - view da sequência de passos por aluno (security_invoker = on), se a montagem no cliente
     ficar pesada;
   - tabela nova de comentários do professor por passo (professor_id, aluno_id, classe_id,
     referência estável do passo, texto, created_at), com RLS via helpers — professor só nas
     classes dele; aluno não lê.
3. Frontend: "Jornada" como terceiro modo ao lado de Hexágonos e Lista (valor padrão 5):
   passos em ordem cronológica, conectores, chips de desvio, painel do passo selecionado com
   só os campos que têm fonte, e "Intervenções do professor neste passo" (salvar e listar
   direto no Supabase). Sugestões da IA no histórico só se vierem de intervencoes (Fase 8).
   "Ver conteúdo entregue" e "Abrir conversa do chat" só se houver destino real.
4. Detecção de desvios em função pura com testes cobrindo os casos da linha 891-901 do protótipo.

Branch: feat/dashboard-fase-9-jornada-real. Abra o PR, não faça merge.
```

### Fase 10 — Escriba

```text
Implemente a Fase 10 do redesign do console: o Escriba, assistente de IA flutuante do professor.

Antes de começar, leia a seção 11.0 e a seção 4.10 de
docs/frontend/redesign-fase-2/01-analise-dashboard.md, e também:
prototipos/professor/prompts/fase-1/revisao-04-problemas-pontuais/06-dashboard-tutor-de-ia-para-o-professor.md
e 14-global-assistente-de-ia-nome-e-persona.md (branch do PR #257 se ainda não estiver no main).

Referências:
- Protótipo: prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html
  Escriba: 847-878 (botão, painel, sugestões rápidas, campo de pergunta).
  Ele aparece em 6 das 7 telas base — não aparece em Aprovações.
- Tela atual: frontend/src/components/console/ConsoleShell.tsx (é aqui que ele mora, não no
  DashboardSection).
- API: grafo em api/app/agent/graph/; leitura de contexto em api/app/repositories/context.py.

1. API: endpoint de conversa do professor que recebe a pergunta e a turma selecionada, monta o
   contexto com os mesmos dados agregados que o dashboard mostra (views de métricas), e responde
   só sobre as turmas do professor autenticado. Sem gravar nada no banco nesta fase, a não ser
   que o time peça histórico.
2. Frontend: botão flutuante bronze no ConsoleShell (fora de Aprovações), painel com cabeçalho
   "Escriba · O guia do professor", mensagem inicial, sugestões rápidas que enviam a pergunta,
   campo com envio por Enter, estado "pensando", erro amigável quando a API estiver fria
   (a API do Render hiberna — CLAUDE.md). Contraste AAA no bronze (seção 6).
3. Acessibilidade: abrir/fechar por teclado, foco preso no painel aberto, Esc fecha,
   aria-live nas respostas.

Critérios de aceite:
- Pergunta sobre turma de outro professor é recusada pela API (teste).
- Console continua utilizável com a API fora do ar.

Branch: feat/console-fase-10-escriba. Abra o PR, não faça merge.
```

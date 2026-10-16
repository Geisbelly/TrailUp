# Análise — as 5 telas novas do console (Missões, Notas, Eventos, Rank de batalhas, Conquistas)

> Só análise e plano. Nenhum código de tela foi escrito.
>
> **Protótipos (V9):** `prototipos/professor/v9/Console Missoes|Notas|Eventos|Rank de Batalhas|Conquistas (Fase 2).dc.html`, lidos pelo roteiro de telas, estados e dados fictícios.
> **Prompts de origem e correções:** `prototipos/professor/prompts/fase-2/novas-telas/00` a `17`.
> **Código e banco conferidos:** `api/alembic/versions` (inclusive `20260909_01`, `20260909_03`, `20260912_*`), `frontend/src/integrations/supabase/types.ts` (tipos gerados do banco real), `docs/architecture/schema-nao-versionado.md`, console (`consoleSections.ts`, `ConsoleShell.tsx`, `trilha/`, `RanksSection.tsx`, `PresencaDialog.tsx`), mobile (`ActivityRenderer`, `QuestionActivity`, `essayValidation`), issues #136, #150–#155, #158.
> **Limite desta análise:** não tenho acesso ao banco de produção. Onde o schema é "não versionado" (arena, guildas, colunas de `conquistas`), o que escrevo vem dos tipos gerados e dos documentos, e **precisa ser conferido ao vivo antes de qualquer migration** (seção 7).

---

## 1. O que o protótipo realmente pede

### 1.1 Navegação (as correções vencem os prompts originais)

Os prompts `10` e `11` agruparam as telas em abas; o `12` desfez, porque **"evento e conquistas são coisas diferentes, não deveriam ficar juntos"**. O estado final é **12 itens na barra lateral**: os 7 atuais + Missões, Notas, Eventos, Rank de batalhas e Conquistas.

**Detalhe de como os arquivos V9 são feitos, para ninguém implementar errado:** são só **dois** arquivos de componente reaproveitados — um com Missões + Notas (`mainTab` 0/1) e outro com Eventos + Rank + Conquistas (`mainTab` 0/1/2). A faixa de abas de cima **nunca é desenhada**; o item da barra lateral só escolhe qual painel abre. Ou seja: **cinco telas independentes**, cada uma com a sua rota.

### 1.2 O que ficou fora, por decisão registrada

| Item | Fonte | Situação |
|---|---|---|
| História da turma | prompt `15` | "função para versões futuras" — fora |
| Aprovações de compras / extensão de prazo | prompt `17` | "não é aqui e não precisa de aprovação" — fora (a #144 ainda diz o contrário; o texto da issue está desatualizado) |
| Dashboard com sínteses da IA (`04`) | sem issue | rascunho; **já existe** como aba Insights (`intervencoes`) |
| Sinal de risco (`08`) | #135 | adendo à Visão geral, não tela nova; `dashboard/risco.ts` já existe |
| Vários itens por formato em Personalizações (`13`) | — | tela já existente |

### 1.3 As cinco telas

| Tela | Conteúdo no protótipo |
|---|---|
| **Missões** | Lista (título, selo de tempo, turma·tópico, prazo, pontos, entregas x/y, "N aguardando correção" + atalho); sub-aba **Sugestões da IA** (taxa de aprovação, "Pedir sugestões" com quantidade e job assíncrono, cartões Aprovar / Editar antes / Recusar com **motivo obrigatório**); formulário (título, objetivo, turma, tópico opcional, itens vincular/criar, prazo com **"cronômetro por questão" × "sem tempo"** + limite por questão, pontuação, **moedas**, recompensa); duplicar e excluir com confirmação |
| **Notas** | Filtros (turma, tópico/missão, status); fila com "entregue há N dias"; painel de correção (enunciado, resposta ou arquivo, gabarito de referência, nota ≤ máximo, feedback, "isso soma X pontos…"); anterior/próxima; aluno que **não entregou** aparece na fila |
| **Eventos** | Lista (rascunho/aberto/encerrado, participação, guildas); formulário com **modalidades** (individual obrigatória; guilda opcional + tamanho máximo), **"O que este evento inclui"** (5 peças: missões, metas, conquistas do evento, desafios, arena — pelo menos uma), pontuação, moedas, medalhas (participação sempre junto com destaque), recompensa; resumo de confirmação ao abrir (guildas "congeladas"); painel **Durante** (não começaram / pararam / guildas ativas / por modalidade); painel **Resultado** (destaque, % acima da média, medalhas, ranking de guildas separado) |
| **Rank de batalhas** | Arena **só dentro de evento aberto**; critério entre os 3 existentes; inscritos (opt-in); pódio + classificação **sem barra normalizada quando há poucos participantes**; confrontos por proximidade de desempenho; nada de valor negativo |
| **Conquistas** | Teto "12 de 20"; lista (ícone, métrica·limiar, escopo, ativa/desativada); formulário: ícone de conjunto fixo, **cor de paleta ou a do perfil**, **métrica de lista fechada**, escopo geral/perfil (limiar por perfil = uma conquista por perfil), pontos, bônus em moedas; aviso ao editar critério já concedido; **desativar, nunca excluir** |

---

## 2. O que existe hoje (código e banco)

### 2.1 Console

- 7 abas em `consoleSections.ts`, `ConsoleShell.tsx` (`navigation`), rotas geradas da mesma lista em `App.tsx`, seções carregadas por `lazy()` em `Console.tsx`. **Não existe nenhuma das 5 telas, nem rota, nem componente.**
- Padrões prontos para reaproveitar: `AlertDialog` de confirmação (Turmas/Trilhas), formulário inline em cartão (Rankings), tabela + podium (Rankings), fila com chips de status (Personalizações), estado vazio / erro com "tentar de novo" (Aprovações, Turmas), `Escriba` global.
- Regra herdada da análise do Dashboard: **não entra link para página vazia** — cada item da barra só aparece quando a tela existe.

### 2.2 Banco — por tela

**Conquistas (o mais adiantado).** `conquistas` já tem `classe_id`, `criado_por`, `criterio` (jsonb), `escopo`, `perfil_alvo`, `pontos_recompensa`, `icone_url`, `categoria`; `conquistas_aluno` guarda a posse. A `20260909_01` declara as métricas numa lista única (`METRICAS`) e um CHECK recusa critério sem métrica suportada. **As 6 métricas do protótipo já existem**: atividades concluídas, dias seguidos, minutos, acertos %, tópicos visitados (aceita "todos") e conclusão rápida (`atividade_rapida`, `max_tempo`).

**Missões.** Missão = `atividade` com `tipo = 'missao'` (decisão da #150). `atividades` tem `pontuacao_maxima`, `data_entrega`, `metadata`; `atividade_conteudos` e `questoes` dão "itens". Já feito nesta série (PRs #426–#430): lista única de tipos, mobile continua renderizando missão, progresso do tópico conta qualquer tipo, `duplicar_atividade`.

**Notas.** `atividade_aluno` tem `pontuacao_obtida`, `pontuacao_maxima`, `avaliacao_metadata`; `questao_aluno` guarda a resposta; já existe o molde de "professor concede pontos": `registrar_presenca_da_turma` (RPC `SECURITY DEFINER`, confere posse, grava em `eventos_aluno` com `concedido_por`, evento separado por `fn_evento_creditado`).

**Eventos / guildas / arena.** Existem `guildas`, `guilda_membros`, `guilda_config_turma` (tamanho máximo, janela de formação), `guilda_evento_snapshot` (composição congelada, `evento_id` **sem tabela de evento**), `guilda_desafios`, `desafio_participantes`, funções `guilda_*` e `arena_*`, `fn_arena_placar`, `ranks` + `rank_tipo` (3 critérios) e a view `vw_rank_posicoes_por_classe`. **Não existe a entidade evento** (a #152 diz isso literalmente: "Não existe evento").

**Moedas.** `moedas_ledger`, `eventos_pontuacao(_classe).moedas` (por *tipo de evento*), `loja_*`. Não há moeda por tópico, atividade, missão ou evento.

### 2.3 Mobile

Não há nada de missão, evento, nota do professor nem entrega de arquivo. O aluno responde dissertativa e a **IA corrige na hora** (`validate-essay-answer-ai`), gravando em `avaliacao_metadata`. Guildas, desafios e arena existem no app.

---

## 3. Lacunas, tela por tela

### 3.1 Conquistas — ~70% do caminho

| Item | Estado | Categoria |
|---|---|---|
| Lista de conquistas da turma | `conquistas.classe_id` existe nos tipos; leitura por RLS `SELECT true` | 🆕 tela |
| **Escrita pelo professor** | **não há policy de INSERT/UPDATE** (a `20260826_09` diz que o catálogo "é dado de sistema") | 🔧 RPC `SECURITY DEFINER` (molde: presença) |
| Métricas e limiar | lista fechada pronta | 🎨 |
| **Desativar** | não há coluna `ativa`; "excluir" apagaria a posse | 🆕 coluna + o gatilho ignora desativadas |
| **Cor** | não há coluna | 🆕 (paleta fixa em código; cor do perfil vem de `perfilCores`) |
| Teto "20" | não existe | 🆕 `app_config` (padrão a decidir) |
| Bônus em moedas | sem caminho de crédito por conquista | ⛔ depende de decisão (§5) |
| Aviso ao editar critério já concedido | contar `conquistas_aluno` da conquista | 🔧 |
| **O gatilho avalia só as conquistas da turma do aluno?** | `20260909_01` percorre **todas** as conquistas; o filtro por `classe_id` **não está em nenhuma migration** | ⚠️ conferir ao vivo; sem isso, um aluno pode destravar conquista de outra turma |
| Vazamento | `SELECT true` deixa qualquer aluno ler as conquistas de **todas** as turmas | ⚠️ RLS por turma |

### 3.2 Missões

| Item | Estado | Categoria |
|---|---|---|
| Lista / duplicar | `duplicar_atividade` existe; faltam contagem de entregas por missão | 🔧 view/RPC |
| Objetivo, prazo, pontuação | `descricao`, `data_entrega`, `pontuacao_maxima` | 🎨; **`saveActivity` não grava `pontuacao_maxima`** |
| **Missão "sem tópico vinculado"** (aparece no protótipo) | `atividades.topico_id` é **obrigatório** | ⚠️ decisão: coluna `classe_id` opcional ou missão sempre num tópico |
| **Cronômetro por questão, verificado no servidor** | não existe (#136: "timer no cliente é aviso, não regra") | 🆕 grande: configuração + RPC de resposta que recusa fora do prazo + mobile |
| Moedas | não há coluna (`metadata` jsonb é uma saída) | 🆕 decisão |
| Recompensa | texto livre no protótipo; sem modelo | ⛔ decisão |
| **Sugestões da IA** | não existe; é IA, então **é a API** (regra de fronteira), como job assíncrono + cota | 🆕 tabelas + endpoint + tela |
| Motivo da recusa e taxa de aprovação | #151 exige gravar desde a primeira versão | 🆕 tabela de decisões |

### 3.3 Notas

| Item | Estado | Categoria |
|---|---|---|
| **O que é "pendente de correção"** | hoje a IA corrige a dissertativa na hora; **não existe estado "aguardando professor"** | ⛔ decisão (§5) |
| Fila e painel | dados em `questao_aluno` + `atividade_aluno` | 🆕 view para a fila + tela |
| **Gravar a nota** | nenhum caminho: o professor não escreve `pontuacao_obtida` | 🆕 RPC `avaliar_entrega` (molde de presença): posse, nota ≤ máximo, `avaliacao_metadata` com quem e quando, **evento creditado** no rank |
| Trabalho com arquivo | **não há entrega de arquivo no app do aluno** | ⛔ fora, até existir no mobile |
| Aluno que não entregou | não é linha de lugar nenhum; precisa ser calculado (matriculado − entregou, com prazo vencido) | 🔧 |
| Gabarito de referência | `questoes.resposta_correta` | 🎨 |

### 3.4 Eventos (a maior)

Quase tudo é novo: tabela de eventos por turma (janela, status, modalidades, tópico opcional); as **5 peças** (missões ligadas, metas coletivas, conquistas do evento — `conquistas` com `escopo = 'evento'` por decisão da #152 —, desafios, arena); abertura que **congela guildas** (`guilda_congelar_composicao` já existe); apuração individual no rank e agregada fora dele; medalhas de participação **e** destaque; painel "durante" e "resultado". As issues #152–#155 estão **"em planejamento — decisões em aberto"**, e a #152 ainda depende da #138 (presença, já feita) e da #164 (valor do evento decidido pelo banco, feita em `20260909_05`).

**Sem a contrapartida no app do aluno, a tela do professor cria evento que ninguém consegue jogar.** Nada de evento, missão ou nota existe no mobile.

### 3.5 Rank de batalhas

Depende de Eventos (arena só existe dentro de um evento aberto). Já há `arena_*`, `fn_arena_placar`, `ranks`, `rank_tipo` — mas as funções da arena **não estão no git** (`schema-nao-versionado.md`). O console atual (`RanksSection`) já faz CRUD de tipos e rankings; o protótipo é outra coisa: a leitura de uma arena de evento.

---

## 4. Ordem proposta e o que cada fase entrega

Critério: **o que já tem chão no banco vem primeiro; o que depende de produto e de mobile vem por último.**

| Fase | Entrega | Pré-requisito | Risco |
|---|---|---|---|
| **A. Fundação** | componentes comuns do console (cabeçalho de página, estado vazio e de erro, selo de status) e o padrão de rota "uma tela = um item da barra, só quando existe" | — | baixo |
| **B. Conquistas** | migration que **captura o schema real** → coluna `ativa`, cor, RLS por turma, RPC de criar/editar/desativar, teto → tela | conferir ao vivo o gatilho (§3.1) | médio |
| **C1. Notas** | RPC `avaliar_entrega` + view da fila + tela | decisão do que é "pendente" (§5) | médio |
| **C2. Missões (cadastro)** | `pontuacao_maxima` no `saveActivity`, ramo do editor para `missao`, lista com entregas, tela | decisões de tópico opcional e moedas | médio |
| **C3. Missões (sugestões da IA)** | tabelas de sugestão e de decisão, job na API, cota, tela | issue #151 liberada | alto |
| **C4. Missões (cronômetro no servidor)** | configuração + RPC que recusa fora do prazo + mobile | #136; mexe no app do aluno | alto |
| **D. Eventos e Rank de batalhas** | só **depois** das decisões abertas e de um desenho do lado do aluno | #152–#155 liberadas | muito alto |

Cada fase abre PRs pequenos e independentes onde der (tipos/regras puras com teste → migration → leitura → tela), no padrão das análises anteriores.

---

## 5. Decisões que só o produto pode tomar (e que travam código)

1. **Notas:** o que é "pendente de correção"? (a) toda dissertativa que a IA já corrigiu, para o professor revisar; (b) só as que o professor marcar; (c) só as que a IA não conseguiu corrigir. Hoje não existe esse estado.
2. **Trabalho com arquivo:** entra? Exige entrega de arquivo no app do aluno, que não existe.
3. **Missão sem tópico:** permitir? Exige tornar `topico_id` opcional (ou criar `classe_id` na atividade).
4. **Moedas por tópico/atividade/missão/evento** (prompt `16`): onde guardar — colunas novas ou `metadata`? E **quando** são creditadas (ao concluir? ao ser aprovada?).
5. **Recompensa da missão e da conquista:** é só moeda ou também "item da loja / badge"? O protótipo mostra texto livre; o modelo não existe.
6. **Teto de conquistas por turma** (o protótipo mostra 20) e **conjunto de ícones** (qual?).
7. **Conquista desativada:** continua sendo avaliada para quem ainda não ganhou? (O protótipo diz que **deixa** de ser avaliada.)
8. **Eventos:** liberar as issues #152–#155 e dizer se o app do aluno entra na mesma rodada.

---

## 6. Não levar para as telas reais

Seletor de "pré-visualização de estado", dados fictícios (Física I, 34 alunos, nomes), o item de barra lateral de telas ainda inexistentes, o texto "Escriba lê os dados…" sem a leitura real, e qualquer valor de teto ou de limite que não esteja em `app_config`.

---

## 7. Riscos e o que conferir antes de escrever migration

- **Schema não versionado.** Colunas de `conquistas` (`classe_id`, `criado_por`) e as funções `arena_*` existem em produção e não no git. Cada fase de banco começa com um PR que **reproduz o que existe** em migration idempotente (`ADD COLUMN IF NOT EXISTS`), para o `alembic upgrade head` deixar de divergir de produção.
- **Cadeia do Alembic:** a `main` já teve três cabeças; toda migration nova repete o teste de cabeça única.
- **RLS:** tabela nova nasce com RLS ligada e **sem policy = invisível**; criar tabela e policy no mesmo commit (regra do `CLAUDE.md`).
- **Sem navegador nesta sessão:** nada será validado visualmente; cada PR diz isso e entrega testes das regras puras.
- **O que o professor vê não pode vazar para o aluno:** nota, sinal de atenção e fila de correção ficam em funções/views que conferem a posse do professor (`app_classes_do_professor()`), nunca em tabela de leitura aberta.

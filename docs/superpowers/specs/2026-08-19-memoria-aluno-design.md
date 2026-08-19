# Memória do aluno (estado mental histórico + domínio por tópico)

Data: 2026-08-19
Status: aprovado para plano de implementação

## Contexto e problema

Segundo sub-projeto da arquitetura de IA proposta pro TrailUp (RAG,
Embeddings+VectorDB, Structured Output, Guardrails, Observabilidade,
Reranking, Memória, Evaluation — ver
`docs/superpowers/specs/2026-08-19-structured-output-guardrails-design.md`
pro primeiro, já mesclado). Este documento cobre só **Memória**.

Hoje não existe memória real de personalização — o que existe é:

1. **`aluno_mental_state_history`** (`api/app/repositories/mental_state.py`)
   — tabela que acumula um registro por ciclo (`kind`, `intensity`,
   `confidence`, `reason`), gravada em todo ciclo por
   `analysis_runner.py:144` via `MentalStateHistoryRepository.registrar()`.
   Mas `.listar_por_aluno()` **nunca é chamado fora de teste** — write-only,
   lacuna já documentada em `CLAUDE.md` ("nunca lido de volta por nenhum nó
   do grafo ou serviço para influenciar decisões").
2. **`iadescricao`** (`IADescricaoRepository.upsert_cycle_summary`) — não é
   histórico: é uma **linha única por aluno, atualizada `UPDATE ... SET` em
   todo ciclo** (`ia_descricao.py:74-80`). O valor do ciclo anterior é
   destruído a cada novo ciclo.
3. **`desempenho_recente`** (`ContextRepository._fetch_desempenho`) — uma
   média `AVG()` de todos os registros históricos de `atividade_aluno`, sem
   nenhuma granularidade por tópico nem visão de tendência entre ciclos.
4. **`DeepKnowledgeTracingAnalyzer`** (`linear_analysis_pipeline.py:488`) —
   apesar do nome, não faz *tracing* real: recalcula `dominio_estimado` do
   zero em cada ciclo a partir da média flat de `desempenho_recente` mais o
   lote de eventos do ciclo atual (`correct`/`wrong`). O resultado
   (`dominio_estimado`, `tendencia`) fica em `state["pipeline_stage_outputs"]`
   mas **nunca é persistido** — não existe granularidade por tópico
   acumulada em lugar nenhum do banco.

## Objetivo

1. Fechar a lacuna documentada: ler `aluno_mental_state_history` de volta e
   detectar recorrência (não só o estado pontual do ciclo atual) — heurística
   escolhida: **3 dos últimos 5 registros com o mesmo `kind` negativo**
   (`frustrated`/`anxious`/`overwhelmed`/`tired`, os valores reais de
   `IAMentalStateKind` em `app/schemas/ia_patch.py`) marca `recorrente=True`.
2. Persistir domínio/dificuldade **por tópico** como fato acumulado — nova
   tabela `aluno_topico_dominio` — em vez de recalculado do zero a cada ciclo
   a partir de uma média flat de toda a classe.
3. Tornar essa memória disponível pros nós de decisão do grafo e pro
   guardrail `checar_evidencia_dominio` (`api/app/agent/graph/guardrails.py`,
   do sub-projeto anterior), sem quebrar as interfaces `Protocol` do
   `linear_analysis_pipeline.py` (`EmotionAnalyzer`, `PerformanceAnalyzer`,
   etc. já recebem `state: dict[str, Any]` — a memória entra por ali, aditivo,
   sem mudar assinatura).

Fora de escopo (decisão explícita): objetivos do aluno (`objetivos`) — exige
feature nova de UI pro aluno definir metas, não existe hoje nem como conceito
de dado; preferências além do que já existe em `alunos.modo_resposta`; RAG,
Observabilidade, Evaluation — sub-projetos próprios.

## Arquitetura

Módulo novo e isolado, `api/app/services/memoria_aluno.py`, com duas
funções — leitura e escrita — que **não mudam nenhuma assinatura de
`Protocol` existente** em `linear_analysis_pipeline.py`. Tudo passa a fluir
pelo `state` dict, que os analisadores já recebem:

- `ler_memoria(session, *, aluno_id, classe_id) -> MemoriaAluno` — chamada de
  dentro de `build_initial_state` (`api/app/services/state_builder.py`),
  logo depois do `context_repo.fetch_aluno_context(...)` já existente.
  Resultado vira `state["memoria_aluno"]`. Internamente: busca
  `AlunoTopicoDominioRepository.buscar_por_classe(aluno_id, classe_id)` +
  `MentalStateHistoryRepository.listar_por_aluno(aluno_id, limit=5)` e aplica
  a heurística de recorrência.
- `atualizar_memoria(session, *, aluno_id, topico_id, performance_resumo,
  mental_state) -> None` — chamada de dentro de `analysis_runner.py`, logo
  depois do bloco que já persiste `MentalStateHistoryRepository.registrar()`
  (`analysis_runner.py:142-155`). Faz upsert em `aluno_topico_dominio` com
  `state["pipeline_stage_outputs"]["performance"]` (disponível depois de
  `orchestrator.run()`); delega a gravação do estado mental pro
  `MentalStateHistoryRepository` já existente (não duplica essa escrita).
  `topico_id` resolvido como `topico_id or desempenho_recente.topico_recente_id`
  — mesmo padrão de fallback que `resolve_conteudo_foco_id` já usa.

Consumo concreto (prova de valor, escopado a 3 pontos — não é "disponibilizar
e nunca usar" de novo):

1. **`checar_evidencia_dominio`** (guardrail existente,
   `api/app/agent/graph/guardrails.py`) passa a receber `dominio_por_topico`
   no `contexto` que `agente_trilha` monta pra `gerar_validado`. Usa o
   registro persistido do `topico_foco` especificamente como evidência
   primária (mais preciso que a média `media_acertos` da classe inteira, que
   é o que o guardrail usa hoje); mantém o fallback pro `media_acertos`
   quando não há registro ainda pro tópico (aluno nunca estudou aquele
   tópico).
2. **`DeepKnowledgeTracingAnalyzer.analyze()`** passa a ler
   `state.get("memoria_aluno", {}).get("dominio_por_topico", {}).get(str(topico_id))`
   como semente de `base_mastery`, em vez de sempre partir da média flat de
   `desempenho_recente` — fecha o loop: agora acumula de ciclo pra ciclo em
   vez de recomputar cego toda vez.
3. **`agente_ui`** (`api/app/agent/graph/nodes/agente_ui.py`) — atenção: o
   `kind` de `aluno_mental_state_history` usa o vocabulário em inglês de
   `IAMentalStateKind` (`frustrated`/`anxious`/`overwhelmed`/`tired`/...),
   **diferente** do vocabulário em português de `emocao_atual.emocao_primaria`
   (`frustrado`/`ansioso`/`cansado`/...) que `EMOCAO_TEMA` já usa hoje — são
   dois agentes/taxonomias distintos, não dá pra usar o `kind` como chave
   direta de `EMOCAO_TEMA`. Por isso o consumo é só o booleano: quando
   `mental_state_recorrente.recorrente` é `true` (qualquer um dos 4 kinds
   negativos, não importa qual especificamente), força o tema de suporte
   (`EMOCAO_TEMA["frustrado"]`) mesmo que a emoção pontual do ciclo atual
   pareça neutra — recorrência pesa mais que o instante. Não tenta traduzir
   `kind` para a chave exata de `EMOCAO_TEMA`.

## Componentes

- **Criar** `api/alembic/versions/20260819_01_memoria_aluno.py`: nova tabela
  `aluno_topico_dominio` (`aluno_id UUID`, `topico_id INT`,
  `dominio_estimado FLOAT`, `tendencia TEXT`, `confianca FLOAT`,
  `atualizado_em TIMESTAMPTZ`, `UNIQUE(aluno_id, topico_id)`, FK
  `topico_id -> topicos(id)`).
- **Criar** `api/app/repositories/aluno_topico_dominio.py`:
  `AlunoTopicoDominioRepository` com `buscar_por_classe(aluno_id, classe_id)
  -> dict[str, dict]` (chave = `topico_id` como string, mesmo padrão de
  `progresso_trilha`) e `upsert(aluno_id, topico_id, dominio_estimado,
  tendencia, confianca)`.
- **Criar** `api/app/schemas/memoria_aluno.py`: `DominioTopico`
  (`dominio_estimado: float`, `tendencia: str`, `confianca: float`,
  `atualizado_em: datetime`), `MentalStateRecorrente` (`recorrente: bool`,
  `kind: str | None`, `ocorrencias: int`), `MemoriaAluno`
  (`dominio_por_topico: dict[str, DominioTopico]`,
  `mental_state_recorrente: MentalStateRecorrente`).
- **Criar** `api/app/services/memoria_aluno.py`: `ler_memoria`,
  `atualizar_memoria`, e a função pura `_detectar_recorrencia(registros:
  list[dict]) -> MentalStateRecorrente` (testável isolada, sem I/O).
- **Modificar** `api/app/services/state_builder.py`: chama `ler_memoria` e
  adiciona `"memoria_aluno"` ao dict retornado por `build_initial_state`.
- **Modificar** `api/app/services/analysis_runner.py`: chama
  `atualizar_memoria` logo após o bloco existente de
  `MentalStateHistoryRepository.registrar()`.
- **Modificar** `api/app/services/linear_analysis_pipeline.py`
  (`DeepKnowledgeTracingAnalyzer.analyze`): lê `state["memoria_aluno"]` como
  semente de `base_mastery` quando disponível pro tópico em questão.
- **Modificar** `api/app/agent/graph/guardrails.py`
  (`checar_evidencia_dominio`): passa a checar `contexto.get("dominio_por_topico")`
  pro `topico_foco` antes de cair no `desempenho_recente.media_acertos`.
- **Modificar** `api/app/agent/graph/nodes/agente_trilha.py`: inclui
  `dominio_por_topico` (de `state.get("memoria_aluno", {})`) no `contexto`
  passado pra `gerar_validado`.
- **Modificar** `api/app/agent/graph/nodes/agente_ui.py`: consulta
  `state.get("memoria_aluno", {}).get("mental_state_recorrente")` antes de
  escolher o tema.
- **Testes:**
  - `api/tests/test_memoria_aluno.py` (novo): `_detectar_recorrencia` (casos
    3/5 mesmo kind, casos sem recorrência, kinds mistos não contam),
    `ler_memoria`/`atualizar_memoria` com sessão fake (mesmo padrão de
    `FakeSession`/`AsyncMock` já usado em `test_guardrails.py`/`test_api.py`).
  - `api/tests/test_repositories.py`: casos novos pra
    `AlunoTopicoDominioRepository` (buscar_por_classe, upsert insere e depois
    atualiza).
  - `api/tests/test_migrations.py`: atualiza asserção de head pra nova
    migração (mesmo padrão já usado nas migrações anteriores).
  - `api/tests/test_guardrails.py`: caso novo pra `checar_evidencia_dominio`
    usando `dominio_por_topico` real em vez de só `media_acertos`.
  - `api/tests/test_graph_nodes.py`: caso novo pra `agente_ui` forçando tema
    de suporte com `mental_state_recorrente`.
  - `api/tests/test_state_builder.py` (se não existir, criar): confirma que
    `build_initial_state` propaga `memoria_aluno`.

## Tratamento de erro

- Falha ao ler `aluno_topico_dominio`/`aluno_mental_state_history` (ex.:
  tabela ainda não migrada num ambiente, erro de conexão pontual): `ler_memoria`
  devolve `MemoriaAluno` vazia (`dominio_por_topico={}`,
  `mental_state_recorrente=MentalStateRecorrente(recorrente=False, kind=None,
  ocorrencias=0)`) — mesmo princípio de "permitir fallback" já documentado
  nos guardrails de pipeline. Nunca derruba `build_initial_state`.
- Falha ao persistir em `atualizar_memoria` (ex.: `topico_id` não resolvido):
  loga aviso e segue — mesmo padrão já usado no bloco de
  `MentalStateHistoryRepository.registrar()` em `analysis_runner.py`
  (`try/except` com `session.rollback()` + `logger.warning`, não propaga).

## Testes manuais

Não há UI nova nesta spec (mudança na camada de orquestração de
análise/personalização). `agente_ui` já tem consumidor mobile existente do
campo `tema` — verificação será via suíte automatizada (`pytest`); sem passo
de teste manual em navegador/mobile necessário.

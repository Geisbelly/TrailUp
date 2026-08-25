# Structured Output + Guardrails no grafo LangGraph

Data: 2026-08-19
Status: aprovado para plano de implementação

## Contexto e problema

Este é o primeiro de vários sub-projetos de uma proposta maior de arquitetura
de IA para o TrailUp (RAG, Embeddings+VectorDB, Structured Output, Guardrails,
Observabilidade/Tracing, Reranking, Memória e Evaluation — decisão explícita:
sem MCP). Pela dimensão do pedido, cada subsistema vira sua própria spec e
plano. Este documento cobre só **Structured Output** e **Guardrails**, que
foram escolhidos como ponto de partida por serem base para os demais (Evaluation
e Guardrails avançados dependem de saída confiável; RAG e Memória não).

`JsonLLMService.ainvoke_json` (`api/app/services/llm.py:220`) é o ponto central
de chamada LLM usado por **todos** os nós de decisão do grafo LangGraph
(`agente_perfil`, `agente_conteudo`, `agente_trilha`, `supervisor`,
`agente_texto`, `agente_ui`, `agente_notificacao`) e pelo endpoint de chat do
mentor (`conversar_com_mentor_personalizacao`,
`api/app/api/v1/personalizacao.py:1397`). Hoje ele só faz extração de JSON bruta
(`extract_json`: remove cercas de código + `json.loads`) — **sem** schema na
geração. Vários nós então validam o resultado com Pydantic *depois*, no seu
próprio código (ex.: `TrilhaConfig.model_validate(result)` em
`agente_trilha.py:39`, `PerfilUpdate.model_validate(result)` em
`agente_perfil.py:64`) — mas **nada nesse caminho captura o
`ValidationError`**. Confirmado em `api/app/services/graph_invocation.py:145-155`:
o único `except Exception` ali só trata erro de conexão do checkpointer
Postgres (`_is_checkpointer_connection_error`); qualquer outra exceção,
incluindo `ValidationError`, sobe crua e derruba a invocação inteira do grafo.

O endpoint de chat do mentor é ainda mais frágil: nem tem schema Pydantic no
resultado (`result.get("reply")` direto, sem validação alguma) e já **promete**
um guardrail que não é verificado — a payload manda
`"guardrails": {"sem_gabarito": true, "sem_resposta_direta_atividade": true}`
pro LLM (`v1/personalizacao.py:1523-1526`), mas isso é só instrução de prompt;
nada no código confere se a resposta de fato respeitou essas regras.

Guardrails de negócio, hoje, são só 4 princípios documentados em prosa
(`docs/api/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md`,
seção 4): não depender de artefato único, permitir fallback em falha de mídia,
não acoplar rank ao cliente, auditoria por job/target/evento. Nenhum deles é
verificado em código, e nenhum cobre o nível de decisão do LLM (ex.: não
recomendar tópico fora de ordem, não afirmar domínio sem evidência).

Já existe precedente de structured output *real* — schema aplicado na própria
geração — em `content_enrichment.py` (`.with_structured_output(_ENRICHMENT_SCHEMA)`,
`content_enrichment.py:991`), usado só na etapa de enriquecimento, fora do
grafo de decisão.

## Objetivo

1. Nenhuma chamada LLM nos nós do grafo (nem no chat do mentor) deve conseguir
   derrubar a invocação inteira por causa de saída malformada. Toda chamada
   passa a usar schema nativo na geração (`.with_structured_output()`) com 1
   retry de reparo e fallback determinístico — nunca uma exceção crua.
2. Cinco guardrails de negócio ganham verificação real em código (não só
   instrução de prompt), operacionalizados contra os campos que já existem
   hoje (sem inventar tabelas/conceitos novos):
   - **Ordem sequencial da trilha** (substituindo "pré-requisitos", que não
     existem como grafo explícito no banco): não recomendar avanço para um
     tópico cuja ordem é posterior a tópicos ainda incompletos.
   - **Tópicos citados existem de fato** na `classe_id` em questão.
   - **Alegação de domínio precisa de evidência**: hoje `ajustes` é texto
     livre sem vocabulário controlado (`trilha_config.txt` só dá um exemplo,
     "reforcar base") — checar "afirma domínio" contra texto livre arbitrário
     seria frágil. Em vez disso: (a) o prompt `trilha_config.txt` passa a
     listar um conjunto fixo de valores aceitos para `ajustes`, incluindo
     `"avancar sem reforco"` como a única forma de sinalizar dispensa de
     reforço; (b) `checar_evidencia_dominio` rejeita a saída se `ajustes`
     contém `"avancar sem reforco"` e `desempenho_recente.media_acertos` é
     menor que 50 — mesmo limiar que `_fallback_trilha`/`_fallback_perfil` já
     usam pra decidir "reforçar fundamentos" vs. "manter progressão", mantendo
     o critério consistente entre o caminho principal e o fallback.
   - **Progresso não é alterável pelo LLM** — já garantido por construção
     (nenhum schema de saída dos nós tem campo de percentual); vira teste de
     regressão de schema, não checagem em runtime.
   - **Grounding do chat do mentor**: resposta não pode conter resposta pronta
     de atividade/questão nem se apoiar em conhecimento fora do conteúdo do
     tópico fornecido no payload. Diferente das outras 3 regras (numéricas,
     checáveis por comparação direta de campos), isso é um julgamento sobre
     texto livre — o `payload` do chat nem contém gabarito pra comparar
     (`buscar_questoes_topico` já filtra isso). `checar_grounding_chat` é
     **assíncrona** e faz uma segunda chamada LLM barata, tipo
     "juiz"/self-critique: schema `{"viola": bool, "motivo": str}`, prompt
     curto perguntando se a resposta entrega solução pronta ou usa
     conhecimento fora do `conteudo_materia` fornecido. É o único guardrail
     desta leva que tem custo de LLM extra — assumido conscientemente, dado
     que não há como checar isso com comparação de campo.

Fora de escopo (decisão explícita): grafo de pré-requisitos explícito entre
tópicos (não existe hoje, seria um projeto novo); guardrails em
`agente_conteudo`/`agente_ui`/`agente_notificacao`/`supervisor`/`agente_texto`
além do `ainvoke_structured` genérico — esses nós só ganham geração
schema-validada nesta leva, sem regra de negócio nova; RAG, Memória,
Observabilidade/Tracing, Reranking e Evaluation — sub-projetos próprios,
brainstormados separadamente.

## Arquitetura

Duas camadas separadas, cada uma com responsabilidade única:

**Camada 1 — geração com schema (mecânica, reutilizável em todo lugar).**
Novo método `JsonLLMService.ainvoke_structured` em `api/app/services/llm.py`,
usando o mesmo padrão que já funciona em `content_enrichment.py`: constrói
JSON Schema a partir de `schema.model_json_schema()`, chama
`.with_structured_output(json_schema)` no cliente Gemini/OpenAI, recebe um
dict já parseado, valida com `schema.model_validate(dict)`. Se a chamada LLM
falhar ou a validação falhar, levanta `StructuredOutputError` (novo, tipado)
em vez de deixar a exceção original (`ValidationError`, erro de rede, etc.)
subir crua. Essa camada não sabe nada sobre regras de negócio — só garante que
a saída tem a forma certa.

**Camada 2 — guardrails de negócio (específicos por nó, com acesso a dados de
domínio).** Novo módulo `api/app/agent/graph/guardrails.py` com:
- Funções de checagem, uma por regra: `checar_ordem_sequencial`,
  `checar_topicos_existem`, `checar_evidencia_dominio` (as 3 síncronas/puras,
  comparação direta de campos) e `checar_grounding_chat` (assíncrona, faz uma
  chamada LLM-juiz — ver Objetivo). Cada uma recebe o modelo Pydantic já
  validado + o contexto de domínio necessário (progresso, lista de tópicos
  válidos, etc.) e devolve `GuardrailViolation | None`.
  `gerar_validado` aceita tanto guardrails síncronos quanto assíncronos na
  mesma lista (faz `await` condicional conforme o tipo de retorno).
- Um helper de orquestração, `gerar_validado(llm, *, prompt_name, payload,
  schema, guardrails, fallback_factory, max_tentativas=2)`, que:
  1. chama `llm.ainvoke_structured(...)`;
  2. roda as funções de guardrail passadas na lista sobre o resultado;
  3. se schema OU guardrail falhar, tenta de novo (só 1 vez) anexando a
     mensagem do erro/violação ao payload como campo `correcao` (mesmo padrão
     de retry-com-feedback que `content_enrichment.py` já usa em
     `_augment_batch_with_feedback`/`attempt`/`feedback`);
  4. se falhar de novo, usa o `fallback_factory` (as funções `_fallback_*`
     que já existem em cada nó) e registra a violação via
     `IADecisionLogRepository` (reaproveitando o padrão de auditoria que o
     chat do mentor já usa em `v1/personalizacao.py:1540`), para manter o
     princípio de "auditoria por job/target/evento" já documentado.

Nós que só precisam da Camada 1 (`agente_perfil`, `agente_conteudo`,
`supervisor`, `agente_texto`, `agente_ui`, `agente_notificacao`) chamam
`llm.ainvoke_structured(...)` diretamente, com uma trycatch simples ao redor
que cai no `fallback_factory` em caso de `StructuredOutputError` (sem retry —
o retry-com-reparo é um recurso da Camada 2, reservado pra quem tem guardrail
de negócio pra justificar o custo extra de uma segunda chamada LLM).

Nós com guardrail de negócio (`agente_trilha`, chat do mentor) chamam
`gerar_validado(...)`.

## Componentes

- **Modificar** `api/app/services/llm.py`: adicionar `StructuredOutputError`
  (exceção nova) e `JsonLLMService.ainvoke_structured`. `extract_json` e
  `ainvoke_json` continuam existindo (usados fora do grafo, ex.: geração de
  cards) — não removidos.
- **Criar** `api/app/agent/graph/guardrails.py`: `GuardrailViolation`
  (dataclass/Pydantic simples com `regra: str` e `mensagem: str`), as 4 funções
  de checagem, e `gerar_validado`.
- **Modificar** `api/app/agent/graph/nodes/agente_trilha.py`: troca a chamada
  direta a `ainvoke_json` por `gerar_validado(..., guardrails=[checar_ordem_sequencial,
  checar_topicos_existem, checar_evidencia_dominio])`. Precisa passar a lista de
  tópicos válidos da `classe_id` (nova dependência: `ConteudoClasseRepository`,
  já usado em outros pontos da API) como parte do contexto de guardrail.
- **Modificar** `api/app/agent/prompts/trilha_config.txt`: passa a listar o
  vocabulário fixo aceito em `ajustes` (incluindo `"avancar sem reforco"`),
  necessário pra `checar_evidencia_dominio` funcionar de forma confiável.
- **Modificar** `api/app/agent/graph/nodes/agente_perfil.py`,
  `agente_conteudo.py`, `agente_texto.py`, `agente_ui.py`,
  `agente_notificacao.py`, `supervisor.py`: trocam `ainvoke_json` por
  `ainvoke_structured` (Camada 1 só).
- **Modificar** `api/app/api/v1/personalizacao.py`
  (`conversar_com_mentor_personalizacao`): define schema Pydantic novo pra
  resposta do chat (`app/schemas/mentor_chat.py`, novo: `reply: str`,
  `should_close: bool`, `hinted_actions: list[str]`) e troca `ainvoke_json`
  por `gerar_validado(..., guardrails=[checar_grounding_chat])`.
- **Criar** `api/app/schemas/mentor_chat.py`: schema Pydantic da resposta do
  chat (hoje inexistente).
- **Testes:**
  - `api/tests/test_llm_service.py`: casos novos para `ainvoke_structured`
    (sucesso, `StructuredOutputError` em falha de schema, erro de rede).
  - `api/tests/test_guardrails.py` (novo): um teste por função de checagem
    (violação detectada + caso válido passa), teste de `gerar_validado`
    cobrindo os 3 caminhos (sucesso de primeira, sucesso após retry com
    reparo, fallback após 2 tentativas) e teste de auditoria (violação gera
    entrada em `IADecisionLogRepository`).
  - `api/tests/test_graph_nodes.py`: atualiza os testes existentes de
    `agente_trilha`/`agente_perfil` para o novo caminho de chamada; adiciona
    teste de regressão que trava o schema de `TrilhaConfig` sem campo de
    progresso (documenta o guardrail nº4, que é garantido por construção).
  - `api/tests/test_api.py`: teste do endpoint de chat cobrindo o guardrail
    de grounding (resposta que tenta entregar gabarito é rejeitada e cai no
    retry/fallback).

## Tratamento de erro

- Falha de rede/quota do provedor LLM dentro de `ainvoke_structured`: mesma
  lógica de rotação de chave/modelo que já existe em
  `_ainvoke_gemini_with_rotation` — reaproveitada, não duplicada.
- Falha de schema (LLM devolveu algo que não bate com o Pydantic) ou violação
  de guardrail: 1 retry com o erro anexado como `correcao` no payload — igual
  ao padrão já validado em `content_enrichment.py`.
- Falha do retry também: cai no `fallback_factory` determinístico que já
  existe por nó (`_fallback_trilha`, `_fallback_perfil`,
  `_fallback_mentor_chat_reply`) — nunca propaga exceção pro chamador do
  grafo. A violação (schema ou guardrail) é logada via
  `IADecisionLogRepository` mesmo quando o fallback resolve, para manter
  visibilidade de quantas vezes o guardrail está sendo acionado (sinal útil
  pro futuro sub-projeto de Evaluation).

## Testes manuais

Não há UI nova nesta spec (mudança é só na camada de orquestração do
backend). Verificação será via suíte automatizada (`pytest`) — sem passo de
teste manual em navegador/mobile necessário.

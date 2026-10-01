# Triagem: corpus de RAG × conjunto de pesquisa

**Issues:** [#70](https://github.com/BitStudioLabs/trail-up/issues/70) (inventário) · [#71](https://github.com/BitStudioLabs/trail-up/issues/71) (triagem)

**Status:** triagem inicial, derivada do inventário. Nenhuma fonte sai de **bloqueada** por este documento — ele só classifica o destino pretendido quando a proveniência se regularizar.

**Atualizado em:** 2026-09-30

## Critério de decisão

- **`corpus`**: texto corrido pedagógico (artigo, capítulo, diretriz) que faz sentido recuperar por similaridade e citar como fonte de uma resposta do mentor. Exige licença que permita extração, chunking, embedding e resposta a alunos.
- **`pesquisa`**: dado tabular/comportamental ou modelo treinado. Não entra no índice vetorial — linha de tabela não é recuperável por similaridade. Serve para calibrar heurística, validar hipótese ou treinar camada ML. O caminho para aproveitar no RAG é virar **texto derivado** (sumário, achado, regra), nunca linha crua.
- **`descartado`**: risco (sensível sem base legal, biométrico) ou custo supera o retorno. Registrado para não reavaliar a cada sprint.
- **Regra geral**: sem licença confirmada, tudo fica **bloqueado** independente da classe. A classe abaixo diz o destino *quando* a licença se confirmar.

## Classificação

| Fonte (do inventário #70) | Classe | Justificativa (uma linha) |
| --- | --- | --- |
| EdNet-KT3 / KT4 | `pesquisa` | Tabular comportamental; já virou os pesos M2 (#215) — o derivado (dificuldade, achados) é o que interessa, não as linhas. |
| OULAD | `pesquisa` | Analítico tabular; candidato a texto derivado (padrões de evasão), nunca linha crua. |
| ARES / OSF `8y3zp` | `pesquisa` | XLSX/IPYNB de pesquisa; aguardar licença + decidir se há texto recuperável. |
| classEx, AI4EDU | `pesquisa` | Conjuntos de pesquisa; aguardar licença e finalidade. |
| `8/` (28 PDFs) | `corpus` (candidato) | Literatura em PDF é o formato-alvo do índice; exige licença por artigo + extração #72. |
| `ScienceDirect_articles_*` (8 PDFs) | `corpus` (candidato) | Idem; acesso ao artigo não concede direito de indexar o texto integral — confirmar licença. |
| `bsxgbt8wnp-2` (5 PDFs) | `corpus` (candidato) | Idem. |
| `tyxy9hbrwd-2` | a classificar | Sem tipo confirmado; classificar quando o diretório original estiver disponível. |
| `Student Depression Dataset.csv` | `descartado` do RAG | Saúde mental de terceiros: vedado no índice (#74); uso em pesquisa só com finalidade + base legal registradas. |
| `AI_SocialMedia_Student_Health_Dataset_clean.csv` | `descartado` do RAG | Idem. |
| `psychological_state_dataset new.csv` | `descartado` do RAG | Idem. |
| `neurodiversity_education_dataset.csv` + `Neurodiversity in Educational Settings Anonymized` | `descartado` do RAG | Neurodivergência: dado sensível LGPD; vedado no índice (#74). |
| `Facial_data` | `descartado` | Biométrico: maior risco, menor retorno; decisão explícita na #74 antes de qualquer uso. |
| `dataverse_files`, demais CSV/XLSX/SAV/DOCX | a classificar | Classificar item a item quando o diretório original estiver disponível. |

## Onde fica cada coisa

- **`corpus`** (quando licenciado e extraído): Vector Store / índice configurado por `OPENAI_RAG_VECTOR_STORE_ID` (caminho canônico, ADR 0001). Ingestão só de texto limpo com seção + documento de origem (#72), com metadados pedagógicos (#73).
- **`pesquisa`**: fora do bucket do RAG, no diretório de pesquisa (`core-trailup` ou diretório de dados versionado à parte — nunca neste repositório). Consumidores: calibração de heurísticas, validação de hipótese, treino da camada ML (M2 já é exemplo: EdNet virou peso, não chunk).
- **Texto derivado** (ponte pesquisa→RAG): sumário ou regra escrita a partir de achado de pesquisa, com citação da fonte e da amostra. Entra no índice como documento próprio, com metadado `tipo=derivado` e `populacao` declarada (#73).

## Reconciliação #63 × #165 (caminho canônico)

- **#165 (OpenAI Vector Store + `file_search` no mentor) é o caminho canônico.** PR #166 foi mergeada em 2026-09-10; o desenho pgvector (`agente_rag`, `rag_context`, `RAGRetrievalService`) é anterior ao ADR e está substituído.
- Consequência para as issues pgvector:
  - **#63** (nó `agente_rag`): fechar como substituída — o mentor já recupera via `file_search`, sem nó no grafo. Reabrir só se um segundo consumidor (fora do mentor) exigir retrieval no LangGraph.
  - **#66** (sugestão/notificação com RAG): reescopo — `sugestao_material.py` é determinístico hoje e deve continuar; RAG entra só via mentor (caminho #165), não via `rag_context` no estado.
  - **#67** (observabilidade/testes do RAG): reescopo — observar o caminho `file_search` (latência, top_k, taxa de citação), não um `RAGRetrievalService` que não existe.
  - **#64** (intervenções): tabela `intervencoes` + leitura de `aluno_mental_state_history` continuam válidas como entrega; só o item "buscar via RAG" passa a significar consultar o mentor/file_search, não `agente_rag`.
- **#72, #73, #75** (extração, curadoria, golden set) continuam válidas e passam a alimentar o Vector Store, não o pgvector.
- **#74 + gate #195** continuam travando qualquer fonte sensível antes de indexar ou enviar a terceiro — independente do backend vetorial.

# Observabilidade do RAG

**Issue:** [#67](https://github.com/BitStudioLabs/trail-up/issues/67)

**Atualizado em:** 2026-10-25

## O que é gravado

Cada chamada ao `file_search` do Vector Store da OpenAI (`OpenAIRagService.invoke_structured`)
gera um resumo (`app/services/rag_observabilidade.py`). O chat do mentor
(`POST /api/v1/personalizar/chat`) grava cada resumo numa linha de `ia_decision_logs`:

| coluna | valor |
| --- | --- |
| `source` | `chat` (dentro do `ck_ia_decision_logs_source`) |
| `stage` | `rag_retrieval` |
| `provider` / `model_name` | `openai` / modelo usado |
| `trigger_event` | escopo do chat |
| `aluno_id`, `classe_id`, `topico_id`, `conteudo_id` | os do chat (mesma retenção das outras linhas) |
| `input_summary` | o resumo abaixo |
| `prompt_text`, `raw_response` | vazios |

`input_summary`:

- `status` (`ok`/`erro`) e `erro` (só o nome da exceção);
- `latencia_ms`: a chamada inteira da Responses API. A busca e a geração vêm juntas, porque a API não separa o tempo da busca;
- `top_k`: `max_num_results` configurado (`OPENAI_RAG_TOP_K`), ou `null` quando vale o padrão da OpenAI;
- `consultas`: quantas consultas o modelo fez (o texto não é gravado);
- `resultados`: `[{file_id, score}]`, até 20 itens. A API não expõe id de chunk;
- `n_resultados`, `com_resultado` (cobertura), `score_max` e `score_medio` (relevância);
- `intervencao`: o guardrail interveio (retry ou fallback) na resposta que usou a busca.

**Sem texto, de propósito.** O resumo não guarda a mensagem do aluno, as consultas geradas a partir dela, o trecho recuperado nem o nome do arquivo. Menor de idade (#195): a busca continua só na OpenAI, com `store=False`; este registro fica no nosso banco.

## Métricas (SQL)

```sql
SELECT date_trunc('day', created_at) AS dia,
       count(*) AS buscas,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY (input_summary->>'latencia_ms')::numeric) AS latencia_p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY (input_summary->>'latencia_ms')::numeric) AS latencia_p95_ms,
       avg((input_summary->>'n_resultados')::numeric) AS resultados_medio,
       max(input_summary->>'top_k') AS top_k,
       avg(((input_summary->>'com_resultado')::boolean)::int) AS cobertura,
       avg((input_summary->>'score_max')::numeric) AS relevancia_media,
       avg(((input_summary->>'intervencao')::boolean)::int) AS taxa_intervencao,
       avg(((input_summary->>'status') = 'erro')::int) AS taxa_erro
FROM ia_decision_logs
WHERE stage = 'rag_retrieval'
GROUP BY 1
ORDER BY 1 DESC;
```

Ainda não existe painel. A consulta acima é a base para ele.

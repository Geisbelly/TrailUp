# Plano de teste em massa: com e sem RAG

**Atualizado em:** 2026-11-04
**Depende de:** [mapa do RAG](./mapa-do-rag-no-sistema.md) · PR #948 (corpus v1, indexador, avaliador) · [golden set](./golden-set-documentos-v1.md) · [regras derivadas](./regras-derivadas.md)

## Pergunta

Ligar o `file_search` sobre as 12 regras derivadas muda o que a IA do TrailUp responde? Se muda, a mudança é para melhor: mais aderente à evidência, sem promessas que a evidência não sustenta?

O teste é técnico, com entradas sintéticas. Não mede aprendizagem nem efeito sobre alunos, e não deve ser descrito assim na monografia (ver `tcc-o-que-nao-afirmar`).

## O problema do "sem" de produção

Em produção, `use_rag=True` não liga só a busca: troca o caminho inteiro (`llm.ainvoke_structured`).

| | Sem RAG (hoje) | Com RAG |
|---|---|---|
| Provedor | Gemini (rotação de chaves, tier free) | OpenAI Responses API |
| Modelo | `gemini-*` padrão | `openai_model_default` = `gpt-4o-mini` |
| Prompt | `SystemMessage` + `HumanMessage` (JSON) | um único `input` com "INSTRUÇÕES DO MENTOR" + "DADOS DA SESSÃO" |
| Busca | nenhuma | `file_search`, filtro `scope=publico` |

Comparar produção com produção mede modelo, provedor, montagem do prompt e busca de uma vez só. Qualquer diferença ficaria sem causa atribuível.

**Desenho:** três braços, sendo a comparação principal entre A e B.

- **A — sem busca:** mesmo `OpenAIRagService.invoke_structured`, mesmo modelo, mesmo prompt, **sem** a ferramenta `file_search`.
- **B — com busca:** o caminho de produção com RAG ligado.
- **C — produção sem RAG (Gemini):** braço de referência, com amostra pequena por causa da cota free. Responde a outra pergunta: "trocar Gemini por gpt-4o-mini + RAG piora alguma coisa que hoje funciona?".

A × B isola o efeito da busca. C × B é a decisão prática de ligar `OPENAI_RAG_ENABLED`.

Para o braço A falta um parâmetro: `invoke_structured(..., usar_busca: bool = True)` ou equivalente. A mudança é pequena e só serve ao teste; o padrão continua igual.

## Camadas

### Camada 1 — Recuperação (sem gerar resposta)

Script `scripts/rag_avaliar_golden_set.py`, da PR #948.

- **Entradas:** 30 perguntas do golden set **mais 3 paráfrases por pergunta** (120 consultas). As paráfrases cobrem registro de aluno, registro de professor e pergunta indireta. Com 30 consultas sobre 12 documentos, qualquer recall alto é pouco informativo.
- **Consultas fora do domínio:** cerca de 20, como "como troco minha senha", "qual a data da prova" ou o conteúdo de uma matéria. Medem se a busca traz regra pedagógica onde não devia. Para isso, registrar o `score` e escolher um limiar.
- **Métricas:**
  - recall@1 e recall@3, acerto@3 e MRR, com intervalo de confiança por bootstrap;
  - para as consultas fora do domínio, a proporção com `score_max` acima do limiar.
- **Custo:** só busca, sem geração. São cerca de 140 chamadas de `vector_stores.search`.

### Camada 2 — Resposta às perguntas do golden set (A × B, e C em amostra)

Cada uma das 120 consultas vira uma mensagem para o **chat do mentor** (`mentor_personalizacao_chat.txt`), com um contexto sintético fixo: aluno fictício maior de idade, tópico genérico, sem atividades.

| Medida | Como | Tipo |
|---|---|---|
| Abstenção correta | GS-18, GS-19 e GS-28 e paráfrases: a resposta reconhece que a evidência não sustenta a conclusão? | binária |
| Promessa proibida | regex + revisão: "seu perfil aprende melhor", "estilo de aprendizagem", emoção inferida de clique/tempo (RD-02, RD-10, RD-12) | binária |
| Concordância com a resposta esperada | nota 0–2 (contradiz / parcial / concorda) contra a coluna "Resposta esperada" | ordinal |
| Limite citado | a resposta menciona o limite da regra quando ele muda a conclusão | binária |
| Guardrails | `checar_grounding_chat`, sem gabarito, schema válido, `fallback_factory` acionado | binária |
| Operação | latência, tokens de entrada e saída, nº de trechos recuperados, falhas | contínua |

- **Volume:** 120 consultas × 3 repetições × 2 braços = **720 chamadas**. As repetições medem a variação do próprio modelo.
- **Braço C:** 30 consultas × 1 repetição, para caber na cota diária do Gemini free tier.

### Camada 3 — Os três pontos de uso reais

O RAG está ligado em três lugares, e as regras pesam diferente em cada um:

| Ponto | Prompt | Cenários sintéticos | O que olhar |
|---|---|---|---|
| Chat do mentor | `mentor_personalizacao_chat.txt` | 40 conversas: dúvida de estudo, pedido de resposta de atividade, desabafo, pergunta sobre o app | B não pode piorar o grounding no conteúdo da matéria nem vazar gabarito; regra só entra quando cabe |
| Intervenção | `intervencao.txt` | 20 históricos de estado mental, recorrente e não recorrente | não rotular emoção a partir de log (RD-12); feedback acionável (RD-07, RD-11) |
| Notificação | `notificacao_personalizada.txt` | 20 situações: inatividade, prazo, progresso | vínculo com progresso e próximo passo (RD-06); sem culpa nem pressão |

- **Volume:** 80 cenários × 3 repetições × 2 braços = **480 chamadas**.
- Intervenção e notificação **não registram a busca** hoje (bloqueio B5 do mapa). O teste usa `coletar_buscas_rag` em volta da chamada, sem depender do log de produção.

## Execução

- **Onde:** script local `api/scripts/rag_teste_com_e_sem.py`, que chama `LLMService`/`OpenAIRagService` direto. Não passa pela API publicada, não usa aluno real e não grava em `ia_decision_logs`, `intervencoes` nem `notificacoes_ia`.
- **Pareamento:** a mesma entrada vai para os dois braços, em ordem aleatória por item, com semente fixa.
- **Saída:** um JSONL por chamada, com o braço, a entrada, a resposta, os trechos recuperados e as métricas de operação, mais um relatório em markdown em `docs/rag/`. As respostas brutas ficam fora do repositório (`scratch`/R2), porque o JSONL é grande.
- **Retomável:** a chave é `(item, repetição, braço)`; rodar de novo pula o que já está pronto.
- **Ritmo:** limite de chamadas por minuto configurável, e o braço C para ao primeiro 429 em vez de tentar de novo.

## Avaliação

1. **Automática:** abstenção por padrão de frase, promessa proibida por regex, schema, guardrails e operação, em 100% das saídas.
2. **Humana, às cegas:** amostra estratificada de **60 pares A/B**, com os braços embaralhados e rotulados X/Y. A autora dá a nota 0–2 de concordância e escolhe a melhor ou o empate. Serve também para conferir as medidas automáticas.
3. **Juiz LLM (opcional):** nota 0–2 nas 1.200 saídas. Precisa decidir qual chave paga, e se for a do RAG, se essa conta aceita o uso. O juiz não pode ser o mesmo modelo dos braços sem essa ressalva no texto; a amostra humana do item 2 mede a concordância com ele (kappa).

**Estatística:** desenho pareado.

- Binárias: McNemar.
- Ordinais: Wilcoxon de postos sinalizados.
- Diferenças com IC 95% por bootstrap pareado, reamostrando por **pergunta original**, não por paráfrase nem por repetição, porque essas não são independentes.
- Para cada métrica, relatar o *n* efetivo: 30 perguntas na camada 2, 80 cenários na camada 3.

## Critério de decisão (fixado antes de rodar)

Ligar o RAG nos três pontos se, em B contra A:

- promessa proibida **não aumenta** (limite superior do IC da diferença ≤ 0);
- abstenção correta nas não respondíveis **não piora**;
- guardrails do chat (grounding, gabarito) **não pioram**;
- latência p95 do chat fica **≤ 2× a de A**.

Se B não for melhor em nenhuma medida, o RAG é custo sem ganho com este corpus: registrar isso, que também é resultado. Se C for melhor que B, o problema é a troca de modelo, não a busca, e vale avaliar o RAG com o mesmo provedor.

## Custo estimado

Valores de referência públicos; conferir no painel da conta do RAG antes de rodar.

- ~1.300 gerações em gpt-4o-mini com cerca de 4 mil tokens de entrada e 300 de saída: na faixa de US$ 1–2.
- ~800 chamadas com `file_search` (braço B + camada 1): na faixa de US$ 2–3, considerando a tarifa por chamada da ferramenta.
- Juiz LLM, se houver: mais cerca de US$ 1.
- **Total previsto: menos de US$ 10**, pago pela conta do RAG.

## Ordem

1. Mesclar a #948 e indexar o corpus (`--aplicar`).
2. Camada 1, com relatório.
3. Paráfrases e cenários sintéticos em `docs/rag/teste-com-e-sem/entradas/`, revisados pela autora antes de rodar.
4. Parâmetro do braço A e o script `rag_teste_com_e_sem.py`, com testes.
5. Rodada piloto: 10 itens × 1 repetição, para conferir custo e saída.
6. Rodada completa, avaliação humana, relatório e seção 8.1 da monografia.

## Decisões pendentes

- Incluir o braço C (Gemini) ou só A × B?
- Juiz LLM ou só avaliação humana? E qual chave paga o juiz?
- Quem escreve e revisa as paráfrases e os cenários: gerados com revisão ou escritos à mão?

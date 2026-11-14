# Avaliação da recuperação do RAG — 2026-11-13

Gerado por `api/scripts/rag_avaliar_golden_set.py`. Corpus: 12 regras derivadas, um arquivo por regra. Busca: `vector_stores.search`, filtro `scope=publico`, top-3.

Mede só a recuperação. Não diz se a resposta do modelo ficou certa.

| Grupo | n | recall@3 | acerto@3 | MRR |
|---|---|---|---|---|
| Todas | 30 | 0.87 | 0.97 | 0.88 |
| Respondível = sim | 27 | 0.87 | 0.96 | 0.89 |
| Respondível = não | 3 | 0.83 | 1.00 | 0.78 |

| ID | Respondível | Relevantes | Recuperados (ordem) | recall | RR |
|---|---|---|---|---|---|
| GS-01 | sim | RD-03, RD-04 | RD-03, RD-04, RD-11 | 1.00 | 1.00 |
| GS-02 | sim | RD-03 | RD-03, RD-11, RD-02 | 1.00 | 1.00 |
| GS-03 | sim | RD-03, RD-04 | RD-03, RD-05, RD-02 | 0.50 | 1.00 |
| GS-04 | sim | RD-04 | RD-04, RD-06, RD-09 | 1.00 | 1.00 |
| GS-05 | sim | RD-04 | RD-04, RD-02, RD-07 | 1.00 | 1.00 |
| GS-06 | sim | RD-04, RD-07 | RD-04, RD-09, RD-10 | 0.50 | 1.00 |
| GS-07 | sim | RD-07, RD-11 | RD-07, RD-11, RD-04 | 1.00 | 1.00 |
| GS-08 | sim | RD-07, RD-11 | RD-11, RD-06, RD-07 | 1.00 | 1.00 |
| GS-09 | sim | RD-07, RD-11 | RD-07, RD-11, RD-12 | 1.00 | 1.00 |
| GS-10 | sim | RD-07 | RD-11, RD-07, RD-03 | 1.00 | 0.50 |
| GS-11 | sim | RD-07, RD-11 | RD-11, RD-07, RD-03 | 1.00 | 1.00 |
| GS-12 | sim | RD-05, RD-08 | RD-05, RD-04, RD-08 | 1.00 | 1.00 |
| GS-13 | sim | RD-08 | RD-08, RD-11, RD-07 | 1.00 | 1.00 |
| GS-14 | sim | RD-05, RD-08 | RD-04, RD-05, RD-07 | 0.50 | 0.50 |
| GS-15 | sim | RD-05, RD-08 | RD-05, RD-01, RD-02 | 0.50 | 1.00 |
| GS-16 | sim | RD-06 | RD-06, RD-03, RD-07 | 1.00 | 1.00 |
| GS-17 | sim | RD-06 | RD-06, RD-11, RD-05 | 1.00 | 1.00 |
| GS-18 | não | RD-06 | RD-06, RD-11, RD-07 | 1.00 | 1.00 |
| GS-19 | não | RD-06, RD-12 | RD-06, RD-05, RD-07 | 0.50 | 1.00 |
| GS-20 | sim | RD-01, RD-02 | RD-02, RD-01, RD-05 | 1.00 | 1.00 |
| GS-21 | sim | RD-02 | RD-01, RD-02, RD-04 | 1.00 | 0.50 |
| GS-22 | sim | RD-01 | RD-01, RD-02, RD-03 | 1.00 | 1.00 |
| GS-23 | sim | RD-09, RD-10 | RD-09, RD-10, RD-01 | 1.00 | 1.00 |
| GS-24 | sim | RD-09, RD-10 | RD-10, RD-09, RD-01 | 1.00 | 1.00 |
| GS-25 | sim | RD-09, RD-12 | RD-09, RD-04, RD-03 | 0.50 | 1.00 |
| GS-26 | sim | RD-12 | RD-12, RD-09, RD-07 | 1.00 | 1.00 |
| GS-27 | sim | RD-12 | RD-06, RD-12, RD-09 | 1.00 | 0.50 |
| GS-28 | não | RD-12 | RD-09, RD-07, RD-12 | 1.00 | 0.33 |
| GS-29 | sim | RD-12 | RD-12, RD-07, RD-11 | 1.00 | 1.00 |
| GS-30 | sim | RD-08 | RD-05, RD-07, RD-03 | 0.00 | 0.00 |


## Leitura

- **O que mudou desde 10/11:** só a RD-09. O limite dela deixou de atribuir a Monterrat et al. (2015) um aumento de tempo de uso sem ganho de aprendizagem, que nenhum texto aberto sustenta (PR #1120). `python -m scripts.rag_indexar_corpus --aplicar` enviou só a RD-09 (`completed`) e manteve as outras 11. A linha antiga saiu do catálogo e a fila de retenção apagou o arquivo antigo da OpenAI às 16:31 UTC (`apagado`). A rodada seguinte do plano confirmou 12 regras indexadas, 0 a enviar e 0 a remover.
- **Comparação com 10/11:** recall@3 e acerto@3 ficaram iguais (0,87 e 0,97 no total). O MRR caiu de 0,89 para 0,88 no total e de 0,91 para 0,89 nas respondíveis, porque a GS-27 passou a trazer a RD-12 em segundo lugar. A RD-12 não mudou; é variação da busca, não efeito da RD-09.
- **Perguntas da RD-09:** GS-23, GS-24 e GS-25 continuam com a RD-09 entre as três primeiras, e GS-23 e GS-24 têm recall 1,00.
- **A única falha completa** continua sendo a GS-30 (relevante `RD-08`), que recuperou `RD-05`, `RD-07` e `RD-03`, como em 10/11.
- **Medir só depois da fila:** a primeira medição de hoje foi feita antes de a fila apagar o arquivo antigo. Com a RD-09 duplicada, várias buscas devolveram duas regras distintas em vez de três, e o recall@3 total caiu para 0,83. Ao reenviar uma regra, espere a fila de retenção processar a remoção (o worker exige 10 minutos de idade e roda a cada 5) antes de medir.
- **Quanto isso vale:** o mesmo limite de 10/11. Com 12 arquivos curtos e top-3, recall alto é esperado e mede pouco. Não diz nada sobre a qualidade das respostas do modelo.

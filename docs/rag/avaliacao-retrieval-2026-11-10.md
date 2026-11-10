# Avaliação da recuperação do RAG — 2026-11-10

Gerado por `api/scripts/rag_avaliar_golden_set.py`. Corpus: 12 regras derivadas, um arquivo por regra. Busca: `vector_stores.search`, filtro `scope=publico`, top-3.

Mede só a recuperação. Não diz se a resposta do modelo ficou certa.

| Grupo | n | recall@3 | acerto@3 | MRR |
|---|---|---|---|---|
| Todas | 30 | 0.87 | 0.97 | 0.89 |
| Respondível = sim | 27 | 0.87 | 0.96 | 0.91 |
| Respondível = não | 3 | 0.83 | 1.00 | 0.78 |

| ID | Respondível | Relevantes | Recuperados (ordem) | recall | RR |
|---|---|---|---|---|---|
| GS-01 | sim | RD-03, RD-04 | RD-03, RD-04, RD-11 | 1.00 | 1.00 |
| GS-02 | sim | RD-03 | RD-03, RD-11, RD-02 | 1.00 | 1.00 |
| GS-03 | sim | RD-03, RD-04 | RD-03, RD-05, RD-02 | 0.50 | 1.00 |
| GS-04 | sim | RD-04 | RD-04, RD-06, RD-03 | 1.00 | 1.00 |
| GS-05 | sim | RD-04 | RD-04, RD-02, RD-07 | 1.00 | 1.00 |
| GS-06 | sim | RD-04, RD-07 | RD-04, RD-09, RD-10 | 0.50 | 1.00 |
| GS-07 | sim | RD-07, RD-11 | RD-07, RD-11, RD-04 | 1.00 | 1.00 |
| GS-08 | sim | RD-07, RD-11 | RD-11, RD-07, RD-06 | 1.00 | 1.00 |
| GS-09 | sim | RD-07, RD-11 | RD-07, RD-11, RD-12 | 1.00 | 1.00 |
| GS-10 | sim | RD-07 | RD-11, RD-07, RD-03 | 1.00 | 0.50 |
| GS-11 | sim | RD-07, RD-11 | RD-11, RD-07, RD-03 | 1.00 | 1.00 |
| GS-12 | sim | RD-05, RD-08 | RD-05, RD-04, RD-08 | 1.00 | 1.00 |
| GS-13 | sim | RD-08 | RD-08, RD-07, RD-11 | 1.00 | 1.00 |
| GS-14 | sim | RD-05, RD-08 | RD-04, RD-05, RD-07 | 0.50 | 0.50 |
| GS-15 | sim | RD-05, RD-08 | RD-05, RD-01, RD-03 | 0.50 | 1.00 |
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
| GS-27 | sim | RD-12 | RD-12, RD-09, RD-06 | 1.00 | 1.00 |
| GS-28 | não | RD-12 | RD-07, RD-09, RD-12 | 1.00 | 0.33 |
| GS-29 | sim | RD-12 | RD-12, RD-07, RD-11 | 1.00 | 1.00 |
| GS-30 | sim | RD-08 | RD-05, RD-07, RD-03 | 0.00 | 0.00 |

## Leitura

- **O que foi feito em 10/11:** as 12 regras do corpus v1 subiram para o Vector Store de produção com `python -m scripts.rag_indexar_corpus --aplicar`, as 12 com status `completed`, e foram registradas em `rag_openai_files`. Antes havia 0. A segunda rodada do plano confirmou: 12 já indexadas e 0 a enviar. Desde então, a chave do RAG (ligada em produção) tem o que buscar.
- **Quanto isso vale:** com 12 arquivos curtos e top-3, um recall alto é esperado e mede pouco. Isto confirma que a busca encontra a regra certa no corpus atual. Não é uma avaliação de RAG em escala, e não diz nada sobre a qualidade das respostas do modelo.
- **A única falha completa:** GS-30 (relevante `RD-08`) recuperou `RD-05`, `RD-07` e `RD-03`.
- **Perguntas sem resposta no corpus** (GS-18, GS-19 e GS-28, "respondível = não"): a busca sempre devolve três regras. Recusar responder não acontece na recuperação; é o prompt quem tem de fazer.

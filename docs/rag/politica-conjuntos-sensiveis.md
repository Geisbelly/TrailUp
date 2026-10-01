# Política de uso dos conjuntos sensíveis

**Issue:** [#74](https://github.com/BitStudioLabs/trail-up/issues/74) · gate [#195](https://github.com/BitStudioLabs/trail-up/issues/195)

**Status:** decisão registrada. Vale até revisão explícita com alguém além da engenharia.

**Atualizado em:** 2026-09-30

## Conjuntos e natureza do dado

| Conjunto (identificador #70) | Natureza | Enquadramento LGPD |
| --- | --- | --- |
| `Student Depression Dataset.csv` | Saúde mental (depressão) | Sensível (art. 11) |
| `psychological_state_dataset new.csv` | Estado psicológico | Sensível (art. 11) |
| `neurodiversity_education_dataset.csv` + `Neurodiversity in Educational Settings Anonymized` | Neurodivergência | Sensível (art. 11) |
| `AI_SocialMedia_Student_Health_Dataset_clean.csv` | Saúde / redes sociais | Sensível se identificar condição de saúde (art. 11) |
| `Facial_data` | Biometria facial | Sensível (art. 11, I) + risco de identificação direta |

Anonimizado na origem não encerra a questão: reidentificação por cruzamento entre conjuntos é risco real e deve ser tratada como premissa, não exceção.

## Decisão

1. **Nenhum conjunto sensível entra no índice do RAG.** Vedação total: sem `file_search`, sem chunk, sem texto derivado de linha individual. O que pode virar texto derivado (regra geral da triagem #71) para no sensível — achado agregado publicado pelo autor do conjunto pode ser *citado* como literatura, nunca reconstruído das linhas.
2. **Pesquisa/validação só com finalidade e base legal registradas.** Antes de qualquer uso (inclusive calibração de heurística ou treino), abrir registro com: finalidade específica, base legal LGPD, quem aprovou fora da engenharia, e limitação da amostra a declarar junto ao resultado.
3. **`Facial_data`: vedado qualquer uso.** Maior risco (biometria de terceiros, possível menor) e menor retorno (o TrailUp não faz reconhecimento facial — emoção no app é mock/opt-in de câmera, #195). Decisão explícita: não baixar, não versionar, não processar. Reabrir exige avaliação de privacidade dedicada.
4. **Nenhum dado sensível de terceiro treina modelo que decide sobre aluno real.** Se o produto passar a inferir estado psicológico a partir de modelo treinado nesses dados, a conclusão volta para pessoas concretas — isso exige base legal própria, avaliação de impacto e aprovação fora da engenharia, não apenas esta política.
5. **Nenhum envio a terceiro sem passar pela #74 + gate #195.** Vale para Vector Store, Jev/TyperSafe, Gemini/OpenAI ou qualquer fornecedor: dado sensível (de terceiro ou de aluno real) não sai do banco sem decisão registrada.

## Publicação (TCC/produto)

Todo resultado derivado de dado sensível declara junto: a amostra de origem, seus limites (população, época, instrumento) e que a generalização para alunos do TrailUp não foi estabelecida. Sem isso, o resultado não entra no TCC nem no produto.

## Revisão

Esta política é decisão de engenharia com efeito de trava. Mudança de qualquer item 1–5 exige: proposta escrita, avaliador fora da engenharia, e registro nesta página (data + quem aprovou).

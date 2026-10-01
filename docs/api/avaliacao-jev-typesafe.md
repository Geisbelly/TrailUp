# Avaliação do Jev (TypeSafe) — issue #216

## Decisão recomendada

**Não substituir nenhum componente de produção pelo Jev nesta etapa.**

O Jev reproduziu os quatro casos sintéticos do motor de decisão atual, mas essa
paridade mede somente a capacidade de seguir a regra fornecida; não prova
acurácia pedagógica nem calibração no domínio TrailUp. O modelo M2 local tem
alvo diferente e continua sendo a alternativa a avaliar na #215 para domínio e
gate de intervenção.

Um experimento posterior só pode considerar Jev para uma decisão discreta,
não sensível e de baixo impacto, executada em *shadow mode* com schema de
entrada explicitamente minimizado e exemplos rotulados do TrailUp. Nenhuma
chamada deve receber identificação do aluno, nome, e-mail, imagem, áudio ou
telemetria bruta.

## O que o Jev oferece

[Jev](https://docs.typesafe.ai/concepts/system-one) é um modelo de avaliação
estruturada: recebe texto ou JSON textual e responde perguntas `Choice`,
`Score` e `Noul` com probabilidades. Ele não recebe imagens, áudio ou vídeo e
não gera a explicação pedagógica que o TrailUp entrega ao aluno.

A PoC usou o [cliente Python oficial](https://docs.typesafe.ai/sdk),
`typesafe-sdk` 0.7.1, com o modelo `jev-latest`. A chave foi fornecida apenas
no ambiente efêmero da execução; não foi gravada em arquivos, configuração ou
histórico de comandos do repositório.

## Pontos de decisão encontrados

| Ponto atual | Evidência | Compatibilidade com Jev | Recomendação |
| --- | --- | --- | --- |
| `XGBoostDecisionEngine` | `api/app/services/linear_analysis_pipeline.py` | Alta tecnicamente: ações e modo são opções finitas. Apesar do nome, é uma regra determinística, não um XGBoost treinado. | Manter a regra. Paridade não justifica adicionar rede, custo e fornecedor externo. |
| `DeepKnowledgeTracingAnalyzer` / M2 | `api/app/services/linear_analysis_pipeline.py`; `core-trailup/docs/m2_knowledge_tracing/RELATORIO_M2.md` | Não é o mesmo alvo: M2 estima domínio e o risco de travar; Jev classificaria uma descrição do estado. | Avaliar M2 na #215; não comparar como substitutos. |
| Supervisor do LangGraph | `api/app/agent/graph/nodes/supervisor.py` | O roteamento é escolha finita, mas o resumo hoje contém IDs, emoção e eventos. | Não enviar a estado externo sem schema minimizado e aprovação de privacidade. |
| Sugestão de material | `api/app/services/sugestao_material.py` | Possível tecnicamente, mas inadequada: hoje é reproduzível e auditável. | Manter determinístico. |
| Emoção, atenção e quadros de câmera | `api/app/services/linear_analysis_pipeline.py` | Incompatível para mídia; alto risco para dados sensíveis. | Não usar Jev. |

## PoC de paridade do motor de decisão

Foram enviados somente quatro estados sintéticos, sem texto livre, dados de
aluno ou identificadores. Cada estado tinha `attention`, `frustration`,
`engagement` e `mastery`. As perguntas reproduziram seis saídas da regra atual:
cinco ações booleanas e o modo (`reforco`, `desafio` ou `imediato`).

| Caso sintético | Saídas esperadas que coincidiram | Latência observada | Tokens de entrada/saída |
| --- | ---: | ---: | ---: |
| Reforço: frustração alta, domínio 0,35 | 6/6 | 1.458 ms | 630 / 132 |
| Pausa: atenção baixa, domínio 0,60 | 6/6 | 1.315 ms | 629 / 132 |
| Desafio: engajamento alto, domínio 0,85 | 6/6 | 344 ms | 630 / 131 |
| Manter: sinais moderados, domínio 0,60 | 6/6 | 586 ms | 630 / 132 |
| **Total** | **24/24** | **344–1.458 ms** | **2.519 / 527** |

**Custo calculado, não faturado:** a documentação oficial lista Jev 1.13 a
US$ 0,042 por milhão de tokens de entrada e saída gratuita
([preços e modelos](https://docs.typesafe.ai/models)). Aplicando a tarifa aos
2.519 tokens de entrada medidos nesta PoC, o custo estimado é
US$ 0,000105798; os 527 tokens de saída não acrescentam custo. Não é uma fatura
nem uma medição de produção.

**Comparação operacional:** a regra `XGBoostDecisionEngine` é local e
determinística (`linear_analysis_pipeline.py:607-640`), sem chamada externa
nesse passo. A latência dela não foi medida nesta PoC; portanto, não há
comparação observada de latência/custo entre regra e Jev. A latência 344–1.458
ms acima é apenas a observação do serviço Jev nos quatro casos sintéticos.

## Estado dos critérios da issue #216

| Critério | Estado e evidência |
| --- | --- |
| Inventário de decisões tipadas, custo e latência atuais | **Parcial:** os pontos e recomendações estão listados acima; o custo/latência local não foram medidos. |
| PoC com estados do TrailUp | **Parcial:** quatro estados sintéticos sem dados pessoais; não são exemplos rotulados ou representativos validados pedagogicamente. |
| Comparação de acurácia com a regra atual e com M2 onde houver alvo comum | **Parcial:** 24/24 coincidências com a regra que gerou os casos; não é medida de acurácia independente. M2 tem alvos diferentes (domínio e risco de travar), então não há comparação comum nesta PoC. |
| Latência, custo e calibração no domínio TrailUp | **Parcial:** latência observada e custo calculado acima; calibração/qualidade pedagógica não avaliadas sem conjunto rotulado independente. |
| Dependência, privacidade de menores e custo de saída | **Analisado qualitativamente** em “Riscos e condições para novo experimento”; não houve envio de dado real nem custo de migração medido. |
| Recomendação explícita com evidência | **Concluído:** não substituir produção nesta etapa; manter regra local e não usar Jev em decisões sensíveis. |
| Sem alteração de produção | **Concluído:** avaliação e recomendação documentais, sem integração de Jev no runtime. |

Assim, este documento fecha a **avaliação exploratória e a decisão de não
substituir**; não afirma que a PoC prove acurácia, calibração ou benefício no
domínio TrailUp. Os critérios quantitativos em aberto exigem conjunto rotulado
independente e medição da regra atual antes de uma decisão de promoção.

O modelo retornado foi `jev-1.13.0`. A confiança do `Choice` de modo foi 1,0
nos quatro casos, mas isso **não** valida a calibração: os casos foram
construídos a partir da própria regra comparada. Não há exemplos rotulados do
TrailUp nesta PoC e, portanto, não há métrica de acurácia, ECE ou benefício
pedagógico a alegar.

## Riscos e condições para novo experimento

- O estado inicial do TrailUp contém nome, e-mail, IDs, eventos e possivelmente
  `frame_b64` (`api/app/services/state_builder.py`). O experimento não pode
  reutilizá-lo como payload externo.
- A política para dados sensíveis de menor é tratada nas issues #74 e #195;
  nenhuma delas é substituída por retenção zero declarada por fornecedor.
- Uma queda, timeout ou resposta de baixa confiança não pode decidir ação de
  impacto pedagógico. O fallback deve ser a regra local e o resultado deve ser
  apenas registrado para comparação.
- Antes de uma promoção, criar conjunto de avaliação rotulado e versionado,
  medir acordo com revisores, taxa de abstenção, latência p95 e calibração por
  decisão. A aprovação deve incluir privacidade, custo e critérios de rollback.

## Referências

- [Documentação oficial do System One/Jev](https://docs.typesafe.ai/concepts/system-one)
- [Cliente Python oficial](https://docs.typesafe.ai/sdk)
- [Referência da API](https://docs.typesafe.ai/api)
- `core-trailup/docs/m2_knowledge_tracing/RELATORIO_M2.md` (repositório irmão)

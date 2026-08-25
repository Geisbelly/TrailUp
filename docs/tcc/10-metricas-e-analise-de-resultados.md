# 10. Metricas e analise de resultados

Data de atualizacao: 2026-04-19

## 1. Objetivo deste capitulo
Definir o quadro de metricas para monitorar efetividade pedagogica, estabilidade operacional e qualidade da personalizacao no ecossistema TrailUp.

## 2. Taxonomia de metricas
- Engajamento: uso, retorno e permanencia;
- Aprendizagem: conclusao, acerto, progressao;
- Operacao: latencia, fila, falha parcial;
- Qualidade de personalizacao: cobertura, completude, qualidade por formato.

## 3. Metricas de engajamento
- tempo ativo por topico (min/aluno/semana);
- taxa de retorno semanal (WAU de alunos ativos);
- sessoes por aluno;
- abandono por etapa do fluxo.

## 4. Metricas de aprendizagem
- percentual de conclusao por topico e classe;
- taxa de atividades concluidas;
- acertos percentuais quando avaliacao estiver disponivel;
- velocidade de progressao entre marcos.

## 5. Metricas de personalizacao
- cobertura de alunos com material personalizado;
- distribuicao de status por formato (`completed`, `pending`, `partial`, `failed`);
- tempo medio de geracao por formato;
- taxa de reprocessamento necessaria.

## 6. Metricas de gamificacao e ranking
- variacao de posicao por janela temporal;
- pontuacao acumulada por classe;
- participacao no top N;
- consistencia entre eventos e view consolidada de ranking.

## 7. Formula exemplar
- Conclusao de topico (%) = (alunos com topico concluido / alunos da turma) x 100
- Cobertura de personalizacao (%) = (alunos com pelo menos um material valido / alunos alvo) x 100
- Latencia de job = `finished_at - created_at`

## 8. Painel minimo recomendado
- painel aluno: progresso, tempo, atividades;
- painel professor: turma, ranking, gargalos de personalizacao;
- painel tecnico: fila de jobs, erros, disponibilidade.

## 9. Fluxo de analise
```mermaid
flowchart LR
  D[Dados operacionais] --> C[Consolidacao]
  C --> K[KPIs]
  K --> I[Interpretacao]
  I --> A[Acoes de produto e pedagogia]
  A --> D
```

## 10. Leitura critica de resultado
- separar melhoria real de efeito de sazonalidade;
- controlar impacto de mudancas simultaneas no produto;
- observar heterogeneidade por perfil e turma;
- reportar limitacoes metodologicas junto ao resultado.

## 11. Gatilhos de revisao arquitetural
- aumento persistente de `pending`/`failed`;
- divergencia entre progresso agregado e eventos;
- crescimento de custo por artefato sem ganho equivalente;
- regressao de latencia acima de SLO definido.

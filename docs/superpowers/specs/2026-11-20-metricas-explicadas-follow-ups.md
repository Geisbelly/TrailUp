# Métricas explicadas: o que a leitura das fontes encontrou

Escrever as explicações (spec `2026-11-20-metricas-explicadas-design.md`) exigiu ler, para cada
métrica, a função ou view que a calcula. Algumas leituras mostraram números que não fazem o que a
tela sugere. Nada disto foi corrigido neste PR: o PR só explica, e cada explicação diz o que o
número é hoje, com os limites. Cada item abaixo é um trabalho separado.

## Dados

1. **Taxa de acertos da turma sempre vazia.** `classe_aluno.acertosPercentual` está NULL nas 6
   matrículas de produção (consulta de 20/11). Só a API grava esse campo
   (`personalizacao_progresso.py`, `atualizar_classe_aluno_snapshot`), ao salvar progresso de item
   personalizado. Efeito: o card "Taxa de acertos" do console mostra sempre "sem dado", e o
   critério `acertos` do ranking empata todo mundo em 0.
2. **Acertos do aluno divergem entre console e app.** O app calcula a média de acertos das
   atividades do professor (`mobile/src/utils/classeMetrics.ts`, `resolveAtividadeAcertos`) e só cai
   para `classe_aluno.acertosPercentual` quando a turma não tem atividade. O console mostra
   `classe_aluno.acertosPercentual`. O mesmo aluno vê um número e o professor outro (ou nenhum).
3. **Escala da nota.** `trg_classe_aluno_nota_pelo_banco` barra só `authenticated` e `anon`. A API
   (`service_role`) grava `notaMedia` em `personalizacao_progresso.py` na escala 0–100, e o banco usa
   0–10. Hoje nenhuma nota passa de 10, mas a primeira gravação da API quebra a escala.
4. **Zero fabricado no chat após erro.** `uso_chat_apos_erro_pct` vira 0 por `COALESCE` quando não
   há mensagem. Sem conversa, o card deveria dizer "sem dado", não "0%".
5. **Evolução do aluno não é histórico.** Em `vw_metricas_evolucao_desempenho_aluno_dia`, a nota e o
   progresso de cada dia são o valor atual de `classe_aluno` repetido, e o dia sem questão aparece
   com 0% de acerto. O gráfico da aba Visão geral do aluno desenha essas linhas como se fossem uma
   série. A explicação já avisa; o certo é guardar o histórico ou não desenhar a linha.

## Textos da tela

6. **"Intervalo recente" diz o contrário do dado.** O subtítulo em
   `mobile/src/components/perfil/ProfileMetricsViews.tsx` ("Tempo ativo do último intervalo
   registrado, não da sessão inteira") contradiz `timeMetricsRecentes`, que soma todos os lotes
   desde que o app abriu (`MetricasContext`, `somarTimeMetrics`). A explicação nova diz "desde que
   você abriu o app"; o subtítulo precisa acompanhar.
7. **Ícone repetido no painel Mistério.** O tile "Desafios resolvidos" usa `help-circle-outline`,
   que é o ícone do guia da seção. Contraria "um ícone, um significado".

## Produto

8. **A leitura de emoção quase nunca existe.** Ela só sai com a câmera ligada e com
   `EMOTION_MODEL_PROVIDER=local_vision`, e o padrão é `unavailable`. Para quase todos os alunos o
   painel mostra "Sem leitura recente". Vale decidir se o chip continua no Perfil.

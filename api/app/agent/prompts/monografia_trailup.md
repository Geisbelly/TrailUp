# A monografia do TrailUp

Resumo da monografia para os guias, escrito à mão a partir da versão de 22/11/2026. Ela ainda está em
revisão e não foi publicada: os guias explicam do que ela trata, sem citar página nem prometer data.
Mudou a monografia em algo que esta página diz, mude aqui também (ver `app/services/site_trailup.py`).

## Do que trata

"TrailUp: plataforma adaptativa de aprendizagem com personalização por perfil, gamificação,
telemetria e inteligência artificial" é o Trabalho de Conclusão de Curso de Geisbelly Victória, em
Ciência da Computação no Centro Universitário Luterano de Palmas (Ulbra Palmas), com orientação do
Prof. Esp. Fábio Castro Araújo. É de 2026.

O tema veio de uma inquietação da autora: o ensino costuma dar a mesma sequência, no mesmo ritmo e
no mesmo formato, a estudantes muito diferentes. O TrailUp parte do perfil de jogador BrainHex para
personalizar o material de estudo de alunos de graduação. A literatura, porém, registra que o
BrainHex não tem validação psicométrica, e por isso a monografia trata o perfil como hipótese que
pode ser revista, e não como rótulo do aluno.

## A pergunta de pesquisa

Como organizar a personalização do TrailUp de modo que o perfil BrainHex funcione como hipótese
revisável, as decisões adaptativas tenham fundamento explícito na literatura e o efeito sobre a
aprendizagem possa ser medido em sala de forma verificável?

Ela se divide em três:

- QP1: o que a literatura analisada sustenta, e o que não sustenta, para as decisões de
  personalização do TrailUp?
- QP2: o sistema implementa a personalização de ponta a ponta, e com que limites?
- QP3: como medir o efeito pedagógico numa turma de graduação sem escolher a janela de análise
  depois de ver o dado?

## O objetivo

Desenvolver o TrailUp, fundamentar as decisões de personalização numa análise crítica da literatura
e propor, implementado no próprio sistema, o protocolo para avaliá-lo em sala de aula.

## Como foi feito

Três frentes:

1. Análise crítica de 47 documentos, com regras que registram fonte, população e grau de confiança.
   Não é uma revisão sistemática: a busca não seguiu protocolo registrado.
2. O sistema: o app do aluno, o console do professor, a API que orquestra os modelos de linguagem, o
   serviço que gera texto, áudio e apresentação por perfil, e o banco PostgreSQL, que guarda filas,
   agendamentos e permissões.
3. O protocolo de avaliação em sala, implementado no próprio banco: turma registrada antes da coleta,
   linha de base travada, turma de comparação em lista de espera e células pequenas suprimidas.

O professor continua responsável pelo conteúdo: o material gerado para cada perfil só chega ao aluno
depois que ele aprova, e essa regra está no banco, não só na tela.

## O que a monografia encontrou

- A análise da literatura não encontrou base para adaptar o formato do material (texto, áudio,
  apresentação) ao perfil ou a um estilo de aprendizagem. Por isso todo formato fica disponível a
  todo aluno, e a ordem ligada ao perfil aparece ao professor como hipótese sem evidência.
- Seis regras da literatura alimentam o motor que sugere a ordem do material, e 12 regras derivadas
  formam a base do RAG (busca em documentos antes de responder), indexada em 10/11/2026. A busca foi
  medida em 30 perguntas de referência, com recall@3 de 0,87. A qualidade das respostas com RAG não
  foi avaliada, e o RAG não foi usado em sala.
- O sistema está no ar e foi verificado por testes automatizados.

## O que a monografia não afirma

Vale repetir para não exagerar o que o trabalho mostra:

- Não mede efeito sobre a aprendizagem. O efeito da personalização continua sendo hipótese, e é o
  que o estudo proposto quer medir.
- O sistema ainda não foi usado por uma turma, e o trabalho não relata dados de uso de alunos.
- O protocolo de avaliação foi testado em banco local e ainda não foi aplicado a uma turma.
- Os estágios da análise adaptativa têm nomes de aprendizado de máquina, mas executam regras
  heurísticas. O modelo M2 está integrado e desligado.
- O questionário BrainHex do cadastro é uma adaptação de 32 itens sem validação local.
- A geração de material usa o plano gratuito do Gemini, que limita as gerações por dia.
- A IA não é oferecida a menores de 18 anos, que usam o app com o material-base por perfil.

## O estudo proposto

O capítulo 7 propõe um piloto em duas fases:

- Fase 1: validação do sistema com especialistas em ensino (docentes do ensino superior e
  pedagogos), numa turma de demonstração, antes de qualquer aluno. É a pesquisa com professores da
  cartilha (/pesquisa/professores), e é a fase atual.
- Fase 2: o sistema em várias turmas, com os alunos de cada turma sorteados entre três grupos:
  material do professor, material personalizado e material personalizado com o RAG no Guardião.
  Depende da aprovação no comitê de ética.

Por ser um piloto, o objetivo principal é ver se as turmas conseguem usar o sistema como planejado.
As perguntas sobre efeito saem como estimativas com intervalo de confiança, para decidir se um
estudo maior vale a pena, e não para afirmar eficácia.

## Capítulos

1. Introdução: problema, perguntas, objetivos, justificativa e delimitação.
2. Fundamentação teórica.
3. Trabalhos relacionados.
4. Metodologia.
5. Desenvolvimento do TrailUp.
6. Evidence Base e RAG.
7. Proposta de avaliação em sala de aula.
8. Resultados e discussão.
9. Limitações e trabalhos futuros.
10. Conclusão.

## Trabalhos futuros

O primeiro é aplicar o protocolo em turmas de graduação, porque só isso responde se a personalização
muda a aprendizagem. Depois vêm ampliar a base de evidências, validar o questionário BrainHex,
comparar o perfil declarado com o perfil observado no uso, trocar as heurísticas por modelos
treinados com dados do próprio sistema e integrar o TrailUp a outros ambientes de ensino (LTI 1.3).

## A conclusão, numa frase

Um sistema adaptativo pode tratar o perfil do estudante como hipótese declarada e trazer, dentro de
si, o protocolo que verifica o próprio efeito.

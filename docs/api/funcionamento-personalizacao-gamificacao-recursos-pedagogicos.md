# Funcionamento detalhado: Personalizacao, Gamificacao e Recursos Pedagogicos (API)

## Objetivo
Explicar o fluxo funcional e pedagogico coordenado pela API TrailUp, incluindo motivacoes e metas de aprendizagem.

## 1. Personalizacao

### Como funciona
1. professor estrutura o topico/conteudo
2. web dispara job de personalizacao
3. API monta contexto do aluno + topico + fonte
4. pipeline gera plano e materiais
5. midia e processada pelo ApiBrainHex
6. API persiste em `conteudo_personalizado`

### Motivos
- adaptar linguagem e ritmo ao perfil BrainHex
- aumentar relevancia do conteudo
- reduzir friccao cognitiva em topicos complexos

### Objetivos pedagogicos
- melhorar compreensao conceitual
- aumentar retencao de conteudo
- elevar conclusao de topicos

## 2. Gamificacao

### Elementos no ecossistema
- ranking por classe (tempo, pontuacao, percentual)
- conquistas por comportamento e progresso
- notificacoes de evolucao
- sinais de engajamento por eventos

### Papel da API
- receber eventos e progresso
- manter contrato para leitura de desempenho
- suportar retroalimentacao de estrategias personalizadas

### Motivos
- reforcar engajamento continuo
- estimular consistencia de estudo
- tornar progresso visivel e comparavel

### Objetivos
- aumentar recorrencia de estudo
- aumentar tempo ativo em topicos
- melhorar taxa de finalizacao de atividades

## 3. Recursos pedagogicos aplicados

### Tipos de recurso
- explicacao textual (markdown)
- narracao guiada (audio)
- apresentacao visual (pdf/slides)
- atividades e questoes
- cards de revisao

### Critrios de aplicacao
- adequacao ao perfil BrainHex
- alinhamento com objetivo pedagogico do topico
- disponibilidade tecnica no cliente

### Motivos
- atender estilos de aprendizagem diferentes
- combinar memoria verbal, visual e aplicada
- reduzir dependencia de um unico formato

### Objetivos
- aumentar acerto medio em atividades
- reduzir abandono de bloco
- acelerar retomada apos pausa

## 4. Guardrails
- nao depender de um unico artefato para liberar estudo
- permitir fallback em falha de midia
- nao acoplar rank a calculo no cliente
- preservar auditoria por job/target/evento

## 5. Indicadores de sucesso recomendados
- tempo ativo por topico
- taxa de conclusao por topico
- acertos em atividades
- latencia de entrega da personalizacao
- taxa de falha por artefato de midia

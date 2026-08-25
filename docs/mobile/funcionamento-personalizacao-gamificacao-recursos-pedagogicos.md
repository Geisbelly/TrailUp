# Funcionamento detalhado: Personalizacao, Gamificacao e Recursos Pedagogicos (Mobile)

## Objetivo
Documentar como o app entrega personalizacao e gamificacao no estudo diario, com foco em motivo, objetivo e comportamento esperado.

## 1. Personalizacao no app

### Fluxo
1. aluno abre topico
2. app busca personalizacao disponivel direto no Supabase (por perfil BrainHex)
3. app monta blocos e materiais
4. app aplica tema e guia por perfil BrainHex
5. app registra progresso por item

### Motivos
- contextualizar conteudo ao perfil do aluno
- reduzir carga cognitiva com linguagem adequada
- aumentar aderencia ao plano de estudo

### Objetivos
- aumentar leitura efetiva de materiais
- melhorar transicao entre conteudo e atividade
- reduzir abandono de topico

## 2. Gamificacao no app

### Elementos
- ranking por classe
- conquistas
- notificacoes de evolucao
- indicadores de progresso e acerto

### Motivos
- dar feedback frequente
- reforcar progresso incremental
- sustentar disciplina de estudo

### Objetivos
- elevar tempo ativo dentro de topicos
- aumentar consistencia semanal
- melhorar percentual de conclusao

## 3. Recursos pedagogicos aplicados

### Recursos
- markdown didatico
- audio guiado
- apresentacao visual
- atividades (quiz, vf, lacuna, dissertativa)
- cards de revisao

### Aplicacao
- conteudo multimodal com fallback por formato
- prioridade para continuidade pedagogica (nao bloquear estudo por falha de midia)

### Motivos
- atender perfis de aprendizagem diferentes
- combinar reforco visual, textual e pratico

### Objetivos
- elevar acerto em atividade
- aumentar retencao de conceitos nucleares
- acelerar retomada apos interrupcao

## 4. Persistencia e rank
- tempo deve ser persistido durante estudo ativo em topico/conteudo/atividade
- eventos de pontuacao devem ser gravados em `eventos_aluno`
- rank deve ser consumido por `vw_rank_posicoes_por_classe`

## 5. Indicadores recomendados
- tempo ativo por topico
- conclusao por topico
- acerto por atividade
- participacao no ranking
- uso de materiais por formato

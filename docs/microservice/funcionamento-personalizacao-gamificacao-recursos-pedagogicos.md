# Funcionamento detalhado: Personalizacao, Gamificacao e Recursos Pedagogicos (ApiBrainHex)

## Objetivo
Explicar como o microservico aplica personalizacao de linguagem e formato pedagogico, e como isso sustenta gamificacao no ecossistema.

## 1. Personalizacao

### Entrada
- perfil BrainHex
- contexto pedagogico do topico
- identificadores de classe/topico/personalizacao

### Processamento
1. gerar narrativa e estrutura em markdown
2. gerar roteiro de audio aderente ao perfil
3. gerar imagens de apoio para slides
4. montar apresentacao final
5. publicar artefatos e atualizar banco

### Motivos
- adaptar tom e explicacao ao perfil
- aumentar engajamento cognitivo por identidade narrativa

### Objetivos
- melhorar compreensao do conteudo
- aumentar consumo de materiais personalizados

## 2. Gamificacao (suporte indireto)
ApiBrainHex nao calcula ranking ou conquistas, mas apoia gamificacao ao:
- entregar material de estudo mais aderente ao perfil
- reduzir friccao de aprendizado
- aumentar probabilidade de progresso e pontuacao no app

## 3. Recursos pedagogicos aplicados
- markdown estruturado
- audio guiado por voz/persona
- apresentacao visual por perfil

### Motivos
- abordagem multimodal para diferentes estilos de aprendizagem
- reforco de conceito por repeticao em canais distintos

### Objetivos
- maior retencao
- melhor transferencia para resolucao de atividades

## 4. Guardrails
- status por artefato (`pending`, `completed`, `failed`)
- merge sem sobrescrever artefato ja concluido
- fallback em falha parcial de pipeline

## 5. Indicadores recomendados
- taxa de sucesso por artefato
- tempo medio de processamento
- cobertura de personalizacao por perfil

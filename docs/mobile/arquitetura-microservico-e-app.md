# Arquitetura do Microservico e do App (Contexto Mobile)

## Objetivo
Descrever como o app mobile consome personalizacao direto do Supabase e como API TrailUp + microservico ApiBrainHex orquestram a geracao de artefatos.

## Visao arquitetural

```text
App Mobile ------------------> Supabase (leitura personalizacao/progresso)
    |                               ^
    |                               |
    +------> API TrailUp ---------->+ (orquestracao/jobs/progresso/chat)
                    |
                    +-------------> ApiBrainHex (geracao multimidia)
```

## Camadas no app
- UI/Navegacao: `src/app`, `src/screens`, `src/components`
- Estado global: `src/context`
- Dados de dominio: `src/models`
- Integracoes externas: `src/services`
- Normalizacao/renderizacao: `src/utils`

## Responsabilidades do app
- autenticar aluno
- carregar trilha e contexto da classe
- abrir topico e alternar entre conteudo/atividade
- renderizar materiais personalizados
- persistir tempo e progresso
- enviar telemetria/eventos

## Integracao com API e microservico
- app nao chama ApiBrainHex diretamente
- app consome artefatos em `conteudo_personalizado` e `cards_personalizados` direto no Supabase
- API e responsavel por orquestracao e estado de processamento
- API e usada pelo app para acionar geracao/retentativa, progresso personalizado e chat mentor

## Motivos e objetivos
- centralizar logica adaptativa no backend
- manter app resiliente com fallback local
- reduzir acoplamento do cliente a detalhes de processamento multimidia

## Objetivos de UX e aprendizagem
- continuidade de estudo mesmo com falhas parciais de midia
- visualizacao consistente de formatos (markdown/audio/video/pdf/docx/pptx)
- progresso confiavel para alimentar rank e analytics

## Riscos e mitigacoes
- risco: rede instavel (`Network request failed`)
  - mitigacao: fallback de tela e persistencia incremental
- risco: artefato indisponivel
  - mitigacao: fallback por formato e continuidade do fluxo
- risco: rank nao refletir estudo
  - mitigacao: persistencia de tempo ativo + eventos validos + leitura por view

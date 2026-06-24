# Arquitetura do Microservico e do App (Contexto ApiBrainHex)

## Objetivo
Descrever a arquitetura do microservico de midia e sua relacao com os apps (mobile/web), separando o papel da API TrailUp e do Supabase.

## Posicionamento no ecossistema

```text
Web -> API TrailUp -> ApiBrainHex -> Supabase Storage + Postgres
Mobile -> Supabase (leitura personalizacao por perfil)
```

ApiBrainHex e um servico especializado de geracao de artefatos pedagogicos.

## Componentes internos
- `server.ts`: endpoints HTTP e orquestracao
- `geminiService.ts`: texto, audio e imagem
- `pdfService.ts`: montagem da apresentacao
- `supabaseService.ts`: upload e merge de materiais
- `brainHex.ts`: configuracao de perfis, guia e identidade

## Responsabilidades
- gerar artefatos por perfil BrainHex
- manter consistencia de estilo por perfil
- publicar arquivos no storage
- atualizar `conteudo_personalizado.materiais`
- nao expor endpoint de leitura de personalizacao para o app mobile

## Fora do escopo
- calculo de ranking
- persistencia de progresso academico
- CRUD pedagogico da turma

## Motivos e objetivos
- isolar processamento multimidia pesado
- facilitar evolucao de prompts e render sem quebrar API principal
- manter padrao visual e narrativo por perfil

## Objetivos operacionais
- reduzir falha total de pipeline (tratar por artefato)
- garantir idempotencia de update em `materiais`
- manter rastreabilidade de processamento por `personalizacao_id`

# Arquitetura do App (Studio/Frontend do ApiBrainHex) - Versão Detalhada

## 1. Objetivo
Descrever arquitetura do app frontend interno do repositório, separado da arquitetura do microserviço backend.

## 2. Escopo do app
- interface de upload de conteúdo
- seleção de perfil BrainHex
- pré-visualização de conteúdo gerado
- acionamento de arquivamento

## 3. Diagrama de alto nível
```mermaid
flowchart LR
  UI[React App.tsx]
  SVC[Client Services]
  API[Express Endpoints]

  UI --> SVC
  SVC --> API
```

## 4. Fluxo principal do app
1. usuário seleciona arquivo e perfil
2. app chama processamento
3. app mostra resultado (markdown, áudio, slides)
4. app dispara arquivamento

## 5. Responsabilidades do frontend
- composição de payload para `/api/v1/archive`
- controle de estado de geração
- download e preview de artefatos

## 6. Limites do frontend
- não executa persistência direta no banco
- não controla merge transacional de materiais

## 7. Objetivos de UX
- operação rápida para validação de resultado
- visibilidade clara de erro e sucesso
- consistência visual por perfil BrainHex

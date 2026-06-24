# Arquitetura de Estrutura e Camadas - Mobile

## Camadas
- Navegacao e telas (`src/app`, `src/screens`).
- Componentes de UI (`src/components`).
- Contextos de estado (`src/context`).
- Modelos de dados (`src/models`).
- Servicos externos (`src/services`).
- Utilitarios (`src/utils`).

## Regra pratica
A tela nao deve conhecer SQL. Persistencia passa por model/context/service.

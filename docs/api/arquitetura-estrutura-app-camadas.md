# Arquitetura de Estrutura e Camadas - API TrailUp

## Camadas
- API HTTP (`app/api`): endpoints e validacao de contrato.
- Servicos (`app/services`): orquestracao de personalizacao, jobs, telemetria.
- Repositorios (`app/repositories`): SQL e acesso a dados.
- Agentes/Grafos (`app/agent`): fluxo adaptativo.
- Core (`app/core`): configuracoes e bootstrap.

## Regra de dependencia
- API depende de servicos.
- Servicos dependem de repositorios.
- Repositorios dependem apenas do banco.
- Controllers/routers nao acessam SQL diretamente.

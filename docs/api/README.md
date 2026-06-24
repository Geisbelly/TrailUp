# Documentacao tecnica

## Como navegar neste diretorio
1. Leia o `README.md` da raiz do repositorio para contexto rapido.
2. Consulte `docs/tcc/README.md` para trilha estruturada completa.
3. Aprofunde por tema usando os guias especializados abaixo.

## Guias principais
- `arquitetura-microservico-detalhada.md`
- `arquitetura-app-detalhada.md`
- `funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md`
- `funcionamento-api-arquitetura-fluxos.md` (quando existente)
- `modelagem-dados-banco.md` (quando existente)
- `seguranca.md` e `politicas-dados-privacidade.md` (quando existentes)

## Pacote TCC (versao expandida)
Todos os capitulos em `docs/tcc/` foram ampliados para cobrir:
- arquitetura separada de app e microservico;
- modelo adaptativo e aplicacao operacional;
- logica de banco, ranking e automacoes;
- UX, LGPD, seguranca e metodologia de avaliacao;
- metricas de impacto, limitacoes e roadmap.

## Criterio de atualizacao
Ao alterar fluxo funcional, contrato de API, regra de banco, ou metrica de produto:
- atualize o capitulo correspondente em `docs/tcc/`;
- registre impacto de operacao/risco;
- mantenha coerencia com o estado real do codigo e banco.

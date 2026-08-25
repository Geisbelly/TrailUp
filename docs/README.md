# Documentação — TrailUp

Documentação central do monorepo. Cada subpasta corresponde a um dos serviços
e reúne a documentação que antes vivia dentro de cada repositório.

> As versões dos documentos compartilhados (arquitetura, banco, fluxos) foram
> **preservadas por projeto**, pois divergem entre si — cada serviço manteve a
> sua perspectiva. Consulte a pasta do projeto correspondente.

## Começando

- **[Manual de uso](./MANUAL.md)** — instalação, configuração, execução, testes e troubleshooting.

## Documentos transversais

Documentação que não pertence a um único serviço:

- **[`tcc/`](./tcc/)** — documento do TCC (versão única).
- **[`ecossistema/`](./ecossistema/)** — fluxo completo do ecossistema, com a
  versão detalhada e as perspectivas resumidas por serviço.

## Índice por projeto

### [`api/`](./api/) — Backend (Python · FastAPI)
- [README](./api/README.md)
- Arquitetura: [app detalhada](./api/arquitetura-app-detalhada.md) · [camadas](./api/arquitetura-estrutura-app-camadas.md) · [funcionamento geral](./api/arquitetura-funcionamento-geral-sistema.md) · [microsserviço](./api/arquitetura-microservico-detalhada.md) · [microsserviço + app](./api/arquitetura-microservico-e-app.md)
- API: [arquitetura e fluxos](./api/funcionamento-api-arquitetura-fluxos.md)
- Banco: [modelagem](./api/modelagem-dados-banco.md) · [Supabase](./api/estrutura-banco-supabase.md) · [Supabase (executivo)](./api/estrutura-banco-supabase-executivo.md)
- Personalização/gamificação: [visão](./api/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md) · [detalhado](./api/funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md)
- [Guia de uso](./api/guia-uso-app.md) · [Segurança](./api/seguranca.md) · [Políticas de dados/privacidade](./api/politicas-dados-privacidade.md)
- [Planos e specs (superpowers)](./api/superpowers/)

### [`frontend/`](./frontend/) — Web (Vite · React)
- Arquitetura: [camadas](./frontend/arquitetura-estrutura-app-camadas.md) · [funcionamento geral](./frontend/arquitetura-funcionamento-geral-sistema.md)
- API: [arquitetura e fluxos](./frontend/funcionamento-api-arquitetura-fluxos.md)
- Banco: [modelagem](./frontend/modelagem-dados-banco.md) · [Supabase](./frontend/estrutura-banco-supabase.md) · [Supabase (executivo)](./frontend/estrutura-banco-supabase-executivo.md)
- [Guia de uso](./frontend/guia-uso-app.md) · [Segurança](./frontend/seguranca.md) · [Políticas de dados/privacidade](./frontend/politicas-dados-privacidade.md)

### [`microservice/`](./microservice/) — Microsserviço (Node · TS)
- [README](./microservice/README.md) · [Docs da API](./microservice/DOCS_API.md) · [Guia de uso](./microservice/GUIA_USO.md)
- Arquitetura: [app detalhada](./microservice/arquitetura-app-detalhada.md) · [microsserviço](./microservice/arquitetura-microservico-detalhada.md) · [microsserviço + app](./microservice/arquitetura-microservico-e-app.md)
- [Integração com a API](./microservice/integracao-apitraiup.md) · [Operação e observabilidade](./microservice/operacao-e-observabilidade.md)
- Personalização/gamificação: [visão](./microservice/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md) · [detalhado](./microservice/funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md)

### [`mobile/`](./mobile/) — App (Expo · React Native)
- [README](./mobile/README.md)
- Arquitetura: [app detalhada](./mobile/arquitetura-app-detalhada.md) · [camadas](./mobile/arquitetura-estrutura-app-camadas.md) · [funcionamento geral](./mobile/arquitetura-funcionamento-geral-sistema.md) · [microsserviço](./mobile/arquitetura-microservico-detalhada.md) · [microsserviço + app](./mobile/arquitetura-microservico-e-app.md)
- API: [arquitetura e fluxos](./mobile/funcionamento-api-arquitetura-fluxos.md)
- Banco: [modelagem](./mobile/modelagem-dados-banco.md) · [Supabase](./mobile/estrutura-banco-supabase.md) · [Supabase (executivo)](./mobile/estrutura-banco-supabase-executivo.md)
- Personalização: [gamificação/recursos](./mobile/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md) · [detalhado](./mobile/funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md) · [multimídia do aluno](./mobile/personalizacao-multimidia-aluno.md)
- [Guia de uso](./mobile/guia-uso-app.md) · [Segurança](./mobile/seguranca.md) · [Políticas de dados/privacidade](./mobile/politicas-dados-privacidade.md)
- [Planos e specs (superpowers)](./mobile/superpowers/) · [SQL](./mobile/sql/)

---

> **Nota:** Documentos transversais ao ecossistema (**TCC** e **fluxos do
> ecossistema**) foram consolidados em [`tcc/`](./tcc/) e
> [`ecossistema/`](./ecossistema/). A documentação restante permanece organizada
> por projeto, pois reflete a perspectiva específica de cada serviço.

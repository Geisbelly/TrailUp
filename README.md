# TrailUp — Monorepo

[![CI](https://github.com/Geisbelly/TrailUp/actions/workflows/ci.yml/badge.svg)](https://github.com/Geisbelly/TrailUp/actions/workflows/ci.yml)

Monorepo do projeto **TrailUp**, reunindo os quatro serviços que antes viviam em
repositórios separados. Cada pasta continua sendo um projeto independente, com o
seu próprio gerenciador de dependências e ciclo de build.

## Estrutura

| Pasta            | Stack                          | Descrição                                  |
| ---------------- | ------------------------------ | ------------------------------------------ |
| `api/`           | Python · FastAPI · Alembic     | API principal (backend)                    |
| `frontend/`      | Vite · React · TypeScript      | Aplicação web                              |
| `microservice/`  | Node · TypeScript (tsx)        | Microsserviço (BrainHex / IA)              |
| `mobile/`        | Expo · React Native            | Aplicativo mobile                          |

> Cada subprojeto mantém o seu próprio `README.md`, `.env.example` e `.gitignore`.
> O `.gitignore` da raiz consolida os artefatos comuns (node_modules, .venv,
> builds, caches, segredos).

```
TrailUp/
├── api/  microservice/  frontend/  mobile/   # serviços (cada um com Dockerfile)
├── docs/                                      # documentação central (ver índice)
├── scripts/                                   # dev.ps1 / dev.sh (orquestração)
├── docker-compose.yml                         # ambiente de dev em containers
├── package.json                               # scripts de conveniência
├── .gitignore  .gitattributes
└── README.md
```

## Documentação

Toda a documentação foi centralizada em [`docs/`](./docs/), organizada por
projeto. Comece pelo [**Manual de Uso**](./docs/MANUAL.md) ou veja o
[índice da documentação](./docs/README.md).

## Pré-requisitos

- **Node.js** 18+ (frontend, microservice, mobile)
- **Python** 3.12+ (api)
- **Expo CLI** (mobile)

> Manual detalhado de instalação, execução e troubleshooting: [`docs/MANUAL.md`](./docs/MANUAL.md).

## Instalação

> Prefere containers? Pule para [Com Docker](#com-docker-desenvolvimento) — só
> precisa do Docker e dos arquivos `.env`.

Cada projeto é instalado de forma independente. A partir da raiz:

```bash
# API (Python) — Windows: .venv\Scripts\Activate.ps1 | Linux/macOS: source .venv/bin/activate
cd api && python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt && cd ..

# Projetos Node (frontend, microservice, mobile)
npm run install:all     # ou: cd <projeto> && npm install
```

### Configuração de ambiente

Cada serviço lê um `.env` (não versionado). Crie a partir do `.env.example`:

```bash
cp api/.env.example api/.env            # repita para microservice, frontend e mobile
```

No Windows (PowerShell): `Copy-Item api/.env.example api/.env`. Depois preencha
os valores reais (Supabase, integrações, chaves de IA). Detalhes no
[Manual de Uso](./docs/MANUAL.md#4-configuração-de-ambiente-env).

## Rodar todos os serviços de uma vez

Há scripts em [`scripts/`](./scripts/) que sobem os quatro serviços juntos:

```powershell
# Windows (PowerShell) — abre cada serviço em sua própria janela
npm run dev
# ou direto:  .\scripts\dev.ps1
# apenas alguns:  .\scripts\dev.ps1 -Service api,microservice
```

```bash
# Linux / macOS — roda em paralelo no mesmo terminal (Ctrl+C encerra todos)
npm run dev:sh
# ou direto:  ./scripts/dev.sh
# apenas alguns:  ./scripts/dev.sh api frontend
```

Portas padrão:

| Serviço        | URL                     |
| -------------- | ----------------------- |
| `api`          | http://localhost:8000   |
| `microservice` | http://localhost:3000   |
| `frontend`     | http://localhost:8080   |
| `mobile`       | http://localhost:8081   |

> Os scripts verificam se as dependências de cada serviço já foram instaladas
> (`.venv` na api, `node_modules` nos demais) e pulam o que ainda não está pronto.

## Com Docker (desenvolvimento)

Sobe `api`, `microservice` e `frontend` em containers com hot-reload (o `mobile`
roda nativamente). Banco externo (Supabase) via `.env`.

```bash
npm run docker:up     # docker compose up --build
npm run docker:down   # encerra
```

Detalhes e pré-requisitos: [`docs/MANUAL.md`](./docs/MANUAL.md) (seção Docker).

## Atalhos por serviço (raiz)

Para rodar um serviço isolado, há scripts de conveniência no `package.json`:

```bash
npm run dev:frontend       # vite
npm run dev:microservice   # node + tsx
npm run start:mobile       # expo start
```

Consulte o `package.json` da raiz para a lista completa.

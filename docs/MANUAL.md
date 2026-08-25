# Manual de Uso — Monorepo TrailUp

Guia completo para instalar, configurar, executar e manter os serviços do
monorepo TrailUp. Para uma visão rápida, veja o [README](../README.md); para a
documentação técnica, o [índice de documentação](./README.md).

---

## 1. Visão geral

O TrailUp é composto por quatro serviços que vivem em um único repositório:

| Pasta            | Stack                       | Porta padrão            | Descrição                       |
| ---------------- | --------------------------- | ----------------------- | ------------------------------- |
| `api/`           | Python · FastAPI · Alembic  | `8000`                  | API principal (orquestração)    |
| `microservice/`  | Node · TypeScript (Express) | `3000`                  | Microsserviço BrainHex / mídia  |
| `frontend/`      | Vite · React · TypeScript   | `8080`                  | Aplicação web (docente)         |
| `mobile/`        | Expo · React Native         | `8081`                  | Aplicativo do aluno             |

Cada serviço é **independente**: tem o seu próprio gerenciador de dependências,
lockfile, `.env` e ciclo de build. O monorepo só compartilha a raiz (git,
documentação e scripts de orquestração).

```
TrailUp/
├── api/  microservice/  frontend/  mobile/   # serviços (cada um com Dockerfile)
├── docs/                                      # documentação central
│   ├── MANUAL.md          (este arquivo)
│   ├── tcc/  ecossistema/ (docs transversais)
│   └── api/  frontend/ …  (docs por serviço)
├── scripts/               # dev.ps1 / dev.sh
├── docker-compose.yml     # ambiente de desenvolvimento em containers
├── .gitignore  .gitattributes
├── package.json           # scripts de conveniência
└── README.md
```

---

## 2. Pré-requisitos

| Ferramenta | Versão     | Usada por                      |
| ---------- | ---------- | ------------------------------ |
| Node.js    | 18+ (20 recomendado) | frontend, microservice, mobile |
| Python     | 3.12+      | api                            |
| Git        | qualquer   | todos                          |
| Expo CLI   | via `npx`  | mobile                         |

> O `frontend` possui `bun.lockb` e `package-lock.json`. Use **npm** por padrão
> (instruções abaixo); se preferir `bun`, ele também funciona.

---

## 3. Instalação

Clone o repositório e instale cada serviço. A partir da raiz:

### API (Python)

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # Windows
# source .venv/bin/activate       # Linux/macOS
pip install -r requirements.txt
```

### Frontend / Microservice / Mobile (Node)

```bash
cd frontend     && npm install && cd ..
cd microservice && npm install && cd ..
cd mobile       && npm install && cd ..
```

Atalho para instalar os três projetos Node de uma vez (na raiz):

```bash
npm run install:all
```

---

## 4. Configuração de ambiente (`.env`)

Cada serviço lê variáveis de um arquivo `.env` (que **não** é versionado). Crie
o seu a partir do `.env.example` correspondente:

```bash
cp api/.env.example          api/.env
cp microservice/.env.example microservice/.env
cp frontend/.env.example     frontend/.env
cp mobile/.env.example       mobile/.env
```

No Windows (PowerShell):

```powershell
Copy-Item api/.env.example api/.env
# … repita para os demais
```

Depois, preencha os valores reais (chaves do Supabase, URLs de integração,
tokens de IA etc.). Os `.env.example` documentam cada variável.

> **Nunca** faça commit de arquivos `.env` reais — eles já estão no `.gitignore`.

---

## 5. Executando os serviços

### Todos de uma vez

```powershell
# Windows (PowerShell) — abre cada serviço em sua própria janela
npm run dev
#   ou:  .\scripts\dev.ps1
#   só alguns:  .\scripts\dev.ps1 -Service api,microservice
```

```bash
# Linux / macOS — paralelo no mesmo terminal; Ctrl+C encerra todos
npm run dev:sh
#   ou:  ./scripts/dev.sh
#   só alguns:  ./scripts/dev.sh api frontend
```

Os scripts verificam as dependências (`.venv` na api, `node_modules` nos demais)
e pulam o que ainda não está instalado, avisando no terminal.

### Um serviço isolado (a partir da raiz)

```bash
npm run dev:frontend       # vite        → http://localhost:8080
npm run dev:microservice   # express     → http://localhost:3000
npm run start:mobile       # expo start  → http://localhost:8081
```

A API roda direto pelo uvicorn (com o `.venv` ativado, dentro de `api/`):

```bash
uvicorn app.main:app --reload --port 8000
```

### Com Docker (desenvolvimento)

Há um `docker-compose.yml` na raiz que sobe **api**, **microservice** e
**frontend** em containers, com hot-reload (o código é montado por volume). O
**mobile** (Expo) fica fora do Docker — rode-o nativamente com
`npm run start:mobile`. O banco é **externo** (Supabase/Postgres), configurado
via `.env`.

Pré-requisitos:

1. [Docker](https://docs.docker.com/get-docker/) + Docker Compose instalados.
2. Os arquivos `.env` de cada serviço criados (seção 4) — o compose os carrega
   via `env_file`.

```bash
npm run docker:up        # docker compose up --build
npm run docker:logs      # acompanha os logs
npm run docker:down      # encerra e remove os containers
```

Ou diretamente:

```bash
docker compose up --build        # sobe os três serviços
docker compose up api            # sobe apenas um serviço (e dependências)
docker compose down              # encerra
```

| Serviço        | Container               | URL (host)              |
| -------------- | ----------------------- | ----------------------- |
| `api`          | `trailup-api`           | http://localhost:8000   |
| `microservice` | `trailup-microservice`  | http://localhost:3000   |
| `frontend`     | `trailup-frontend`      | http://localhost:8080   |

> **Comunicação entre serviços:** dentro da rede do compose, os containers se
> enxergam pelo nome (`api`, `microservice`, `frontend`). Por isso a api usa
> `BRAINHEX_API_URL=http://microservice:3000` (injetado pelo compose). Já o
> `frontend` roda no **navegador do host**, então mantém
> `VITE_APITRAIUP_URL=http://localhost:8000`.
>
> A imagem da api instala **ffmpeg** (necessário para `moviepy`/`gTTS`).

---

## 6. Testes e qualidade

| Serviço        | Testes                          | Lint / type-check          |
| -------------- | ------------------------------- | -------------------------- |
| `api`          | `pytest` (dentro de `api/`)     | —                          |
| `microservice` | `npm run test:microservice`     | `npm run lint:microservice` (tsc) |
| `frontend`     | —                               | `npm run lint:frontend` (eslint)  |
| `mobile`       | —                               | `npm run lint:mobile` (expo lint) |

Exemplos a partir da raiz:

```bash
npm run test:microservice
npm run lint:frontend
```

API (com o `.venv` ativado):

```bash
cd api && pytest
```

### Integração contínua (CI)

A cada `push` na `main` e em cada `pull request`, o GitHub Actions roda os
checks automaticamente ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

| Serviço        | O que o CI executa                    |
| -------------- | ------------------------------------- |
| `api`          | `pytest` (com ffmpeg instalado)       |
| `microservice` | `npm run lint` (tsc) + `npm test`     |
| `frontend`     | `npm run lint` (eslint) + `npm run build` |
| `mobile`       | `npm run lint` (expo lint)            |

O workflow detecta **quais serviços mudaram** (via `paths-filter`) e roda apenas
os jobs afetados — um push que altera só o `frontend` não dispara os testes da
`api`. O status aparece no badge no topo do [README](../README.md).

---

## 7. Banco de dados (API)

A API usa **Alembic** para migrações. Com o `.venv` ativado, dentro de `api/`:

```bash
alembic upgrade head            # aplica todas as migrações
alembic revision -m "mensagem"  # cria nova migração
```

Consulte [`docs/api/modelagem-dados-banco.md`](./api/modelagem-dados-banco.md) e
[`docs/api/estrutura-banco-supabase.md`](./api/estrutura-banco-supabase.md).

---

## 8. Documentação

Toda a documentação fica em [`docs/`](./README.md):

- **Transversais:** [`tcc/`](./tcc/) (documento do TCC) e
  [`ecossistema/`](./ecossistema/) (fluxo completo Web → API → BrainHex → Mobile).
- **Por serviço:** [`api/`](./api/), [`frontend/`](./frontend/),
  [`microservice/`](./microservice/), [`mobile/`](./mobile/) — arquitetura,
  banco, segurança, guias e planos/specs.

---

## 9. Fluxo de trabalho (git)

Repositório único: um commit pode abranger mais de um serviço. Sugestões:

- Faça commits focados; use prefixos por escopo quando útil
  (`api:`, `frontend:`, `docs:`…).
- `node_modules/`, `.venv/`, `dist/`, `.env` e caches já são ignorados pela raiz.
- Quebras de linha são normalizadas para LF via `.gitattributes`.

---

## 10. Troubleshooting

| Sintoma | Causa provável | Solução |
| ------- | -------------- | ------- |
| `dev.ps1` avisa "dependências ausentes" | serviço sem `.venv`/`node_modules` | rode a instalação da seção 3 |
| `uvicorn` não encontrado | `.venv` não ativado ou sem dependências | ative o `.venv` e `pip install -r requirements.txt` |
| Porta já em uso (`EADDRINUSE` / "porta já em uso") | outro processo na 8000/3000/8080/8081 | encerre o processo ou ajuste a porta |
| Erros de conexão entre serviços | `.env` não configurado | confira URLs (ex.: `BRAINHEX_API_URL=http://localhost:3000`) |
| `dev.ps1` bloqueado pela política de execução | ExecutionPolicy do Windows | os scripts já usam `-ExecutionPolicy Bypass`; se rodar manual, use o mesmo |
| Mobile não abre no dispositivo | Expo/rede | use `npm run start:mobile` e leia o QR code com o Expo Go |

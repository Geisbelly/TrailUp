# Suite Robot Framework — Personalização de Conteúdo no Console do Professor

**Data:** 2026-08-01
**Status:** Aprovado para planejamento

## Objetivo

Criar uma suite de testes end-to-end com Robot Framework que valide, pela
interface do console do professor (`frontend/`, porta 8080), o fluxo central
de personalização de conteúdo: **professor cadastra conteúdo de um tópico →
dispara a geração → os 7 perfis BrainHex aparecem com material gerado**.

Este é o primeiro teste Robot Framework do monorepo — hoje não existe nenhuma
suite `.robot` nem dependência de `robotframework` em nenhum dos 4 serviços
(confirmado em `api/requirements.txt`/`pyproject.toml`,
`frontend/package.json`, `microservice/package.json`, `mobile/package.json`).
Os testes automatizados existentes (pytest em `api/tests/`) cobrem a camada de
serviço/pipeline, não a jornada de usuário na UI — esta suite fecha essa
lacuna.

## Escopo

**Dentro do escopo (v1):**
- Login real via UI com um usuário professor de teste fixo.
- Cadastro de conteúdo de um tópico já existente (criado via API no setup).
- Disparo da geração de personalização.
- Validação de que os 7 perfis BrainHex aparecem na tela com pelo menos um
  material (texto e/ou áudio) associado.
- Execução contra um **ambiente de staging já existente** (URL e credenciais
  fornecidas posteriormente via variáveis de ambiente).

**Fora do escopo (v1):**
- App mobile e a visualização do aluno.
- Comparação de diferenciação real de conteúdo entre perfis (ex.: garantir que
  o texto do Seeker é de fato diferente do texto do Survivor) — v1 verifica
  apenas presença de material por perfil, não seu conteúdo.
- Testes de contraste/acessibilidade AAA por perfil.
- Pipeline de CI para rodar a suite automaticamente — v1 assume execução
  manual/local apontando para staging.
- Criação de ambiente de staging — assume-se que ele já existe; a criação
  dele é responsabilidade externa a este spec.

## Ambiente e autenticação

- **Alvo:** ambiente de staging já hospedado (não a stack local
  `docker-compose`). URL do frontend, URL da API, e-mail/senha do professor de
  teste são fornecidos depois — nenhum valor é hardcoded na suite.
- **Autenticação na UI:** login real preenchendo o formulário do frontend com
  o usuário professor de teste — cobre o fluxo de auth real (Supabase JWT),
  em vez de injetar sessão/cookie diretamente.
- **Autenticação para chamadas de setup/teardown via API:** as chamadas
  `RequestsLibrary` para criar/remover classe e tópico de teste usam um JWT do
  mesmo professor de teste, obtido antes da suite rodar (mesmo mecanismo usado
  pelos testes pytest existentes em `api/tests/conftest.py`, que já validam o
  formato de payload esperado por `api/app/api/v1/personalizacao.py`).

## Estrutura de arquivos

```
tests/robot/
├── resources/
│   ├── Login.resource          # keywords da tela de login
│   ├── Topico.resource         # keywords de cadastro/edição de conteúdo do tópico
│   └── Personalizacao.resource # keywords da aba/lista de personalização por perfil
├── data/
│   └── ApiSetup.resource       # cria/remove classe e tópico de teste via RequestsLibrary
├── suites/
│   └── personalizacao_topico.robot
├── variables/
│   └── staging.py              # lê BASE_URL_FRONTEND, BASE_URL_API, PROFESSOR_EMAIL,
│                                # PROFESSOR_SENHA, TIMEOUT_GERACAO de variáveis de ambiente
└── requirements.txt             # robotframework, robotframework-browser, robotframework-requests
```

Organização em **Page Object Model**: cada `.resource` em `resources/`
encapsula localizadores e ações de baixo nível de uma única tela. O `.robot`
em `suites/` só compõe essas keywords em passos de alto nível, legíveis no
estilo Given/When/Then nativo do Robot Framework. Isso isola qualquer mudança
futura de UI dentro do `.resource` da tela afetada, sem tocar no arquivo de
teste — e evita que um único arquivo monolítico cresça descontroladamente
conforme mais jornadas forem adicionadas no futuro.

`variables/staging.py` centraliza toda configuração dependente de ambiente
(nenhum valor de staging fica espalhado pelos `.robot`/`.resource`),
consistente com a convenção já usada no restante do projeto de manter
configuração específica de ambiente fora do código e em um único lugar.

## Fluxo do teste

1. **Suite Setup (API):** via `ApiSetup.resource` (`RequestsLibrary` + JWT do
   professor de teste), cria uma classe e um tópico novos chamando os
   endpoints existentes em `api/app/api/v1/personalizacao.py`. Cada execução
   parte de dados isolados — não reaproveita classe/tópico de execuções
   anteriores, evitando acúmulo de materiais de perfis de rodadas passadas.
2. **Login (UI — Browser/Playwright):** preenche o formulário de login do
   frontend com o e-mail/senha do professor de teste.
3. **Cadastro e disparo (UI):** navega até o tópico criado no setup, cadastra
   o conteúdo pela interface do console do professor e dispara a geração da
   personalização.
4. **Espera (polling na UI):** aguarda, com timeout configurável
   (`TIMEOUT_GERACAO`), até a tela exibir os 7 perfis BrainHex com material
   associado. O polling é feito na própria UI (recarregando/observando o
   componente), não consultando `personalizacao_jobs`/`personalizacao_job_targets`
   diretamente — a suite fica fiel ao que o usuário real vê e não se acopla à
   estrutura interna do backend.
5. **Asserção:** confirma que os 7 perfis — `Seeker`, `Survivor`, `Daredevil`,
   `Mastermind`, `Conqueror`, `Socializer`, `Achiever` — aparecem na tela,
   cada um com pelo menos um material (texto e/ou áudio) associado.
6. **Suite Teardown (API):** via `ApiSetup.resource`, remove/desativa a classe
   e o tópico de teste criados no passo 1.

## Dependências

- `robotframework`
- `robotframework-browser` — automação de navegador baseada em Playwright.
  Requer Node.js instalado além do Python; precisa de `rfbrowser init` após a
  instalação para baixar os browsers do Playwright.
- `robotframework-requests` — chamadas HTTP de setup/teardown via API.

Escolhido `robotframework-browser` em vez de `SeleniumLibrary` por já reusar o
motor Playwright (mesma base do restante da stack de frontend) e por lidar
melhor com esperas automáticas em uma SPA React com estados assíncronos —
compensa a dependência extra de Node.js.

## Critério de sucesso

A suite passa quando, após cadastrar conteúdo e disparar a geração pela UI, a
tela de personalização do tópico exibe os 7 perfis BrainHex, cada um com pelo
menos um material gerado, dentro do timeout configurado. Falha se qualquer
perfil estiver ausente, sem material, ou se o timeout for atingido antes dos
7 perfis aparecerem.

## Riscos e limitações conhecidas

- **Staging ainda não confirmado com dados/credenciais prontos** — a suite
  depende de um usuário professor de teste e de um ambiente de staging
  acessível; até esses valores serem fornecidos, a suite não pode ser
  executada de ponta a ponta (pode ser desenvolvida e validada estruturalmente
  antes disso).
- **Pipeline assíncrono real** — como a geração dos 7 perfis passa por
  `personalizacao_jobs`, o tempo de execução da suite depende da latência real
  do pipeline (LLM de texto/áudio); o timeout de polling precisa ser generoso
  o suficiente para não gerar falso-negativo.
- **Sem cobertura de CI nesta v1** — a suite roda manualmente/local contra
  staging; integrar a um pipeline de CI fica para uma iteração futura.

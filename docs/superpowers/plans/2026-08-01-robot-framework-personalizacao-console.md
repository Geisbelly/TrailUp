# Suite Robot Framework — Personalização no Console do Professor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a primeira suite Robot Framework do monorepo TrailUp, validando pela UI do console do professor que cadastrar conteúdo de um tópico dispara a geração de personalização e resulta nos 7 perfis BrainHex com material gerado.

**Architecture:** Page Object Model em `tests/robot/` — um `.resource` por tela (Login, Topico, Personalizacao) mais um `.resource` de setup/teardown via Supabase REST + API Python, e uma suite `.robot` que compõe tudo. Configuração de ambiente (URLs, credenciais, timeout) centralizada em `variables/staging.py`, lida de variáveis de ambiente — nada hardcoded.

**Tech Stack:** Robot Framework, `robotframework-browser` (Playwright), `robotframework-requests`, Python 3.

**Spec de referência:** `docs/superpowers/specs/2026-08-01-robot-framework-personalizacao-console-design.md`

---

## Pré-requisitos externos (fora do controle deste plano)

Estes valores não existem ainda no repositório e precisam ser fornecidos antes que a Task 8 (execução real) possa rodar de ponta a ponta. Todas as tasks anteriores (1–7) são executáveis e verificáveis sem eles, usando valores de teste locais/dummy só para validar a estrutura.

- `RF_BASE_URL_FRONTEND` — URL do console do professor em staging (ex.: `https://staging.trailup.exemplo/`).
- `RF_BASE_URL_API` — URL da API Python em staging (ex.: `https://api-staging.trailup.exemplo`).
- `RF_SUPABASE_URL` — URL do projeto Supabase de staging.
- `RF_SUPABASE_ANON_KEY` — anon key pública do Supabase de staging.
- `RF_PROFESSOR_EMAIL` / `RF_PROFESSOR_SENHA` — credenciais de um usuário com uma linha em `professor` (`liberado = true`) já existente em staging.
- `RF_TIMEOUT_GERACAO` — opcional, default `10 min` no código.
- `RF_HEADLESS` — opcional, default `true`.
- Node.js instalado (exigido por `robotframework-browser`).

---

## Task 1: Estrutura de pastas e dependências

**Files:**
- Create: `tests/robot/requirements.txt`
- Create: `tests/robot/resources/.gitkeep`
- Create: `tests/robot/data/.gitkeep`
- Create: `tests/robot/suites/.gitkeep`
- Create: `tests/robot/variables/.gitkeep`

- [ ] **Step 1: Criar a estrutura de pastas**

```bash
mkdir -p tests/robot/resources tests/robot/data tests/robot/suites tests/robot/variables
touch tests/robot/resources/.gitkeep tests/robot/data/.gitkeep tests/robot/suites/.gitkeep tests/robot/variables/.gitkeep
```

- [ ] **Step 2: Criar `tests/robot/requirements.txt`**

```
robotframework>=7.0
robotframework-browser>=18.0
robotframework-requests>=0.9
```

- [ ] **Step 3: Instalar as dependências em um virtualenv dedicado**

```bash
python -m venv tests/robot/.venv
tests/robot/.venv/Scripts/pip install -r tests/robot/requirements.txt
tests/robot/.venv/Scripts/python -m Browser.entry init
```

Expected: `robotframework-browser` baixa os browsers do Playwright (Chromium/Firefox/WebKit) sem erro. Requer Node.js instalado no PATH.

- [ ] **Step 4: Confirmar a instalação**

Run: `tests/robot/.venv/Scripts/robot --version`
Expected: imprime a versão do Robot Framework instalado (ex.: `Robot Framework 7.x`).

- [ ] **Step 5: Commit**

```bash
git add tests/robot/requirements.txt tests/robot/resources/.gitkeep tests/robot/data/.gitkeep tests/robot/suites/.gitkeep tests/robot/variables/.gitkeep
git commit -m "test(robot): cria estrutura inicial da suite Robot Framework"
```

---

## Task 2: Arquivo de variáveis de ambiente + smoke test de configuração

**Files:**
- Create: `tests/robot/variables/staging.py`
- Create: `tests/robot/suites/00_config_smoke.robot`

- [ ] **Step 1: Escrever a suite de smoke test (falha primeiro, arquivo de variáveis ainda não existe)**

```robotframework
*** Settings ***
Variables    ../variables/staging.py

*** Test Cases ***
Variaveis De Ambiente Devem Carregar
    Should Not Be Empty    ${BASE_URL_FRONTEND}
    Should Not Be Empty    ${BASE_URL_API}
    Should Not Be Empty    ${SUPABASE_URL}
    Should Not Be Empty    ${SUPABASE_ANON_KEY}
    Should Not Be Empty    ${PROFESSOR_EMAIL}
    Should Not Be Empty    ${PROFESSOR_SENHA}
    Log    Timeout de geracao configurado: ${TIMEOUT_GERACAO}
    Log    Modo headless: ${HEADLESS}
```

- [ ] **Step 2: Rodar e confirmar que falha (arquivo de variáveis não existe)**

Run: `tests/robot/.venv/Scripts/robot --outputdir tests/robot/results tests/robot/suites/00_config_smoke.robot`
Expected: FAIL — `Error in file '...00_config_smoke.robot': Variable file '...variables/staging.py' does not exist.`

- [ ] **Step 3: Implementar `tests/robot/variables/staging.py`**

```python
import os


def _env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise KeyError(
            f"Variavel de ambiente obrigatoria ausente: {name}. "
            "Configure as variaveis RF_* antes de rodar a suite."
        )
    return value


BASE_URL_FRONTEND = _env("RF_BASE_URL_FRONTEND")
BASE_URL_API = _env("RF_BASE_URL_API")
SUPABASE_URL = _env("RF_SUPABASE_URL")
SUPABASE_ANON_KEY = _env("RF_SUPABASE_ANON_KEY")
PROFESSOR_EMAIL = _env("RF_PROFESSOR_EMAIL")
PROFESSOR_SENHA = _env("RF_PROFESSOR_SENHA")
TIMEOUT_GERACAO = os.environ.get("RF_TIMEOUT_GERACAO", "10 min")
HEADLESS = os.environ.get("RF_HEADLESS", "true").lower() == "true"
```

- [ ] **Step 4: Rodar sem variáveis de ambiente definidas e confirmar a mensagem de erro nova**

Run: `tests/robot/.venv/Scripts/robot --outputdir tests/robot/results tests/robot/suites/00_config_smoke.robot`
Expected: FAIL — erro de importação citando `KeyError` e a mensagem `Variavel de ambiente obrigatoria ausente: RF_BASE_URL_FRONTEND`.

- [ ] **Step 5: Definir variáveis de teste (valores dummy, só para validar a estrutura) e rodar de novo**

PowerShell:
```powershell
$env:RF_BASE_URL_FRONTEND = "http://localhost:8080"
$env:RF_BASE_URL_API = "http://localhost:8000"
$env:RF_SUPABASE_URL = "http://localhost:0"
$env:RF_SUPABASE_ANON_KEY = "dummy"
$env:RF_PROFESSOR_EMAIL = "dummy@example.com"
$env:RF_PROFESSOR_SENHA = "dummy"
tests/robot/.venv/Scripts/robot --outputdir tests/robot/results tests/robot/suites/00_config_smoke.robot
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/robot/variables/staging.py tests/robot/suites/00_config_smoke.robot
git commit -m "test(robot): adiciona arquivo de variaveis de ambiente e smoke test de configuracao"
```

---

## Task 3: Login.resource

Tela: `frontend/src/pages/Login.tsx`, rota `/login`. Campos: `id="email"`, `id="password"`, botão `type="submit"` com texto `"Entrar"`. Após login, `Login.tsx` só navega para `/console` se `professor.liberado === true` — o professor de teste precisa satisfazer essa condição em staging (ver Pré-requisitos). O console renderiza um botão com texto `"Trilha"` assim que carrega (`frontend/src/pages/Console.tsx`), usado aqui como sinal de "login concluído".

**Files:**
- Create: `tests/robot/resources/Login.resource`
- Create: `tests/robot/suites/01_login_smoke.robot`

- [ ] **Step 1: Escrever a suite de smoke test referenciando a keyword ainda inexistente**

```robotframework
*** Settings ***
Resource    ../resources/Login.resource
Suite Teardown    Close Browser

*** Test Cases ***
Professor Consegue Logar E Ver O Console
    Fazer Login Como Professor
```

- [ ] **Step 2: Criar `Login.resource` vazio (só a seção Settings, sem a keyword) e rodar em `--dryrun`**

```robotframework
*** Settings ***
Library    Browser
Variables    ../variables/staging.py
```

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/01_login_smoke.robot`
Expected: FAIL — `No keyword with name 'Fazer Login Como Professor' found.`

- [ ] **Step 3: Implementar a keyword em `Login.resource`**

```robotframework
*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Keywords ***
Fazer Login Como Professor
    New Browser    chromium    headless=${HEADLESS}
    New Context    baseURL=${BASE_URL_FRONTEND}
    New Page    /login
    Fill Text    css=#email    ${PROFESSOR_EMAIL}
    Fill Text    css=#password    ${PROFESSOR_SENHA}
    Click    css=button[type="submit"]
    Wait For Elements State    text=Trilha    visible    timeout=15s
```

- [ ] **Step 4: Rodar em `--dryrun` de novo e confirmar que a keyword resolve**

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/01_login_smoke.robot`
Expected: PASS (dry run valida sintaxe e resolução de keywords, não executa o navegador — ainda não requer staging).

- [ ] **Step 5: Commit**

```bash
git add tests/robot/resources/Login.resource tests/robot/suites/01_login_smoke.robot
git commit -m "test(robot): adiciona keyword e smoke test de login do professor"
```

---

## Task 4: ApiSetup.resource (setup e teardown via Supabase REST + API Python)

Não existe endpoint na API Python para criar/remover classe e tópico — o console usa Supabase PostgREST direto (`frontend/src/components/console/trilha/ClassesManager.tsx`, `TopicsManager.tsx`). Schema confirmado em `frontend/src/integrations/supabase/types.ts`:
- `classe`: `descricao`, `materia_id` (nullable), `professor_id` (uuid, obrigatório na prática).
- `topicos`: `nome` (obrigatório), `classe_id` (obrigatório), `ordem`, `next`/`depende` (arrays, default `[]` na prática).
- `conteudos`: criado pela UI na Task 5, não no setup.

Autenticação: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` com header `apikey` e body `{email, password}` retorna `access_token` e `user.id` reais — reusado tanto nas chamadas Supabase REST quanto na API Python.

**Files:**
- Create: `tests/robot/data/ApiSetup.resource`
- Create: `tests/robot/suites/02_api_setup_smoke.robot`

- [ ] **Step 1: Escrever a suite de smoke test referenciando as keywords ainda inexistentes**

```robotframework
*** Settings ***
Resource    ../data/ApiSetup.resource
Suite Teardown    Remover Dados De Teste

*** Test Cases ***
Setup De Dados De Teste Via API
    Obter Token Do Professor De Teste
    Criar Classe De Teste
    Criar Topico De Teste
    Should Not Be Empty    ${CLASSE_ID}
    Should Not Be Empty    ${TOPICO_ID}
```

- [ ] **Step 2: Criar `ApiSetup.resource` vazio (só Settings) e rodar em `--dryrun`**

```robotframework
*** Settings ***
Library    RequestsLibrary
Library    Collections
Variables    ../variables/staging.py
```

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/02_api_setup_smoke.robot`
Expected: FAIL — `No keyword with name 'Obter Token Do Professor De Teste' found.` (e as demais).

- [ ] **Step 3: Implementar as keywords em `ApiSetup.resource`**

```robotframework
*** Settings ***
Library    RequestsLibrary
Library    Collections
Variables    ../variables/staging.py

*** Keywords ***
Obter Token Do Professor De Teste
    Create Session    supabase    ${SUPABASE_URL}
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Content-Type=application/json
    ${body}=    Create Dictionary
    ...    email=${PROFESSOR_EMAIL}
    ...    password=${PROFESSOR_SENHA}
    ${response}=    POST On Session    supabase    /auth/v1/token?grant_type=password
    ...    json=${body}    headers=${headers}    expected_status=200
    Set Suite Variable    ${ACCESS_TOKEN}    ${response.json()}[access_token]
    Set Suite Variable    ${PROFESSOR_UUID}    ${response.json()}[user][id]

Criar Classe De Teste
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Authorization=Bearer ${ACCESS_TOKEN}
    ...    Content-Type=application/json
    ...    Prefer=return=representation
    ${body}=    Create Dictionary
    ...    descricao=RF Teste Personalizacao
    ...    materia_id=${None}
    ...    professor_id=${PROFESSOR_UUID}
    ${response}=    POST On Session    supabase    /rest/v1/classe
    ...    json=${body}    headers=${headers}    expected_status=201
    ${criada}=    Set Variable    ${response.json()}[0]
    Set Suite Variable    ${CLASSE_ID}    ${criada}[id]

Criar Topico De Teste
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Authorization=Bearer ${ACCESS_TOKEN}
    ...    Content-Type=application/json
    ...    Prefer=return=representation
    @{vazio}=    Create List
    ${body}=    Create Dictionary
    ...    nome=Topico RF Teste
    ...    classe_id=${CLASSE_ID}
    ...    ordem=${1}
    ...    next=${vazio}
    ...    depende=${vazio}
    ${response}=    POST On Session    supabase    /rest/v1/topicos
    ...    json=${body}    headers=${headers}    expected_status=201
    ${criado}=    Set Variable    ${response.json()}[0]
    Set Suite Variable    ${TOPICO_ID}    ${criado}[id]

Remover Dados De Teste
    ${headers}=    Create Dictionary
    ...    apikey=${SUPABASE_ANON_KEY}
    ...    Authorization=Bearer ${ACCESS_TOKEN}
    IF    $TOPICO_ID
        DELETE On Session    supabase    /rest/v1/conteudos?topico_id=eq.${TOPICO_ID}
        ...    headers=${headers}    expected_status=204
        DELETE On Session    supabase    /rest/v1/topicos?id=eq.${TOPICO_ID}
        ...    headers=${headers}    expected_status=204
    END
    IF    $CLASSE_ID
        DELETE On Session    supabase    /rest/v1/classe?id=eq.${CLASSE_ID}
        ...    headers=${headers}    expected_status=204
    END
```

- [ ] **Step 4: Rodar em `--dryrun` de novo e confirmar que todas as keywords resolvem**

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/02_api_setup_smoke.robot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/robot/data/ApiSetup.resource tests/robot/suites/02_api_setup_smoke.robot
git commit -m "test(robot): adiciona setup/teardown de dados de teste via Supabase REST"
```

---

## Task 5: Topico.resource (cadastro de conteúdo)

Tela: `frontend/src/components/console/trilha/TopicEditDrawer.tsx`, rota `/console/trilha/{topico_id}/editar`. Quando o tópico não tem nenhum conteúdo (`contents.length === 0`), o formulário já abre em modo de criação (`isCreating = true`) com `tipo` default `"texto"` — não é preciso interagir com o `Select` de Formato. Campo título: `input[placeholder="Ex: Introdução à Lógica"]` (sem `id`/`name`). Campo de corpo (Textarea, só visível quando `tipo === "texto"`): `placeholder="# Digite seu conteúdo aqui..."`. Botão de salvar mostra texto `"Criar Conteúdo"` e, durante o salvamento, um ícone com classe `animate-spin` (`Loader2`) — usado como sinal de fim do save.

**Files:**
- Create: `tests/robot/resources/Topico.resource`
- Create: `tests/robot/suites/03_topico_smoke.robot`

- [ ] **Step 1: Escrever a suite de smoke test referenciando as keywords ainda inexistentes**

```robotframework
*** Settings ***
Resource    ../resources/Login.resource
Resource    ../data/ApiSetup.resource
Resource    ../resources/Topico.resource
Suite Setup       Preparar Sessao De Teste
Suite Teardown    Encerrar Sessao De Teste

*** Keywords ***
Preparar Sessao De Teste
    Obter Token Do Professor De Teste
    Criar Classe De Teste
    Criar Topico De Teste
    Fazer Login Como Professor

Encerrar Sessao De Teste
    Remover Dados De Teste
    Close Browser

*** Test Cases ***
Professor Cadastra Conteudo De Texto No Topico
    Abrir Editor Do Topico De Teste
    Cadastrar Conteudo De Texto    Conteudo RF Teste Automatizado    Corpo de teste gerado pela suite Robot Framework.
```

- [ ] **Step 2: Criar `Topico.resource` vazio (só Settings) e rodar em `--dryrun`**

```robotframework
*** Settings ***
Library    Browser
Variables    ../variables/staging.py
```

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/03_topico_smoke.robot`
Expected: FAIL — `No keyword with name 'Abrir Editor Do Topico De Teste' found.`

- [ ] **Step 3: Implementar as keywords em `Topico.resource`**

```robotframework
*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Keywords ***
Abrir Editor Do Topico De Teste
    Go To    ${BASE_URL_FRONTEND}/console/trilha/${TOPICO_ID}/editar
    Wait For Elements State    css=[placeholder="Ex: Introdução à Lógica"]    visible    timeout=15s

Cadastrar Conteudo De Texto
    [Arguments]    ${titulo}    ${corpo}
    Fill Text    css=[placeholder="Ex: Introdução à Lógica"]    ${titulo}
    Fill Text    css=[placeholder="# Digite seu conteúdo aqui..."]    ${corpo}
    Click    text=Criar Conteúdo
    Wait For Elements State    css=.animate-spin    hidden    timeout=15s
```

- [ ] **Step 4: Rodar em `--dryrun` de novo e confirmar que resolve**

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/03_topico_smoke.robot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/robot/resources/Topico.resource tests/robot/suites/03_topico_smoke.robot
git commit -m "test(robot): adiciona keywords de cadastro de conteudo do topico"
```

---

## Task 6: Personalizacao.resource (verificação dos 7 perfis)

Tela: `frontend/src/components/console/personalizacoes/PersonalizacoesSection.tsx`, aba "Personalizações" do console (`frontend/src/pages/Console.tsx`), sub-aba `"Por perfil"` (default). Os 3 `Select` (Classe/Tópico/Conteúdo) são componentes Radix (`role="combobox"`) sem `id`/`aria-label`, na ordem fixa Classe(0)/Tópico(1)/Conteúdo(2); as opções abertas têm `role="option"` com o texto visível igual ao cadastrado. Cada perfil BrainHex é um `Card` com `aria-label="Geração para o perfil {perfil_label}"` (rótulo em português); quando há material, aparece um botão `"Ver conteúdo completo"` dentro do card.

**Files:**
- Create: `tests/robot/resources/Personalizacao.resource`
- Create: `tests/robot/suites/04_personalizacao_smoke.robot`

- [ ] **Step 1: Escrever a suite de smoke test referenciando as keywords ainda inexistentes**

```robotframework
*** Settings ***
Resource    ../resources/Login.resource
Resource    ../resources/Personalizacao.resource
Suite Teardown    Close Browser

*** Test Cases ***
Professor Abre Aba De Personalizacoes
    Fazer Login Como Professor
    Abrir Aba Personalizacoes
```

- [ ] **Step 2: Criar `Personalizacao.resource` vazio (só Settings e a lista de perfis) e rodar em `--dryrun`**

```robotframework
*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Variables ***
@{PERFIS_BRAINHEX_LABELS}    Explorador    Sobrevivente    Aventureiro    Estrategista    Conquistador    Socializador    Realizador
```

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/04_personalizacao_smoke.robot`
Expected: FAIL — `No keyword with name 'Abrir Aba Personalizacoes' found.`

- [ ] **Step 3: Implementar as keywords em `Personalizacao.resource`**

```robotframework
*** Settings ***
Library    Browser
Variables    ../variables/staging.py

*** Variables ***
@{PERFIS_BRAINHEX_LABELS}    Explorador    Sobrevivente    Aventureiro    Estrategista    Conquistador    Socializador    Realizador

*** Keywords ***
Abrir Aba Personalizacoes
    Go To    ${BASE_URL_FRONTEND}/console
    Click    text=Personalizações
    Wait For Elements State    text=Por perfil    visible    timeout=15s

Selecionar Classe Topico E Conteudo Para Personalizacao
    [Arguments]    ${nome_classe}    ${nome_topico}    ${titulo_conteudo}
    Click    css=button[role="combobox"] >> nth=0
    Click    css=[role="option"] >> text=${nome_classe}
    Click    css=button[role="combobox"] >> nth=1
    Click    css=[role="option"] >> text=${nome_topico}
    Click    css=button[role="combobox"] >> nth=2
    Click    css=[role="option"] >> text=${titulo_conteudo}
    Click    text=Atualizar

Aguardar Geracao Dos 7 Perfis
    Wait Until Keyword Succeeds    ${TIMEOUT_GERACAO}    15s    Recarregar E Verificar Todos Os Perfis

Recarregar E Verificar Todos Os Perfis
    Click    text=Atualizar
    FOR    ${label}    IN    @{PERFIS_BRAINHEX_LABELS}
        Wait For Elements State
        ...    css=[aria-label="Geração para o perfil ${label}"] >> text=Ver conteúdo completo
        ...    visible    timeout=3s
    END
```

- [ ] **Step 4: Rodar em `--dryrun` de novo e confirmar que resolve**

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/04_personalizacao_smoke.robot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/robot/resources/Personalizacao.resource tests/robot/suites/04_personalizacao_smoke.robot
git commit -m "test(robot): adiciona keywords de verificacao dos 7 perfis BrainHex"
```

---

## Task 7: Suite principal integrando o fluxo completo

Compõe todas as keywords das Tasks 3–6 no cenário aprovado na spec: setup via API → login → cadastro de conteúdo → abrir personalizações → selecionar classe/tópico/conteúdo → aguardar os 7 perfis.

**Files:**
- Create: `tests/robot/suites/personalizacao_topico.robot`
- Modify (opcional, limpeza): os smoke tests das Tasks 3–6 continuam válidos como suites isoladas; não precisam ser removidos.

- [ ] **Step 1: Escrever a suite principal**

```robotframework
*** Settings ***
Resource    ../resources/Login.resource
Resource    ../resources/Topico.resource
Resource    ../resources/Personalizacao.resource
Resource    ../data/ApiSetup.resource
Variables    ../variables/staging.py

Suite Setup       Preparar Dados De Teste
Suite Teardown    Limpar Dados De Teste

*** Variables ***
${NOME_CLASSE}          RF Teste Personalizacao
${NOME_TOPICO}          Topico RF Teste
${TITULO_CONTEUDO}      Conteúdo RF Teste Automatizado
${CORPO_CONTEUDO}       Conteudo de teste gerado automaticamente pela suite Robot Framework de personalizacao.

*** Keywords ***
Preparar Dados De Teste
    Obter Token Do Professor De Teste
    Criar Classe De Teste
    Criar Topico De Teste

Limpar Dados De Teste
    Remover Dados De Teste
    Close Browser

*** Test Cases ***
Professor Cadastra Conteudo E Personalizacao E Gerada Para Os 7 Perfis
    Fazer Login Como Professor
    Abrir Editor Do Topico De Teste
    Cadastrar Conteudo De Texto    ${TITULO_CONTEUDO}    ${CORPO_CONTEUDO}
    Abrir Aba Personalizacoes
    Selecionar Classe Topico E Conteudo Para Personalizacao
    ...    ${NOME_CLASSE}    ${NOME_TOPICO}    ${TITULO_CONTEUDO}
    Aguardar Geracao Dos 7 Perfis
```

- [ ] **Step 2: Rodar em `--dryrun` e confirmar que todas as keywords resolvem**

Run: `tests/robot/.venv/Scripts/robot --dryrun --outputdir tests/robot/results tests/robot/suites/personalizacao_topico.robot`
Expected: PASS. Isso confirma que a suite inteira está sintaticamente correta e todas as keywords existem, sem precisar de staging ainda.

- [ ] **Step 3: Commit**

```bash
git add tests/robot/suites/personalizacao_topico.robot
git commit -m "test(robot): adiciona suite principal do fluxo de personalizacao por topico"
```

---

## Task 8: Execução real contra staging (bloqueada até credenciais serem fornecidas)

Esta task só pode ser concluída quando os valores da seção "Pré-requisitos externos" estiverem disponíveis. Documentar isso não é um placeholder do plano — é uma dependência externa real já registrada como risco na spec.

**Files:** nenhum (task operacional, não produz código novo).

- [ ] **Step 1: Configurar as variáveis de ambiente reais de staging**

PowerShell (substituir pelos valores reais fornecidos):
```powershell
$env:RF_BASE_URL_FRONTEND = "<url staging frontend>"
$env:RF_BASE_URL_API = "<url staging api>"
$env:RF_SUPABASE_URL = "<url staging supabase>"
$env:RF_SUPABASE_ANON_KEY = "<anon key staging>"
$env:RF_PROFESSOR_EMAIL = "<email do professor de teste>"
$env:RF_PROFESSOR_SENHA = "<senha do professor de teste>"
```

- [ ] **Step 2: Confirmar que o professor de teste está liberado**

Verificar diretamente no Supabase de staging que existe uma linha em `professor` com `id` igual ao `auth.users.id` desse e-mail e `liberado = true`. Sem isso, `Login.tsx` nunca navega para `/console` (fica preso na tela de login com toast de "aguardando aprovação").

- [ ] **Step 3: Rodar a suite completa**

Run: `tests/robot/.venv/Scripts/robot --outputdir tests/robot/results tests/robot/suites/personalizacao_topico.robot`
Expected: PASS — o relatório em `tests/robot/results/report.html` mostra o teste `Professor Cadastra Conteudo E Personalizacao E Gerada Para Os 7 Perfis` verde, com os 7 perfis BrainHex confirmados.

- [ ] **Step 4: Se falhar por timeout na geração, ajustar `RF_TIMEOUT_GERACAO`**

Run: `$env:RF_TIMEOUT_GERACAO = "20 min"` e repetir o Step 3 — o pipeline de geração depende da latência real do LLM de texto/áudio para os 7 perfis.

---

## Self-Review

**Cobertura da spec:** Escopo (login real, cadastro via UI, setup isolado por execução, validação dos 7 perfis, ambiente configurável) — coberto nas Tasks 1–7. Fora de escopo (mobile, diferenciação de conteúdo, contraste AAA, CI) — nenhuma task o implementa, como esperado. Riscos documentados na spec (staging pendente, pipeline assíncrono, sem CI) — refletidos nos Pré-requisitos e na Task 8.

**Placeholders:** nenhum "TBD"/"implementar depois" no código das tasks 1–7; os únicos valores pendentes (URLs/credenciais de staging) são pré-requisitos externos explícitos, não lacunas do plano.

**Consistência de nomes:** `${CLASSE_ID}`/`${TOPICO_ID}`/`${ACCESS_TOKEN}`/`${PROFESSOR_UUID}` definidos em `ApiSetup.resource` (Task 4) e reusados sem divergência em `Topico.resource` (Task 5) e na suite principal (Task 7). `${TITULO_CONTEUDO}` cadastrado na Task 7 é o mesmo valor passado para `Selecionar Classe Topico E Conteudo Para Personalizacao`. `@{PERFIS_BRAINHEX_LABELS}` definido uma única vez em `Personalizacao.resource` (Task 6) e usado só ali.

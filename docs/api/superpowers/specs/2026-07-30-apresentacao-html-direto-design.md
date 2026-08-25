# Apresentação: entrega direta em HTML (substitui PDF/Puppeteer): Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** O material "apresentação" hoje é gerado como HTML (`slideTemplate.ts`) e depois rasterizado em PDF via Puppeteer/Chrome headless (`pdfService.ts`) só pra ser entregue como arquivo estático. Essa etapa de rasterização é a origem de praticamente todo incidente de deploy do microservice: certificado self-signed do Traefik, disco cheio durante o download do Chrome, cache do Puppeteer no lugar errado (`.puppeteerrc.cjs` não copiado a tempo no Dockerfile), bibliotecas de sistema faltando (`libglib-2.0.so.0` e outras). Além do custo operacional, renderizar em PDF também trava a personalização: qualquer ajuste (contraste, camada de adequação por aluno) exige regerar o PDF inteiro no servidor. Este design remove o Puppeteer do caminho principal: o microservice entrega o HTML que já constrói hoje diretamente pro cliente (web/mobile) renderizar, sem passar por rasterização nenhuma.

**Architecture:** Mantém `slideTemplate.ts`/`buildDeckHtml()` como está (identidade do guardião por perfil, tema da aula, imagens geradas por IA). Remove a etapa `pdfService.ts` → Puppeteer → PDF. O HTML resultante é salvo como arquivo estático (`.html`) no Supabase Storage, no mesmo padrão que o PDF usa hoje (`archiveToSupabase`). Mobile (`WebView` já plugado em `DocumentBlock`) e web (preview do console) passam a apontar pra essa URL `.html` em vez de `.pdf` — sem lógica nova de renderização, já que WebView/iframe renderizam HTML nativamente.

**Tech Stack:** Remove Puppeteer (`microservice/package.json`, `.puppeteerrc.cjs`, `Dockerfile`). Mantém Node.js/Express, OpenAI (`gpt-image-1`, cena de fundo), Gemini (ícones decorativos), HTML/CSS com fonte embutida em base64 (já existente).

---

## Contexto — por que essa mudança agora

Na sessão de hoje (2026-07-30), o pipeline de apresentação PDF (implementado em 2026-07-26, ver `docs/api/superpowers/specs/2026-07-26-slides-visuais-tematicos-design.md`) causou uma cadeia de incidentes de produção, todos giratando em torno do Puppeteer/Chrome:

1. Certificado self-signed do Traefik na comunicação API↔microservice (não relacionado ao Puppeteer em si, mas descoberto no mesmo incidente).
2. Disco cheio na VPS durante `apt-get`/download do Chrome no build.
3. `.puppeteerrc.cjs` copiado depois do `npm install` no Dockerfile — Chrome baixava no cache padrão (`~/.cache/puppeteer`) em vez de `node_modules/.puppeteer_cache`, onde o código procura.
4. Bibliotecas de sistema faltando (`libglib-2.0.so.0` e outras) — `node:22-slim` não tem o que o Chrome headless precisa pra rodar.

Cada um desses foi corrigido isoladamente, mas o padrão deixa claro que manter um Chrome headless vivo e saudável em produção é caro e frágil. Rodar apresentação como HTML entregue direto ao cliente elimina essa classe de problema inteira.

---

## Decisões (resultado das perguntas de esclarecimento)

| Decisão | Escolha |
|---|---|
| Formato entregue ao cliente | **HTML pronto**, reaproveitando `slideTemplate.ts`/`buildDeckHtml()` como está — não JSON estruturado renderizado por componente próprio em cada plataforma |
| Futuro do PDF | **Sai de cena.** Sem exportação/download por enquanto; Puppeteer é removido do pipeline principal, não vira "opcional sob demanda" |
| Onde o HTML mora | **Arquivo estático no Supabase Storage**, mesmo padrão de hoje (gera uma vez por classe × tópico × perfil, sobe pro Storage, cliente aponta pra URL) — não é servido dinamicamente por endpoint |
| Escopo da personalização por perfil | **Só preservar o que já existe** (assinatura editorial, cor/retrato/fonte por perfil) — não expandir nesta mudança |

---

## Seção 1: Arquitetura e fluxo

```
runPipeline(profile, fontes, ...)                    [server.ts]
  │
  ├─ processMediaWithGemini(...)                      [inalterado]
  │     → slides[] com imagePrompt + iconPrompts[]
  │
  ├─ generateSlideAssets(slides, profile)              [inalterado]
  │     → cena de fundo (OpenAI) + ícones (Gemini) por slide
  │
  ├─ buildDeckHtml(slides, profile)                    [inalterado — slideTemplate.ts]
  │     → monta 1 documento HTML completo (identidade do guardião + tema da aula)
  │
  └─ archiveToSupabase(htmlString, ext: "html")         [ajustado — sobe .html em vez de .pdf]
```

**Removido:** `pdfService.ts` deixa de existir como gerador de PDF — `launchPresentationBrowser`, `resolvePresentationExecutablePath`, `presentationBrowserLaunchOptions`, `getPresentationRendererReadiness`/`runPresentationRendererProbe`, e a checagem `presentation_renderer` no `/api/health`. Junto: `.puppeteerrc.cjs`, a dependência `puppeteer` em `microservice/package.json`, e as mudanças de `Dockerfile` feitas hoje (linha do `COPY package*.json .puppeteerrc.cjs ./` deixa de ter propósito).

**Mantido:** `slideTemplate.ts` (reaproveitado 100%), geração de imagens IA (cena OpenAI + ícones Gemini), `archiveToSupabase`.

**Mobile/Web:** nenhuma lógica de renderização nova. Mobile já tem `WebView` plugado em `DocumentBlock` pra blocos `tipo === "apresentacao"`, hoje apontando pra URL do PDF; passa a apontar pra URL do `.html`. Web (preview do console) idem via iframe/link. HTML é, inclusive, mais simples de exibir em `WebView` do que PDF (WebView renderiza HTML nativamente; PDF dependia de suporte nativo variável por plataforma).

---

## Seção 2: Contrato, versionamento e storage

**Versões** (`microservice/src/constants/pipelineVersions.ts` + `api/app/services/media_contract.py`, mantidos em espelho):
- `PRESENTATION_ENGINE_VERSION`: `"puppeteer-html-v3"` → `"html-direct-v1"`.
- `MEDIA_PIPELINE_VERSION` incrementa (força regeneração do material existente, já que o arquivo entregue muda de `.pdf` pra `.html`).

**`/api/health` do microservice:** remove o campo `presentation_renderer` e o probe de Puppeteer inteiro — não há mais Chrome pra verificar. `brainhex_contract_ready` (`api/app/services/media_agents.py`) deixa de precisar tratar `status: "degraded"`/503 como transitório nesse ponto especificamente (a lógica de retry genérica pra instabilidade de rede continua).

**Storage (`microservice/server.ts`):**
- Renomeia `pdfPath`/`pdfUrl` → `presentationPath`/`presentationUrl` (manter nome "pdf" apontando pra um `.html` seria enganoso).
- Caminho: `${storagePath}/apresentacao/material-${refId}.pdf` → `.../material-${refId}.html`.
- `archiveToSupabase(..., "application/pdf")` → `"text/html"`.
- `materiais.apresentacao` (JSONB, Supabase) continua guardando uma URL — só muda extensão/mimetype.

**Mobile (`mobile/src/utils/contentBlocks.ts`):** `isPdfUrl()`, `isPresentationUrl()`, `isDocumentUrl()`, `inferBlockType()` formam a cadeia que infere o tipo de bloco quando não vem declarado explicitamente (`pdf` → `documento` → `apresentacao`, nessa ordem — ver linhas 327-331). Preciso conferir/ajustar pra que uma URL `.html` de apresentação não seja capturada por `isDocumentUrl` antes de chegar em `isPresentationUrl`. Detalhe de implementação, não decisão de design em aberto.

---

## Seção 3: Tratamento de erros

Superfície de falha muito menor que hoje — some a classe inteira de erro "Puppeteer não lançou o browser" / "Chrome não encontrado" / bibliotecas de sistema faltando.

- **Falha de imagem individual** (cena de fundo ou 1 ícone): inalterado — CSS já cai pra cor sólida derivada do accent do perfil, elemento que falhou simplesmente não entra no HTML. Mesmo comportamento de hoje.
- **`buildDeckHtml`:** é montagem de string em memória, sem processo externo. Só falha com dado de entrada malformado, já validado antes pelo schema do `geminiService.ts`.
- **Upload pro Storage:** mesmo tratamento de erro genérico que `archiveToSupabase` já tem.
- **Fonte embutida:** já é `data:` URL em base64 (`fileToDataUrl` em `slideTemplate.ts:50-53`) — self-contained, sem dependência de rede nem no servidor (build) nem no cliente (render). Nenhuma mudança necessária aqui.

---

## Seção 4: Testes

- `microservice/src/services/pdfService.test.ts` é **removido** (não adaptado — o arquivo inteiro testava comportamento específico de Puppeteer/PDF que deixa de existir): lançamento de browser, `%PDF` nos primeiros bytes, contagem de páginas via regex.
- Testes de `slideTemplate.ts`/`buildDeckHtml` (existentes ou novos, conforme cobertura atual) continuam garantindo: HTML válido por perfil, nenhum `sourceIds`/`Ref:` vazando como texto visível, não lança exceção com/sem `imagem_referencia`/`icones` presentes.
- `microservice/src/server.test.ts`: ajusta asserções de `/api/health` que hoje esperam o campo `presentation_renderer` (removido do payload).
- QA visual continua manual (abrir o `.html` gerado num browser, inspecionar) — mais simples que hoje, que exigia renderizar o PDF pra visualizar.
- `microservice/scripts/renderPresentationQa.ts` importa `generateSlidesPDF` e `launchPresentationBrowser` de `pdfService.ts` — ambos removidos. O script é ajustado pra escrever o HTML de `buildDeckHtml` (que já importa) direto em disco, sem Puppeteer — fica mais simples do que é hoje.

---

## Fora de escopo

- Expandir a personalização por perfil além do que já existe (assinatura editorial, cor/retrato/fonte, geração de imagens IA) — só preservar.
- Exportação/download de PDF, mesmo sob demanda.
- Fallback Python (`MultiOutputPipeline`/reportlab) — não é tocado.
- Servir o HTML dinamicamente por endpoint (fica como arquivo estático no Storage, igual ao padrão de hoje).
- Regressão visual automatizada (screenshot diffing) — QA continua manual.
- **Render nativo mobile do material "apresentação"** (`mobile/src/utils/personalization.ts:1182-1273`): descoberto durante o planejamento que o mobile, quando há `payload.slides` inline (caso normal), **não abre o arquivo** (PDF hoje, `.html` depois desta mudança) — monta blocos de markdown simples (título + bullet points de texto) via `MarkdownBlock.tsx`, ignorando cor/imagem/ícone por perfil. Ou seja: o arquivo trocado por este design é consumido pelo **preview do console web** (iframe em `PerfilConteudoDialog.tsx`), não pelo aluno no app. Enriquecer o que o aluno realmente vê no mobile (usar a cor/imagem/ícone já presentes em `payload.slides` num componente visual nativo, em vez de texto puro) é trabalho de UI novo, com decisões de design próprias — fica para um brainstorm dedicado à parte.

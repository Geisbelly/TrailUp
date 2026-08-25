# Slides de Apresentação Temáticos (estilo Slidesgo): Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Os slides de apresentação (PDF) gerados pelo `microservice` hoje repetem o mesmo retrato estático em toda página e ignoram a imagem gerada por IA por slide, resultando em decks visualmente idênticos slide a slide, sem relação com o assunto da aula. O objetivo é reescrever o gerador de PDF pra produzir slides com nível de acabamento visual próximo de templates prontos (Slidesgo/Slidescarnival), combinando o assunto específico da aula com a identidade fixa do guardião BrainHex do aluno.

**Architecture:** Troca o motor de renderização do PDF de jsPDF (vetorial puro) para Puppeteer (HTML+CSS real → PDF), restrito ao caminho `microservice` (fonte de verdade de geração de mídia — o fallback Python `MultiOutputPipeline`/reportlab fica fora de escopo). O schema de slide gerado pela IA ganha um campo `iconPrompts` por slide, cada slide decidindo seus próprios elementos decorativos (sem tema compartilhado entre slides — trade-off aceito explicitamente). Geração de imagem passa a rodar para todos os slides, dividida por provedor: a **cena de fundo** de cada slide vai para a **OpenAI** (`gpt-image-1`, melhor qualidade artística), os **ícones decorativos** continuam na **Gemini**. Ambos com chave única (sem pool multi-chave — não foi possível provisionar chaves extras do Gemini).

**Tech Stack:** Node.js/Express (microservice), Puppeteer (novo — render HTML→PDF), OpenAI API (`gpt-image-1`, novo — cena de fundo por slide), Gemini API (`gemini-2.5-flash-image` — ícones decorativos), HTML/CSS (template dos slides).

---

## Contexto — o que está quebrado hoje

`microservice/src/services/pdfService.ts` (antes desta mudança):
1. Busca o retrato oficial do guardião **uma vez fora do loop de slides** e o usa como painel esquerdo em **todo** slide — idêntico do primeiro ao último.
2. A imagem gerada por IA por slide (`imagem_referencia`, vinda de `imagePrompt`, já nasce 16:9 — a mesma proporção do slide inteiro) é **descartada**: `const imgRef = guardianImage || s.imagem_referencia || ""` nunca chega a usar `s.imagem_referencia` porque `guardianImage` é sempre verdadeiro.
3. `sourceIds` (metadado interno de rastreabilidade) era renderizado como texto visível (`Ref: pptx-sN`) no PDF entregue ao aluno.
4. A cor de fundo por perfil (`PANEL_BG`) era uma tabela escolhida à mão, dessincronizada da cor-assinatura real de alguns perfis (ex.: Seeker/Amara é dourado mas o painel saía verde).
5. Só os 6 primeiros slides de cada deck recebem imagem gerada (`generateSlidesImages`, limite de custo/rate-limit) — o resto sempre cai no fallback estático.

Uma correção incremental já foi aplicada nesta sessão (full-bleed da imagem existente + motivos vetoriais por perfil + cor derivada do accent + remoção do vazamento de `Ref:`) e está funcional, mas o usuário pediu ir além, no nível de composição/riqueza visual dos templates de referência (Slidesgo/Slidescarnival — civilização Maia, "impostores entre a tripulação", Egito vintage, espaço). Este design substitui essa correção incremental.

---

## Decisões (resultado das perguntas de esclarecimento)

| Decisão | Escolha |
|---|---|
| O que manda na composição visual de cada slide | **Os dois pesam igual**: identidade do guardião (cor, retrato, nome) fica fixa em todo slide; o assunto da aula muda a cena de fundo e os ícones decorativos |
| Motor de renderização | **Puppeteer** (HTML/CSS → PDF), substituindo jsPDF |
| Escopo | Só `microservice`; fallback Python (reportlab) fica de fora |
| Fallback se Puppeteer falhar | Nenhum motor alternativo — erro de infraestrutura, resolvido fora do código (ex.: subir em servidor próprio) |
| Como o tema visual da aula é decidido | **Caminho A**: cada slide decide seus próprios ícones/prompts na mesma chamada que já gera o resto do conteúdo — sem passo de planejamento visual dedicado nem kit de ícones compartilhado entre slides |
| De onde vêm os ícones/elementos decorativos | **Gerados por IA na Gemini**, um prompt por ícone (`iconPrompts`), mesmo estilo mágico/ilustrado do guardião |
| De onde vem a cena de fundo do slide | **Gerada por IA na OpenAI** (`gpt-image-1`) — trocada do Gemini pra essa por qualidade artística |
| Quantos slides recebem imagem gerada | **Todos** (remove o limite de 6) |
| Como viabilizar o volume de chamadas de imagem | **Sem pool** — cada provedor com **1 chave só** (não foi possível provisionar chaves extras do Gemini, e a OpenAI também é 1 chave). O paralelismo possível vem de cena de fundo (OpenAI) e ícones (Gemini) serem provedores/chaves diferentes, então podem rodar ao mesmo tempo um do outro; dentro de cada provedor a geração continua serial com retry/backoff, então decks com muitos slides vão levar mais tempo pra gerar do que se houvesse pool — ver Seção 3 |
| Infra do Puppeteer no Render | Segue como está; se faltar memória, o usuário tem servidor próprio para migrar depois |

**Trade-off aceito conscientemente:** como cada slide escolhe seus ícones de forma independente (caminho A), a coesão visual entre slides de uma mesma aula pode ser menor do que em um deck Slidesgo real (que reusa o mesmo kit de ícones do início ao fim). Não é tratado neste design — fica como possível iteração futura se o resultado incomodar na prática.

---

## Seção 1: Arquitetura e fluxo

```
runPipeline(profile, fontes, ...)                    [server.ts]
  │
  ├─ processMediaWithGemini(files, profile)           [geminiService.ts]
  │     → markdown, audioScript, slides[] (cada slide agora com imagePrompt + iconPrompts[])
  │
  ├─ generateSlideAssets(slides, profile)              [NOVO — substitui generateSlidesImages]
  │     → roda os dois em paralelo (provedores/chaves independentes):
  │         - generateSceneImage(imagePrompt) × slide         [NOVO — OpenAI gpt-image-1]
  │         - generateSlideImage(iconPrompt) × N por slide    [existente — Gemini]
  │       dentro de cada provedor, as chamadas continuam seriais com retry/backoff
  │       (1 chave cada, sem pool — ver Seção 3)
  │     → retorna slides[] enriquecidos com { imagem_referencia, icones: string[] }
  │
  ├─ generateSlidesPDF(slides, profile)                [pdfService.ts — REESCRITO]
  │     → monta 1 documento HTML (1 <section> por slide, 1280×720)
  │     → Puppeteer: page.pdf() → Buffer
  │
  └─ archiveToSupabase(...)                            [inalterado]
```

`openaiImageService.ts` (novo, `src/services/`): client OpenAI (`OPENAI_API_KEY`, 1 chave), expõe `generateSceneImage(prompt: string): Promise<string | null>` usando `gpt-image-1` — mesmo papel de `generateSlideImage` (Gemini) mas para a cena de fundo. Sem pool: não há mais chaves disponíveis pra nenhum dos dois provedores, então tanto `generateSceneImage` quanto `generateSlideImage` seguem cada um com 1 chave própria — o ganho de paralelismo vem só de rodar os dois provedores ao mesmo tempo (`Promise.all`), não de dividir carga dentro de um mesmo provedor.

---

## Seção 2: Schema de conteúdo gerado (mudança de contrato)

Cada slide, no JSON retornado pela IA (`geminiService.ts` e nos prompts Python equivalentes), ganha:

```
{
  ...campos existentes (title, topics, explanation, characterQuote, characterAction, imagePrompt, sourceIds),
  "iconPrompts": ["string", "string"]   // NOVO — 2 a 4 prompts curtos, cada um um elemento
                                        // decorativo especifico do slide, no mesmo estilo
                                        // magico/ilustrado do guardiao (nunca icone generico
                                        // de clipart, nunca texto/letras dentro da imagem)
}
```

Arquivos afetados:
- `microservice/src/services/geminiService.ts` — `responseSchema` ganha `iconPrompts` em cada slide; `systemInstruction` ganha regra explicando o propósito e o estilo esperado.
- `api/app/agent/prompts/gerador_conteudo.txt` e `pipeline_midia_etapas.txt` — mesma regra, mantendo os dois caminhos (microservice e fallback Python) aplicando a assinatura do perfil, mesmo que só o microservice efetivamente gere as imagens a partir desses prompts hoje.

---

## Seção 3: Geração de imagens por slide

`generateSlideAssets` (substitui `generateSlidesImages` em `server.ts`):
- Roda para **todos** os slides (remove o `Math.min(slides.length, 6)` atual).
- Duas trilhas rodando em paralelo entre si (`Promise.all`), cada uma serial internamente (1 chave, sem pool):
  - **Cenas de fundo (OpenAI):** `generateSceneImage(imagePrompt)`, 1 chamada por slide, em sequência com pequeno intervalo (mesmo padrão de delay que existe hoje entre chamadas Gemini, adaptado pro rate-limit da OpenAI).
  - **Ícones (Gemini):** `generateSlideImage(iconPrompt)` por item de `iconPrompts`, também em sequência, reaproveitando o retry/backoff que já existe.
- Falha isolada (uma imagem específica não gera, de qualquer um dos dois provedores) não derruba o slide nem o deck — só aquele elemento fica ausente no HTML final (ver Seção 5).
- Tempo total de geração sobe em relação a hoje (sem pool, volume maior — todos os slides em vez de 6) — não dá pra estimar um número exato aqui; vale medir na implementação e decidir se precisa de ajuste (ex.: aumentar o intervalo entre chamadas se começar a bater rate-limit, já que não há chave reserva pra absorver isso).

Callers afetados em `server.ts`: os dois pontos que hoje chamam `generateSlidesImages` (`runPipeline` e o handler `/api/v1/archive`) passam a chamar `generateSlideAssets`, recebendo de volta os slides já enriquecidos (substitui o papel de `enrichSlidesWithImages`, que só sabia lidar com uma imagem de fundo por slide gerada por um único provedor).

---

## Seção 4: Template HTML/CSS e renderização

Novo módulo interno em `pdfService.ts` (ou arquivo irmão `slideTemplate.ts`) constrói uma string HTML completa:

**Sempre presentes (identidade do guardião, fixa por perfil):**
- Selo do guia: retrato oficial (`mobile/src/assets/guardioes/{profile}.png`, ou `socializer-duo.png` no caso do Socializador) + nome, moldura na cor-assinatura do perfil, em um canto fixo do slide.
- Variável CSS de cor de acento (`--accent: {BRAIN_HEX_CONFIG[profile].color}`) aplicada em bordas de card, título, linha do rodapé.
- Rodapé com nome do guia + `pagina / total`.

**Variam por slide/aula (tema):**
- Cena de fundo (`imagem_referencia`) como `background-image` full-bleed do `<section>`.
- Gradiente CSS real (`linear-gradient`) fazendo a transição entre a arte de fundo e a área de texto — substitui o hack de retângulos empilhados do jsPDF.
- Os ícones gerados (`icones[]`) posicionados via CSS absoluto, com posição/rotação/tamanho variando deterministicamente pelo índice do slide (mesma função `rand01` seed-based já existente, adaptada para gerar valores de `style` inline em vez de coordenadas de desenho).

**Conteúdo:** título, cards de tópico, balão de citação do guia, texto de síntese (`SYNTHESIS_LABELS` por perfil, mantido) — mesma hierarquia de informação de hoje, agora em HTML/CSS real (sombra, cantos arredondados, tipografia variável).

**Fonte:** uma fonte temática (estilo "grimório"/medieval para títulos) embutida como arquivo local no repositório (`microservice/src/assets/fonts/`) e referenciada via `@font-face` com caminho de arquivo — nunca via CDN, porque o Puppeteer precisa renderizar de forma confiável sem depender de rede externa disponível no momento do render.

**Render:** um único documento HTML com N `<section class="slide">` (uma por slide), cada uma com `width/height` fixos em 1280×720px e `page-break-after: always` no CSS. Puppeteer carrega esse documento via `page.setContent(...)` e gera o PDF inteiro numa única chamada `page.pdf({ width: '1280px', height: '720px', printBackground: true })` — sem gerar PDFs por slide e concatenar depois.

---

## Seção 5: Tratamento de erros

- **Falha de uma imagem específica** (cena de fundo ou 1 ícone): o slide não trava — o CSS define uma cor de fundo sólida derivada do accent do perfil por baixo de tudo, e o elemento que falhou simplesmente não é incluído no HTML daquele slide. Mesmo princípio do try/catch que já existe em volta de `doc.addImage` hoje, adaptado para "não incluir a tag `<img>`" em vez de "não desenhar".
- **Falha no lançamento do Puppeteer** (Chromium ausente/erro de sandbox): propaga como falha da etapa de geração de PDF, mesmo contrato de hoje (a etapa é obrigatória no pipeline, sem fallback silencioso para outro motor).
- **Chave no limite (Gemini ou OpenAI):** sem pool pra cair pra outra chave — mantém o retry/backoff exponencial que `generateSlideImage` já implementa hoje (mesmo padrão replicado em `generateSceneImage` pra OpenAI). Se o rate-limit for atingido de forma persistente, os slides/ícones daquela leva ficam sem imagem (degrada pro fundo sólido, não trava o deck).

---

## Seção 6: Testes

- `microservice/src/services/pdfService.test.ts` (já existe, escrito nesta sessão) é adaptado para o novo caminho assíncrono via Puppeteer:
  - PDF válido (`%PDF` nos primeiros bytes) para cada perfil.
  - Nenhum `sourceIds`/`Ref:` vazando como texto visível.
  - Não lança exceção com e sem `imagem_referencia`/`icones` presentes.
  - Contagem de páginas: a checagem atual via regex `/Type /Page` no PDF bruto pode não bater com a estrutura interna que o Chromium gera — substituir por uma checagem equivalente (ex.: abrir o PDF gerado com uma lib de leitura, ou contar `<section>` esperadas vs. páginas retornadas).
- `openaiImageService.test.ts` (novo): valida o parsing da resposta da OpenAI e o comportamento de erro/retry, no mesmo padrão dos testes existentes de `geminiService`.
- QA visual continua manual (gerar um PDF de teste com dados sintéticos, renderizar como imagem via PyMuPDF ou abrir no visualizador do SO, inspecionar) — sem infraestrutura de teste visual automatizado neste escopo.

---

## Fora de escopo

- Fallback Python (`gerar_pdf_slides`/reportlab) — não é tocado.
- Kit de ícones compartilhado/coerente por aula (rejeitado a favor do caminho A: cada slide decide sozinho).
- Testes de regressão visual automatizados (screenshot diffing).
- Ajuste de plano/infra do Render — decisão e execução do usuário, fora do código.

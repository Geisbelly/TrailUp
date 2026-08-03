# Slides imersivos gerados por IA (HTML/CSS/JS livre) — Design

**Status:** proposto, aguardando aprovação do usuário antes do plano de implementação.

## Motivação

Hoje `materiais.apresentacao` é gerado a partir de um array JSON estruturado por
slide (`title`/`topics`/`explanation`/`imagePrompt`/`iconPrompts`/...) que um
template fixo (`microservice/src/lib/slideTemplate.ts`,
`microservice/src/constants/presentationThemes.ts`) transforma num deck HTML
único. Dois problemas concretos motivam esta mudança:

1. **Viewport fixo, não responsivo.** `buildDeckHtml()` gera
   `<meta name="viewport" content="width=1280, initial-scale=1" />` — um deck
   editorial 16:9 pensado pra desktop. O mobile carrega esse mesmo HTML num
   WebView (via `apresentacao`) ou reconstrói uma versão nativa simplificada a
   partir do JSON (`PresentationSlidesBlock`/`apresentacao-slides`) — nenhum
   dos dois é a experiência imersiva desejada.
2. **Layout fixo por perfil, não por conteúdo.** O template escolhe entre um
   punhado de layouts fixos (`cover`/`split`/`cards`/`spotlight`/`timeline`/
   `finale`) numa sequência rotativa por perfil
   (`presentationLayoutForSlide`), preenchidos com os mesmos campos JSON —
   não adapta a estrutura visual ao que aquele slide específico precisa dizer.

Decisão do usuário (não negociável para este projeto): a IA passa a gerar
**HTML/CSS/JS livre por slide** — nada de JSON estruturado sendo renderizado
diretamente em nenhum canal — resultando em decks **responsivos
mobile-first, animados e interativos**, com o mesmo pipeline servindo tanto o
console do professor (adaptado a viewport largo) quanto o app do aluno
(mobile, via WebView).

## Fora de escopo

- Reconstrução retroativa de apresentações já geradas (versionamento cobre
  isso — ver "Migração e versionamento").
- Geração de áudio/narração sincronizada com as novas interações (mantém o
  fluxo de áudio atual, sem mudança).
- Edição manual do HTML pelo professor fora do fluxo de "regenerar com
  prompt" já existente.

## Arquitetura

### 1. Geração por slide (não deck inteiro numa chamada)

Precedente direto neste repositório: o commit `6c892e9` migrou a geração de
markdown de "uma chamada mesclando o tópico inteiro" para "lotes de blocos
menores" após problemas de orçamento de output/qualidade numa chamada grande.
Este design segue o mesmo padrão: **cada slide é uma chamada Gemini
independente**, recebendo:

- o conteúdo-fonte daquele trecho do tópico;
- os design tokens do perfil (cor-assinatura oficial + `secondary`/`accent`/
  `background` pela fórmula já usada em `personalizacao-theme-guide.ts` —
  ver `docs/superpowers/plans/2026-07-26-paleta-brainhex-psicologia-cores.md`)
  e o `mood`/`artDirection`/`motifs` editoriais já definidos em
  `presentationThemes.ts` (viram *brief* de prompt, não mais valores de
  template);
- o HTML do slide anterior (só como referência de continuidade visual, não
  para copiar).

Isso também torna a regeneração de 1 slide natural: é a mesma unidade de
geração, rodada de novo com o prompt de melhoria do professor.

### 2. Shell fixo + isolamento por slide (nested iframes sandboxed)

A IA tem liberdade total sobre o **conteúdo de cada slide**. A **navegação
entre slides** (swipe/tap para trocar, indicador de progresso) é um shell
nosso, fixo e testado — não gerado a cada vez.

Isolamento: cada slide roda no seu próprio `<iframe sandbox="allow-scripts">`
(sem `allow-same-origin`, sem acesso a rede/cookies/storage do app, sem
navegação para o topo), aninhado dentro do documento shell. Motivo de usar
iframe (não Shadow DOM): Shadow DOM encapsula estilo e árvore DOM, mas **não**
isola execução de JavaScript — um script gerado por IA dentro de um shadow
root ainda pode chamar `document.querySelector` fora dele. Iframe isola de
verdade: um slide malicioso/quebrado não afeta os demais nem o shell.

A navegação entre slides (prev/next, gestos de swipe capturados na borda) é
tratada inteiramente pelo shell — ele mostra/esconde/anima os iframes por
índice. Não há comunicação cross-frame necessária para isso. Interações
*dentro* de um slide (toque-pra-revelar, micro-quiz, parallax) ficam
contidas no próprio iframe daquele slide, sem precisar falar com o shell.

CSP restritiva no documento shell e em cada iframe: sem `script-src`
externo, sem `connect-src`, sem `frame-ancestors` fora do próprio app.

### 3. Validação pós-geração (defesa em profundidade)

Antes de persistir o HTML de um slide, um checador estático (determinístico,
sem LLM) rejeita e força nova tentativa se encontrar:

- padrões de rede/armazenamento (`fetch(`, `XMLHttpRequest`, `document.cookie`,
  `localStorage`, `window.top`, `window.parent`, `<script src=` externo);
- tamanho fora do orçamento (limite configurável, mesmo espírito do
  `CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS` já existente);
- ausência de conteúdo renderizável (documento vazio/só whitespace).

Em caso de falha de validação, repete a geração daquele slide (mesmo padrão
de retry por falha de qualidade já usado no pipeline: Gemini tenta de novo
antes de qualquer escalonamento). Isso é defesa em profundidade — o sandbox
do iframe já impede o dano prático mesmo se um HTML malformado passar; a
validação existe para pegar cedo e não persistir lixo.

### 4. Modelo de dado

`materiais.apresentacao.payload` deixa de guardar campos estruturados por
slide e passa a guardar:

```json
{
  "abertura": "string — mantido, ainda útil para roteiro de áudio/contexto",
  "tema_visual": { "...": "brief de design tokens/mood usado como prompt input" },
  "slides": [
    { "index": 0, "html": "<section>...</section> (conteúdo livre gerado pela IA)" }
  ]
}
```

`arquivo_url` continua apontando para **um** HTML final (o deck montado pelo
shell — determinístico, sem custo de LLM, o que também resolve a limitação
documentada no endpoint `/regenerar/slide` desta sessão: "não reconstrói o
deck". Agora reconstruir é barato, então regenerar 1 slide **remonta o deck
inteiro automaticamente**).

### 5. Regenerar 1 slide (rework do endpoint já existente)

Contrato muda de JSON para HTML nos 3 pontos já implementados nesta sessão:

- `microservice/src/services/geminiService.ts`
  (`regenerateSlideContent`): recebe `{ html: string }` do slide atual +
  `improvement_prompt`, devolve `{ html: string }` novo (não mais
  `SlideContent`/`imageBase64`).
- `microservice/server.ts` (`POST /api/v1/regenerate/slide`): body/response
  atualizados para o novo contrato.
- `api/app/services/media_agents.py` (`regenerar_slide_brainhex`): payload
  `slide` passa a ser `{"html": "..."}`.
- `api/app/api/v1/personalizacao.py`
  (`regenerar_slide_personalizacao`): lê `materiais.apresentacao.payload.slides[i].html`
  em vez de campos estruturados, chama o client, escreve o `html` novo,
  **remonta e re-upload do deck completo** (função determinística, local —
  sem chamada de rede além do upload), atualiza `arquivo_url`. A resposta da
  API troca `slide: dict` + `image_base64_preview` por só `slide_html: str`
  — não existe mais imagem separada; a imagem, se houver, é parte do
  HTML/CSS do próprio slide, já visível ao vivo no deck remontado.

### 6. Console do professor e mobile — mesmo HTML, responsivo

Um único pipeline de geração cobre os dois ambientes. O prompt orienta a IA
a usar unidades relativas (`%`, `vw`/`vh`, `rem`), sem largura fixa, com
media queries para aproveitar viewports largos (o console roda o mesmo
HTML num iframe mais largo; não há dois decks gerados separadamente — isso
dobraria custo/latência de geração sem ganho claro).

### 7. Migração e versionamento

`PRESENTATION_ENGINE_VERSION`/`PRESENTATION_DESIGN_VERSION`
(`microservice/src/constants/pipelineVersions.ts`) são incrementadas.
Apresentações já geradas com a versão antiga **não são reconstruídas
retroativamente** — seguem servindo o HTML antigo (mesmo padrão já usado
pelo projeto para toda mudança de pipeline, por `CLAUDE.md`: "incremente
essa versão quando prompts... precisarem ser regenerados"). Um novo ciclo de
geração (redisparo manual do professor, ou natural via class-delta/full-sync)
passa a usar o novo pipeline.

### 8. Testes

Como a saída deixa de ser determinística (HTML/CSS/JS livre por slide), a
estratégia de teste muda de forma:

- **Testes automatizados** cobrem as partes determinísticas: função de
  montagem do shell (dado N HTMLs de slide, produz um documento com N
  iframes sandboxed corretamente configurados + CSP), o validador
  estático (aceita/rejeita amostras conhecidas de HTML válido/malicioso), e
  o contrato da chamada Gemini (mockada, no mesmo padrão já usado em
  `geminiBlockBatches.test.ts`/`test_brainhex_generation.py`).
- **QA visual manual** continua necessário para "isso ficou bonito/imersivo/
  on-brand" — não é automatizável. `microservice/scripts/renderPresentationQa.ts`
  (já existente, hoje gera um deck de amostra por perfil com dados
  sintéticos via `buildDeckHtml`) é estendido para o novo pipeline: em vez de
  slides JSON sintéticos, usa fixtures de HTML de slide (hardcoded ou geradas
  uma vez e congeladas) para exercitar a montagem do shell sem depender de
  uma chamada real ao Gemini a cada execução.

## Fases de implementação (para o plano)

1. Shell de montagem do deck (iframes sandboxed, CSP, navegação/gestos) +
   validador estático + testes determinísticos.
2. Pipeline de geração por slide no microservice (prompt, chamada Gemini,
   retry por falha de validação) substituindo o preenchimento de template
   atual.
3. Rework dos 3 endpoints de regeneração (microservice + api) para o
   contrato HTML.
4. Migração do consumo no mobile (retirar `PresentationSlidesBlock`/
   `apresentacao-slides`, usar o WebView existente apontando pro novo deck)
   e conferência do console do professor.
5. QA visual manual multi-perfil (script de QA estendido) + verificação de
   contraste/acessibilidade antes de liberar.

## Pré-requisito antes de ligar o flag em produção

> **Status: resolvido nesta branch** (`fix/slides-imersivos-consumer-guards`),
> retroportado aqui porque esta branch foi criada a partir de `main` e não
> depende de `feature/slides-imersivos-wiring` — a seção original vive
> naquela branch (commit `de75cc8`); esta cópia mantém o histórico desta
> branch autocontido.

`materiais.apresentacao.payload.slides` agora pode assumir 2 formatos
incompatíveis, sinalizados por `metadata.engine_variant`:

- **motor imersivo** (`engine_variant === "immersive"`) — array de
  `{index, html}` (fragmento HTML por slide, sem estrutura de
  título/tópicos/etc.).
- **pipeline de imagem+template** (`engine_variant` ausente) — array de
  `SlideContent` estruturado (`title`/`topics`/`explanation`/`visualDescription`/
  `characterQuote`/etc.), como sempre foi antes desta mudança.

Todo consumidor de `payload.slides` fora do `microservice/` foi rastreado e
**nenhum deles** verificava `metadata.engine_variant` antes de tratar cada
item como `SlideContent`. Se `PRESENTATION_ENGINE_IMMERSIVE_ENABLED` fosse
ligado em qualquer ambiente que esses consumidores alcançam, eles leriam
`{index, html}` como se fosse `SlideContent` silenciosamente — sem erro, sem
fallback — produzindo UI garantida quebrada (campos `title`/`topics`
`undefined`) ou, no caso da rota de regeneração de slide individual, corrupção
de escrita no material persistido. Não era uma falha graciosa; era corrupção
silenciosa de dado.

**Os 3 pontos abaixo agora checam `metadata.engine_variant === "immersive"`
antes de assumir o formato `SlideContent`** (implementado em
`docs/superpowers/plans/2026-08-03-slides-imersivos-consumer-guards.md`):

- `mobile/src/utils/personalization.ts` (`normalizeMediaBlocks`) — pula a
  síntese do bloco nativo `apresentacao-slides` quando imersivo, caindo no
  caminho WebView (`arquivo_url`) já existente.
- `mobile/src/components/PresentationSlidesBlock.tsx` (`normalizePayload`) —
  defesa em profundidade: descarta slides sem conteúdo substantivo.
- `api/app/api/v1/personalizacao.py` (`regenerar_slide_personalizacao`) —
  rejeita com 409 em vez de misturar formatos na escrita.

## Riscos aceitos

- Geração por slide independente pode gerar leve deriva visual entre slides
  de um mesmo deck (mitigado por passar o HTML do slide anterior como
  referência, mas não eliminado). Aceito conscientemente — mesma categoria
  de trade-off já aceito em outras partes do pipeline (ex.: concorrência de
  perfis sem lock global, documentado no commit `74f84e1`).
- Nenhuma automação garante "qualidade estética" — depende de QA visual
  humana por perfil após cada mudança relevante de prompt.

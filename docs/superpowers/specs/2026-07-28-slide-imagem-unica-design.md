# Slide inteiro como imagem única (gpt-image-1)

## Contexto

Hoje cada slide de uma apresentação personalizada é montado em duas partes:

1. **Imagens geradas por IA**, sem texto: 1 cena de fundo por slide via OpenAI
   (`generateSceneImage`) + ícones decorativos via Gemini com contingência
   OpenAI (`generateSlideIconWithFallback`) — ambos em `server.ts`.
2. **HTML real** por cima (`slideTemplate.ts`): título, corpo, badge do guia,
   cores com contraste WCAG AAA ajustado (`_ensure_min_contrast`), tudo
   renderizado a PDF via Puppeteer (`pdfService.ts`).

O fundo é gerado deliberadamente **sem texto** ("no words, no letters, no
labels") porque texto embutido em imagem de IA costuma sair incorreto em
pt-BR (acentos/diacríticos) e essa separação preserva contraste ajustável,
tipografia por perfil e acessibilidade.

Essa spec troca esse modelo: a imagem gerada pela IA passa a conter o slide
**inteiro** (fundo + título + corpo + identidade visual do perfil), com o
risco de texto assumido conscientemente em troca de menos chamadas de imagem
por slide (hoje até 2 chamadas — cena + ícone — viram 1) e de um resultado
visualmente mais coeso.

Isso conecta diretamente com o incidente investigado nesta mesma sessão: um
job de 95 slides estourou o hard limit de billing da OpenAI gerando cena+ícone
separados para cada slide. Um circuito de fail-fast para esse hard limit já
foi implementado em `openaiImageService.ts` (`isOpenAiBillingHardLimitError`,
`resetOpenAiImageCircuit`) — esta spec reaproveita esse mesmo circuito.

## Decisões

- **Escopo: slide inteiro na imagem.** Título, corpo, ícone e identidade do
  perfil ficam todos embutidos no prompt de uma única chamada de imagem por
  slide. `slideTemplate.ts` deixa de desenhar título/corpo em HTML para esse
  slide — só encaixa a imagem full-bleed.
- **Fallback por slide.** Se a geração da imagem cheia falhar (erro de API,
  circuito de billing aberto, resposta sem imagem), aquele slide
  especificamente cai para o pipeline atual (fundo + ícone + HTML). Um deck
  pode sair com mistura de slides `full-image` e `legacy` — nunca aborta o
  job inteiro por causa de um slide.
- **Acessibilidade: alt-text preservado.** O texto original (título + corpo)
  que virou prompt continua salvo e vai como `alt`/`aria-label` da tag
  `<img>` no HTML da página — não aparece visualmente, mas leitor de tela
  ainda tem acesso ao conteúdo real.
- **Qualidade dedicada para esse caminho.** `OPENAI_IMAGE_QUALITY=medium`
  (ajustado ontem para cena/ícone sem texto) é baixo demais para texto
  legível. Novo env var `OPENAI_SLIDE_IMAGE_QUALITY` (padrão `"high"`) só
  para a geração de slide inteiro, via override por chamada — não muda o
  custo do caminho legacy (cena/ícone continuam em `medium`).
- **Sem QA automático de texto nesta v1.** Não há detecção/regeneração
  automática quando o texto sair ilegível — risco aceito explicitamente.
  Revisável depois se virar problema recorrente.
- **Granularidade de geração inalterada.** Continua 1 imagem por
  (tópico × perfil × slide), gerada uma vez e reusada entre alunos do mesmo
  perfil — não muda a arquitetura de compartilhamento de material descrita no
  `CLAUDE.md` do projeto.

## Arquitetura

### `openaiImageService.ts`

Nova função `generateFullSlideImage(prompt, retries, attempt, overrides?)`,
ao lado de `generateSceneImage`/`generateDecorativeIconImage`, reaproveitando
o `generateImageBase64` interno existente (mesmo circuito de billing
`openaiImageUnavailableUntil` — se o hard limit abrir aqui, também bloqueia
cena/ícone na mesma execução, porque é a mesma conta OpenAI).

Diferenças de parâmetro em relação às chamadas existentes:
- `size: "1536x1024"` (igual à cena hoje — é o formato mais próximo de 16:9
  suportado pelo `gpt-image-1`).
- `quality`: `OpenAiImageOverrides` ganha um campo opcional `quality`, que
  quando presente tem precedência sobre a leitura de
  `process.env.OPENAI_IMAGE_QUALITY` dentro de `generateImageBase64`.
  `generateFullSlideImage` passa `quality: process.env.OPENAI_SLIDE_IMAGE_QUALITY
  || "high"` por padrão.
- `prefix`/prompt: novo texto-base que instrui o modelo a renderizar o
  título e o corpo do slide (recebidos como parâmetros, não só uma "cena"),
  reforçando identidade do perfil (reaproveita `buildImageStyleSuffix`) e uma
  instrução best-effort de contraste/legibilidade tipográfica (não há mais
  como aplicar `_ensure_min_contrast` depois de a imagem existir).

### `server.ts`

Nova função `generateFullSlideImages(slides, profile, plan)`, chamada no
lugar de `generateSlideAssets` no caminho principal de geração de deck. Para
cada slide, na ordem:

1. Tenta `generateFullSlideImage(...)` com o prompt completo (título+corpo+
   direção visual).
2. Sucesso → slide recebe `renderMode: "full-image"` e o base64 resultante.
3. Falha (exceção de qualquer natureza, incluindo circuito de billing aberto)
   → loga (`log.warn("slide cheio falhou, caindo pro pipeline legacy", { slide: i, err })`)
   e roda a geração antiga só para aquele índice (a mesma lógica hoje em
   `generateSceneImages`/`generateSlideIcons`, restrita a 1 slide), marcando
   `renderMode: "legacy"`.

Nenhuma outra etapa do job (persistência em Supabase, upload do PDF) muda —
o formato de saída de `generateFullSlideImages` estende o shape atual de
`SlideAssets` com o campo `renderMode` e o texto original por slide (para o
alt-text). Para slides `full-image`, `imagem_referencia[i]` recebe o base64
da imagem cheia e `icones[i]` fica vazio (`[]`) — não existe ícone separado
nesse modo. Para slides `legacy`, ambos os campos são preenchidos exatamente
como hoje.

### `slideTemplate.ts`

`slideHtml()` ganha um branch inicial: se `slide.renderMode === "full-image"`,
renderiza apenas uma tag `<img>` full-bleed com
`alt="${título}. ${corpo}"` (texto puro escapado via `escapeHtml()`, já
existente no arquivo) e retorna — pulando toda a montagem de título, corpo,
badge do guia e ícone em HTML para esse slide. Quando `renderMode === "legacy"`
(ou ausente, para compatibilidade com chamadas antigas), o comportamento é
idêntico ao atual, sem nenhuma mudança.

### Puppeteer / PDF (`pdfService.ts`)

Sem mudança estrutural: continua HTML → PDF via `generateSlidesPDF`. Para
slides `full-image`, o HTML daquela página fica reduzido a pouco mais que a
tag `<img>`.

**Risco técnico a validar durante a implementação:** não está confirmado que
o `alt` de uma `<img>` sobrevive como texto acessível no PDF gerado pelo
Puppeteer (depende de geração de PDF taggeado, recurso mais recente do
Chrome/Puppeteer). Se não sobreviver, o texto original ainda fica disponível
via o dado persistido no Supabase (não é perdido), mas deixa de valer como
acessibilidade *dentro do PDF* — a decisão de contornar isso (ex: expor o
texto em outro lugar consultável) fica para quando esse risco for confirmado.

## Tratamento de erro

- Falha em `generateFullSlideImage` para um slide → fallback automático para
  o pipeline legacy **daquele slide**, sem abortar o deck.
- Circuito de billing já aberto (por uma chamada anterior de cena/ícone/slide
  cheio) → `generateFullSlideImage` falha rápido sem bater na rede (mesmo
  comportamento já implementado em `generateImageBase64`); o fallback legacy
  então tentará cena/ícone, que também falham rápido pelo mesmo circuito —
  resultando no pior caso já existente hoje (slide sem imagem), não um caso
  novo introduzido por esta mudança.
- Texto ilegível/incorreto na imagem gerada: sem detecção automática nesta
  versão — risco aceito.

## Testes

- `openaiImageService.test.ts`: `generateFullSlideImage` usa
  `OPENAI_SLIDE_IMAGE_QUALITY` (padrão `"high"`) por padrão; override de
  `quality` por chamada tem precedência; reaproveita o circuito existente
  (uma chamada que já abriu o circuito faz a chamada seguinte de slide
  inteiro falhar sem invocar `generate`).
- `server.test.ts`: `generateFullSlideImages` — slide com sucesso recebe
  `renderMode: "full-image"`; slide com erro recebe `renderMode: "legacy"` e
  os campos equivalentes ao shape antigo de `generateSlideAssets` para
  aquele índice; falha em um slide não impede os demais de tentar o caminho
  novo.
- `slideTemplate.test.ts`: slide `full-image` renderiza somente `<img>` com
  `alt` = título+corpo; slide `legacy` (ou sem `renderMode`) mantém o
  comportamento atual inalterado (teste de regressão).

## Fora de escopo

- QA/detecção automática de texto ilegível na imagem gerada.
- Consistência visual entre slides do mesmo deck via imagem de referência
  (image-to-image) — cada slide continua sendo gerado de forma independente,
  como já acontece hoje para as cenas de fundo.
- Mudança na granularidade de cache/geração (tópico × perfil), na tabela
  `conteudo_personalizado` ou em qualquer schema do Supabase.

# Rotação de modelos Gemini free-tier antes do fallback obrigatório pra OpenAI

## Contexto

`microservice/src/services/contentGenerationService.ts` gera texto/áudio por
bloco chamando o Gemini (`generateStructuredContentWithFallback`). Quando a
resposta do Gemini passa a validação de contrato (`validateResult`), o
resultado é aceito. Quando não passa (`ContentGenerationQualityError` — ex.:
"Áudio do bloco bloco-02 foi resumido abaixo do mínimo de cobertura"), o
código hoje repete a chamada **no mesmo modelo primário**
(`resolveGeminiContentGenerationModel()`, hoje `gemini-3.6-flash`) até 3 vezes
com um prompt de correção, e se ainda assim falhar, exige uma resposta da
OpenAI (`generateAfterPrimaryGeminiFailure`) — sem alternativa se a conta
OpenAI estiver sem crédito (`insufficient_quota` / HTTP 429).

Esse é exatamente o cenário observado em produção: a conta OpenAI está sem
crédito, e todo bloco cuja saída do Gemini falhar o gate de qualidade nas 3
tentativas do modelo primário passa a falhar a geração inteira daquele
perfil, mesmo com o Gemini saudável e outros modelos do mesmo tier free
potencialmente disponíveis.

Já existe, em `geminiService.ts`, uma lista de modelos Gemini free-tier
(`resolveGeminiTextFallbackModels()` / `DEFAULT_GEMINI_TEXT_FALLBACK_MODELS`)
usada por `generateGeminiContent()` para rotacionar modelos **quando a
chamada em si falha por cota/disponibilidade** (429, modelo aposentado,
timeout). Essa rotação já é exaustiva no nível de transporte — quando um erro
de disponibilidade chega em `contentGenerationService.ts`, todos os modelos
già foram tentados em todas as chaves configuradas. Por isso o fallback
obrigatório da OpenAI em erro de disponibilidade permanece inalterado.

O que falta é uma rotação equivalente para o caso em que a chamada **teve
sucesso, mas o conteúdo não passou no gate de qualidade** — hoje isso só
repete o modelo primário, nunca tenta um modelo diferente.

## Mudança proposta

### 1. `StructuredContentGenerationOptions` ganha `geminiFallbackModels`

Em `contentGenerationService.ts`:

```ts
export interface StructuredContentGenerationOptions {
  generateWithGemini: StructuredContentGenerator;
  generateWithOpenAI?: StructuredContentGenerator;
  validateResult?: (
    value: unknown,
    provider: ContentGenerationProvider,
  ) => void;
  environment?: Record<string, string | undefined>;
  now?: () => number;
  geminiFallbackModels?: string[];
}
```

Injetado pelo chamador (`geminiService.ts`, ponto de chamada de
`generateStructuredContentWithFallback` dentro de `processMediaWithGemini`),
reaproveitando a lista já existente:

```ts
generateStructuredContentWithFallback(call, {
  generateWithGemini: /* ... já existente ... */,
  validateResult,
  geminiFallbackModels: resolveGeminiTextFallbackModels(),
});
```

Isso evita duplicar a lista/env var (`GEMINI_TEXT_FALLBACK_MODELS`) e mantém
os dois pontos de rotação (disponibilidade e qualidade) usando a mesma fonte
de verdade.

### 2. Laço de qualidade tenta os modelos fallback antes de exigir OpenAI

Em `generateStructuredContentWithFallback`, depois que o modelo primário
esgota `maxQualityAttempts` (3, inalterado) sem passar a validação:

- Para cada modelo em `geminiFallbackModels` (exceto o primário, se aparecer
  duplicado na lista), tenta **1 vez** (`call.geminiModel` sobrescrito para o
  modelo do fallback, sem prompt de correção — é um modelo diferente, não uma
  repetição do mesmo erro).
- Se algum desses fallbacks passar a validação, retorna com sucesso
  (`provider: "gemini"`, `model: <modelo do fallback que funcionou>`).
- Erros de disponibilidade durante essa fase (ex.: um modelo fallback
  especificamente aposentado) não interrompem o laço — pula pro próximo
  candidato da lista, já que o objetivo aqui é justamente descobrir qual
  modelo está saudável.
- Só depois de **todos** os modelos (primário + todos os fallbacks)
  terminarem sem sucesso, o código cai em `generateAfterPrimaryGeminiFailure`
  (fallback obrigatório pra OpenAI, comportamento inalterado a partir daí).

Isso NÃO se aplica ao caminho de erro de disponibilidade do modelo primário
(linha ~554, `isGeminiAvailabilityError`) — esse já vem exaurido no nível de
transporte (`generateGeminiContent`), então tentar de novo aqui seria
trabalho repetido.

### 3. Observabilidade

- `StructuredContentGenerationResult.model` passa a refletir o modelo que
  efetivamente produziu o resultado aceito (hoje sempre reporta
  `call.geminiModel`, o primário, mesmo quando a resposta aceita veio de um
  retry).
- A mensagem de erro final (todos os modelos + OpenAI falharam) passa a
  listar quantos modelos Gemini foram tentados antes de exigir OpenAI, em vez
  de "o Gemini falhou" genérico — facilita diagnosticar pelos logs (o
  `[gemini-diag]` já existente por lote continua funcionando sem alteração).

### 4. Lista de modelos fallback ampliada (+6)

`DEFAULT_GEMINI_TEXT_FALLBACK_MODELS` em `geminiService.ts` passa de 5 para
11 modelos, mantendo a ordem de prioridade já documentada (série 3.x
primeiro — contas novas só têm acesso a ela — depois 2.x como tentativa
residual):

```ts
const DEFAULT_GEMINI_TEXT_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];
```

Os 6 novos (`gemini-3.1-flash`, `gemini-3.6-flash-lite`, `gemini-2.5-flash`,
`gemini-2.5-pro`, `gemini-1.5-flash`, `gemini-1.5-pro`) completam variantes
já usadas em outro ponto do código (`REGENERATION_GEMINI_MODELS`, no motor de
regeneração com prompt) ou pares naturais dos modelos já na lista
(`-lite`/não-`-lite` da mesma versão). Essa lista amplia os dois consumidores
que já dependem de `resolveGeminiTextFallbackModels()`: a rotação por
disponibilidade (inalterada) e a nova rotação por qualidade (item 2).

`.env.example` (comentário de `GEMINI_TEXT_FALLBACK_MODELS`) e
`geminiKeyRotation.test.ts` (asserção da lista default) precisam refletir a
lista ampliada.

## Fora de escopo

- Erros de disponibilidade do modelo primário continuam indo direto pro
  fallback obrigatório da OpenAI (já esgotados no nível de transporte).
- Nenhuma tentativa de correção de prompt nos modelos fallback — só no
  primário, como hoje.
- Nenhuma mudança no comportamento quando a OpenAI falha (mensagem de erro
  final, streak de falha, etc.) além de listar os modelos Gemini tentados.

## Teste

- Reproduz o cenário dos logs: modelo primário falha qualidade 3x, primeiro
  modelo fallback também falha qualidade, segundo fallback passa → confirma
  que a OpenAI nunca é chamada e que `result.model` reporta o modelo do
  segundo fallback.
- Todos os modelos (primário + 11 fallbacks) falham qualidade → confirma que
  só então o fluxo exige OpenAI, e que a mensagem de erro final menciona a
  quantidade de modelos Gemini tentados.
- Erro de disponibilidade em UM modelo fallback específico durante a fase de
  rotação por qualidade não aborta o laço — passa para o próximo candidato.
- `resolveGeminiTextFallbackModels()` sem override de env retorna a lista
  ampliada de 11 modelos, na ordem especificada.

# Assinatura com caracterização contida e barreira de fidelidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar a fantasia do prompt base por guia com voz e cena curta, pôr a assinatura
editorial como camada de tom e acrescentar uma barreira local que remove ou registra o que não está
no material do professor.

**Architecture:** a assinatura vira um JSON no microservice com teste de paridade na API. O prompt
(`buildContentGenerationInstruction`) ganha uma camada comum e uma seção de assinatura. Um módulo
puro (`fidelityGuard.ts`) roda sobre cada capítulo já aceito por `validateBlockBatchGeneration`, e
os achados sobem em `ProcessedContent.metadata.fidelidade` até o material de markdown.

**Tech Stack:** TypeScript (tsx, `node:test`), Python 3.12 (pytest).

**Spec:** `docs/superpowers/specs/2026-11-11-assinatura-meio-termo-e-barreira-design.md`

## Global Constraints

- Todo texto em PT-BR, UTF-8 sem BOM.
- A barreira não chama modelo, não lança erro e não reescreve frase: só remove item e cerca código.
- A barreira nunca roda dentro de `validateResult` (lá um erro faz a cascata gerar de novo e gasta cota).
- Uma única subida de `MEDIA_PIPELINE_VERSION`, igual em `api/app/services/media_contract.py` e
  `microservice/src/constants/pipelineVersions.ts`.
- Nenhum `git push` nem PR antes de Geisbelly aprovar o resultado do segundo piloto.
- Testes novos do microservice entram na lista explícita do script `test` do `package.json`.

## Review Focus

1. Bloco sem código e sem checklist (tópico fora de programação): a barreira não pode achar nada nem
   mudar o texto. → teste em Task 2.
2. Checklist com item verdadeiro que parafraseia a fonte com outras palavras: não pode ser removido.
   → caso dos itens verdadeiros do Survivor em Task 2.
3. Bloco cercado que mostra a versão errada da refutação (`inicio < fim`): registra, não remove.
   → teste em Task 2.
4. Perfil Socializer (diálogo): sem `[Tom: ...]` e sem tom de narrador solo. → teste em Task 3.
5. Lote em que todos os capítulos passam limpos: `metadata.fidelidade` existe com `achados: []`,
   para distinguir "checado sem achado" de "não checado". → teste em Task 4.

---

### Task 1: Assinatura no microservice e paridade com o Python

**Files:**
- Create: `microservice/src/constants/editorialSignatures.json` (cópia exata de
  `_BRAINHEX_EDITORIAL_SIGNATURES`, 7 chaves, grafia `"Socialiser"`, 9 campos)
- Create: `microservice/src/constants/editorialSignatures.ts`
- Modify: `microservice/tsconfig.json` (`"resolveJsonModule": true`)
- Create: `microservice/src/constants/editorialSignatures.test.ts`
- Create: `api/tests/test_assinatura_editorial_paridade.py`
- Modify: `microservice/package.json` (script `test`)

**Interfaces:**
- Produces:
  ```ts
  export interface EditorialSignature {
    tom_voz: string; ritmo: string; abertura_estilo: string; convencimento_estilo: string;
    progressao_narrativa: string; fechamento_estilo: string; narrativa_preferencial: string;
    marcadores_linguisticos: string[]; proibicoes_estilo: string[];
  }
  export function editorialSignatureFor(profile: BrainHexProfile): EditorialSignature;
  ```

- [ ] **Step 1: testes.** `editorialSignatures.test.ts`: para os 7 `BrainHexProfile`,
  `editorialSignatureFor` devolve os 9 campos não vazios; `editorialSignatureFor("socializer")` é a
  entrada `"Socialiser"` do JSON. `test_assinatura_editorial_paridade.py`: carrega o JSON (caminho
  relativo a `api/tests`, como `test_boss_falas.py` faz com o mobile) e faz
  `assert json == _BRAINHEX_EDITORIAL_SIGNATURES`.
- [ ] **Step 2:** rodar e ver falhar (`cd microservice && node --import tsx --test src/constants/editorialSignatures.test.ts`; `cd api && pytest tests/test_assinatura_editorial_paridade.py`).
- [ ] **Step 3:** gerar o JSON a partir do Python (`ast.literal_eval` do dicionário, `json.dumps(..., ensure_ascii=False, indent=2)`), escrever o `.ts` com o mapa perfil → chave e ligar `resolveJsonModule`. Conferir que o import do JSON funciona nos dois modos que o projeto usa: `node --import tsx --test` (testes) e `node --require tsx/cjs` (`npm start`).
- [ ] **Step 4:** os dois testes passam; `npm run lint` no microservice passa.
- [ ] **Step 5:** commit `feat(microservice): assinatura editorial do perfil em JSON, com paridade testada contra o Python`.

### Task 2: Barreira de fidelidade

**Files:**
- Create: `microservice/src/services/fidelityGuard.ts`
- Create: `microservice/src/services/__fixtures__/fidelidade/` com `blocos.json` e os 5
  `<perfil>-<cond>.json` (o campo `conteudo` dos `.gemini.json` de
  `docs/analises/2026-11-11-avaliacao-assinatura-editorial/notas/dados/gen/`)
- Create: `microservice/src/services/fidelityGuard.test.ts`
- Modify: `microservice/package.json` (script `test`)

**Interfaces:**
- Consumes: `EnrichedContentBlock` (`src/types/index.ts`).
- Produces:
  ```ts
  export const FIDELITY_GUARD_VERSION = "fidelidade-v1";
  export type TipoDeAchado = "codigo_sem_cerca" | "codigo_fora_da_fonte" | "item_sem_apoio"
    | "numero_fora_da_fonte" | "generalizacao_fora_da_fonte" | "desafio_sem_resposta";
  export interface AchadoDeFidelidade {
    blockId: string; campo: "markdown" | "audioScript"; tipo: TipoDeAchado;
    trecho: string; acao: "cercado" | "removido" | "registrado";
  }
  export interface RelatorioDeFidelidade { versao: string; achados: AchadoDeFidelidade[] }
  export function guardarFidelidade(
    block: EnrichedContentBlock,
    chapter: { markdown: string; audioScript: string },
  ): { markdown: string; audioScript: string; achados: AchadoDeFidelidade[] };
  export function guardarFidelidadeDoAudio(
    block: EnrichedContentBlock, audioScript: string,
  ): AchadoDeFidelidade[];
  ```

As regras e limiares são os da seção 2 da spec. `trecho` tem no máximo 160 caracteres. O limiar de
apoio começa em 0,6 e é calibrado pelo Step 1; se nenhum valor separa os casos, sai e ficam as regras
de crase e de termo ausente.

- [ ] **Step 1: testes**, com os fixtures (`b1`/`b2` de `blocos.json`):
  - `survivor-assinatura`: remove os itens que contêm "ponto flutuante" e "erros de inferência"
    (`acao: "removido"`, `tipo: "item_sem_apoio"`); o markdown resultante ainda contém
    `inicio = meio + 1` e `-1` nos itens do checklist.
  - `mastermind-assinatura`: o código de `busca_binaria` passa a estar dentro de ```` ``` ```` e há
    um achado `codigo_sem_cerca` com `acao: "cercado"`; registra `generalizacao_fora_da_fonte` para
    "exponencial".
  - `survivor-atual`: registra "exponencialmente".
  - Nos cinco: nenhum achado cujo `trecho` contenha "37" do rastreio ou "1.024"; nenhum
    `numero_fora_da_fonte` para "1.000.000", "1.024" ou "20".
  - Bloco sem código e sem checklist (texto de história, fonte e capítulo com as mesmas palavras):
    `achados` vazio e markdown idêntico ao de entrada.
  - Bloco cercado com `while inicio < fim:` (a versão errada): `codigo_fora_da_fonte` com
    `acao: "registrado"` e o bloco continua no texto.
  - `**Desafio:**` sem `**Resposta:**`: `desafio_sem_resposta`.
  - `guardarFidelidadeDoAudio` não devolve `numero_*` nem `codigo_*`.
- [ ] **Step 2:** rodar e ver falhar (`node --import tsx --test src/services/fidelityGuard.test.ts`).
- [ ] **Step 3:** implementar as funções em `fidelityGuard.ts` (normalização: minúsculas, sem acento por `NFKD`, espaços juntados; stopwords do português numa constante local; prefixo de 5 letras).
- [ ] **Step 4:** testes passam; `npm run lint` passa.
- [ ] **Step 5:** commit `feat(microservice): barreira de fidelidade remove item sem apoio no material e cerca código solto`.

### Task 3: Prompt com camada comum e assinatura

**Files:**
- Modify: `microservice/src/services/geminiService.ts` (`buildContentGenerationInstruction`, linhas ~1560–1700)
- Create: `microservice/src/services/contentGenerationInstruction.test.ts`
- Modify: `microservice/src/services/classStoryArc.test.ts` (troca `"MERGULHO TEMÁTICO"` por `"ASSINATURA EDITORIAL DO PERFIL"`)
- Modify: `microservice/package.json` (script `test`)

**Interfaces:**
- Consumes: `editorialSignatureFor` (Task 1).
- Produces: `export function buildEditorialSignatureSection(profile: BrainHexProfile): string` e a
  mesma assinatura de `buildContentGenerationInstruction`.

A redação das regras é a da seção 1 da spec. O texto da seção da assinatura segue o de
`montar-prompts.ts` do teste de 11/11, com os marcadores marcados como vocabulário opcional e as
regras próprias de Survivor, Mastermind e Seeker. O tom de narrador sai de um mapa em código
(`seeker`, `mastermind`, `survivor`, e uma linha para os outros perfis de narração solo), não de uma
condição deixada ao modelo.

- [ ] **Step 1: testes** em `contentGenerationInstruction.test.ts`, para os 7 perfis:
  - não contém `"mística"`, `"medieval"`, `"Alquímica"` nem `"Grimório"` no texto das regras de
    markdown e áudio (a regra 2, visual, fica fora da checagem: testar o trecho a partir de
    `"4. "`);
  - contém `"ASSINATURA EDITORIAL DO PERFIL"`, cada valor de `tom_voz`, `abertura_estilo`,
    `fechamento_estilo` e cada `proibicoes_estilo` do perfil, e a palavra `"opcional"` junto dos
    marcadores;
  - contém `"**Desafio:**"` e `"**Resposta:**"`;
  - contém a regra de a cena vir depois do marcador `##`;
  - narração solo: contém só o tom do próprio perfil (`"firme, grave e protetor"` só no survivor,
    `"calmo, calculista e pausado"` só no mastermind) e nenhum `"Se ${"` ou `"for 'seeker'"`;
  - socializer: não contém `"Inclua marcações de [Tom"`;
  - survivor contém `"**Checklist:**"`; não contém `"Lexicografia técnica"` (dica antiga).
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** reescrever as regras 1, 3, 4 e o bloco do áudio de `buildContentGenerationInstruction` e acrescentar `buildEditorialSignatureSection` depois da regra do áudio.
- [ ] **Step 4:** `contentGenerationInstruction.test.ts`, `classStoryArc.test.ts` e `geminiFormulaRule.test.ts` passam; `npm run lint` passa.
- [ ] **Step 5:** commit `feat(microservice): prompt troca a fantasia do prompt base por guia com cena curta e põe a assinatura do perfil`.

### Task 4: Barreira ligada na geração e no material

**Files:**
- Modify: `microservice/src/services/geminiService.ts` (`processMediaWithGemini`, logo depois de
  `const validated = validateBlockBatchGeneration(...)`; `consolidateBlockBatchGenerations`;
  `generateAudioScriptsWithGemini`)
- Modify: `microservice/src/types/index.ts` (`ProcessedContent.metadata.fidelidade?: RelatorioDeFidelidade`; `GeneratedBlockBatch.achados?: AchadoDeFidelidade[]`)
- Modify: `microservice/src/services/mediaResume.ts` (`buildMarkdownMaterialEntry` aceita `fidelidade?: RelatorioDeFidelidade` e o grava em `metadata.fidelidade`)
- Modify: `microservice/server.ts` (passa `resultado.metadata.fidelidade` até `buildMarkdownMaterialEntry`; `/api/v1/generate/block` responde `fidelidade` junto de `chapters`)
- Test: `microservice/src/services/geminiBlockBatches.test.ts`, `microservice/src/services/mediaResume.test.ts`

**Interfaces:**
- Consumes: `guardarFidelidade`, `guardarFidelidadeDoAudio`, `FIDELITY_GUARD_VERSION`,
  `RelatorioDeFidelidade` (Task 2).

- [ ] **Step 1: testes.**
  - `geminiBlockBatches.test.ts`: `consolidateBlockBatchGenerations` com dois lotes, um com achados
    e outro sem, devolve `metadata.fidelidade = { versao: "fidelidade-v1", achados: <os do primeiro> }`;
    com nenhum achado, `achados: []` (Review Focus 5).
  - `mediaResume.test.ts`: `buildMarkdownMaterialEntry({..., fidelidade})` grava
    `metadata.fidelidade`; sem o parâmetro, a chave não aparece.
  - Teste de fonte, como em `classStoryArc.test.ts`: `guardarFidelidade(` aparece em
    `processMediaWithGemini` depois de `const validated = validateBlockBatchGeneration(` e não
    aparece dentro de `validateResult`.
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** aplicar `guardarFidelidade` a cada capítulo de `validated` (troca markdown e audioScript pelos corrigidos, guarda os achados no lote), agregar em `consolidateBlockBatchGenerations`, logar `info` por lote com contagem por tipo (sem trecho), levar até o material e até a resposta de `/generate/block`. Em `generateAudioScriptsWithGemini`, só `guardarFidelidadeDoAudio` e o log.
- [ ] **Step 4:** testes passam, incluindo `server.pipeline.test.ts` e `server.test.ts`; `npm run lint` passa.
- [ ] **Step 5:** commit `feat(microservice): a barreira roda em cada capítulo aceito e os achados vão para o material de markdown`.

### Task 5: Versão, documentação e CI

**Files:**
- Modify: `api/app/services/media_contract.py` e `microservice/src/constants/pipelineVersions.ts` (`MEDIA_PIPELINE_VERSION = "2026-11-11.1"`, com comentário de uma linha dizendo o porquê)
- Modify: `CLAUDE.md` (o trecho "replicada no prompt do microservice (`geminiService.ts`)" passa a citar `editorialSignatures.json`, a paridade e a barreira)
- Modify: `docs/superpowers/specs/2026-11-11-assinatura-meio-termo-e-barreira-design.md` (status: implementado, sem PR)

- [ ] **Step 1:** subir a versão nos dois arquivos; `pipelineVersions.contract.test.ts` passa.
- [ ] **Step 2:** CI do microservice no pacote inteiro: `cd microservice && npm ci && npm run lint && npm test`. Esperado: tudo verde.
- [ ] **Step 3:** CI da API: `cd api && ruff check . && pytest`. Esperado: tudo verde (falha preexistente na `main` é registrada, não corrigida aqui).
- [ ] **Step 4:** `python scripts/verifica_encoding_docs.py` passa.
- [ ] **Step 5:** commit `chore: sobe a versão do pipeline de mídia para a assinatura e a barreira`.

### Task 6: Segundo piloto com o Gemini

Fora do repositório (scratchpad), com o código da branch.

- [ ] **Step 1:** montar os prompts novos com `buildContentGenerationInstruction` da branch para Seeker, Survivor e Mastermind, em dois tópicos: busca binária (`blocos.json` do teste de 11/11) e um tópico fora de programação lido de uma turma real (somente leitura, `conteudo_personalizado`/blocos enriquecidos, sem dado de aluno).
- [ ] **Step 2:** gerar 2 repetições por perfil e tópico e o `mastermind-atual` que faltou (13 chamadas), com `gerar-gemini.ts`. Cota esgotada: parar e retomar no dia seguinte; não usar créditos pagos.
- [ ] **Step 3:** rodar `guardarFidelidade` nas saídas e ler com os critérios da spec (seção 5).
- [ ] **Step 4:** publicar o resultado (página do teste atualizada) e parar para a aprovação de Geisbelly. Só então: push e PR.

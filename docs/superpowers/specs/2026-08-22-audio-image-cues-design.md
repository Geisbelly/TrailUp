# Imagem vinculada a minutagem do áudio (D3) — Design

## Contexto

Sub-parte D3 do sub-projeto D. Depende diretamente do D2 (reaproveitamento
de imagens entre mídias, [TrailUp#93](https://github.com/Geisbelly/TrailUp/pull/93),
ainda não mesclado — esta branch parte de `feature/reaproveitamento-imagens-midias`,
não de `main`, e precisa ser rebaseada/remergeada quando o D2 for mesclado).

Pedido original: a imagem de exemplo no áudio pode estar ligada a um
segundo específico do áudio (em vez de só uma capa estática única, como o
D2 entregou).

## Restrição explícita do usuário — LIDA COM MÁXIMA PRIORIDADE

**Nenhuma mudança na geração, síntese, divisão em capítulos (`splitTtsChapters`),
concatenação (`joinAudioChapters`) ou qualquer coisa que afete o SOM do
áudio gerado.** A investigação inicial (antes desta correção de rumo)
cogitou reescrever a divisão do TTS pra respeitar fronteiras de seção —
**descartado explicitamente**. Este documento não toca em nenhum arquivo/
função de síntese de áudio.

## Abordagem: minutagem estimada por proporção de texto

Em vez de um corte real no áudio, a minutagem de cada seção é **estimada**
depois que o áudio já foi gerado (sem alterar como foi gerado):

1. **Duração total do áudio** já pronto: calculada a partir do tamanho em
   bytes do arquivo final (MP3 ou WAV), que já existe — não precisa
   decodificar nem tocar o áudio. Formato confirmado por investigação:
   PCM sempre 24kHz mono 16-bit; MP3 final é CBR 128kbps mono 24kHz
   (`Mp3Encoder(1, 24000, 128)`), WAV é o mesmo PCM com header de 44 bytes.
   - MP3: `duracaoSegundos = bytesTotais / 16000` (128000 bits/s ÷ 8).
   - WAV: `duracaoSegundos = (bytesTotais - 44) / 48000` (24000Hz × 2 bytes/amostra × 1 canal).
2. **Proporção de texto por seção**: `splitProcessedContentIntoParts`
   (`microservice/src/services/geminiService.ts`) já sabe o texto de cada
   seção (`## título`) antes de agrupá-las em "partes" — só precisa expor
   essa informação como um novo campo aditivo (`sectionBoundaries` por
   parte: título, posição de início/fim em caracteres, índice global da
   seção no documento), sem mudar `markdown`/`audioScript` que já retorna.
3. **Minutagem estimada por seção**: `segundoEstimado = duracaoTotal ×
   (charStart / totalChars)`.
4. **Imagem por seção**: reaproveita a MESMA imagem já atribuída pelo D2
   (`insertImagesIntoMarkdown`) pra aquela seção no markdown — usando o
   mesmo cálculo round-robin (`imagens[indiceGlobalDaSecao % imagens.length]`),
   garantindo consistência entre o que aparece no markdown e no áudio pra
   a mesma seção (sem precisar alterar `insertImagesIntoMarkdown`, só
   reproduzir a mesma fórmula com o mesmo índice global).

## Escopo: só a primeira parte (mesma limitação já aceita pelo D2)

`capaUrl` (D2) já só reflete a 1ª "parte" do áudio quando o conteúdo é
longo o suficiente pra virar múltiplos arquivos. `imageCues` segue a MESMA
limitação por consistência — só a primeira parte ganha `imageCues`; partes
seguintes (2+) não ganham cues nesta fase (não é uma regressão nova, é a
mesma limitação que `capaUrl` já tem hoje).

## Novos campos (todos aditivos, sem migração de schema)

- `ContentPart.sectionBoundaries?: Array<{ globalIndex: number; title: string; charStart: number; charEnd: number }>` (`geminiService.ts`).
- `MaterialEntry.payload.imageCues?: Array<{ startSec: number; imageUrl: string }>` (mesmo campo livre `payload` já usado por `capaUrl`/`roteiro`).

## Wiring

1. `microservice/src/utils/audioDuration.ts` (novo, puro): `estimateAudioDurationSec(mp3Base64, wavBase64): number | null`.
2. `microservice/src/utils/audioImageCues.ts` (novo, puro): `computeImageCues(sectionBoundaries, durationSec, images): {startSec, imageUrl}[]`.
3. `geminiService.ts`: `splitProcessedContentIntoParts` passa a expor `sectionBoundaries` por parte (bookkeeping de texto, sem tocar em áudio).
4. `server.ts` (`runPipeline`): computa a duração e os cues da 1ª parte, passa pro `archiveMultiPartToSupabase` (novo param `audioImageCues`).
5. `archiveMultiPartToSupabase`: grava `payload.imageCues` quando presente.
6. Mobile: novo `mobile/src/utils/audioImageCues.ts` (puro): `parseImageCues(raw: unknown): ImageCue[] | null` — mesmo estilo de validação de `parseDeckProgressMessage`.
7. `mobile/src/utils/personalization.ts`: lê `payload.imageCues` (só na parte 1, mesmo critério de `capaUrl`) e inclui em `metadata.imageCues`.
8. `mobile/src/components/ContentRenderer.tsx`: lê `metadata.imageCues`, repassa pro `AudioPlayer`.
9. `mobile/src/components/funcionais/AudioPlayer.tsx`: nova prop `imageCues?: ImageCue[]`. A imagem exibida passa a ser a do cue mais recente cujo `startSec <= positionMillis / 1000` (já tem `playback.positionMillis` rastreado, granularidade de 350ms — suficiente); sem `imageCues`, cai de volta pro `capaUrl` estático (comportamento do D2 preservado).

## Testes

Mesmo padrão TDD (`node:test`) dos sub-projetos anteriores:
- `audioDuration.test.ts`: MP3 de tamanho conhecido → duração esperada; WAV com header de 44 bytes → duração esperada descontando o header; sem nenhum dos dois → `null`.
- `audioImageCues.test.ts`: N seções com tamanhos de texto diferentes → minutagens proporcionais corretas; round-robin de imagens usa o índice GLOBAL da seção (não o local dentro da parte); sem imagens disponíveis → array vazio.
- `geminiService.test.ts` (arquivo já existente, se houver, ou novo): `sectionBoundaries` calculado corretamente por `splitProcessedContentIntoParts`, sem alterar `markdown`/`audioScript` retornados (regressão zero no comportamento já testado).
- Mobile: `audioImageCues.test.ts` (parsing/validação, mesmo estilo de `deckProgressMessage.test.ts`).
- Sem teste automatizado pra `AudioPlayer.tsx` (mesmo critério já usado nesta sessão — sem infra de teste de componente RN); verificação visual manual fica registrada como pendente pro usuário testar, igual ao D1a.

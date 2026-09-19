# Imagem gerada por IA como fallback no markdown/áudio — Design

## Contexto

O D2 (`2026-08-22-reaproveitamento-imagens-midias-design.md`) limitou o
escopo a imagens do **professor**: markdown/áudio só ganham imagem quando
existe material de referência anexado. A própria spec documentou o motivo
("Descoberta que definiu o escopo"): markdown/áudio são gerados e
finalizados **antes** da chamada ao BrainHexPDF, e a imagem gerada por IA
só existe **depois** — reusá-la exigiria reordenar o pipeline, opção
descartada na época por decisão explícita do usuário.

O usuário reverteu essa decisão nesta sessão: quando não há imagem do
professor, markdown/áudio devem usar a **mesma imagem gerada por IA** que
os slides usam, mesmo aceitando a espera adicional.

## Decisão

Sem reordenar a geração de áudio (TTS continua concorrente com a
apresentação — nenhuma mudança na síntese em si, só na etapa de inserir
imagem no material já pronto). O BrainHexPDF passa a devolver, na resposta
de `/api/v1/render-and-store`, um mapa `subtopic -> imagem gerada` (só
quando não recebeu `attachments`). O microservice, depois que a
apresentação retorna, insere essa imagem retroativamente no markdown e usa
nos cues de áudio — mesma função (`insertImagesIntoMarkdown`,
`computeImageCues`) já usada pelo D2/D3 para as imagens do professor.

## Arquitetura

```
BrainHexPDF (server.ts, /api/v1/render-and-store)
  resolveSlideIllustrations(...) -> generatedSlides
  extractGeneratedImagesBySubtopic(generatedSlides)
    -> { "DNS": "data:image/png;base64,...", "Cache": "..." }
    (so preenchido quando attachments estava vazio; exclui o SVG
    generico de ultimo recurso - reusa-lo so espalharia o problema)
  resposta JSON ganha campo `generatedImagesBySubtopic` quando não vazio
  ↓
TrailUp microservice (server.ts, runPipeline)
  imageAttachments vazio (sem material do professor)
  → após runAudioAndPresentationInParallel resolver:
      presentationResults[0]?.generatedImagesBySubtopic
      → Object.values(...) vira images: {url}[] (url = a propria data URI)
      → insertImagesIntoMarkdown(partsWithAudio[0].markdown, images)
        (retroativo - sectionBoundaries do audio nao mudam, sao
        computados a partir do audioScript, nao do markdown)
      → computeImageCues(sectionBoundaries, duration, images) usa o
        mesmo fallback
      → audioCoverImageUrl cai pro fallback quando nao ha
        imageAttachments[0]
```

## Escopo e limitações aceitas

- Só a **1ª parte** do material recebe o fallback — mesma limitação já
  aceita pelo `capaUrl` (D2) e `audioImageCues` (D3): a chamada ao
  BrainHexPDF é uma por parte, e só a resposta da 1ª parte é usada aqui.
- Prioridade: imagem do professor sempre vence quando existe (nenhuma
  mudança de comportamento quando `imageAttachments.length > 0`). O
  fallback gerado só entra em jogo com zero anexos.
- SVG genérico de último recurso (`createFallbackIllustrationSvg`) nunca
  vira fallback de markdown/áudio — só imagem de verdade gerada via IA.
- Sem mudança nenhuma na geração/síntese de áudio (TTS, chapters, PCM,
  MP3/WAV) — só na etapa de inserir referência de imagem no material já
  produzido.

## Testes

- `slideIllustrations.test.ts`: `extractGeneratedImagesBySubtopic` —
  primeira imagem por subtópico único, mantém a 1ª quando o mesmo
  subtópico repete (Parte 1/2), exclui SVG genérico, ignora slide sem
  subtópico/imagem.
- TrailUp `server.pipeline.test.ts`: fallback só ativa quando
  `imageAttachments` está vazio E a apresentação devolveu
  `generatedImagesBySubtopic`; markdown/audioImageCues/audioCoverImageUrl
  usam o fallback nesse caso; nenhuma mudança quando há imagem do
  professor.

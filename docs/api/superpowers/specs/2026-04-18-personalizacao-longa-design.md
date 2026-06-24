# Design: Personalização Longa — Integração ApiBrainHex → ApiTraiUp

**Data:** 2026-04-18  
**Status:** Aprovado  
**Abordagem:** Reescrita limpa (Abordagem B)

---

## Contexto

O ApiTraiUp possui um pipeline de personalização de conteúdo educacional baseado em perfis BrainHex. O ApiBrainHex possui um sistema de personas/guias narrativos (Atena, Orion, Valka, etc.) com output rico para slides, áudio e markdown. O objetivo é trazer esse sistema de personas para dentro do ApiTraiUp, ao mesmo tempo que se remove a geração de vídeo, PDF, DOCX e quiz — que não funcionam ou não valem o custo.

---

## Formatos de Saída

### Removidos
- `video` — pipeline, prompt, schema, migration, Pydantic model
- `pdf` — pipeline, prompt, schema, migration, Pydantic model
- `documento` — pipeline, prompt, schema, migration, Pydantic model
- `quiz` — pipeline, prompt, schema, migration, Pydantic model

### Mantidos
- `audio` — enriquecido com voz mapeada por perfil e marcações `[Tom: ...]`
- `slides` (apresentacao) — schema substituído pelo do ApiBrainHex
- `cards` — sem alteração funcional

### Adicionado
- `markdown` — grimório narrativo personalizado por perfil, armazenado como arquivo `.md` no Supabase bucket `conteudo_aluno`

O pipeline de etapas (`estudo_conteudo → planejamento → estilizacao → revisao → correcao`) permanece intacto para os formatos gerados por LLM.

---

## Sistema de Personas/Guias BrainHex

Novo dict `_BRAINHEX_GUIDE_PERSONAS` em `personalizacao.py`, injetado no `perfil_editorial` via `_build_profile_editorial_context()`.

| Perfil | Guia | Voz TTS | Cor | Framing Narrativo |
|---|---|---|---|---|
| mastermind | Atena | Charon | #707c88 | "Arquitetura do Conceito" |
| seeker | Orion | Puck | #a78c07 | "Crônicas da Exploração" |
| survivor | Valka | Fenrir | #720101 | "Diretrizes de Campo" |
| daredevil | Rexa | Zephyr | #1b6b1b | "Código de Impacto" |
| conqueror | Drako | Kore | #01808b | "Tratado de Soberania" |
| socializer | Luma | Kore | #6d15be | "Elo da Comunidade" |
| achiever | Auri | Puck | #ad6002 | "Caminho da Maestria" |

Os campos `guia_nome`, `guia_voz`, `guia_cor` e `framing_narrativo` são injetados no contexto dos prompts e usados por:
- **Áudio:** `guia_voz` → `voiceName` no Gemini TTS
- **Slides:** `guia_nome` → `characterQuote`; `guia_cor` → estética visual
- **Markdown:** `guia_nome` + `framing_narrativo` → tom narrativo do grimório

---

## Schema de Slides (Novo)

Substituição completa do schema anterior (`titulo, subtitulo, pontos, layout, imagem_referencia, tema_visual`).

```json
{
  "titulo": "string (max 6 palavras)",
  "topics": ["string"],
  "explanation": "string (síntese densa, terminologia varia por perfil)",
  "visualDescription": "string (analogia visual ou exemplo prático)",
  "characterQuote": "string (fala do guia reagindo ao conteúdo)",
  "characterAction": "explaining | celebrating | thinking | warning",
  "imagePrompt": "string (prompt para geração de imagem 2D estilo mágico)",
  "sourceIds": ["string"]
}
```

### Terminologia por perfil (campo `topics` e `explanation`)

| Perfil | Topics label | Explanation label |
|---|---|---|
| mastermind | "Engrenagens" | "Síntese Técnica" |
| seeker | "Pista" / "Rastro" | "Insight da Jornada" |
| survivor | "Atenção" | "Tática de Campo" |
| daredevil | "Desafio" / "Ação Imediata" | (curta e potente) |
| conqueror | "Domínio" / "Expansão" | "Decreto Supremo" |
| socializer | "Pessoas" / "Comunidade" | "História Coletiva" |
| achiever | "Meta" / "Recurso" | "Caminho da Maestria" |

O `tema_visual` de nível raiz da apresentação continua com `cores`, `perfil` e `guia_nome`.

---

## Mudanças nos Prompts

### `gerador_conteudo.txt`
- Remove schemas de `pdf`, `documento`, `video`, `quiz`
- Adiciona schema de `markdown` (string grimório narrativo)
- Substitui schema de `slides` pelo novo
- Adiciona bloco de personalização narrativa por perfil com `guia_nome`, `framing_narrativo`, `guia_cor`

### `pipeline_midia_etapas.txt`
- Remove `pdf`, `documento`, `video`, `quiz` dos formatos válidos e checklists
- Adiciona `markdown` como formato com checklist: fluidez narrativa, tom do perfil, fechamento memorável
- Atualiza checklist de `apresentacao`: validar `characterQuote`, `characterAction`, `imagePrompt` em todos os slides
- Atualiza checklist de `audio`: validar marcações `[Tom: ...]` e coerência com voz do guia
- Persona por formato: `markdown` → "narrador grimório do guia `{guia_nome}`"

---

## Mudanças no Pipeline (`media_pipeline.py`)

- **Remove:** `VideoPipeline`, `PdfPipeline`, `DocumentoPipeline`
- **Adiciona:** `MarkdownPipeline` — recebe string markdown → encode `.md` → upload Supabase `conteudo_aluno`
- **Atualiza:** `SlidesPipeline` — aceita novo schema de slides
- **Atualiza:** `AudioPipeline` — recebe `guia_voz` do perfil editorial → `voiceName` Gemini TTS
- **Atualiza:** `MultiOutputPipeline` — remove referências aos formatos removidos

---

## Mudanças nos Schemas Pydantic (`schemas/personalizacao.py`)

- **Remove:** `PdfMaterial`, `DocumentoMaterial`, `VideoMaterial`, `QuizMaterial`
- **Adiciona:** `MarkdownMaterial` com campos: `arquivo_url`, `storage_path`, `perfil`, `guia_nome`
- **Atualiza:** `SlideItem` — campos novos, remove campos antigos
- **Atualiza:** `MateriaisGerados` — reflete novo conjunto de formatos

---

## Migração do Banco (`sql/manual_supabase_migration.sql`)

- Remove entradas/constraints relacionadas a `video`, `pdf`, `documento`, `quiz` em `materiais_gerados` e `conteudos_personalizados`
- Adiciona `markdown` como `tipo` válido em `materiais_gerados`
- Atualiza constraint de `tipo` para: `markdown | audio | apresentacao | cards`

---

## Notas adicionais

- `imagem` também é removida (não faz parte do novo conjunto de formatos: `markdown | audio | apresentacao | cards`)
- `_MEDIA_FORMATOS` em `personalizacao_jobs.py` precisa ser atualizado para o novo conjunto
- Testes dos formatos removidos devem ser deletados ou atualizados

---

## Arquivos Impactados

| Arquivo | Tipo de mudança |
|---|---|
| `app/services/personalizacao.py` | Adiciona `_BRAINHEX_GUIDE_PERSONAS`, atualiza `_build_profile_editorial_context`, remove formatos |
| `app/services/media_pipeline.py` | Remove `VideoPipeline`, `PdfPipeline`, `DocumentoPipeline`, `ImagePipeline`; adiciona `MarkdownPipeline`; atualiza `SlidesPipeline` e `AudioPipeline` |
| `app/services/personalizacao_jobs.py` | Atualiza `_MEDIA_FORMATOS` para `{audio, apresentacao, markdown, cards}` |
| `app/agent/prompts/gerador_conteudo.txt` | Remove formatos, adiciona markdown, atualiza slides schema |
| `app/agent/prompts/pipeline_midia_etapas.txt` | Remove formatos, atualiza checklists e personas |
| `app/schemas/personalizacao.py` | Remove/adiciona/atualiza modelos Pydantic |
| `sql/manual_supabase_migration.sql` | Migration para novo conjunto de tipos |
| `tests/test_media_pipeline.py` | Remove testes de formatos removidos, adiciona testes de `MarkdownPipeline` |
| `tests/test_personalizacao_service.py` | Atualiza fixtures e assertions para novo conjunto de formatos |
| `tests/test_video_service.py` | Deletar — formato removido |

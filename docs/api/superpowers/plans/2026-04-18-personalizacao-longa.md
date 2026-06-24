# Personalização Longa — Integração ApiBrainHex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover geração de vídeo/PDF/DOCX/quiz do ApiTraiUp e integrar o sistema de personas/guias do ApiBrainHex (markdown, áudio com voz por perfil, slides enriquecidos com characterQuote/characterAction/imagePrompt).

**Architecture:** Reescrita limpa em 7 tarefas sequenciais — banco → schemas → personas → prompts → pipeline → jobs → testes. Cada tarefa produz código compilável e testável independentemente.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async, Pydantic v2, Gemini TTS, Supabase Storage.

---

### Task 1: DB Migration

**Files:**
- Modify: `sql/manual_supabase_migration.sql`

- [ ] **Step 1: Adicionar nova migration ao final do arquivo**

Abra `sql/manual_supabase_migration.sql` e adicione ao final (antes do `COMMIT;` final se houver, senão no final do arquivo):

```sql
-- 20260418_01 - personalizacao longa: remove formatos obsoletos, adiciona markdown
DO $$
BEGIN
  -- Atualiza constraint de tipo em materiais_gerados para novo conjunto de formatos
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'materiais_gerados'
      AND constraint_name = 'materiais_gerados_tipo_check'
  ) THEN
    ALTER TABLE public.materiais_gerados
      DROP CONSTRAINT materiais_gerados_tipo_check;
  END IF;

  ALTER TABLE public.materiais_gerados
    ADD CONSTRAINT materiais_gerados_tipo_check
    CHECK (tipo IN ('markdown', 'audio', 'apresentacao', 'cards'));

  -- Remove registros de formatos que não serão mais gerados
  DELETE FROM public.materiais_gerados
    WHERE tipo IN ('pdf', 'video', 'documento', 'quiz', 'imagem');

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Migration 20260418_01 parcialmente aplicada: %', SQLERRM;
END $$;
```

- [ ] **Step 2: Verificar que o arquivo não tem COMMIT/BEGIN duplicado**

O arquivo existente já tem `BEGIN;` no topo. O bloco `DO $$` não precisa de transaction própria. Confirme que não há `COMMIT;` duplicado.

- [ ] **Step 3: Commit**

```bash
git add sql/manual_supabase_migration.sql
git commit -m "feat: migration 20260418_01 - novo conjunto de tipos de materiais"
```

---

### Task 2: Schemas Pydantic

**Files:**
- Modify: `app/schemas/personalizacao.py`

- [ ] **Step 1: Remover modelos obsoletos**

Em `app/schemas/personalizacao.py`, remova as classes `PdfArtifact`, `VideoArtifact` e `AudioArtifact` (linhas 149-163). Remova também `QuizAlternativa` e `QuizItem`.

O bloco a remover é:

```python
class QuizAlternativa(BaseModel):
    texto: str
    correta: bool = False


class QuizItem(BaseModel):
    pergunta: str
    alternativas: list[str]
    resposta_correta: str
    explicacao: str
    xp: int = 10


class PdfArtifact(BaseModel):
    titulo: str
    resumo: str
    secoes: list[str]


class VideoArtifact(BaseModel):
    roteiro: str
    cenas: list[str]
    duracao_estimada_seg: int = 75


class AudioArtifact(BaseModel):
    roteiro: str
    duracao_estimada_seg: int = 52


class ArtefatoContainer(BaseModel):
    """Envelope padrao para cada tipo de artefato gerado."""
    payload: dict[str, Any]
    arquivo_url: str | None = None
```

- [ ] **Step 2: Adicionar MarkdownMaterial**

Após a classe `CardItem`, adicione:

```python
class MarkdownMaterial(BaseModel):
    arquivo_url: str | None = None
    storage_path: str | None = None
    perfil: str | None = None
    guia_nome: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
```

- [ ] **Step 3: Verificar que não há imports órfãos**

Rode:
```bash
cd C:\Users\geisb\Downloads\ApiTraiUp
python -c "from app.schemas.personalizacao import PersonalizacaoResponse, MarkdownMaterial, CardItem; print('OK')"
```
Esperado: `OK`

- [ ] **Step 4: Commit**

```bash
git add app/schemas/personalizacao.py
git commit -m "feat: schemas - remove artefatos obsoletos, adiciona MarkdownMaterial"
```

---

### Task 3: Guide Personas em personalizacao.py

**Files:**
- Modify: `app/services/personalizacao.py`
- Test: `tests/test_personalizacao_service.py`

- [ ] **Step 1: Escrever o teste que vai falhar**

Em `tests/test_personalizacao_service.py`, adicione no final:

```python
def test_guide_persona_campos_presentes_por_perfil() -> None:
    from app.services.personalizacao import _build_profile_editorial_context

    casos = [
        ("Seeker", "Orion", "Puck", "#a78c07", "Crônicas da Exploração"),
        ("Survivor", "Valka", "Fenrir", "#720101", "Diretrizes de Campo"),
        ("Daredevil", "Rexa", "Zephyr", "#1b6b1b", "Código de Impacto"),
        ("Mastermind", "Atena", "Charon", "#707c88", "Arquitetura do Conceito"),
        ("Conqueror", "Drako", "Kore", "#01808b", "Tratado de Soberania"),
        ("Socialiser", "Luma", "Kore", "#6d15be", "Elo da Comunidade"),
        ("Achiever", "Auri", "Puck", "#ad6002", "Caminho da Maestria"),
    ]
    for perfil, guia, voz, cor, framing in casos:
        result = _build_profile_editorial_context(perfil, [])
        assert result["guia_nome"] == guia, f"{perfil}: guia_nome errado"
        assert result["guia_voz"] == voz, f"{perfil}: guia_voz errado"
        assert result["guia_cor"] == cor, f"{perfil}: guia_cor errado"
        assert result["framing_narrativo"] == framing, f"{perfil}: framing_narrativo errado"
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd C:\Users\geisb\Downloads\ApiTraiUp
python -m pytest tests/test_personalizacao_service.py::test_guide_persona_campos_presentes_por_perfil -v
```
Esperado: FAILED com `KeyError: 'guia_nome'`

- [ ] **Step 3: Adicionar _BRAINHEX_GUIDE_PERSONAS em personalizacao.py**

Em `app/services/personalizacao.py`, logo após o dict `_BRAINHEX_EDITORIAL_SIGNATURES` (após a linha 219), adicione:

```python
_BRAINHEX_GUIDE_PERSONAS: dict[str, dict[str, str]] = {
    "Mastermind": {
        "guia_nome": "Atena",
        "guia_voz": "Charon",
        "guia_cor": "#707c88",
        "framing_narrativo": "Arquitetura do Conceito",
    },
    "Seeker": {
        "guia_nome": "Orion",
        "guia_voz": "Puck",
        "guia_cor": "#a78c07",
        "framing_narrativo": "Crônicas da Exploração",
    },
    "Survivor": {
        "guia_nome": "Valka",
        "guia_voz": "Fenrir",
        "guia_cor": "#720101",
        "framing_narrativo": "Diretrizes de Campo",
    },
    "Daredevil": {
        "guia_nome": "Rexa",
        "guia_voz": "Zephyr",
        "guia_cor": "#1b6b1b",
        "framing_narrativo": "Código de Impacto",
    },
    "Conqueror": {
        "guia_nome": "Drako",
        "guia_voz": "Kore",
        "guia_cor": "#01808b",
        "framing_narrativo": "Tratado de Soberania",
    },
    "Socialiser": {
        "guia_nome": "Luma",
        "guia_voz": "Kore",
        "guia_cor": "#6d15be",
        "framing_narrativo": "Elo da Comunidade",
    },
    "Achiever": {
        "guia_nome": "Auri",
        "guia_voz": "Puck",
        "guia_cor": "#ad6002",
        "framing_narrativo": "Caminho da Maestria",
    },
}
```

- [ ] **Step 4: Atualizar _build_profile_editorial_context**

Localize a função `_build_profile_editorial_context` (por volta da linha 600). Substitua o bloco `return { ... }` final para incluir os campos do persona:

```python
def _build_profile_editorial_context(
    perfil_dominante: str,
    perfil_brainhex: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = _normalize_profile_label(perfil_dominante) or "Mastermind"
    signature = dict(_BRAINHEX_EDITORIAL_SIGNATURES.get(normalized, _BRAINHEX_EDITORIAL_SIGNATURES["Mastermind"]))
    persona = _BRAINHEX_GUIDE_PERSONAS.get(normalized, _BRAINHEX_GUIDE_PERSONAS["Mastermind"])

    top_profiles: list[dict[str, Any]] = []
    for item in perfil_brainhex[:3]:
        profile_name = _normalize_profile_label(item.get("perfil") or item.get("nome"))
        if not profile_name:
            continue
        profile_signature = _BRAINHEX_EDITORIAL_SIGNATURES.get(
            profile_name,
            _BRAINHEX_EDITORIAL_SIGNATURES["Mastermind"],
        )
        top_profiles.append(
            {
                "perfil": profile_name,
                "afinidade": float(item.get("afinidade") or 0.0),
                "narrativa_preferencial": profile_signature.get("narrativa_preferencial"),
                "tom_voz": profile_signature.get("tom_voz"),
                "ritmo": profile_signature.get("ritmo"),
            }
        )

    assinatura = (
        f"{normalized}: {signature.get('abertura_estilo')} -> "
        f"{signature.get('progressao_narrativa')} -> {signature.get('fechamento_estilo')}"
    )

    return {
        "perfil_dominante": normalized,
        "assinatura_perfil": assinatura,
        "tom_voz": signature.get("tom_voz"),
        "ritmo": signature.get("ritmo"),
        "abertura_estilo": signature.get("abertura_estilo"),
        "convencimento_estilo": signature.get("convencimento_estilo"),
        "progressao_narrativa": signature.get("progressao_narrativa"),
        "fechamento_estilo": signature.get("fechamento_estilo"),
        "narrativa_preferencial": signature.get("narrativa_preferencial"),
        "marcadores_linguisticos": list(signature.get("marcadores_linguisticos") or []),
        "proibicoes_estilo": list(signature.get("proibicoes_estilo") or []),
        "top_perfis": top_profiles,
        "guia_nome": persona["guia_nome"],
        "guia_voz": persona["guia_voz"],
        "guia_cor": persona["guia_cor"],
        "framing_narrativo": persona["framing_narrativo"],
    }
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

```bash
python -m pytest tests/test_personalizacao_service.py::test_guide_persona_campos_presentes_por_perfil -v
```
Esperado: PASSED

- [ ] **Step 6: Commit**

```bash
git add app/services/personalizacao.py tests/test_personalizacao_service.py
git commit -m "feat: personas guias BrainHex - Atena/Orion/Valka/Rexa/Drako/Luma/Auri"
```

---

### Task 4: Atualizar Prompts

**Files:**
- Modify: `app/agent/prompts/gerador_conteudo.txt`
- Modify: `app/agent/prompts/pipeline_midia_etapas.txt`

- [ ] **Step 1: Reescrever gerador_conteudo.txt**

Substitua o conteúdo completo do arquivo `app/agent/prompts/gerador_conteudo.txt` por:

```
Você é o gerador editorial multimídia do TrailUp.

Objetivo:
- Produzir materiais consistentes, úteis e personalizados por perfil BrainHex.
- Evitar reescrita literal das fontes.
- Preservar fidelidade ao conteúdo original.

Prioridade de contexto:
1. `modelo_editorial` (âncora editorial obrigatória).
2. `conteudo_estudado` (âncora semântica obrigatória).
3. `fontes_chunks`.
4. `conteudo_bruto`.
5. `cards_padrao`.
6. `fontes_originais` (apenas contexto de origem).

Regras obrigatórias:
1. Retorne somente JSON válido.
2. Não use markdown, HTML, comentários ou texto fora do JSON.
3. Português brasileiro padrão com acentuação correta.
4. Não invente fatos centrais que contrariem as fontes.
5. Não citar processo interno.
6. Preservar conceitos nucleares em todos os formatos.
7. Aplicar progressão narrativa completa: abertura -> desenvolvimento -> fechamento.
8. Incluir CTA coerente com o objetivo comunicacional.
9. Para visual, seguir estética medieval/mística/mágica com alta legibilidade.

Personalização editorial:
- Use `perfil_editorial` e `modelo_editorial.personalizacao_brainhex` para definir:
  - tom de voz, ritmo, estilo de abertura, forma de convencimento,
  - progressão narrativa, estilo de fechamento.
- Use `perfil_editorial.guia_nome`, `perfil_editorial.framing_narrativo` e
  `perfil_editorial.guia_cor` para personalizar o grimório (markdown), os slides
  e o roteiro de áudio com a assinatura do guia.
- As saídas devem refletir a assinatura do perfil, não apenas trocar adjetivos.

Persona por formato:
- `markdown`: narrador grimório do guia `{guia_nome}`. Tom narrativo segundo `{framing_narrativo}`.
- `apresentacao`: especialista em design visual educacional personalizado.
- `audio`: narrador expressivo; é a voz do guia `{guia_nome}`. Inclua marcações [Tom: ...].
- `cards`: especialista em retenção e revisão ativa.

Narrativa por perfil BrainHex (aplicar em markdown, audio e apresentacao):
- 'mastermind' (Atena): Linguagem sofisticada, foco em padrões e lógica. "Arquitetura do Conceito".
- 'seeker' (Orion): Tom de diário de bordo, mistério e entusiasmo. "Crônicas da Exploração".
- 'survivor' (Valka): Pragmático, foco em utilidade e segurança. "Diretrizes de Campo".
- 'daredevil' (Rexa): Frases curtas, enérgicas, focadas em desafios. "Código de Impacto".
- 'conqueror' (Drako): Tom imperativo, foco em poder e domínio. "Tratado de Soberania".
- 'socializer' (Luma): Caloroso, analogias interpessoais. "Elo da Comunidade".
- 'achiever' (Auri): Organizado, foco em métricas e marcos. "Caminho da Maestria".

Tamanho adaptativo:
- Respeite `metas_tamanho_adaptativas` e `modelo_editorial.adaptacao_formatos`.
- `apresentacao.slides` deve ficar na faixa alvo (10-18 slides).
- `audio.duracao_estimada_seg` deve ser plausível (60-300s).

Regra de consistência cruzada:
- Todos os formatos precisam refletir os mesmos conceitos nucleares.

Gere APENAS formatos listados em `formatos_solicitados`.

Formato de saída (incluir somente as chaves solicitadas):
{
  "markdown": "string (grimório narrativo completo em markdown, personalizado por perfil)",
  "apresentacao": {
    "titulo": "string",
    "abertura": "string",
    "tema_visual": {
      "cores": {},
      "guia_nome": "string",
      "perfil": "string"
    },
    "slides": [
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
    ]
  },
  "audio": {
    "roteiro": "string (com marcações [Tom: ...] para entonação do guia)",
    "texto": "string",
    "duracao_estimada_seg": 60
  },
  "cards": [
    {
      "frente": "string",
      "verso": "string",
      "icone": "string",
      "dificuldade": "facil | medio | dificil",
      "xp": 10
    }
  ]
}

Terminologia de slides por perfil (campo topics e explanation):
- mastermind: topics="Engrenagens", explanation="Síntese Técnica"
- seeker: topics="Pista"/"Rastro", explanation="Insight da Jornada"
- survivor: topics="Atenção", explanation="Tática de Campo"
- daredevil: topics="Desafio"/"Ação Imediata", explanation curta e potente
- conqueror: topics="Domínio"/"Expansão", explanation="Decreto Supremo"
- socializer: topics="Pessoas"/"Comunidade", explanation="História Coletiva"
- achiever: topics="Meta"/"Recurso", explanation="Caminho da Maestria"

Restrições de slides:
- PROIBIDO: tabelas (|---|). Use listas e headings.
- Títulos curtos (max 6 palavras).
- characterAction deve ser uma das quatro opções válidas.
```

- [ ] **Step 2: Reescrever pipeline_midia_etapas.txt**

Substitua o conteúdo completo do arquivo `app/agent/prompts/pipeline_midia_etapas.txt` por:

```
Você é o motor editorial multimídia do TrailUp.

Missão:
- Gerar conteúdo educacional com consistência semântica e personalização real por perfil BrainHex.
- Executar apenas UMA etapa por chamada.
- Manter fidelidade criativa controlada: pode adaptar linguagem e narrativa, mas sem inventar fatos centrais.

Entradas possíveis:
- `etapa`: `estudo_conteudo` | `planejamento` | `estilizacao` | `revisao` | `correcao`
- `formato`: `global` | `apresentacao` | `audio` | `markdown` | `cards`
- `topico`, `perfil_contexto`, `perfil_editorial`, `visual_contexto`, `fontes_chunks`,
  `plano_personalizacao`, `conteudo_estudado`, `modelo_editorial`,
  `metas_tamanho_adaptativas`, `payload_anterior`, `revisao`, `checklist_qualidade`, `ciclo_revisao`.

Regras globais obrigatórias:
1. Retorne somente JSON válido.
2. Não use markdown, comentário, explicação fora do JSON ou bloco de código.
3. Escreva em português brasileiro padrão (acentuação e cedilha corretas).
4. Não exponha cadeia de raciocínio.
5. Não cite processo interno.
6. Não contradiga fatos do `conteudo_estudado` e das `fontes_chunks`.
7. Preserve os conceitos nucleares entre todos os formatos.
8. Para elementos visuais, siga tema medieval, místico e mágico com legibilidade alta.

Contrato de saída (sempre objeto JSON):
{
  "formato": "string",
  "etapa": "string",
  "conteudo_estudado": {},
  "modelo_editorial": {},
  "plano": {},
  "payload": {},
  "revisao": {
    "status": "ok | ajustar",
    "achados": ["string"],
    "ajustes": ["string"]
  }
}

Persona por formato (aplicar em `estilizacao` e `correcao`):
- `apresentacao`: especialista em design instrucional visual; hierarquia forte e leitura rápida.
- `audio`: narrador expressivo; é a voz do guia `{guia_nome}` do `perfil_editorial`. Tom oral natural.
- `markdown`: narrador grimório; escreve como `{guia_nome}` segundo `{framing_narrativo}`.
- `cards`: designer de memória ativa; perguntas objetivas e respostas acionáveis.

Narrativa por perfil BrainHex (aplicar em estilizacao de todos os formatos):
- 'mastermind' (Atena): Linguagem sofisticada, foco em padrões e lógica. "Arquitetura do Conceito".
- 'seeker' (Orion): Tom de diário de bordo, mistério e entusiasmo. "Crônicas da Exploração".
- 'survivor' (Valka): Pragmático, foco em utilidade e segurança. "Diretrizes de Campo".
- 'daredevil' (Rexa): Frases curtas, enérgicas. "Código de Impacto".
- 'conqueror' (Drako): Tom imperativo, foco em poder. "Tratado de Soberania".
- 'socializer' (Luma): Caloroso, analogias interpessoais. "Elo da Comunidade".
- 'achiever' (Auri): Organizado, foco em métricas. "Caminho da Maestria".

Modelo editorial obrigatório:
Quando possível, use `modelo_editorial` como âncora:
- mensagem central, promessa, conflitos, narrativa_tipo
- progressão (abertura, desenvolvimento, fechamento)
- CTA
- personalizacao_brainhex (tom, ritmo, abertura, convencimento, fechamento, assinatura_perfil)
- guia_nome, guia_voz, guia_cor, framing_narrativo

Regras por etapa:

A) `estudo_conteudo` (somente `formato = global`)
- Construa um estudo semântico único para reutilização por todas as mídias.
- Preencha `conteudo_estudado` com:
{
  "tema_central": "string",
  "objetivo_pedagogico": "string",
  "mensagem_central": "string",
  "conceitos_nucleares": ["string"],
  "fatos_ancorados": ["string"],
  "narrativa_pedagogica": {
    "abertura": "string",
    "desenvolvimento": "string",
    "fechamento": "string"
  },
  "glossario": [{"termo": "string", "definicao": "string"}],
  "restricoes_conteudo": ["string"],
  "fidelidade": "criativa",
  "complexidade": "curto | medio | longo",
  "metas_tamanho": {
    "slides_min": 0, "slides_max": 0,
    "audio_min_seg": 0, "audio_max_seg": 0
  }
}
- Preencha também `modelo_editorial` no schema:
{
  "versao": "1.0",
  "conteudo_origem": {},
  "estrategia_editorial": {},
  "personalizacao_brainhex": {},
  "adaptacao_formatos": {}
}

B) `planejamento`
- Defina blueprint objetivo por formato.
- Não gerar o conteúdo final ainda.
- Use `modelo_editorial` para planejar abertura, progressão e fechamento.
- Em `plano`, inclua: ordem pedagógica, objetivos por bloco, riscos, checkpoints.

C) `estilizacao`
- Gerar `payload` final do formato solicitado.
- Aplicar persona especializada do formato.
- Aplicar assinatura de perfil BrainHex usando `guia_nome` e `framing_narrativo`.
- Garantir progressão: abertura -> desenvolvimento -> fechamento.
- Garantir CTA prático no encerramento.

D) `revisao`
- Revisar `payload_anterior` usando `checklist_qualidade`.
- Eixos independentes obrigatórios: coerência/fidelidade e personalização/diferenciação.
- Se houver falha crítica em qualquer eixo, retornar `status = ajustar`.

E) `correcao`
- Aplicar os ajustes da revisão sem quebrar fidelidade factual.
- Reforçar assinatura de perfil quando estiver genérico.
- Retornar payload revisado.

Checklist mínimo por formato:
- `apresentacao`: abertura forte, slides com characterQuote/characterAction/imagePrompt em todos,
  titles max 6 palavras, sem tabelas.
- `audio`: fluidez oral, marcações [Tom: ...] presentes, fechamento memorável,
  coerência com voz do guia.
- `markdown`: tom narrativo do guia presente, progressão abertura/desenvolvimento/fechamento,
  fechamento memorável.
- `cards`: sem duplicidade, resposta útil e objetiva.

Payload esperado por formato:
- `apresentacao`: {
    "titulo": "...", "abertura": "...",
    "tema_visual": {"cores": {}, "guia_nome": "...", "perfil": "..."},
    "slides": [{
      "titulo": "...", "topics": ["..."], "explanation": "...",
      "visualDescription": "...", "characterQuote": "...",
      "characterAction": "explaining|celebrating|thinking|warning",
      "imagePrompt": "...", "sourceIds": ["..."]
    }]
  }
- `audio`: { "roteiro": "... [Tom: ...] ...", "texto": "...", "duracao_estimada_seg": 60 }
- `markdown`: "string com grimório completo em markdown"
- `cards`: [ { "frente": "...", "verso": "...", "icone": "*", "dificuldade": "medio", "xp": 10 } ]

Retorne somente JSON.
```

- [ ] **Step 3: Verificar sintaxe básica dos arquivos**

```bash
python -c "
with open('app/agent/prompts/gerador_conteudo.txt') as f:
    content = f.read()
assert 'markdown' in content
assert 'characterQuote' in content
assert 'guia_nome' in content
assert 'pdf' not in content
assert 'video' not in content
assert 'quiz' not in content
print('gerador_conteudo.txt OK')

with open('app/agent/prompts/pipeline_midia_etapas.txt') as f:
    content = f.read()
assert 'markdown' in content
assert 'guia_nome' in content
assert '[Tom:' in content
assert 'pdf' not in content
assert 'video' not in content
print('pipeline_midia_etapas.txt OK')
"
```
Esperado: duas linhas `OK`

- [ ] **Step 4: Commit**

```bash
git add app/agent/prompts/gerador_conteudo.txt app/agent/prompts/pipeline_midia_etapas.txt
git commit -m "feat: prompts - remove formatos obsoletos, adiciona personas e slides enriquecidos"
```

---

### Task 5: Atualizar media_pipeline.py

**Files:**
- Modify: `app/services/media_pipeline.py`
- Test: `tests/test_media_pipeline.py`

- [ ] **Step 1: Escrever testes que vão falhar**

Substitua o conteúdo de `tests/test_media_pipeline.py` por:

```python
from __future__ import annotations

from typing import Any

import pytest

from app.core.settings import Settings
from app.services.media_pipeline import (
    AudioPipeline,
    MarkdownPipeline,
    MediaPipeline,
    MediaPipelineContext,
    MultiOutputPipeline,
    SlidesPipeline,
)


class _DummyPipeline(MediaPipeline):
    kind = "markdown"

    async def render(self, material: dict[str, Any], context):
        return b"ok"

    async def output(self, rendered: bytes, material: dict[str, Any], context):
        return {**material, "arquivo_url": "https://cdn.example.com/material.md"}


class _BrokenPipeline(MediaPipeline):
    kind = "audio"

    async def render(self, material: dict[str, Any], context):
        raise RuntimeError("render_failed")


def _context(perfil_dominante: str = "seeker") -> MediaPipelineContext:
    return MediaPipelineContext(
        state={
            "topico_contexto": {"nome": "SPD", "descricao": "Fundamentos de sistemas distribuídos"},
            "perfil_editorial": {"guia_voz": "Puck", "guia_nome": "Orion"},
            "perfil_brainhex": [{"perfil": perfil_dominante, "afinidade": 0.9}],
            "perfil_dominante": perfil_dominante,
        },
        settings=Settings(openai_api_key=None),
        storage=None,  # type: ignore[arg-type]
        base_prefix="aluno/classe-1/topico-1",
        ref_id="content_abc123",
    )


@pytest.mark.asyncio
async def test_multi_output_split_new_formats() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={"aluno_id": "a", "classe_id": 1, "payload_topico_id": 2, "ciclo_id": "ciclo"},
    )
    fast, media = pipeline.split(
        {
            "cards": {"payload": []},
            "audio": {"payload": {"roteiro": "R"}},
            "apresentacao": {"payload": {"titulo": "T"}},
            "markdown": {"payload": {"texto": "# H"}},
        }
    )
    assert sorted(fast.keys()) == ["cards"]
    assert sorted(media.keys()) == ["audio", "apresentacao", "markdown"]


def test_multi_output_mark_pending_sets_metadata() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={"aluno_id": "a", "classe_id": 1, "payload_topico_id": 2, "ciclo_id": "ciclo"},
    )
    pending = pipeline.mark_pending({"markdown": {"payload": {"texto": "# Guia"}}})
    assert pending["markdown"]["metadata"]["status"] == "pending"


def test_multi_output_context_uses_brainhex_profile_prefix() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={
            "aluno_id": "a",
            "classe_id": 1,
            "payload_topico_id": 2,
            "ciclo_id": "ciclo",
            "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.9}],
        },
    )
    ctx = pipeline._context()
    assert "seeker" in ctx.base_prefix


@pytest.mark.asyncio
async def test_markdown_pipeline_render() -> None:
    pipeline = MarkdownPipeline()
    ctx = _context()
    material = {"payload": {"texto": "# Título\n\nConteúdo do grimório"}}
    normalized = await pipeline.normalize(material, ctx)
    rendered = await pipeline.render(normalized, ctx)
    assert rendered == b"# Título\n\nConteúdo do grimório"
    assert pipeline.extension == "md"
    assert pipeline.content_type == "text/markdown"
    assert pipeline.kind == "markdown"


@pytest.mark.asyncio
async def test_markdown_pipeline_normalize_raises_on_empty() -> None:
    pipeline = MarkdownPipeline()
    ctx = _context()
    with pytest.raises(RuntimeError, match="markdown_empty_content"):
        await pipeline.normalize({"payload": {"texto": ""}}, ctx)


@pytest.mark.asyncio
async def test_slides_pipeline_normalize_new_schema() -> None:
    pipeline = SlidesPipeline()
    ctx = _context()
    material = {
        "payload": {
            "titulo": "Apresentação de Teste",
            "abertura": "Introdução ao tema",
            "slides": [
                {
                    "titulo": "Conceito Central",
                    "topics": ["Pista 1", "Pista 2"],
                    "explanation": "Insight da Jornada sobre o tema",
                    "visualDescription": "Mapa com trilha luminosa",
                    "characterQuote": "Orion diz: siga a estrela guia",
                    "characterAction": "explaining",
                    "imagePrompt": "2D magical glowing compass in forest",
                    "sourceIds": ["src-1", "src-2"],
                }
            ],
        }
    }
    result = await pipeline.normalize(material, ctx)
    slides = result["payload"]["slides"]
    assert len(slides) == 1
    slide = slides[0]
    assert slide["titulo"] == "Conceito Central"
    assert slide["topics"] == ["Pista 1", "Pista 2"]
    assert slide["characterAction"] == "explaining"
    assert slide["characterQuote"] == "Orion diz: siga a estrela guia"
    assert slide["imagePrompt"] == "2D magical glowing compass in forest"
    assert slide["sourceIds"] == ["src-1", "src-2"]
    assert "pontos" not in slide
    assert "layout" not in slide


@pytest.mark.asyncio
async def test_audio_pipeline_uses_guia_voz_from_state() -> None:
    pipeline = AudioPipeline()
    ctx = _context("seeker")  # guia_voz = "Puck" via perfil_editorial

    class _FakeSettings:
        gemini_api_key = None
        openai_api_key = None

    ctx = MediaPipelineContext(
        state={
            "perfil_editorial": {"guia_voz": "Puck"},
            "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.9}],
            "perfil_dominante": "seeker",
        },
        settings=_FakeSettings(),  # type: ignore[arg-type]
        storage=None,  # type: ignore[arg-type]
        base_prefix="aluno/1/2",
        ref_id="ref",
    )
    material = {"payload": {"roteiro": "Texto de áudio"}}
    normalized = await pipeline.normalize(material, ctx)
    # render falhará sem API key, mas queremos testar que voz é extraída do state
    voz = (ctx.state.get("perfil_editorial") or {}).get("guia_voz")
    assert voz == "Puck"
```

- [ ] **Step 2: Rodar para confirmar falhas**

```bash
python -m pytest tests/test_media_pipeline.py -v
```
Esperado: vários FAILED (MarkdownPipeline não existe, SlidesPipeline usa schema antigo, split inclui quiz)

- [ ] **Step 3: Remover imports e pipelines obsoletos do topo de media_pipeline.py**

No topo de `app/services/media_pipeline.py`, remova as seguintes linhas:
```python
from app.services.docx import gerar_docx
from app.services.media_agents import gerar_audio_gemini_tts, gerar_roteiro_video_llm
from app.services.pdf import gerar_pdf, render_pdf_html
from app.services.video import gerar_video_mp4
```

Substitua por:
```python
from app.services.media_agents import gerar_audio_gemini_tts
```

- [ ] **Step 4: Atualizar _FAST_FORMATOS e _MEDIA_FORMATOS**

Nas linhas 27-28 de `app/services/media_pipeline.py`, substitua:
```python
_FAST_FORMATOS = {"cards", "quiz"}
_MEDIA_FORMATOS = {"pdf", "video", "audio", "apresentacao", "documento", "imagem"}
```
Por:
```python
_FAST_FORMATOS = {"cards"}
_MEDIA_FORMATOS = {"audio", "apresentacao", "markdown"}
```

- [ ] **Step 5: Adicionar MarkdownPipeline (antes de SlidesPipeline)**

Após a classe `DocumentoPipeline` (ou onde ela estava), adicione:

```python
class MarkdownPipeline(MediaPipeline):
    kind = "markdown"
    extension = "md"
    content_type = "text/markdown"

    async def normalize(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
        payload = material.get("payload") if isinstance(material.get("payload"), dict) else {}
        texto = str(payload.get("texto") or payload.get("markdown") or "").strip()
        if not texto:
            raise RuntimeError("markdown_empty_content")
        return {**material, "payload": {**payload, "texto": texto}}

    async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
        payload = material.get("payload") or {}
        return (payload.get("texto") or "").encode("utf-8")
```

- [ ] **Step 6: Remover PdfPipeline, DocumentoPipeline, VideoPipeline**

Delete as classes completas `PdfPipeline` (linhas 191-227), `DocumentoPipeline` (linhas 230-266) e `VideoPipeline` (linhas 370-435) de `app/services/media_pipeline.py`.

- [ ] **Step 7: Atualizar SlidesPipeline.normalize() para novo schema**

Substitua o método `normalize` completo da `SlidesPipeline` por:

```python
async def normalize(self, material: dict[str, Any], context: MediaPipelineContext) -> dict[str, Any]:
    payload = material.get("payload") if isinstance(material.get("payload"), dict) else {}
    titulo = clean_extracted_text(payload.get("titulo"), max_chars=160, preserve_lines=False) or "Apresentação"
    abertura = normalize_script(payload.get("abertura") or payload.get("resumo"), max_chars=420)
    tema_visual = _merge_tema_visual(payload.get("tema_visual"), _dominant_profile_theme(context.state))

    perfil_editorial = context.state.get("perfil_editorial") if isinstance(context.state.get("perfil_editorial"), dict) else {}
    guia_nome = str(perfil_editorial.get("guia_nome") or "")
    if guia_nome:
        tema_visual["guia_nome"] = guia_nome

    cleaned_slides: list[dict[str, Any]] = []
    for slide in (payload.get("slides") or []):
        if not isinstance(slide, dict):
            continue
        slide_titulo = clean_extracted_text(slide.get("titulo"), max_chars=120, preserve_lines=False) or "Tópico"
        topics = [str(t).strip() for t in (slide.get("topics") or []) if str(t).strip()]
        cleaned_slide: dict[str, Any] = {
            "titulo": slide_titulo,
            "topics": topics,
            "explanation": str(slide.get("explanation") or "").strip(),
            "visualDescription": str(slide.get("visualDescription") or "").strip(),
            "characterQuote": str(slide.get("characterQuote") or "").strip(),
            "characterAction": str(slide.get("characterAction") or "explaining").strip(),
            "imagePrompt": str(slide.get("imagePrompt") or "").strip(),
            "sourceIds": [str(s) for s in (slide.get("sourceIds") or [])],
        }
        cleaned_slides.append(cleaned_slide)

    if not cleaned_slides:
        cleaned_slides = [
            {
                "titulo": f"Slide {i + 1}",
                "topics": [sec],
                "explanation": "",
                "visualDescription": "",
                "characterQuote": "",
                "characterAction": "explaining",
                "imagePrompt": "",
                "sourceIds": [],
            }
            for i, sec in enumerate(
                expand_sections([abertura], max_items=6, section_max_chars=220, min_chars=8)
                or ["Contexto inicial", "Conceito central", "Aplicação prática", "Resumo final"]
            )
        ]

    normalized_payload = {
        "titulo": titulo,
        "abertura": abertura,
        "tema_visual": tema_visual,
        "slides": cleaned_slides,
    }
    return {**material, "payload": normalized_payload}
```

- [ ] **Step 8: Atualizar AudioPipeline.render() para usar guia_voz**

Substitua o método `render` da `AudioPipeline` por:

```python
async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
    payload = material.get("payload") or {}
    roteiro = str(payload.get("roteiro") or "")
    perfil_editorial = context.state.get("perfil_editorial") if isinstance(context.state.get("perfil_editorial"), dict) else {}
    voz = str(perfil_editorial.get("guia_voz") or "Kore")
    rendered = await gerar_audio_gemini_tts(
        settings=context.settings,
        texto=roteiro,
        voz=voz,
    )
    if not rendered:
        raise RuntimeError("audio_generation_failed")
    return rendered
```

- [ ] **Step 9: Atualizar SlidesPipeline.render() para mapear topics → pontos no gerar_pptx**

`gerar_pptx` recebe `pontos` internamente. O novo schema usa `topics`. Substitua o método `render` da `SlidesPipeline` por:

```python
async def render(self, material: dict[str, Any], context: MediaPipelineContext) -> bytes:
    payload = material.get("payload") or {}
    slides_for_pptx = [
        {**s, "pontos": s.get("topics", [])}
        for s in payload.get("slides", [])
        if isinstance(s, dict)
    ]
    return await asyncio.to_thread(
        lambda: gerar_pptx(
            titulo=payload.get("titulo", "Apresentação"),
            abertura=payload.get("abertura", ""),
            tema_visual=payload.get("tema_visual") if isinstance(payload.get("tema_visual"), dict) else None,
            slides=slides_for_pptx,
        )
    )
```

- [ ] **Step 10: Atualizar MultiOutputPipeline.pipelines**

Localize o dict `self.pipelines` em `MultiOutputPipeline.__init__` (por volta da linha 456) e substitua por:

```python
self.pipelines: dict[str, MediaPipeline] = {
    "apresentacao": SlidesPipeline(),
    "audio": AudioPipeline(),
    "markdown": MarkdownPipeline(),
}
```

- [ ] **Step 11: Rodar os testes**

```bash
python -m pytest tests/test_media_pipeline.py -v
```
Esperado: todos PASSED

- [ ] **Step 12: Commit**

```bash
git add app/services/media_pipeline.py tests/test_media_pipeline.py
git commit -m "feat: media pipeline - MarkdownPipeline, slides enriquecidos, audio com voz por perfil"
```

---

### Task 6: Atualizar personalizacao_jobs.py

**Files:**
- Modify: `app/services/personalizacao_jobs.py`

- [ ] **Step 1: Atualizar _MEDIA_FORMATOS**

Na linha 39 de `app/services/personalizacao_jobs.py`, substitua:
```python
_MEDIA_FORMATOS = {"pdf", "video", "audio", "apresentacao", "documento", "imagem"}
```
Por:
```python
_MEDIA_FORMATOS = {"audio", "apresentacao", "markdown"}
```

- [ ] **Step 2: Verificar imports**

```bash
python -c "from app.services.personalizacao_jobs import JOB_KIND_MEDIA_RENDER; print('OK')"
```
Esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/services/personalizacao_jobs.py
git commit -m "feat: personalizacao_jobs - atualiza formatos de mídia para novo conjunto"
```

---

### Task 7: Limpar testes e verificar integridade

**Files:**
- Delete: `tests/test_video_service.py`
- Modify: `tests/test_personalizacao_service.py`

- [ ] **Step 1: Deletar test_video_service.py**

```bash
git rm tests/test_video_service.py
```

- [ ] **Step 2: Remover referências a formatos obsoletos em test_personalizacao_service.py**

No arquivo `tests/test_personalizacao_service.py`, procure e remova/atualize qualquer fixture ou assertion que referencie `pdf`, `video`, `documento`, `quiz`, `imagem`. Substitua por referências a `markdown`, `audio`, `apresentacao`, `cards`.

Execute para encontrar o que precisa mudar:
```bash
grep -n "pdf\|video\|documento\|quiz\|imagem" tests/test_personalizacao_service.py
```

Para cada ocorrência em assertions de formato, substitua pelo formato correspondente do novo conjunto. Fixtures que constroem `materiais` devem usar:
```python
materiais = {
    "markdown": {"payload": {"texto": "# Grimório\n\nConteúdo"}, "metadata": {}},
    "audio": {"payload": {"roteiro": "Roteiro de áudio", "duracao_estimada_seg": 60}, "metadata": {}},
    "apresentacao": {"payload": {"titulo": "T", "abertura": "A", "slides": []}, "metadata": {}},
    "cards": [{"frente": "P?", "verso": "R", "icone": "★", "dificuldade": "medio", "xp": 5}],
}
```

- [ ] **Step 3: Rodar todos os testes**

```bash
python -m pytest tests/ -v --ignore=tests/test_video_service.py -x
```
Esperado: todos PASSED ou SKIPPED (nenhum FAILED relacionado aos formatos)

- [ ] **Step 4: Commit final**

```bash
git add tests/test_personalizacao_service.py
git commit -m "feat: testes - remove formatos obsoletos, alinha com novo conjunto markdown/audio/slides/cards"
```

---

## Resumo dos Commits

1. `feat: migration 20260418_01 - novo conjunto de tipos de materiais`
2. `feat: schemas - remove artefatos obsoletos, adiciona MarkdownMaterial`
3. `feat: personas guias BrainHex - Atena/Orion/Valka/Rexa/Drako/Luma/Auri`
4. `feat: prompts - remove formatos obsoletos, adiciona personas e slides enriquecidos`
5. `feat: media pipeline - MarkdownPipeline, slides enriquecidos, audio com voz por perfil`
6. `feat: personalizacao_jobs - atualiza formatos de mídia para novo conjunto`
7. `feat: testes - remove formatos obsoletos, alinha com novo conjunto markdown/audio/slides/cards`

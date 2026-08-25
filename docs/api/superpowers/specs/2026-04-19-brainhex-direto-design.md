# Integração Direta ApiTraiUp → ApiBrainHex: Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ApiTraiUp envia arquivos brutos + contexto do aluno diretamente ao ApiBrainHex, que processa tudo e persiste os materiais. ApiTraiUp para de gerar resumos, plano e ai_patch no banco.

**Architecture:** Personalização vira dois passos independentes: (1) ApiTraiUp gera cards via LLM direto e salva registro limpo; (2) ApiBrainHex recebe URLs das fontes, faz download, processa com Gemini e persiste mídias. Sem LangGraph no caminho de personalização.

**Tech Stack:** FastAPI + asyncio (ApiTraiUp), Node.js/Express + Gemini SDK (ApiBrainHex), Supabase Storage + Postgres.

---

## Fluxo end-to-end

```
Worker (job) ou POST /api/v1/personalizar
  │
  ├─ fetch_personalizacao_context(aluno_id, classe_id, topico_id)
  │     → perfil BrainHex dominante
  │     → fontes_personalizacao: [{arquivo_url, mime_type, tipo}]
  │     → histórico/contexto do aluno
  │
  ├─ source_hash = hash(fontes_urls + perfil)
  │     → se igual ao último registro → skipped
  │
  ├─ gerar_cards_direto(perfil, fontes_texto, contexto_aluno, settings)
  │     → JsonLLMService direto, sem LangGraph
  │     → retorna payload de cards
  │
  ├─ salvar conteudo_personalizado
  │     → materiais: { cards: {payload, metadata: {status: "completed"}} }
  │     → status: "processando_midias"
  │     → plano: null, ai_patch: null
  │
  ├─ seed_progress(record)
  │
  └─ asyncio.create_task → disparar_brainhex_async(fontes, perfil, ids)
        [fire-and-forget]

--- ApiBrainHex (independente) ---
  ├─ fetch(url) → buffer → base64  (para cada fonte)
  ├─ processMediaWithGemini(allFiles[], profile)
  ├─ generateNaturalAudio + generateSlidesImages + generateSlidesPDF
  └─ mergePersonalizacaoMateriais → status="pronto"
```

---

## Seção 1: Responsabilidades

| Componente | Responsabilidade |
|---|---|
| ApiTraiUp | Autenticação, jobs, contexto do aluno, geração de cards (LLM direto), registro simplificado, disparo do ApiBrainHex |
| ApiBrainHex | Download de arquivos, processamento Gemini, geração de áudio/markdown/PDF, persistência de materiais no banco |
| `conteudo_personalizado` | Guarda ids, ciclo_id, source_hash, status, `materiais` (cards + mídias). Sem `plano`, sem `ai_patch` |
| LangGraph | Continua na API para chat, análise e outros fluxos — não é usado no caminho de personalização |

---

## Seção 2: Mudanças no ApiTraiUp

### 2.1 Novo contrato interno de personalização

```python
# Função nova em personalizacao.py
async def fetch_personalizacao_context(
    aluno_id: str,
    classe_id: int,
    topico_id: int,
    conteudo_id: int | None,
    settings: Settings,
    session: AsyncSession,
) -> dict:
    # Retorna:
    # {
    #   "perfil_dominante": "seeker",
    #   "fontes": [{"arquivo_url": "...", "mime_type": "...", "tipo": "..."}],
    #   "contexto_aluno": {...},  # histórico, desempenho
    #   "source_hash": "sha256...",
    #   "ciclo_id": "uuid",
    # }
```

```python
# Função nova em personalizacao.py
async def gerar_cards_direto(
    perfil: str,
    conteudo_classe: dict,     # estrutura do tópico/conteúdo já no banco (nome, objetivos, descrição)
    contexto_aluno: dict,      # histórico, desempenho, modo_operacao
    settings: Settings,
) -> dict:
    # Chama JsonLLMService diretamente com prompt gerador_conteudo.txt
    # Usa estrutura do tópico já conhecida pelo ApiTraiUp — não faz download de arquivos
    # Retorna payload de cards: {items: [...], formato: "cards"}
```

> **Nota:** ApiTraiUp não faz download das fontes para gerar cards. Usa a estrutura pedagógica do tópico (nome, objetivos, descrição, atividades) que já está no banco. O download e leitura dos arquivos é exclusivamente responsabilidade do ApiBrainHex.

### 2.2 Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `app/services/personalizacao.py` | Adiciona `fetch_personalizacao_context()` + `gerar_cards_direto()`; remove `persist_personalizacao_record` com plano/ai_patch; `salvar` passa a receber `materiais` direto sem plano |
| `app/services/personalizacao_jobs.py` | `_process_target`: substitui `ainvoke_personalizacao_graph` pelo fluxo direto (context → cards → salvar → brainhex) |
| `app/api/v1/personalizacao.py` | Rota `POST /personalizar`: substitui `ainvoke_personalizacao_graph` pelo mesmo fluxo direto |
| `app/services/media_agents.py` | `disparar_brainhex_async()`: substitui `conteudo_estudado` por `fontes: list[dict]` no payload HTTP |

### 2.3 O que é removido do caminho de personalização

- Chamada a `ainvoke_personalizacao_graph()` (personalização)
- Chamada a `build_personalizacao_state()` (substituída por `fetch_personalizacao_context`)
- Geração de `plano`, `ai_patch`, `editorial_metadata`, `modelo_editorial`, `perfil_editorial`
- Escrita de `plano` e `ai_patch` em `conteudo_personalizado` (colunas ficam, passam a ser `null`)
- Nós do grafo usados só para personalização: `agente_midias_personalizadas`, `plano_personalizacao`, `ai_patch_personalizacao`

### 2.4 Novo payload para disparar_brainhex_async

```python
async def disparar_brainhex_async(
    *,
    settings: Settings,
    perfil: str,
    fontes: list[dict],          # [{url, mime_type, tipo}]
    personalizacao_id: int,
    aluno_id: str = "",
    classe_id: int | None = None,
    topico_id: int | None = None,
    ciclo_id: str = "",
) -> bool:
    payload = {
        "profile": perfil,
        "personalizacao_id": personalizacao_id,
        "aluno_id": aluno_id,
        "classe_id": classe_id,
        "topico_id": topico_id,
        "ciclo_id": ciclo_id,
        "fontes": fontes,         # ← novo campo
    }
    # POST {brainhex_url}/api/personalizar, timeout=15s, retorna True se 202
```

---

## Seção 3: Mudanças no ApiBrainHex

### 3.1 Novo contrato de POST /api/personalizar

```typescript
// Body recebido
{
  profile:           BrainHexProfile          // obrigatório
  personalizacao_id: number                   // obrigatório
  aluno_id?:         string
  classe_id?:        number
  topico_id?:        number
  ciclo_id?:         string
  fontes:            FonteItem[]              // obrigatório (pode ser vazio)
}

interface FonteItem {
  url:       string   // URL pública direta para download
  mime_type: string
  tipo:      string   // "documento" | "apresentacao" | "audio" | "markdown" | etc.
}
```

### 3.2 Novo fluxo em background

```typescript
// server.ts — POST /api/personalizar (setImmediate)

// 1. Download de cada fonte
async function fetchFontesAsFileData(fontes: FonteItem[]): Promise<FileData[]> {
  // fetch(url) → ArrayBuffer → base64
  // retorna só as fontes que foram baixadas com sucesso
  // loga erro e continua para as demais se uma falhar
}

// 2. processMediaWithGemini aceita array
const resultado = await processMediaWithGemini(filesData, profile);

// 3. Restante igual (áudio, imagens, PDF, upload, mergePersonalizacaoMateriais)
```

### 3.3 Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `server.ts` | `POST /api/personalizar`: aceita `fontes[]`; adiciona `fetchFontesAsFileData()`; remove parsing de `conteudo_estudado` |
| `src/services/geminiService.ts` | `processMediaWithGemini`: aceita `fileData[]` (array) em vez de único `fileData`; múltiplos arquivos enviados em um único prompt Gemini |

### 3.4 Sem fontes disponíveis

Se `fontes` chegar vazio: ApiBrainHex loga `[brainhex] fontes vazias, abortando processamento id={id}` e retorna sem processar — não atualiza `conteudo_personalizado`.

---

## Seção 4: Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| `fontes` vazio | `gerar_cards_direto` usa só contexto do aluno; ApiBrainHex não processa mídias |
| Arquivo inacessível (URL 404/timeout) | ApiBrainHex loga erro por fonte, continua com as demais fontes disponíveis |
| `gerar_cards_direto` falha | Target marcado `failed`; nenhum registro salvo |
| ApiBrainHex timeout/erro HTTP (disparo) | `disparar_brainhex_async` loga e retorna `False`; `materiais` fica como `{cards: ...}` sem mídias |
| Todas as fontes falham no download | ApiBrainHex não chama Gemini; `conteudo_personalizado.status` permanece `processando_midias` |

---

## Seção 5: O que NÃO muda

- Tabela `fontes_personalizacao` — sem alteração
- Tabela `conteudo_personalizado` — colunas `plano`/`ai_patch` ficam (passam a ser `null`)
- Mobile: `PersonalizacaoResponse` continua com os mesmos campos (steps, materiais, media_status, etc.)
- LangGraph: continua para chat mentor, análise emocional, trilha e outros fluxos
- Jobs de enrollment, class-delta, full-sync, class-theme — sem alteração no tipo de job
- Autenticação, telemetria, progresso — sem alteração
- `POST /api/v1/archive` no ApiBrainHex (path do frontend) — sem alteração

---

## Arquivos por repositório

### ApiTraiUp
```
app/services/personalizacao.py        modificar
app/services/personalizacao_jobs.py   modificar
app/services/media_agents.py          modificar
app/api/v1/personalizacao.py          modificar
```

### ApiBrainHex
```
server.ts                              modificar
src/services/geminiService.ts          modificar
```

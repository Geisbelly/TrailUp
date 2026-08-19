# Geração granular e retomável de conteúdo personalizado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a geração de conteúdo personalizado (texto/áudio/apresentação por tópico×perfil) retomar de onde parou numa falha parcial — por bloco (para enriquecimento e síntese Gemini) e por parte de entrega (para áudio/apresentação) — em vez de reiniciar tudo do zero e regastar tokens de LLM já gerados com sucesso.

**Architecture:** Ver `docs/superpowers/specs/2026-08-18-geracao-granular-retomavel-design.md`. Duas fases com dependência (bloco → parte), rodando dentro da fila `personalizacao_jobs`/`personalizacao_job_targets` já existente (novo `kind=media_generation`, colunas novas opcionais `media_kind`/`block_id`/`part_ordem` no target), com uma tabela nova (`personalizacao_blocos_gerados`) só para cachear o conteúdo de cada bloco entre tentativas. O `microservice` ganha 3 endpoints granulares novos; a orquestração inteira (o quê chamar, quando, e o que pular por já estar pronto) fica no Python.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (Python, `api/`); Express + TypeScript + `node:test` (`microservice/`).

**Nota sobre fidelidade ao spec:** durante a investigação desta plan, o schema real de `personalizacao_job_targets` (colunas `brainhex_profile_key`/`is_profile_template`, constraint `uq_job_target_aluno_topico_conteudo_perfil`) e os nomes reais dos `kind` de job (`student_enrollment`, `class_delta_sync`, etc.) divergiam do que o spec assumiu (ele foi escrito contra uma migration mais antiga). Este plano usa os nomes/constraints REAIS, verificados em `api/alembic/versions/` e `api/app/repositories/personalizacao_jobs.py`. A arquitetura (2 fases, granularidade, tabela de cache) continua exatamente a do spec.

---

## Task 1: Microservice — expor os capítulos por bloco em `ProcessedContent`

Hoje `consolidateBlockBatchGenerations` (em `microservice/src/services/geminiService.ts`) já calcula um `chapters: GeneratedBlockChapter[]` (um `{blockId, markdown, audioScript, slides}` por bloco) internamente, mas só devolve a versão consolidada (markdown/audioScript juntados). Este task expõe o array bruto também, sem mudar nada do comportamento existente — é aditivo.

**Files:**
- Modify: `microservice/src/types/index.ts:43-64` (interface `ProcessedContent`)
- Modify: `microservice/src/services/geminiService.ts:1057-1084` (`consolidateBlockBatchGenerations`)
- Test: `microservice/src/services/geminiBlockBatches.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do teste existente `"consolida markdown, áudio e slides na ordem global com metadados dos lotes"` (por volta da linha 400 de `geminiBlockBatches.test.ts`, logo antes do `});` que fecha o teste):

```typescript
  assert.deepEqual(
    result.chapters?.map((c) => c.blockId),
    ["bloco-01", "bloco-02", "bloco-03", "bloco-04"],
  );
  assert.equal(result.chapters?.[0]?.markdown.includes("PRIMEIRO"), true);
  assert.equal(result.chapters?.[2]?.markdown.includes("TERCEIRO"), true);
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd microservice && npx tsc --noEmit`
Expected: erro de tipo — `Property 'chapters' does not exist on type 'ProcessedContent'`.

- [ ] **Step 3: Adicionar o campo ao tipo `ProcessedContent`**

Em `microservice/src/types/index.ts`, dentro da interface `ProcessedContent` (depois do campo `metadata: {...}`, antes de `slideImages?: string[];`):

```typescript
  /** Capítulo bruto por bloco — só populado quando generation_mode é
   * "block_batches" (ver consolidateBlockBatchGenerations). Usado pelo
   * endpoint /api/v1/generate/block para persistir cada bloco separado,
   * em vez de só o markdown/audioScript já consolidado acima. */
  chapters?: { blockId: string; markdown: string; audioScript: string; slides: SlideContent[] }[];
```

- [ ] **Step 4: Popular o campo em `consolidateBlockBatchGenerations`**

Em `microservice/src/services/geminiService.ts`, dentro do `return { ... }` de `consolidateBlockBatchGenerations` (linha ~1057), adicionar `chapters` como irmão de `markdown`/`audioScript`/`slides`:

```typescript
  return {
    markdown: chapters.map((chapter) => chapter.markdown).join("\n\n---\n\n"),
    audioScript: chapters.map((chapter) => chapter.audioScript).join("\n\n"),
    slides: chapters.flatMap((chapter) => chapter.slides),
    chapters,
    metadata: {
```

(`chapters` já é a variável local computada na linha ~1024 — `const chapters = orderedBatches.flatMap((batch) => batch.chapters);` — não precisa recalcular nada.)

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsc --noEmit && node --test src/services/geminiBlockBatches.test.ts`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add microservice/src/types/index.ts microservice/src/services/geminiService.ts microservice/src/services/geminiBlockBatches.test.ts
git commit -m "feat(microservice): expoe capitulos por bloco em ProcessedContent.chapters"
```

---

## Task 2: Microservice — endpoint `POST /api/v1/generate/block`

Gera o capítulo (markdown+audioScript+slides) de um subconjunto de blocos já enriquecidos, reaproveitando `processMediaWithGemini` inteiro (que já faz batching/concorrência/fallback quando `contentBlocks.length > 0`) — sem duplicar nenhuma lógica de geração, só um wrapper HTTP fino.

**Files:**
- Modify: `microservice/server.ts` (novo endpoint, perto de `/api/v1/regenerate/*`)
- Test: `microservice/src/server.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `microservice/src/server.test.ts`, depois do bloco `describe("GET /api/health", ...)`:

```typescript
// ─── POST /api/v1/generate/block ───────────────────────────────────────────

describe("POST /api/v1/generate/block", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer({ apiSharedSecret: "test-secret" })));
  after(async () => close());

  it("exige x-api-secret", async () => {
    const res = await fetch(`${base}/api/v1/generate/block`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentBlocks: [enrichedContentBlock()], profile: "mastermind" }),
    });
    assert.equal(res.status, 401);
  });

  it("exige contentBlocks e profile", async () => {
    const res = await fetch(`${base}/api/v1/generate/block`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-secret": "test-secret" },
      body: JSON.stringify({ contentBlocks: [] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.match(body.error, /contentBlocks/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd microservice && node --test src/server.test.ts`
Expected: FAIL — `404` em vez de `401`/`400` (rota ainda não existe).

- [ ] **Step 3: Implementar o endpoint**

Em `microservice/server.ts`, adicionar logo depois do bloco `/api/v1/regenerate/document` (antes do comentário `// ── POST /api/v1/archive`):

```typescript
  // ── POST /api/v1/generate/block — geração granular por bloco ────
  //
  // Usado pelo worker de fila do Python (Fase A da geracao retomavel — ver
  // docs/superpowers/specs/2026-08-18-geracao-granular-retomavel-design.md).
  // Aceita um SUBCONJUNTO de blocos já enriquecidos (só os que ainda faltam
  // numa retentativa) e devolve o capítulo (markdown+audioScript+slides) de
  // cada um. Reaproveita processMediaWithGemini inteiro — já faz
  // batching/concorrência/fallback Gemini→OpenAI quando contentBlocks não
  // está vazio, sem nenhuma fonte binária (filesData=[]).
  app.post("/api/v1/generate/block", requireSecret, async (req, res) => {
    try {
      const { contentBlocks, profile, presentation_theme: presentationTheme, guidance_prompt: guidancePrompt } = req.body ?? {};
      if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) {
        return res.status(400).json({ error: "contentBlocks é obrigatório e não pode ser vazio" });
      }
      if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile é obrigatório e precisa ser um perfil BrainHex válido" });
      }
      const presentationPlan = buildPresentationDesignPlan(
        profile as BrainHexProfile,
        presentationTheme ?? {},
        contentBlocks[0]?.tema || contentBlocks[0]?.topico || "Conteúdo de estudo",
      );
      const result = await processMediaWithGemini(
        [],
        profile as BrainHexProfile,
        contentBlocks,
        presentationPlan,
        typeof guidancePrompt === "string" ? guidancePrompt : undefined,
      );
      if (!result.chapters || result.chapters.length === 0) {
        return res.status(502).json({ error: "geração não retornou capítulos por bloco" });
      }
      res.json({ success: true, chapters: result.chapters });
    } catch (error: any) {
      req.log.error("generate/block erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao gerar capítulos por bloco" });
    }
  });

```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsc --noEmit && node --test src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add microservice/server.ts microservice/src/server.test.ts
git commit -m "feat(microservice): endpoint POST /api/v1/generate/block para geracao granular"
```

---

## Task 3: Microservice — endpoint `POST /api/v1/generate/part-audio`

Wrapper HTTP fino sobre `generateLongNaturalAudio`/`generateLongConversationalAudio` (já existem em `geminiService.ts`) + upload no Storage (mesma lógica de `archiveMultiPartToSupabase`, extraída em miniatura).

**Files:**
- Modify: `microservice/server.ts`
- Test: `microservice/src/server.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `microservice/src/server.test.ts`:

```typescript
// ─── POST /api/v1/generate/part-audio ──────────────────────────────────────

describe("POST /api/v1/generate/part-audio", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer({ apiSharedSecret: "test-secret" })));
  after(async () => close());

  it("exige audioScript, profile, bucket e storagePath", async () => {
    const res = await fetch(`${base}/api/v1/generate/part-audio`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-secret": "test-secret" },
      body: JSON.stringify({ profile: "mastermind" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.match(body.error, /audioScript/);
  });

  it("rejeita profile invalido", async () => {
    const res = await fetch(`${base}/api/v1/generate/part-audio`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-secret": "test-secret" },
      body: JSON.stringify({
        audioScript: "roteiro de teste",
        profile: "nao-existe",
        bucket: "conteudo_aluno",
        storagePath: "brainhex/mastermind/topico-1/audio/material-1-parte-01",
      }),
    });
    assert.equal(res.status, 400);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd microservice && node --test src/server.test.ts`
Expected: FAIL — `404` (rota não existe ainda).

- [ ] **Step 3: Implementar o endpoint**

Em `microservice/server.ts`, logo depois do endpoint `/api/v1/generate/block` criado no Task 2:

```typescript
  // ── POST /api/v1/generate/part-audio — TTS granular por parte ───
  //
  // Fase B da geracao retomavel: gera e sobe o audio de UMA parte de
  // entrega (ja resplitada pelo worker Python a partir do markdown
  // consolidado dos blocos da Fase A). storagePath vem SEM extensao — a
  // extensao real (mp3 preferencial, wav fallback) e decidida aqui, como
  // ja acontece em archiveMultiPartToSupabase.
  app.post("/api/v1/generate/part-audio", requireSecret, async (req, res) => {
    try {
      const { audioScript, profile, bucket, storagePath } = req.body ?? {};
      if (typeof audioScript !== "string" || !audioScript.trim()) {
        return res.status(400).json({ error: "audioScript é obrigatório" });
      }
      if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile é obrigatório e precisa ser um perfil BrainHex válido" });
      }
      if (typeof bucket !== "string" || !bucket.trim() || typeof storagePath !== "string" || !storagePath.trim()) {
        return res.status(400).json({ error: "bucket e storagePath são obrigatórios" });
      }
      const typedProfile = profile as BrainHexProfile;
      const voiceProfile = GUARDIAN_VOICE_PROFILES[typedProfile];
      const secondaryGuideName = BRAIN_HEX_CONFIG[typedProfile]?.secondaryGuideName;
      const audioResult = secondaryGuideName && voiceProfile.secondaryVoice
        ? await generateLongConversationalAudio(
            audioScript,
            { name: BRAIN_HEX_CONFIG[typedProfile].guideName, voice: voiceProfile.voice, direction: voiceProfile.direction },
            { name: secondaryGuideName, voice: voiceProfile.secondaryVoice, direction: voiceProfile.secondaryDirection },
          )
        : await generateLongNaturalAudio(audioScript, voiceProfile.voice, voiceProfile.direction);

      const audioPayload = audioResult.mp3 ?? audioResult.wav;
      if (!audioPayload) {
        return res.status(502).json({ error: "geração de áudio não retornou mp3 nem wav" });
      }
      const ext = audioResult.mp3 ? "mp3" : "wav";
      const mime = audioResult.mp3 ? "audio/mpeg" : "audio/wav";
      const path = `${storagePath}.${ext}`;
      const audioUrl = await uploadBuffer(bucket, path, Buffer.from(audioPayload, "base64"), mime);
      if (!audioUrl) {
        return res.status(502).json({ error: "upload do áudio falhou" });
      }
      res.json({ success: true, url: audioUrl, storagePath: path, mimeType: mime });
    } catch (error: any) {
      req.log.error("generate/part-audio erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao gerar áudio da parte" });
    }
  });

```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsc --noEmit && node --test src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add microservice/server.ts microservice/src/server.test.ts
git commit -m "feat(microservice): endpoint POST /api/v1/generate/part-audio para TTS granular"
```

---

## Task 4: Microservice — endpoint `POST /api/v1/generate/part-presentation`

Wrapper mais fino ainda: `renderAndUploadPresentationViaBrainHexPdf` já faz a chamada ao BrainHexPDF e o upload acontece do lado de lá (via `SUPABASE_SERVICE_ROLE_KEY` do BrainHexPDF) — o endpoint só precisa validar entrada e devolver o resultado.

**Files:**
- Modify: `microservice/server.ts`
- Test: `microservice/src/server.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// ─── POST /api/v1/generate/part-presentation ───────────────────────────────

describe("POST /api/v1/generate/part-presentation", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer({ apiSharedSecret: "test-secret" })));
  after(async () => close());

  it("exige markdown, topic, profile, bucket e storagePath", async () => {
    const res = await fetch(`${base}/api/v1/generate/part-presentation`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-secret": "test-secret" },
      body: JSON.stringify({ profile: "mastermind" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.match(body.error, /markdown/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd microservice && node --test src/server.test.ts`
Expected: FAIL — `404`.

- [ ] **Step 3: Implementar o endpoint**

Em `microservice/server.ts`, logo depois do endpoint `/api/v1/generate/part-audio`:

```typescript
  // ── POST /api/v1/generate/part-presentation — render granular por parte ──
  //
  // Fase B da geracao retomavel: renderiza e sobe a apresentacao de UMA
  // parte via BrainHexPDF. O upload real acontece do lado do BrainHexPDF
  // (SUPABASE_SERVICE_ROLE_KEY dele) — aqui so repassa a chamada, igual
  // arquiveMultiPartToSupabase ja faz por parte hoje.
  app.post("/api/v1/generate/part-presentation", requireSecret, async (req, res) => {
    try {
      const { markdown, topic, profile, bucket, storagePath } = req.body ?? {};
      if (typeof markdown !== "string" || !markdown.trim()) {
        return res.status(400).json({ error: "markdown é obrigatório" });
      }
      if (typeof topic !== "string" || !topic.trim()) {
        return res.status(400).json({ error: "topic é obrigatório" });
      }
      if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile é obrigatório e precisa ser um perfil BrainHex válido" });
      }
      if (typeof bucket !== "string" || !bucket.trim() || typeof storagePath !== "string" || !storagePath.trim()) {
        return res.status(400).json({ error: "bucket e storagePath são obrigatórios" });
      }
      const result = await renderAndUploadPresentationViaBrainHexPdf({
        markdown,
        topic,
        profile: profile as BrainHexProfile,
        bucket,
        presentationPath: storagePath,
      });
      if (result.failure) {
        return res.status(502).json({
          error: result.failure.error,
          error_stage: result.failure.stage,
        });
      }
      res.json({ success: true, url: result.presentationUrl });
    } catch (error: any) {
      req.log.error("generate/part-presentation erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao gerar apresentação da parte" });
    }
  });

```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsc --noEmit && node --test src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add microservice/server.ts microservice/src/server.test.ts
git commit -m "feat(microservice): endpoint POST /api/v1/generate/part-presentation para render granular"
```

---

## Task 5: Migration — schema de geração granular

Estende `personalizacao_job_targets` com `media_kind`/`block_id`/`part_ordem` (nullable — legado continua igual), substitui a unique constraint por dois índices únicos parciais (um pros targets legados, outro pros novos — preserva a garantia de unicidade dos dois mundos sem enfraquecer nenhum), e cria `personalizacao_blocos_gerados`.

**Files:**
- Create: `api/alembic/versions/20260818_01_geracao_granular_retomavel.py`
- Test: `api/tests/test_migrations_geracao_granular.py`

- [ ] **Step 1: Confirmar a revisão HEAD atual**

Run: `cd api && python -c "import subprocess,glob,re
files=glob.glob('alembic/versions/*.py')
revs={}
downs=set()
for f in files:
    t=open(f,encoding='utf-8').read()
    m=re.search(r'^revision = \"([^\"]+)\"', t, re.M)
    d=re.search(r'^down_revision = \"?([^\"\n]+)\"?', t, re.M)
    if m:
        revs[m.group(1)]=f
        if d and d.group(1)!='None': downs.add(d.group(1))
print(set(revs)-downs)"`
Expected: `{'20260803_01'}` (se for outro valor, use esse como `down_revision` no Step 2 em vez de `20260803_01`).

- [ ] **Step 2: Escrever a migration**

Criar `api/alembic/versions/20260818_01_geracao_granular_retomavel.py`:

```python
"""geracao granular e retomavel por bloco/parte/perfil

Estende personalizacao_job_targets com colunas opcionais para targets
granulares (bloco para enriquecimento/capitulo, parte de entrega para
audio/apresentacao) e cria personalizacao_blocos_gerados, um cache de
conteudo por bloco escopado a um job (ciclo de geracao) - permite retomar
uma tentativa que falhou parcialmente sem rechamar o LLM para o que ja
funcionou. Ver docs/superpowers/specs/2026-08-18-geracao-granular-retomavel-design.md.

Revision ID: 20260818_01
Revises: 20260803_01
Create Date: 2026-08-18
"""

from alembic import op

revision = "20260818_01"
down_revision = "20260803_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS media_kind TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS block_id TEXT
        """
    )
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        ADD COLUMN IF NOT EXISTS part_ordem INTEGER
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_job_targets_media_key'
              AND conrelid = 'personalizacao_job_targets'::regclass
          ) THEN
            ALTER TABLE personalizacao_job_targets
            ADD CONSTRAINT ck_job_targets_media_key CHECK (
              (media_kind IN ('enriquecimento', 'capitulo') AND block_id IS NOT NULL AND part_ordem IS NULL)
              OR (media_kind IN ('audio', 'apresentacao') AND part_ordem IS NOT NULL AND block_id IS NULL)
              OR media_kind IS NULL
            );
          END IF;
        END $$;
        """
    )
    # A constraint antiga (job_id, aluno_id, topico_id, conteudo_id,
    # brainhex_profile_key) impediria multiplos targets granulares no mesmo
    # aluno/topico/conteudo/perfil (um por bloco/parte). Vira dois indices
    # unicos parciais: um preserva a garantia antiga para targets legados
    # (media_kind IS NULL), outro cobre os novos targets granulares - NULL
    # em block_id/part_ordem nao colide entre linhas diferentes num indice
    # unico comum, entao precisam ficar em predicados separados.
    op.execute(
        """
        ALTER TABLE personalizacao_job_targets
        DROP CONSTRAINT IF EXISTS uq_job_target_aluno_topico_conteudo_perfil
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_job_target_legado
        ON personalizacao_job_targets (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
        WHERE media_kind IS NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_job_target_granular
        ON personalizacao_job_targets (job_id, aluno_id, topico_id, media_kind, block_id, part_ordem)
        WHERE media_kind IS NOT NULL
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS personalizacao_blocos_gerados (
          id BIGSERIAL PRIMARY KEY,
          job_id UUID NOT NULL REFERENCES personalizacao_jobs(id) ON DELETE CASCADE,
          block_id TEXT NOT NULL,
          enriched_payload JSONB,
          markdown TEXT,
          audio_script TEXT,
          slides JSONB,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (job_id, block_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_personalizacao_blocos_gerados_job
        ON personalizacao_blocos_gerados (job_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS personalizacao_blocos_gerados")
    op.execute("DROP INDEX IF EXISTS uq_job_target_granular")
    op.execute("DROP INDEX IF EXISTS uq_job_target_legado")
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'uq_job_target_aluno_topico_conteudo_perfil'
              AND conrelid = 'personalizacao_job_targets'::regclass
          ) THEN
            ALTER TABLE personalizacao_job_targets
            ADD CONSTRAINT uq_job_target_aluno_topico_conteudo_perfil
            UNIQUE (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key);
          END IF;
        END $$;
        """
    )
    op.execute(
        "ALTER TABLE personalizacao_job_targets DROP CONSTRAINT IF EXISTS ck_job_targets_media_key"
    )
    op.execute("ALTER TABLE personalizacao_job_targets DROP COLUMN IF EXISTS part_ordem")
    op.execute("ALTER TABLE personalizacao_job_targets DROP COLUMN IF EXISTS block_id")
    op.execute("ALTER TABLE personalizacao_job_targets DROP COLUMN IF EXISTS media_kind")
```

- [ ] **Step 3: Escrever um teste de sanidade da migration (sem banco real)**

Criar `api/tests/test_migrations_geracao_granular.py`:

```python
import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260818_01_geracao_granular_retomavel.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260818_01", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260818_01"
    assert module.down_revision == "20260803_01"


def test_migration_upgrade_and_downgrade_are_idempotent_sql():
    module = _load_migration()
    # upgrade()/downgrade() só executam op.execute(...) com SQL contendo
    # IF NOT EXISTS/IF EXISTS/DO $$ ... END $$ - roda sem erro de sintaxe
    # aqui via um op fake que só grava as strings, sem precisar de banco.
    executed = []

    class FakeOp:
        def execute(self, sql):
            executed.append(str(sql))

    module.op = FakeOp()
    module.upgrade()
    assert any("personalizacao_blocos_gerados" in s for s in executed)
    assert any("media_kind" in s for s in executed)
    assert any("uq_job_target_legado" in s for s in executed)
    assert any("uq_job_target_granular" in s for s in executed)

    executed.clear()
    module.downgrade()
    assert any("DROP TABLE IF EXISTS personalizacao_blocos_gerados" in s for s in executed)
```

- [ ] **Step 4: Rodar o teste**

Run: `cd api && python -m pytest tests/test_migrations_geracao_granular.py -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Aplicar a migration num banco real de dev (se disponível)**

Run: `cd api && alembic upgrade head`
Expected: sem erro. Se não houver banco de dev configurado nesta máquina, pular este step (a migration roda no deploy) — mas rodar antes de considerar o Task 9 (wiring) pronto para uso real.

- [ ] **Step 6: Commit**

```bash
git add api/alembic/versions/20260818_01_geracao_granular_retomavel.py api/tests/test_migrations_geracao_granular.py
git commit -m "feat(api): migration da geracao granular e retomavel (targets + blocos_gerados)"
```

---

## Task 6: Python — `PersonalizacaoBlocosRepository`

Repositório novo, só para o cache de conteúdo por bloco (`personalizacao_blocos_gerados`). Segue o padrão de `RecordingSession`/`MappingResult` já usado em `api/tests/test_repositories.py`.

**Files:**
- Create: `api/app/repositories/personalizacao_blocos.py`
- Test: `api/tests/test_personalizacao_blocos_repository.py`

- [ ] **Step 1: Escrever o teste que falha**

Criar `api/tests/test_personalizacao_blocos_repository.py`:

```python
import pytest

from app.repositories.personalizacao_blocos import PersonalizacaoBlocosRepository


class MappingRows:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None

    def one(self):
        return self.rows[0]

    def __iter__(self):
        return iter(self.rows)


class MappingResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return MappingRows(self.rows)


class RecordingSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.commits = 0

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if self.responses:
            return self.responses.pop(0)
        return MappingResult([])

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


JOB_ID = "11111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_upsert_enriquecimento_grava_enriched_payload():
    row = {
        "id": 1,
        "job_id": JOB_ID,
        "block_id": "bloco-01",
        "enriched_payload": {"id": "bloco-01", "tema": "Redes"},
        "markdown": None,
        "audio_script": None,
        "slides": None,
    }
    session = RecordingSession([MappingResult([row])])
    repo = PersonalizacaoBlocosRepository(session)

    result = await repo.upsert_enriquecimento(
        job_id=JOB_ID,
        block_id="bloco-01",
        enriched_payload={"id": "bloco-01", "tema": "Redes"},
    )

    assert result["block_id"] == "bloco-01"
    assert result["enriched_payload"]["tema"] == "Redes"
    assert session.commits == 1
    sql, params = session.calls[0]
    assert "ON CONFLICT (job_id, block_id)" in sql
    assert params["job_id"] == JOB_ID
    assert params["block_id"] == "bloco-01"


@pytest.mark.asyncio
async def test_upsert_capitulo_grava_markdown_audio_slides():
    row = {
        "id": 1,
        "job_id": JOB_ID,
        "block_id": "bloco-01",
        "enriched_payload": {"id": "bloco-01"},
        "markdown": "## Bloco 1\n\nConteúdo.",
        "audio_script": "Narração do bloco 1.",
        "slides": [{"title": "Slide 1"}],
    }
    session = RecordingSession([MappingResult([row])])
    repo = PersonalizacaoBlocosRepository(session)

    result = await repo.upsert_capitulo(
        job_id=JOB_ID,
        block_id="bloco-01",
        markdown="## Bloco 1\n\nConteúdo.",
        audio_script="Narração do bloco 1.",
        slides=[{"title": "Slide 1"}],
    )

    assert result["markdown"].startswith("## Bloco 1")
    assert result["slides"] == [{"title": "Slide 1"}]


@pytest.mark.asyncio
async def test_listar_por_job_retorna_todos_os_blocos():
    rows = [
        {"id": 1, "job_id": JOB_ID, "block_id": "bloco-01", "enriched_payload": {}, "markdown": "md1", "audio_script": "a1", "slides": []},
        {"id": 2, "job_id": JOB_ID, "block_id": "bloco-02", "enriched_payload": {}, "markdown": None, "audio_script": None, "slides": None},
    ]
    session = RecordingSession([MappingResult(rows)])
    repo = PersonalizacaoBlocosRepository(session)

    result = await repo.listar_por_job(job_id=JOB_ID)

    assert len(result) == 2
    assert result[0]["block_id"] == "bloco-01"
    assert result[1]["markdown"] is None
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd api && python -m pytest tests/test_personalizacao_blocos_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.repositories.personalizacao_blocos'`.

- [ ] **Step 3: Implementar o repositório**

Criar `api/app/repositories/personalizacao_blocos.py`:

```python
import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PersonalizacaoBlocosRepository:
    """Cache de conteudo por bloco, escopado a um job (ciclo de geracao).

    Nao guarda status proprio - quem decide o que ja rodou e o que falta e
    exclusivamente personalizacao_job_targets (os targets de
    enriquecimento/capitulo daquele block_id, no mesmo job_id). Esta tabela
    so segura o CONTEUDO produzido quando esses targets terminam completed.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _hydrate(row: dict[str, Any]) -> dict[str, Any]:
        item = dict(row)
        for field in ("enriched_payload", "slides"):
            value = item.get(field)
            if isinstance(value, str):
                try:
                    item[field] = json.loads(value)
                except (TypeError, ValueError):
                    item[field] = None
        return item

    async def upsert_enriquecimento(
        self,
        *,
        job_id: str,
        block_id: str,
        enriched_payload: dict[str, Any],
    ) -> dict[str, Any]:
        result = await self.session.execute(
            text(
                """
                INSERT INTO personalizacao_blocos_gerados (
                  job_id, block_id, enriched_payload, updated_at
                )
                VALUES (
                  CAST(:job_id AS UUID), :block_id, CAST(:enriched_payload AS JSONB), NOW()
                )
                ON CONFLICT (job_id, block_id) DO UPDATE
                SET enriched_payload = EXCLUDED.enriched_payload,
                    updated_at = NOW()
                RETURNING id, job_id, block_id, enriched_payload, markdown, audio_script, slides
                """
            ),
            {
                "job_id": job_id,
                "block_id": block_id,
                "enriched_payload": json.dumps(enriched_payload, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate(dict(result.mappings().one()))

    async def upsert_capitulo(
        self,
        *,
        job_id: str,
        block_id: str,
        markdown: str,
        audio_script: str,
        slides: list[dict[str, Any]],
    ) -> dict[str, Any]:
        result = await self.session.execute(
            text(
                """
                INSERT INTO personalizacao_blocos_gerados (
                  job_id, block_id, markdown, audio_script, slides, updated_at
                )
                VALUES (
                  CAST(:job_id AS UUID), :block_id, :markdown, :audio_script, CAST(:slides AS JSONB), NOW()
                )
                ON CONFLICT (job_id, block_id) DO UPDATE
                SET markdown = EXCLUDED.markdown,
                    audio_script = EXCLUDED.audio_script,
                    slides = EXCLUDED.slides,
                    updated_at = NOW()
                RETURNING id, job_id, block_id, enriched_payload, markdown, audio_script, slides
                """
            ),
            {
                "job_id": job_id,
                "block_id": block_id,
                "markdown": markdown,
                "audio_script": audio_script,
                "slides": json.dumps(slides, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate(dict(result.mappings().one()))

    async def listar_por_job(self, *, job_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, job_id, block_id, enriched_payload, markdown, audio_script, slides
                FROM personalizacao_blocos_gerados
                WHERE job_id = CAST(:job_id AS UUID)
                ORDER BY id ASC
                """
            ),
            {"job_id": job_id},
        )
        return [self._hydrate(dict(row)) for row in result.mappings()]
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd api && python -m pytest tests/test_personalizacao_blocos_repository.py -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add api/app/repositories/personalizacao_blocos.py api/tests/test_personalizacao_blocos_repository.py
git commit -m "feat(api): PersonalizacaoBlocosRepository - cache de conteudo por bloco"
```

---

## Task 7: Python — extrair `derive_base_blocks_and_topic`/`enrich_base_blocks` de `content_enrichment.py`

Refatoração mecânica (mover código, não reescrever lógica) de `enrich_content_blocks` para expor separadamente (a) a segmentação/agrupamento em blocos-base (barata, sem LLM, sempre determinística) e (b) o aprofundamento via LLM (Gemini com fallback OpenAI) — para poder chamar (b) só com o SUBCONJUNTO de blocos ainda não enriquecidos numa retentativa.

**Files:**
- Modify: `api/app/services/content_enrichment.py:1106-1200` (função `enrich_content_blocks`)
- Test: `api/tests/test_content_enrichment.py` (arquivo já existe — adicionar testes novos, não duplicar os existentes)

- [ ] **Step 1: Ler o teste existente de `enrich_content_blocks` para preservar o fixture**

Run: `cd api && grep -n "^def _context\|^async def test_enrich_content_blocks" tests/test_content_enrichment.py | head -5`
Anotar o nome exato do fixture/helper de contexto usado nos testes existentes (provavelmente `_context(...)`, já visto em uso por outros testes deste arquivo) — os testes novos abaixo devem reusar o MESMO helper, não recriar um fixture paralelo.

- [ ] **Step 2: Escrever os testes que falham**

Adicionar ao final de `api/tests/test_content_enrichment.py`:

```python
def test_derive_base_blocks_and_topic_e_deterministico_sem_llm():
    context = _context()
    base_blocks_1, topic_1, source_hash_1, segments_1 = content_enrichment.derive_base_blocks_and_topic(context)
    base_blocks_2, topic_2, source_hash_2, segments_2 = content_enrichment.derive_base_blocks_and_topic(context)

    assert [b["id"] for b in base_blocks_1] == [b["id"] for b in base_blocks_2]
    assert topic_1 == topic_2
    assert source_hash_1 == source_hash_2
    assert len(segments_1) == len(segments_2)
    assert all(b["id"].startswith("bloco-") for b in base_blocks_1)


@pytest.mark.asyncio
async def test_enrich_base_blocks_aceita_subconjunto_de_blocos(monkeypatch):
    context = _context()
    base_blocks, topic, source_hash, _segments = content_enrichment.derive_base_blocks_and_topic(context)
    assert len(base_blocks) >= 1
    subset = base_blocks[:1]

    async def fake_gemini(*, base_blocks, topic, source_hash, settings):
        assert [b["id"] for b in base_blocks] == [b["id"] for b in subset]
        return (
            [{**b, "conteudo_aprofundado": b["conteudo_base"] + " (aprofundado)"} for b in base_blocks],
            {"model": "fake-model", "models": ["fake-model"], "lotes_gerados": 1, "chamadas_realizadas": 1},
        )

    monkeypatch.setattr(content_enrichment, "_enrich_base_blocks_with_gemini", fake_gemini)

    blocks, metadata = await content_enrichment.enrich_base_blocks(
        base_blocks=subset,
        topic=topic,
        source_hash=source_hash,
        settings=_settings_with_gemini(),
    )

    assert len(blocks) == 1
    assert blocks[0]["id"] == subset[0]["id"]
    assert metadata["model"] == "fake-model"


@pytest.mark.asyncio
async def test_enrich_content_blocks_continua_equivalente_apos_refatoracao(monkeypatch):
    # Regressao: enrich_content_blocks precisa continuar se comportando
    # exatamente igual apos virar um wrapper de derive_base_blocks_and_topic
    # + enrich_base_blocks - mesmo formato de retorno, mesmos campos.
    context = _context()

    async def fake_gemini(*, base_blocks, topic, source_hash, settings):
        return (
            [{**b, "conteudo_aprofundado": b["conteudo_base"] + " (aprofundado)"} for b in base_blocks],
            {"model": "fake-model", "models": ["fake-model"], "lotes_gerados": 1, "chamadas_realizadas": 1},
        )

    monkeypatch.setattr(content_enrichment, "_enrich_base_blocks_with_gemini", fake_gemini)

    result = await content_enrichment.enrich_content_blocks(
        context=context,
        settings=_settings_with_gemini(),
    )

    assert result["schema_version"]
    assert isinstance(result["blocos"], list)
    assert len(result["blocos"]) >= 1
    assert result["metadata"]["enrichment_llm_provider"] == "gemini"
```

Notas: `_settings_with_gemini()` — se um helper equivalente já existir no arquivo (ex.: `_settings_with_openai()` já foi visto em uso), criar o par simétrico só com `gemini_api_key` preenchido; se `_context()` não for o nome exato do helper existente, ajustar as chamadas acima para o nome real encontrado no Step 1.

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd api && python -m pytest tests/test_content_enrichment.py -k "derive_base_blocks or enrich_base_blocks or continua_equivalente" -v`
Expected: FAIL — `AttributeError: module 'content_enrichment' has no attribute 'derive_base_blocks_and_topic'`.

- [ ] **Step 4: Extrair as duas funções**

Em `api/app/services/content_enrichment.py`, substituir a função `enrich_content_blocks` (linhas 1106-1200, do `async def enrich_content_blocks` até o fechamento do `return {...}`) por três funções: as duas novas extraídas + `enrich_content_blocks` reescrita como composição das duas.

```python
def derive_base_blocks_and_topic(
    context: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any], str, list[dict[str, Any]]]:
    """Segmentacao neutra e rastreavel - sem LLM, sempre deterministica pro
    mesmo context. Nenhum perfil BrainHex participa do agrupamento; assim os
    mesmos blocos-base atendem aos sete perfis. Retorna
    (base_blocks, topic_payload, source_hash, segments)."""
    segments = _source_segments(context)
    base_blocks = _group_segments(context, segments)
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    source_hash = str(context.get("source_hash") or "")
    topic_payload = {
        "titulo": _text(topic.get("nome") or topic.get("titulo")),
        "descricao": _text(topic.get("descricao")),
        "objetivo": _text(topic.get("objetivo")),
    }
    return base_blocks, topic_payload, source_hash, segments


async def enrich_base_blocks(
    *,
    base_blocks: list[dict[str, Any]],
    topic: dict[str, Any],
    source_hash: str,
    settings: Settings,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Aprofundamento curricular neutro de um conjunto (ou subconjunto, numa
    retentativa) de blocos-base. Gemini e o provedor PRINCIPAL, com fallback
    automatico pra OpenAI so quando o Gemini falhar. Retorna
    (blocks_aprofundados, provider_metadata_com_enrichment_llm_provider)."""
    openai_key = str(getattr(settings, "openai_api_key", "") or "").strip()
    gemini_key = str(getattr(settings, "gemini_api_key", "") or "").strip()
    if not openai_key and not gemini_key:
        raise ContentEnrichmentError(
            "GEMINI_API_KEY ausente: a API não pode dividir e aprofundar o conteúdo."
        )

    llm_provider = "gemini"
    gemini_error: ContentEnrichmentError | None = None
    blocks: list[dict[str, Any]] | None = None
    provider_metadata: dict[str, Any] = {}

    if gemini_key:
        try:
            blocks, provider_metadata = await _enrich_base_blocks_with_gemini(
                base_blocks=base_blocks,
                topic=topic,
                source_hash=source_hash,
                settings=settings,
            )
        except ContentEnrichmentError as exc:
            gemini_error = exc
            if not openai_key:
                raise
    else:
        gemini_error = ContentEnrichmentError(
            "GEMINI_API_KEY ausente: usando OpenAI como único provedor configurado."
        )

    if blocks is None:
        try:
            blocks, provider_metadata = await _enrich_base_blocks_with_openai(
                base_blocks=base_blocks,
                topic=topic,
                source_hash=source_hash,
                settings=settings,
            )
            llm_provider = "openai"
        except ContentEnrichmentError as openai_error:
            raise ContentEnrichmentError(
                "Gemini e OpenAI falharam ao aprofundar o conteúdo. "
                f"Gemini: {gemini_error}. OpenAI: {openai_error}"
            ) from openai_error

    provider_metadata = dict(provider_metadata)
    provider_metadata["enrichment_llm_provider"] = llm_provider
    provider_metadata["openai_fallback_used"] = llm_provider == "openai"
    provider_metadata["gemini_failure_reason"] = (
        _text(str(gemini_error)) if llm_provider == "openai" and gemini_error else ""
    )
    return blocks, provider_metadata


async def enrich_content_blocks(
    *,
    context: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Separa, aprofunda e só então libera blocos neutros para personalização."""
    base_blocks, topic_payload, source_hash, segments = derive_base_blocks_and_topic(context)
    blocks, provider_metadata = await enrich_base_blocks(
        base_blocks=base_blocks,
        topic=topic_payload,
        source_hash=source_hash,
        settings=settings,
    )
    return {
        "schema_version": _SCHEMA_VERSION,
        "source_hash": source_hash,
        "tema": _text(topic_payload.get("titulo")) or "Conteúdo de estudo",
        "blocos": blocks,
        "metadata": {
            "segmentos_origem": len(segments),
            "blocos_gerados": len(blocks),
            "fontes_cobertas": len({source_id for block in base_blocks for source_id in block.get("source_ids") or []}),
            "fallback": False,
            "provider": CONTENT_ENRICHMENT_PROVIDER,
            "division_provider": "api-deterministic",
            "enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
            "enrichment_llm_provider": provider_metadata["enrichment_llm_provider"],
            "openai_fallback_used": provider_metadata["openai_fallback_used"],
            "gemini_failure_reason": provider_metadata["gemini_failure_reason"],
            "personalization_applied": False,
            "pipeline_order": [
                "content_decomposition",
```

**Atenção:** o `return {...}` original de `enrich_content_blocks` continua depois de `"pipeline_order": [...]` (chaves adicionais não mostradas aqui — copiar o restante do dicionário original tal como está, sem alterar nenhum campo depois de `"content_decomposition",`). O objetivo desta etapa é só trocar de onde vêm `topic`/`llm_provider`/`gemini_error` (agora `topic_payload`/`provider_metadata[...]`), preservando cada chave existente do dicionário de retorno.

- [ ] **Step 5: Rodar TODOS os testes de `content_enrichment.py` (novos e existentes)**

Run: `cd api && python -m pytest tests/test_content_enrichment.py -v`
Expected: PASS em todos — os testes antigos de `enrich_content_blocks` continuam passando sem nenhuma alteração no comportamento observável, e os 3 novos do Step 2 também passam.

- [ ] **Step 6: Rodar a suíte completa da API pra garantir que nada mais quebrou**

Run: `cd api && python -m pytest -x -q`
Expected: PASS (nenhuma regressão em outros testes que dependem de `enrich_content_blocks`, ex. `test_personalizacao_service.py`).

- [ ] **Step 7: Commit**

```bash
git add api/app/services/content_enrichment.py api/tests/test_content_enrichment.py
git commit -m "refactor(api): extrai derive_base_blocks_and_topic/enrich_base_blocks de enrich_content_blocks

Permite aprofundar um SUBCONJUNTO de blocos (so os ainda nao enriquecidos
numa retentativa) sem duplicar a logica de fallback Gemini->OpenAI.
enrich_content_blocks vira so a composicao das duas, comportamento
identico (coberto pelos testes existentes + regressao nova)."
```

---

## Task 8: Python — clientes HTTP para os 3 endpoints granulares do microservice

Reaproveita `_regenerar_via_brainhex` (já existe em `media_agents.py`, é o motor genérico de POST-com-auth-e-error-sink usado pelos 3 clients de `/api/v1/regenerate/*`) — três funções finas, mesmo padrão de `regenerar_capitulo_brainhex`.

**Files:**
- Modify: `api/app/services/media_agents.py`
- Test: `api/tests/test_brainhex_generation.py`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `api/tests/test_brainhex_generation.py` (seguindo o padrão dos testes existentes de `regenerar_capitulo_brainhex` no mesmo arquivo — usar o mesmo helper de mock de `httpx.AsyncClient` já usado lá; se o arquivo usa `monkeypatch.setattr(media_agents.httpx, "AsyncClient", FakeAsyncClient)`, reaproveitar o mesmo `FakeAsyncClient`):

```python
@pytest.mark.asyncio
async def test_gerar_capitulo_bloco_brainhex_chama_endpoint_correto(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"success": True, "chapters": [{"blockId": "bloco-01", "markdown": "md", "audioScript": "audio", "slides": []}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json, headers):
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(media_agents.httpx, "AsyncClient", FakeClient)

    result = await media_agents.gerar_capitulo_bloco_brainhex(
        settings=_settings_with_brainhex(),
        content_blocks=[{"id": "bloco-01"}],
        profile="mastermind",
    )

    assert result["chapters"][0]["blockId"] == "bloco-01"
    assert captured["url"].endswith("/api/v1/generate/block")
    assert captured["json"]["contentBlocks"] == [{"id": "bloco-01"}]
    assert captured["json"]["profile"] == "mastermind"


@pytest.mark.asyncio
async def test_gerar_audio_parte_brainhex_chama_endpoint_correto(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"success": True, "url": "https://fake/audio.mp3", "storagePath": "path.mp3", "mimeType": "audio/mpeg"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json, headers):
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(media_agents.httpx, "AsyncClient", FakeClient)

    result = await media_agents.gerar_audio_parte_brainhex(
        settings=_settings_with_brainhex(),
        audio_script="roteiro",
        profile="mastermind",
        bucket="conteudo_aluno",
        storage_path="brainhex/mastermind/topico-1/audio/material-1-parte-01",
    )

    assert result["url"] == "https://fake/audio.mp3"
    assert captured["url"].endswith("/api/v1/generate/part-audio")


@pytest.mark.asyncio
async def test_gerar_apresentacao_parte_brainhex_chama_endpoint_correto(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"success": True, "url": "https://fake/apresentacao.html"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json, headers):
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(media_agents.httpx, "AsyncClient", FakeClient)

    result = await media_agents.gerar_apresentacao_parte_brainhex(
        settings=_settings_with_brainhex(),
        markdown="## Bloco\n\nConteúdo",
        topic="Bloco 1",
        profile="mastermind",
        bucket="conteudo_aluno",
        storage_path="brainhex/mastermind/topico-1/apresentacao/material-1-parte-01.html",
    )

    assert result["url"] == "https://fake/apresentacao.html"
    assert captured["url"].endswith("/api/v1/generate/part-presentation")
```

Se `_settings_with_brainhex()` ainda não existir no arquivo, criar um helper local equivalente aos já usados nos testes de `disparar_brainhex_async`/`regenerar_capitulo_brainhex` (que já constroem `Settings(...)` com `brainhex_api_url`/`brainhex_api_secret` preenchidos — usar exatamente o mesmo padrão já presente no arquivo).

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd api && python -m pytest tests/test_brainhex_generation.py -k "gerar_capitulo_bloco or gerar_audio_parte or gerar_apresentacao_parte" -v`
Expected: FAIL — `AttributeError: module 'media_agents' has no attribute 'gerar_capitulo_bloco_brainhex'`.

- [ ] **Step 3: Implementar os três clients**

Em `api/app/services/media_agents.py`, logo depois de `regenerar_slide_brainhex` (perto da linha 692) ou de qualquer outro `_regenerar_via_brainhex`-based client existente:

```python
async def gerar_capitulo_bloco_brainhex(
    *,
    settings: Settings,
    content_blocks: list[dict[str, Any]],
    profile: str,
    presentation_theme: dict[str, Any] | None = None,
    guidance_prompt: str | None = None,
    error_sink: list[str] | None = None,
) -> dict[str, Any] | None:
    """Gera o capitulo (markdown+audioScript+slides) de um subconjunto de
    blocos ja enriquecidos via POST /api/v1/generate/block (Fase A da
    geracao retomavel). Retorna {chapters: [...]} ou None em caso de falha."""
    return await _regenerar_via_brainhex(
        settings=settings,
        endpoint="/api/v1/generate/block",
        json_payload={
            "contentBlocks": content_blocks,
            "profile": str(profile or "").strip().lower(),
            "presentation_theme": presentation_theme,
            "guidance_prompt": guidance_prompt,
        },
        error_sink=error_sink,
    )


async def gerar_audio_parte_brainhex(
    *,
    settings: Settings,
    audio_script: str,
    profile: str,
    bucket: str,
    storage_path: str,
    error_sink: list[str] | None = None,
) -> dict[str, Any] | None:
    """Gera e sobe o audio de UMA parte de entrega via
    POST /api/v1/generate/part-audio (Fase B). Retorna
    {url, storagePath, mimeType} ou None em caso de falha."""
    return await _regenerar_via_brainhex(
        settings=settings,
        endpoint="/api/v1/generate/part-audio",
        json_payload={
            "audioScript": audio_script,
            "profile": str(profile or "").strip().lower(),
            "bucket": bucket,
            "storagePath": storage_path,
        },
        error_sink=error_sink,
    )


async def gerar_apresentacao_parte_brainhex(
    *,
    settings: Settings,
    markdown: str,
    topic: str,
    profile: str,
    bucket: str,
    storage_path: str,
    error_sink: list[str] | None = None,
) -> dict[str, Any] | None:
    """Renderiza e sobe a apresentacao de UMA parte de entrega via
    POST /api/v1/generate/part-presentation (Fase B). Retorna {url} ou None
    em caso de falha."""
    return await _regenerar_via_brainhex(
        settings=settings,
        endpoint="/api/v1/generate/part-presentation",
        json_payload={
            "markdown": markdown,
            "topic": topic,
            "profile": str(profile or "").strip().lower(),
            "bucket": bucket,
            "storagePath": storage_path,
        },
        error_sink=error_sink,
    )
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd api && python -m pytest tests/test_brainhex_generation.py -v`
Expected: PASS em todos (novos + existentes).

- [ ] **Step 5: Commit**

```bash
git add api/app/services/media_agents.py api/tests/test_brainhex_generation.py
git commit -m "feat(api): clients HTTP para os 3 endpoints granulares do microservice"
```

---

## Task 9: Python — módulo `media_generation_jobs.py` (orquestração completa)

O coração da retomada: cria a Fase A (targets de bloco), processa cada target chamando os clients do Task 8, cria a Fase B quando a Fase A completa, processa targets de parte, e finaliza o job. Fica num módulo próprio (não em `personalizacao_jobs.py`, que já é grande e genérico) porque esta lógica é específica de `kind=media_generation` e não se mistura com o modelo antigo de "1 target = 1 aluno×tópico pronto".

**Files:**
- Create: `api/app/services/media_generation_jobs.py`
- Test: `api/tests/test_media_generation_jobs.py`

- [ ] **Step 1: Escrever o teste da criação do ciclo (Fase A)**

Criar `api/tests/test_media_generation_jobs.py`:

```python
import pytest

from app.services import media_generation_jobs


class FakeJobsRepo:
    def __init__(self):
        self.jobs = {}
        self.targets = []
        self.created_job = None

    async def find_open_job_by_payload(self, **kwargs):
        for job in self.jobs.values():
            if job["status"] != "completed":
                return job
        return None

    async def criar_job(self, *, kind, classe_id, trigger_source, payload, aluno_id, topico_id, conteudo_id, total_targets, commit=True):
        job_id = "job-1"
        job = {
            "id": job_id, "kind": kind, "status": "pending", "classe_id": classe_id,
            "aluno_id": aluno_id, "topico_id": topico_id, "conteudo_id": conteudo_id,
            "payload": payload, "total_targets": total_targets,
        }
        self.jobs[job_id] = job
        self.created_job = job
        return job

    async def inserir_targets_media_generation(self, *, job_id, targets):
        self.targets.extend(targets)


@pytest.mark.asyncio
async def test_criar_ciclo_media_generation_cria_um_target_de_enriquecimento_e_capitulo_por_bloco():
    repo = FakeJobsRepo()
    base_blocks = [{"id": "bloco-01"}, {"id": "bloco-02"}]

    job = await media_generation_jobs.criar_ciclo_media_generation(
        jobs_repo=repo,
        classe_id=10,
        aluno_id="aluno-1",
        topico_id=100,
        conteudo_id=None,
        brainhex_profile_key="mastermind",
        ciclo_id="ciclo-abc",
        source_hash="hash-1",
        base_blocks=base_blocks,
        trigger_source="student_request",
    )

    assert job["kind"] == media_generation_jobs.JOB_KIND_MEDIA_GENERATION
    assert job["payload"]["ciclo_id"] == "ciclo-abc"
    assert job["payload"]["source_hash"] == "hash-1"
    assert job["payload"]["brainhex_profile_key"] == "mastermind"

    target_keys = {(t["media_kind"], t["block_id"]) for t in repo.targets}
    assert target_keys == {
        ("enriquecimento", "bloco-01"),
        ("capitulo", "bloco-01"),
        ("enriquecimento", "bloco-02"),
        ("capitulo", "bloco-02"),
    }


@pytest.mark.asyncio
async def test_criar_ciclo_media_generation_reaproveita_job_aberto_existente():
    repo = FakeJobsRepo()
    repo.jobs["job-existente"] = {
        "id": "job-existente", "kind": media_generation_jobs.JOB_KIND_MEDIA_GENERATION,
        "status": "partial", "payload": {"ciclo_id": "ciclo-antigo", "source_hash": "hash-1", "brainhex_profile_key": "mastermind"},
    }

    job = await media_generation_jobs.criar_ciclo_media_generation(
        jobs_repo=repo,
        classe_id=10,
        aluno_id="aluno-1",
        topico_id=100,
        conteudo_id=None,
        brainhex_profile_key="mastermind",
        ciclo_id="ciclo-novo-ignorado",
        source_hash="hash-1",
        base_blocks=[{"id": "bloco-01"}],
        trigger_source="student_request",
    )

    assert job["id"] == "job-existente"
    assert repo.created_job is None  # nao criou um job novo
    assert repo.targets == []  # nao recriou targets (ja existem)
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.media_generation_jobs'`.

- [ ] **Step 3: Implementar `criar_ciclo_media_generation` e a constante de kind**

Criar `api/app/services/media_generation_jobs.py`:

```python
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

JOB_KIND_MEDIA_GENERATION = "media_generation"

_BLOCK_MEDIA_KINDS = ("enriquecimento", "capitulo")
_PART_MEDIA_KINDS = ("audio", "apresentacao")


async def criar_ciclo_media_generation(
    *,
    jobs_repo: Any,
    classe_id: int,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None,
    brainhex_profile_key: str,
    ciclo_id: str,
    source_hash: str,
    base_blocks: list[dict[str, Any]],
    trigger_source: str,
) -> dict[str, Any]:
    """Busca um job media_generation aberto (status != completed) para o
    mesmo (classe, topico, conteudo, aluno, perfil, source_hash) e reaproveita
    - inclusive reabrindo um job failed. So cria um job novo (e os targets de
    Fase A, um enriquecimento + um capitulo por bloco) quando nao existe
    nenhum aberto ainda."""
    existing = await jobs_repo.find_open_job_by_payload(
        kind=JOB_KIND_MEDIA_GENERATION,
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        source_hash=source_hash,
        brainhex_profile_key=brainhex_profile_key,
    )
    if existing:
        logger.info(
            "media_generation: reaproveitando job aberto %s (status=%s)",
            existing["id"],
            existing.get("status"),
        )
        return existing

    job = await jobs_repo.criar_job(
        kind=JOB_KIND_MEDIA_GENERATION,
        classe_id=classe_id,
        trigger_source=trigger_source,
        payload={
            "ciclo_id": ciclo_id,
            "source_hash": source_hash,
            "brainhex_profile_key": brainhex_profile_key,
        },
        aluno_id=aluno_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        total_targets=len(base_blocks) * 2,
        commit=False,
    )

    targets = []
    for block in base_blocks:
        block_id = str(block["id"])
        for media_kind in _BLOCK_MEDIA_KINDS:
            targets.append({
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "brainhex_profile_key": brainhex_profile_key,
                "media_kind": media_kind,
                "block_id": block_id,
                "part_ordem": None,
                "status": "pending",
            })
    await jobs_repo.inserir_targets_media_generation(job_id=str(job["id"]), targets=targets)
    return job
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add api/app/services/media_generation_jobs.py api/tests/test_media_generation_jobs.py
git commit -m "feat(api): media_generation_jobs.criar_ciclo_media_generation - Fase A do ciclo"
```

- [ ] **Step 6: Escrever o teste do processamento de um target de bloco (enriquecimento e capítulo)**

Adicionar a `api/tests/test_media_generation_jobs.py`:

```python
class FakeBlocosRepo:
    def __init__(self):
        self.rows = {}

    async def upsert_enriquecimento(self, *, job_id, block_id, enriched_payload):
        row = self.rows.setdefault(block_id, {"block_id": block_id, "enriched_payload": None, "markdown": None, "audio_script": None, "slides": None})
        row["enriched_payload"] = enriched_payload
        return row

    async def upsert_capitulo(self, *, job_id, block_id, markdown, audio_script, slides):
        row = self.rows.setdefault(block_id, {"block_id": block_id, "enriched_payload": None, "markdown": None, "audio_script": None, "slides": None})
        row["markdown"] = markdown
        row["audio_script"] = audio_script
        row["slides"] = slides
        return row

    async def listar_por_job(self, *, job_id):
        return list(self.rows.values())


@pytest.mark.asyncio
async def test_processar_target_enriquecimento_persiste_e_nao_rechama_llm_se_ja_completo():
    blocos_repo = FakeBlocosRepo()
    chamadas = []

    async def fake_enrich_base_blocks(*, base_blocks, topic, source_hash, settings):
        chamadas.append([b["id"] for b in base_blocks])
        return [{**b, "conteudo_aprofundado": "aprofundado"} for b in base_blocks], {"model": "fake"}

    target = {"id": 1, "block_id": "bloco-01", "media_kind": "enriquecimento"}
    base_blocks_by_id = {"bloco-01": {"id": "bloco-01", "conteudo_base": "base"}}

    ok = await media_generation_jobs.processar_target_enriquecimento(
        blocos_repo=blocos_repo,
        job_id="job-1",
        target=target,
        base_blocks_by_id=base_blocks_by_id,
        topic={"titulo": "T"},
        source_hash="hash-1",
        settings=object(),
        enrich_base_blocks_fn=fake_enrich_base_blocks,
    )

    assert ok is True
    assert blocos_repo.rows["bloco-01"]["enriched_payload"]["conteudo_aprofundado"] == "aprofundado"
    assert chamadas == [["bloco-01"]]


@pytest.mark.asyncio
async def test_processar_target_capitulo_persiste_markdown_audio_slides():
    blocos_repo = FakeBlocosRepo()
    blocos_repo.rows["bloco-01"] = {
        "block_id": "bloco-01",
        "enriched_payload": {"id": "bloco-01", "tema": "Redes"},
        "markdown": None, "audio_script": None, "slides": None,
    }

    async def fake_gerar_capitulo_bloco_brainhex(*, settings, content_blocks, profile, presentation_theme=None, guidance_prompt=None, error_sink=None):
        return {"chapters": [{"blockId": "bloco-01", "markdown": "## Bloco\n\nTexto", "audioScript": "Narração", "slides": [{"title": "S1"}]}]}

    target = {"id": 2, "block_id": "bloco-01", "media_kind": "capitulo"}

    ok = await media_generation_jobs.processar_target_capitulo(
        blocos_repo=blocos_repo,
        job_id="job-1",
        target=target,
        profile="mastermind",
        settings=object(),
        gerar_capitulo_fn=fake_gerar_capitulo_bloco_brainhex,
    )

    assert ok is True
    assert blocos_repo.rows["bloco-01"]["markdown"] == "## Bloco\n\nTexto"
    assert blocos_repo.rows["bloco-01"]["slides"] == [{"title": "S1"}]


@pytest.mark.asyncio
async def test_processar_target_capitulo_falha_quando_bloco_nao_enriquecido():
    blocos_repo = FakeBlocosRepo()
    target = {"id": 2, "block_id": "bloco-nunca-enriquecido", "media_kind": "capitulo"}

    with pytest.raises(media_generation_jobs.MediaGenerationTargetError):
        await media_generation_jobs.processar_target_capitulo(
            blocos_repo=blocos_repo,
            job_id="job-1",
            target=target,
            profile="mastermind",
            settings=object(),
            gerar_capitulo_fn=None,
        )
```

- [ ] **Step 7: Rodar os testes e confirmar que falham**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -k "processar_target" -v`
Expected: FAIL — `AttributeError: module 'media_generation_jobs' has no attribute 'processar_target_enriquecimento'`.

- [ ] **Step 8: Implementar `processar_target_enriquecimento` e `processar_target_capitulo`**

Adicionar a `api/app/services/media_generation_jobs.py`:

```python
class MediaGenerationTargetError(RuntimeError):
    """Erro definitivo ao processar um target de bloco/parte - o worker
    decide status (pending pra retry, ou failed se esgotou tentativas) a
    partir disto, igual ja faz para os outros kinds de job."""


async def processar_target_enriquecimento(
    *,
    blocos_repo: Any,
    job_id: str,
    target: dict[str, Any],
    base_blocks_by_id: dict[str, dict[str, Any]],
    topic: dict[str, Any],
    source_hash: str,
    settings: Any,
    enrich_base_blocks_fn: Any,
) -> bool:
    """Aprofunda SO o bloco deste target (mesmo function que enriquecimento
    em lote usa, chamada com um subconjunto de 1 bloco - retomada de outros
    blocos ja completos fica a cargo de quem monta a lista de targets
    pendentes antes de chegar aqui, nao desta funcao)."""
    block_id = str(target["block_id"])
    base_block = base_blocks_by_id.get(block_id)
    if base_block is None:
        raise MediaGenerationTargetError(
            f"bloco {block_id} nao encontrado nos blocos-base derivados do contexto atual"
        )
    blocks, _metadata = await enrich_base_blocks_fn(
        base_blocks=[base_block],
        topic=topic,
        source_hash=source_hash,
        settings=settings,
    )
    if not blocks:
        raise MediaGenerationTargetError(f"enriquecimento nao retornou resultado para {block_id}")
    await blocos_repo.upsert_enriquecimento(
        job_id=job_id,
        block_id=block_id,
        enriched_payload=blocks[0],
    )
    return True


async def processar_target_capitulo(
    *,
    blocos_repo: Any,
    job_id: str,
    target: dict[str, Any],
    profile: str,
    settings: Any,
    gerar_capitulo_fn: Any,
) -> bool:
    """Gera o capitulo (markdown+audioScript+slides) do bloco deste target -
    exige que o enriquecimento daquele bloco ja esteja persistido (Fase A
    processa enriquecimento antes de capitulo, por bloco - ver orquestracao
    em processar_job_media_generation_once)."""
    block_id = str(target["block_id"])
    rows = await blocos_repo.listar_por_job(job_id=job_id)
    cached = next((r for r in rows if r["block_id"] == block_id), None)
    if not cached or not cached.get("enriched_payload"):
        raise MediaGenerationTargetError(
            f"bloco {block_id} ainda nao tem enriquecimento persistido - target de capitulo nao pode rodar antes"
        )
    result = await gerar_capitulo_fn(
        settings=settings,
        content_blocks=[cached["enriched_payload"]],
        profile=profile,
    )
    chapters = (result or {}).get("chapters") or []
    chapter = next((c for c in chapters if c.get("blockId") == block_id), None)
    if not chapter:
        raise MediaGenerationTargetError(f"geracao de capitulo nao retornou resultado para {block_id}")
    await blocos_repo.upsert_capitulo(
        job_id=job_id,
        block_id=block_id,
        markdown=str(chapter.get("markdown") or ""),
        audio_script=str(chapter.get("audioScript") or ""),
        slides=chapter.get("slides") or [],
    )
    return True
```

- [ ] **Step 9: Rodar os testes e confirmar que passam**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -v`
Expected: PASS em todos (5 testes até aqui).

- [ ] **Step 10: Commit**

```bash
git add api/app/services/media_generation_jobs.py api/tests/test_media_generation_jobs.py
git commit -m "feat(api): processar_target_enriquecimento/processar_target_capitulo (Fase A)"
```

- [ ] **Step 11: Escrever o teste da transição Fase A → Fase B e dos targets de parte**

Adicionar a `api/tests/test_media_generation_jobs.py`:

```python
class FakeJobsRepoComTargets(FakeJobsRepo):
    def __init__(self, targets):
        super().__init__()
        self._targets = targets
        self.inseridos_fase_b = []

    async def get_targets(self, job_id):
        return self._targets

    async def inserir_targets_media_generation(self, *, job_id, targets):
        self.inseridos_fase_b.extend(targets)
        self._targets.extend(targets)


def test_fase_b_nao_e_criada_com_bloco_de_capitulo_ainda_pendente():
    targets = [
        {"id": 1, "media_kind": "capitulo", "block_id": "bloco-01", "status": "completed"},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-02", "status": "pending"},
    ]
    assert media_generation_jobs.fase_a_completa(targets) is False


def test_fase_b_e_criada_quando_todos_os_capitulos_completam():
    targets = [
        {"id": 1, "media_kind": "capitulo", "block_id": "bloco-01", "status": "completed"},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-02", "status": "completed"},
        {"id": 3, "media_kind": "enriquecimento", "block_id": "bloco-01", "status": "completed"},
    ]
    assert media_generation_jobs.fase_a_completa(targets) is True


@pytest.mark.asyncio
async def test_criar_targets_fase_b_um_audio_e_uma_apresentacao_por_parte():
    repo = FakeJobsRepoComTargets(targets=[])

    await media_generation_jobs.criar_targets_fase_b(
        jobs_repo=repo,
        job_id="job-1",
        aluno_id="aluno-1",
        topico_id=100,
        conteudo_id=None,
        brainhex_profile_key="mastermind",
        total_partes=2,
    )

    keys = {(t["media_kind"], t["part_ordem"]) for t in repo.inseridos_fase_b}
    assert keys == {("audio", 1), ("apresentacao", 1), ("audio", 2), ("apresentacao", 2)}


@pytest.mark.asyncio
async def test_processar_target_audio_persiste_url_na_parte():
    partes_persistidas = []

    async def fake_persistir_parte(*, media_kind, ordem, url, storage_path):
        partes_persistidas.append((media_kind, ordem, url))

    async def fake_gerar_audio_fn(*, settings, audio_script, profile, bucket, storage_path):
        return {"url": "https://fake/audio.mp3", "storagePath": storage_path, "mimeType": "audio/mpeg"}

    target = {"id": 10, "media_kind": "audio", "part_ordem": 1}

    ok = await media_generation_jobs.processar_target_audio(
        target=target,
        audio_script_by_ordem={1: "roteiro da parte 1"},
        profile="mastermind",
        bucket="conteudo_aluno",
        storage_path_prefix="brainhex/mastermind/topico-1/audio/material-1",
        settings=object(),
        gerar_audio_fn=fake_gerar_audio_fn,
        persistir_parte_fn=fake_persistir_parte,
    )

    assert ok is True
    assert partes_persistidas == [("audio", 1, "https://fake/audio.mp3")]
```

- [ ] **Step 12: Rodar os testes e confirmar que falham**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -k "fase_a_completa or fase_b or processar_target_audio" -v`
Expected: FAIL — `AttributeError: module 'media_generation_jobs' has no attribute 'fase_a_completa'`.

- [ ] **Step 13: Implementar `fase_a_completa`, `criar_targets_fase_b`, `processar_target_audio`, `processar_target_apresentacao`**

Adicionar a `api/app/services/media_generation_jobs.py`:

```python
def fase_a_completa(targets: list[dict[str, Any]]) -> bool:
    """True quando TODOS os targets de capitulo (a etapa mais tardia da Fase
    A - cada capitulo so roda depois do enriquecimento do mesmo bloco) estao
    completed. Fase B (por parte) so pode ser criada nesse momento, porque
    splitProcessedContentIntoParts opera sobre o markdown CONSOLIDADO de
    todos os blocos."""
    capitulo_targets = [t for t in targets if t.get("media_kind") == "capitulo"]
    if not capitulo_targets:
        return False
    return all(t.get("status") == "completed" for t in capitulo_targets)


async def criar_targets_fase_b(
    *,
    jobs_repo: Any,
    job_id: str,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None,
    brainhex_profile_key: str,
    total_partes: int,
) -> None:
    targets = []
    for ordem in range(1, total_partes + 1):
        for media_kind in _PART_MEDIA_KINDS:
            targets.append({
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "brainhex_profile_key": brainhex_profile_key,
                "media_kind": media_kind,
                "block_id": None,
                "part_ordem": ordem,
                "status": "pending",
            })
    await jobs_repo.inserir_targets_media_generation(job_id=job_id, targets=targets)


async def processar_target_audio(
    *,
    target: dict[str, Any],
    audio_script_by_ordem: dict[int, str],
    profile: str,
    bucket: str,
    storage_path_prefix: str,
    settings: Any,
    gerar_audio_fn: Any,
    persistir_parte_fn: Any,
) -> bool:
    ordem = int(target["part_ordem"])
    audio_script = audio_script_by_ordem.get(ordem)
    if not audio_script:
        raise MediaGenerationTargetError(f"parte {ordem} sem audioScript disponivel para gerar audio")
    suffix = f"-parte-{ordem:02d}" if len(audio_script_by_ordem) > 1 else ""
    result = await gerar_audio_fn(
        settings=settings,
        audio_script=audio_script,
        profile=profile,
        bucket=bucket,
        storage_path=f"{storage_path_prefix}{suffix}",
    )
    if not result or not result.get("url"):
        raise MediaGenerationTargetError(f"geracao de audio nao retornou url para a parte {ordem}")
    await persistir_parte_fn(
        media_kind="audio",
        ordem=ordem,
        url=result["url"],
        storage_path=result.get("storagePath"),
    )
    return True


async def processar_target_apresentacao(
    *,
    target: dict[str, Any],
    markdown_by_ordem: dict[int, str],
    titulo_by_ordem: dict[int, str],
    profile: str,
    bucket: str,
    storage_path_prefix: str,
    settings: Any,
    gerar_apresentacao_fn: Any,
    persistir_parte_fn: Any,
) -> bool:
    ordem = int(target["part_ordem"])
    markdown = markdown_by_ordem.get(ordem)
    if not markdown:
        raise MediaGenerationTargetError(f"parte {ordem} sem markdown disponivel para gerar apresentacao")
    suffix = f"-parte-{ordem:02d}" if len(markdown_by_ordem) > 1 else ""
    result = await gerar_apresentacao_fn(
        settings=settings,
        markdown=markdown,
        topic=titulo_by_ordem.get(ordem, "Aula"),
        profile=profile,
        bucket=bucket,
        storage_path=f"{storage_path_prefix}{suffix}.html",
    )
    if not result or not result.get("url"):
        raise MediaGenerationTargetError(f"geracao de apresentacao nao retornou url para a parte {ordem}")
    await persistir_parte_fn(
        media_kind="apresentacao",
        ordem=ordem,
        url=result["url"],
        storage_path=None,
    )
    return True
```

- [ ] **Step 14: Rodar os testes e confirmar que passam**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -v`
Expected: PASS em todos (9 testes até aqui).

- [ ] **Step 15: Commit**

```bash
git add api/app/services/media_generation_jobs.py api/tests/test_media_generation_jobs.py
git commit -m "feat(api): transicao Fase A -> Fase B e processamento de targets de parte"
```

---

## Task 10: Python — extensão de `PersonalizacaoJobsRepository` para targets granulares

O `inserir_targets` existente é específico do modelo antigo (upsert por aluno×tópico×conteúdo×perfil). Os targets granulares (bloco/parte) usam identidade diferente — método novo, sem tocar no existente. `get_targets` ganha as 3 colunas novas (nullable, não quebra leitores existentes).

**Files:**
- Modify: `api/app/repositories/personalizacao_jobs.py`
- Test: `api/tests/test_repositories.py`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `api/tests/test_repositories.py` (no mesmo estilo dos testes de `PersonalizacaoJobsRepository` já existentes no arquivo, usando `RecordingSession`/`MappingResult`/`DummyResult` já definidos no topo):

```python
@pytest.mark.asyncio
async def test_inserir_targets_media_generation_grava_media_kind_block_id_part_ordem():
    session = RecordingSession([DummyResult(), DummyResult()])
    repo = PersonalizacaoJobsRepository(session)

    await repo.inserir_targets_media_generation(
        job_id="job-1",
        targets=[
            {
                "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None,
                "brainhex_profile_key": "mastermind", "media_kind": "enriquecimento",
                "block_id": "bloco-01", "part_ordem": None, "status": "pending",
            },
        ],
    )

    sql, params = session.calls[0]
    assert "INSERT INTO personalizacao_job_targets" in sql
    assert "media_kind" in sql
    assert "block_id" in sql
    assert "part_ordem" in sql
    assert params["media_kind"] == "enriquecimento"
    assert params["block_id"] == "bloco-01"
    assert params["part_ordem"] is None


@pytest.mark.asyncio
async def test_get_targets_inclui_colunas_granulares():
    row = {
        "id": 1, "job_id": "job-1", "aluno_id": "aluno-1", "topico_id": 100,
        "conteudo_id": None, "brainhex_profile_key": "mastermind", "is_profile_template": False,
        "status": "completed", "attempts": 1, "last_error": None, "personalizacao_id": None,
        "created_at": None, "updated_at": None, "media_kind": "capitulo", "block_id": "bloco-01", "part_ordem": None,
    }
    session = RecordingSession([MappingResult([row])])
    repo = PersonalizacaoJobsRepository(session)

    targets = await repo.get_targets("job-1")

    assert targets[0]["media_kind"] == "capitulo"
    assert targets[0]["block_id"] == "bloco-01"
    sql, _params = session.calls[0]
    assert "media_kind" in sql
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd api && python -m pytest tests/test_repositories.py -k "media_generation or granulares" -v`
Expected: FAIL — `AttributeError: 'PersonalizacaoJobsRepository' object has no attribute 'inserir_targets_media_generation'` / `assert "media_kind" in sql` falha (query atual não seleciona essas colunas).

- [ ] **Step 3: Adicionar `inserir_targets_media_generation` e estender `get_targets`**

Em `api/app/repositories/personalizacao_jobs.py`, adicionar depois de `inserir_targets` (linha ~347):

```python
    async def inserir_targets_media_generation(
        self,
        *,
        job_id: str,
        targets: list[dict[str, Any]],
    ) -> None:
        """INSERT simples (sem upsert) para targets granulares (bloco/parte)
        de um job kind=media_generation. Diferente de inserir_targets: a
        identidade aqui inclui media_kind/block_id/part_ordem (indice unico
        parcial uq_job_target_granular garante nao duplicar), e estes
        targets sao sempre criados uma unica vez por job (Fase A na criacao
        do ciclo, Fase B na transicao) - nao ha cenario de "job antigo
        reenviando os mesmos targets" que justifique um upsert aqui."""
        if not targets:
            return
        if not await self._targets_exists():
            raise RuntimeError("Tabela personalizacao_job_targets indisponivel.")

        for target in targets:
            await self.session.execute(
                text(
                    """
                    INSERT INTO personalizacao_job_targets (
                      job_id,
                      aluno_id,
                      topico_id,
                      conteudo_id,
                      brainhex_profile_key,
                      media_kind,
                      block_id,
                      part_ordem,
                      status,
                      attempts,
                      created_at,
                      updated_at
                    )
                    VALUES (
                      CAST(:job_id AS UUID),
                      CAST(:aluno_id AS UUID),
                      :topico_id,
                      :conteudo_id,
                      :brainhex_profile_key,
                      :media_kind,
                      :block_id,
                      :part_ordem,
                      :status,
                      0,
                      NOW(),
                      NOW()
                    )
                    ON CONFLICT DO NOTHING
                    """
                ),
                {
                    "job_id": job_id,
                    "aluno_id": target["aluno_id"],
                    "topico_id": int(target["topico_id"]),
                    "conteudo_id": target.get("conteudo_id"),
                    "brainhex_profile_key": str(target.get("brainhex_profile_key") or "mastermind").strip().lower(),
                    "media_kind": target["media_kind"],
                    "block_id": target.get("block_id"),
                    "part_ordem": target.get("part_ordem"),
                    "status": target.get("status", "pending"),
                },
            )

        await self.session.execute(
            text(
                """
                UPDATE personalizacao_jobs
                SET total_targets = (
                  SELECT COUNT(*) FROM personalizacao_job_targets WHERE job_id = CAST(:job_id AS UUID)
                ),
                    updated_at = NOW()
                WHERE id = CAST(:job_id AS UUID)
                """
            ),
            {"job_id": job_id},
        )
        await self.session.commit()
```

Em seguida, no método `get_targets` (linha ~570), acrescentar `media_kind, block_id, part_ordem` ao `SELECT`:

```python
    async def get_targets(self, job_id: str) -> list[dict[str, Any]]:
        if not await self._targets_exists():
            return []
        result = await self.session.execute(
            text(
                """
                SELECT
                  id,
                  job_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  brainhex_profile_key,
                  is_profile_template,
                  status,
                  attempts,
                  last_error,
                  personalizacao_id,
                  created_at,
                  updated_at,
                  media_kind,
                  block_id,
                  part_ordem
                FROM personalizacao_job_targets
                WHERE job_id = CAST(:job_id AS UUID)
                ORDER BY id ASC
                """
            ),
            {"job_id": job_id},
        )
        return [dict(row) for row in result.mappings()]
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd api && python -m pytest tests/test_repositories.py -v`
Expected: PASS em todos (novos + existentes — `get_targets` mudou de SELECT, então rodar o arquivo inteiro confirma que nenhum teste existente dependia da lista antiga de colunas).

- [ ] **Step 5: Commit**

```bash
git add api/app/repositories/personalizacao_jobs.py api/tests/test_repositories.py
git commit -m "feat(api): inserir_targets_media_generation + get_targets expõe colunas granulares"
```

---

## Task 11: Python — orquestrador do job inteiro (`processar_job_media_generation_once`)

Junta tudo dos Tasks 6-10 num único ponto de entrada, análogo ao branch de `JOB_KIND_CLASS_THEME` já existente em `process_personalizacao_job_once` — processa todos os targets pendentes do job (Fase A e, quando aplicável, Fase B), decide a transição de fase, e devolve o status final agregado.

**Files:**
- Modify: `api/app/services/media_generation_jobs.py`
- Test: `api/tests/test_media_generation_jobs.py`

- [ ] **Step 1: Escrever o teste de ponta-a-ponta do orquestrador (com Fase A completa disparando Fase B)**

Adicionar a `api/tests/test_media_generation_jobs.py`:

```python
class FakeJobsRepoCompleto:
    def __init__(self, targets, job):
        self.targets = targets
        self.job = job
        self.status_updates = []
        self.finalized = None

    async def get_targets(self, job_id):
        return self.targets

    async def update_target_status(self, *, target_id, status, attempts=None, last_error=None, personalizacao_id=None):
        self.status_updates.append((target_id, status))
        for t in self.targets:
            if t["id"] == target_id:
                t["status"] = status

    async def inserir_targets_media_generation(self, *, job_id, targets):
        next_id = max((t["id"] for t in self.targets), default=0) + 1
        for t in targets:
            t["id"] = next_id
            next_id += 1
        self.targets.extend(targets)

    async def finalize_job(self, *, job_id, status, last_error=None):
        self.finalized = status
        return {**self.job, "status": status}


@pytest.mark.asyncio
async def test_processar_job_media_generation_once_completa_fase_a_e_cria_fase_b():
    job = {"id": "job-1", "payload": {"ciclo_id": "c1", "source_hash": "h1", "brainhex_profile_key": "mastermind"}}
    targets = [
        {"id": 1, "media_kind": "enriquecimento", "block_id": "bloco-01", "status": "pending", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-01", "status": "pending", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
    ]
    repo = FakeJobsRepoCompleto(targets, job)
    blocos_repo = FakeBlocosRepo()
    base_blocks_by_id = {"bloco-01": {"id": "bloco-01", "conteudo_base": "base"}}

    async def fake_enrich(*, base_blocks, topic, source_hash, settings):
        return [{**b, "conteudo_aprofundado": "aprofundado"} for b in base_blocks], {}

    async def fake_gerar_capitulo(*, settings, content_blocks, profile, presentation_theme=None, guidance_prompt=None, error_sink=None):
        return {"chapters": [{"blockId": "bloco-01", "markdown": "## Bloco\n\nTexto", "audioScript": "Narração", "slides": []}]}

    result = await media_generation_jobs.processar_job_media_generation_once(
        jobs_repo=repo,
        blocos_repo=blocos_repo,
        job=job,
        base_blocks_by_id=base_blocks_by_id,
        topic={"titulo": "T"},
        profile="mastermind",
        settings=object(),
        max_retries=3,
        total_partes_calculator=lambda blocos_repo_rows: 1,
        enrich_base_blocks_fn=fake_enrich,
        gerar_capitulo_fn=fake_gerar_capitulo,
        gerar_audio_fn=None,
        gerar_apresentacao_fn=None,
        bucket="conteudo_aluno",
        storage_path_prefix="brainhex/mastermind/topico-100",
    )

    assert result["fase_b_criada"] is True
    assert any(t["media_kind"] == "audio" for t in repo.targets)
    assert any(t["media_kind"] == "apresentacao" for t in repo.targets)
    assert targets[0]["status"] == "completed"
    assert targets[1]["status"] == "completed"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -k "completa_fase_a_e_cria_fase_b" -v`
Expected: FAIL — `AttributeError: module 'media_generation_jobs' has no attribute 'processar_job_media_generation_once'`.

- [ ] **Step 3: Implementar `processar_job_media_generation_once`**

Adicionar a `api/app/services/media_generation_jobs.py`:

```python
async def processar_job_media_generation_once(
    *,
    jobs_repo: Any,
    blocos_repo: Any,
    job: dict[str, Any],
    base_blocks_by_id: dict[str, dict[str, Any]],
    topic: dict[str, Any],
    profile: str,
    settings: Any,
    max_retries: int,
    total_partes_calculator: Any,
    enrich_base_blocks_fn: Any,
    gerar_capitulo_fn: Any,
    gerar_audio_fn: Any,
    gerar_apresentacao_fn: Any,
    bucket: str,
    storage_path_prefix: str,
) -> dict[str, Any]:
    """Processa todos os targets PENDENTES do job (Fase A e, se ja aplicavel,
    Fase B), cria a Fase B quando a Fase A acabou de completar, e devolve um
    resumo (sem finalizar o job - quem chama decide o status agregado, igual
    ja acontece pros outros kinds em process_personalizacao_job_once)."""
    job_id = str(job["id"])
    payload = job.get("payload") or {}
    source_hash = str(payload.get("source_hash") or "")
    targets = await jobs_repo.get_targets(job_id)
    errors = 0
    fase_b_criada = False

    pendentes = [t for t in targets if t.get("status") not in ("completed", "skipped", "failed")]
    for target in pendentes:
        attempts = int(target.get("attempts") or 0) + 1
        try:
            if target["media_kind"] == "enriquecimento":
                await processar_target_enriquecimento(
                    blocos_repo=blocos_repo,
                    job_id=job_id,
                    target=target,
                    base_blocks_by_id=base_blocks_by_id,
                    topic=topic,
                    source_hash=source_hash,
                    settings=settings,
                    enrich_base_blocks_fn=enrich_base_blocks_fn,
                )
            elif target["media_kind"] == "capitulo":
                await processar_target_capitulo(
                    blocos_repo=blocos_repo,
                    job_id=job_id,
                    target=target,
                    profile=profile,
                    settings=settings,
                    gerar_capitulo_fn=gerar_capitulo_fn,
                )
            elif target["media_kind"] == "audio":
                # audio_script_by_ordem/markdown/titulo_by_ordem sao resolvidos
                # pelo chamador (personalizacao_jobs.py) antes de invocar este
                # orquestrador, a partir do markdown consolidado da Fase A -
                # ver Task 12. Aqui so repassa o resultado ja calculado via
                # closures capturadas em gerar_audio_fn/gerar_apresentacao_fn.
                await processar_target_audio(
                    target=target,
                    audio_script_by_ordem=payload.get("_audio_script_by_ordem", {}),
                    profile=profile,
                    bucket=bucket,
                    storage_path_prefix=storage_path_prefix,
                    settings=settings,
                    gerar_audio_fn=gerar_audio_fn,
                    persistir_parte_fn=payload.get("_persistir_parte_fn"),
                )
            elif target["media_kind"] == "apresentacao":
                await processar_target_apresentacao(
                    target=target,
                    markdown_by_ordem=payload.get("_markdown_by_ordem", {}),
                    titulo_by_ordem=payload.get("_titulo_by_ordem", {}),
                    profile=profile,
                    bucket=bucket,
                    storage_path_prefix=storage_path_prefix,
                    settings=settings,
                    gerar_apresentacao_fn=gerar_apresentacao_fn,
                    persistir_parte_fn=payload.get("_persistir_parte_fn"),
                )
            await jobs_repo.update_target_status(target_id=int(target["id"]), status="completed", attempts=attempts)
        except MediaGenerationTargetError as exc:
            status = "pending" if attempts < max_retries else "failed"
            await jobs_repo.update_target_status(target_id=int(target["id"]), status=status, attempts=attempts, last_error=str(exc))
            if status == "failed":
                errors += 1

    refreshed_targets = await jobs_repo.get_targets(job_id)
    ja_tem_fase_b = any(t.get("media_kind") in _PART_MEDIA_KINDS for t in refreshed_targets)
    if not ja_tem_fase_b and fase_a_completa(refreshed_targets):
        total_partes = total_partes_calculator(refreshed_targets)
        await criar_targets_fase_b(
            jobs_repo=jobs_repo,
            job_id=job_id,
            aluno_id=str(refreshed_targets[0]["aluno_id"]),
            topico_id=int(refreshed_targets[0]["topico_id"]),
            conteudo_id=refreshed_targets[0].get("conteudo_id"),
            brainhex_profile_key=str(payload.get("brainhex_profile_key") or "mastermind"),
            total_partes=total_partes,
        )
        fase_b_criada = True

    return {"errors": errors, "fase_b_criada": fase_b_criada}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -v`
Expected: PASS em todos (10 testes até aqui).

- [ ] **Step 5: Commit**

```bash
git add api/app/services/media_generation_jobs.py api/tests/test_media_generation_jobs.py
git commit -m "feat(api): processar_job_media_generation_once - orquestrador completo do ciclo"
```

**Nota de simplificação assumida neste task:** os campos `_audio_script_by_ordem`/`_markdown_by_ordem`/`_titulo_by_ordem`/`_persistir_parte_fn` em `payload` são um atalho pra manter este teste isolado sem precisar simular o pipeline de split inteiro. O Task 12 (wiring real em `personalizacao_jobs.py`) substitui esse atalho por dados reais: monta esses dicionários a partir do markdown/audioScript consolidados dos blocos da Fase A (via `splitProcessedContentIntoParts`-equivalente, reaproveitando a MESMA função de split que o microservice já usa — ver decisão do spec de manter parte de entrega no formato atual) antes de chamar `processar_job_media_generation_once`, e `persistir_parte_fn` vira uma função real que escreve em `conteudo_personalizado.materiais.<kind>.partes[]` via `mergePersonalizacaoMateriais`-equivalente do lado Python (`MateriaisRepository`, já importado em `personalizacao_jobs.py`).

---

## Task 12: Python — wiring em `process_personalizacao_job_once` e `personalizar()`

Liga tudo à fila real: novo branch de `kind=media_generation` no loop existente, e `personalizar()` passa a enfileirar em vez de gerar tudo inline.

**Files:**
- Modify: `api/app/services/personalizacao_jobs.py`
- Modify: `api/app/api/v1/personalizacao.py:1298-1464` (`personalizar()`)
- Test: `api/tests/test_personalizacao_jobs_loop.py`
- Test: `api/tests/test_api.py`

- [ ] **Step 1: Escrever o teste de que `personalizar()` reaproveita um ciclo `failed` em vez de reiniciar do zero**

Adicionar a `api/tests/test_api.py`, próximo ao teste existente `test_personalizar_route_reusa_ciclo_existente_sem_regenerar` (usar os mesmos fixtures/overrides desse teste como referência de setup):

```python
@pytest.mark.asyncio
async def test_personalizar_route_reaproveita_job_media_generation_failed_sem_reenriquecer(
    client, aluno_user, monkeypatch,
):
    # Setup espelha test_personalizar_route_reusa_ciclo_existente_sem_regenerar,
    # mas o registro existente tem status "failed" (nao "pronto"/"processando_midias")
    # e SOURCE_HASH IGUAL - antes desta mudanca, isso disparava um ciclo novo do
    # zero (novo enrich_content_blocks, novos cards). Agora deve reaproveitar o
    # job media_generation aberto e NAO rechamar enrich_content_blocks.
    calls = {"enrich": 0}

    async def fake_enrich_content_blocks(*, context, settings):
        calls["enrich"] += 1
        return {"blocos": [{"id": "bloco-01"}], "schema_version": 1}

    monkeypatch.setattr(
        "app.api.v1.personalizacao.enrich_content_blocks",
        fake_enrich_content_blocks,
    )
    # ... (restante do setup: override_session com FakeSession pré-carregada
    # com um registro conteudo_personalizado status=failed e um job
    # media_generation aberto com o mesmo source_hash - seguir exatamente o
    # padrao de mock de sessão/override já usado no teste de reuso vizinho
    # neste arquivo, adaptando os dados retornados pelos mocks de
    # ConteudoPersonalizadoRepository/PersonalizacaoJobsRepository).

    # Asserção principal desta migração: enrich_content_blocks NÃO é
    # chamado de novo quando já existe job aberto pro mesmo source_hash.
    assert calls["enrich"] == 0
```

**Nota:** este teste depende do setup completo (fixtures de sessão/mocks) já presente no arquivo para `test_personalizar_route_reusa_ciclo_existente_sem_regenerar` — antes de escrever a versão final, ler esse teste vizinho por completo (`grep -n "test_personalizar_route_reusa_ciclo_existente_sem_regenerar" -A 80 api/tests/test_api.py`) e replicar exatamente o padrão de mock ali usado, só trocando o status do registro existente para `"failed"` e adicionando o mock do job `media_generation` aberto.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd api && python -m pytest tests/test_api.py -k "reaproveita_job_media_generation_failed" -v`
Expected: FAIL — `calls["enrich"] == 1` (comportamento atual sempre reenriquece).

- [ ] **Step 3: Adicionar o branch `JOB_KIND_MEDIA_GENERATION` em `process_personalizacao_job_once`**

Em `api/app/services/personalizacao_jobs.py`, importar o novo módulo no topo. A linha existente `from app.services.media_agents import brainhex_contract_ready, disparar_brainhex_async` (linha 26) precisa ganhar os 3 novos clients do Task 8 junto:

```python
from app.repositories.personalizacao_blocos import PersonalizacaoBlocosRepository
from app.services.content_enrichment import derive_base_blocks_and_topic, enrich_base_blocks
from app.services.media_agents import (
    brainhex_contract_ready,
    disparar_brainhex_async,
    gerar_apresentacao_parte_brainhex,
    gerar_audio_parte_brainhex,
    gerar_capitulo_bloco_brainhex,
)
from app.services.media_generation_jobs import (
    JOB_KIND_MEDIA_GENERATION,
    processar_job_media_generation_once,
)
```

(Substituir a linha de import existente de `media_agents` por esta versão ampliada, em vez de duplicá-la.)

Adicionar, logo depois do branch `if job["kind"] == JOB_KIND_CLASS_THEME:` (linha ~1716) e antes de `async with session_factory() as session:` que carrega os targets genéricos:

```python
    if job["kind"] == JOB_KIND_MEDIA_GENERATION:
        async with session_factory() as session:
            jobs_repo = PersonalizacaoJobsRepository(session)
            blocos_repo = PersonalizacaoBlocosRepository(session)
            try:
                payload = job.get("payload") or {}
                ctx = await fetch_personalizacao_context(
                    aluno_id=str(job["aluno_id"]),
                    classe_id=int(job["classe_id"]),
                    topico_id=job.get("topico_id"),
                    conteudo_id=job.get("conteudo_id"),
                    settings=app.state.settings,
                    session=session,
                )
                base_blocks, topic_payload, _source_hash, _segments = derive_base_blocks_and_topic(ctx)
                base_blocks_by_id = {str(b["id"]): b for b in base_blocks}
                outcome = await processar_job_media_generation_once(
                    jobs_repo=jobs_repo,
                    blocos_repo=blocos_repo,
                    job=job,
                    base_blocks_by_id=base_blocks_by_id,
                    topic=topic_payload,
                    profile=str(payload.get("brainhex_profile_key") or "mastermind"),
                    settings=app.state.settings,
                    max_retries=int(app.state.settings.personalizacao_job_max_retries),
                    total_partes_calculator=lambda _targets: 1,
                    enrich_base_blocks_fn=enrich_base_blocks,
                    gerar_capitulo_fn=gerar_capitulo_bloco_brainhex,
                    gerar_audio_fn=gerar_audio_parte_brainhex,
                    gerar_apresentacao_fn=gerar_apresentacao_parte_brainhex,
                    bucket=BUCKET,
                    storage_path_prefix=f"brainhex/{payload.get('brainhex_profile_key')}/classe-{job['classe_id']}/topico-{job.get('topico_id')}",
                )
                refreshed = await jobs_repo.refresh_job_counters(str(job["id"]))
                targets = await jobs_repo.get_targets(str(job["id"]))
                has_failed = any(t.get("status") == "failed" for t in targets)
                has_pending = any(t.get("status") not in TARGET_DONE_STATES for t in targets)
                final_status = "completed"
                if has_failed or has_pending:
                    final_status = "partial"
                if has_failed and refreshed and int(refreshed.get("processed_targets") or 0) == int(refreshed.get("error_count") or 0):
                    final_status = "failed"
                if final_status == "completed":
                    await jobs_repo.finalize_job(job_id=str(job["id"]), status="completed", last_error=None)
            except Exception as exc:
                logger.exception("Falha ao processar job media_generation", extra={"job_id": str(job.get("id"))})
                await session.rollback()
                await jobs_repo.finalize_job(job_id=str(job["id"]), status="failed", last_error=str(exc))
        return True
```

**Nota de escopo explícita:** o wiring de `_audio_script_by_ordem`/`_markdown_by_ordem`/`_persistir_parte_fn` (ver nota de simplificação do Task 11) e a persistência final em `conteudo_personalizado.materiais` (equivalente a `mergePersonalizacaoMateriais` do lado Python, usando `MateriaisRepository` já importado neste arquivo) ficam como próximo passo imediato depois deste task — o código acima cobre a Fase A completa (enriquecimento+capítulo por bloco, retomável) e a transição pra Fase B, mas a persistência final do merge em `conteudo_personalizado` para os targets de parte precisa da função `persistir_parte_fn` real, que grava em `materiais.<kind>.partes[]` no mesmo formato que `microservice/src/services/supabaseService.ts::mergePersonalizacaoMateriais` já usa (ver `MaterialPart`). Adicionar esse fechamento como Task 12b antes de considerar este plano encerrado — não implementado neste task para manter o wiring de Fase A/transição revisável e testável isoladamente primeiro.

- [ ] **Step 4: Reescrever `personalizar()` para enfileirar em vez de gerar inline**

Em `api/app/api/v1/personalizacao.py`, substituir o trecho entre `# Evita reprocessar do zero...` (linha ~1318) e o `return _to_response(record)` final (linha ~1464) — a lógica de reuso baseada só em `status in {"pronto","processando_midias"}` (linhas 1318-1344) e a criação inline de enriquecimento/cards/registro/dispatch (linhas 1346-1455) — por:

```python
    from app.services.media_generation_jobs import criar_ciclo_media_generation
    from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
    from app.services.content_enrichment import derive_base_blocks_and_topic

    jobs_repo = PersonalizacaoJobsRepository(session)
    base_blocks, _topic_payload, _source_hash, _segments = derive_base_blocks_and_topic(ctx)

    job = await criar_ciclo_media_generation(
        jobs_repo=jobs_repo,
        classe_id=payload.classe_id,
        aluno_id=aluno_id,
        topico_id=int(resolved_topico_id) if resolved_topico_id is not None else 0,
        conteudo_id=resolved_conteudo_id,
        brainhex_profile_key=brainhex_profile_key,
        ciclo_id=ctx["ciclo_id"],
        source_hash=str(ctx.get("source_hash") or ""),
        base_blocks=base_blocks,
        trigger_source="student_request",
    )

    personalizacao_repo = ConteudoPersonalizadoRepository(session)
    ciclo_id_efetivo = str(job["payload"].get("ciclo_id") or ctx["ciclo_id"])
    record = await personalizacao_repo.buscar_por_ciclo_id(aluno_id=aluno_id, ciclo_id=ciclo_id_efetivo)
    if not record:
        record_id = await personalizacao_repo.salvar(
            aluno_id=aluno_id,
            classe_id=payload.classe_id,
            topico_id=int(resolved_topico_id) if resolved_topico_id is not None else None,
            conteudo_id=int(resolved_conteudo_id) if resolved_conteudo_id is not None else None,
            ciclo_id=ciclo_id_efetivo,
            plano={
                "perfil_dominante": ctx.get("perfil_dominante"),
                "brainhex_profile_key": brainhex_profile_key,
            },
            materiais={},
            ai_patch=None,
            status="processando_midias",
            source_hash=ctx["source_hash"],
            formato_prioritario="cards",
            formatos_gerados=[],
        )
        record = await personalizacao_repo.buscar_por_id(record_id)

    logger.info(
        "personalizacao.output=%s",
        {"aluno_id": aluno_id, **_summarize_personalizacao_record(record)},
    )
    return _to_response(record)
```

**Nota de escopo:** este step remove `gerar_cards_direto`/`enrich_content_blocks`/`_asyncio.create_task(disparar_brainhex_async(...))` da rota `personalizar()` — cards e enriquecimento passam a rodar dentro do worker de fila (`personalizacao_jobs_loop`), não mais de forma síncrona/inline na resposta HTTP. Isso muda a latência percebida da rota (responde mais rápido, mas o conteúdo demora o mesmo tempo total pra ficar pronto, processado em background pelo worker — poll de 5s, ver spec). Cards ficam FORA do escopo deste plano (não migrados para dentro de `media_generation_jobs.py` ainda — continuam não sendo gerados por este fluxo até um follow-up dedicado); sinalizar isso ao revisar antes de mergear, caso cards sejam um requisito bloqueante de UX no curto prazo.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd api && python -m pytest tests/test_api.py tests/test_personalizacao_jobs_loop.py -v`
Expected: PASS no teste novo do Step 1. Testes antigos que dependiam do comportamento inline de `personalizar()` (geração síncrona de cards, chamada direta a `disparar_brainhex_async`) provavelmente PRECISAM ser atualizados nesta mesma etapa — rodar a suíte completa (`cd api && python -m pytest -x -q`) e ajustar qualquer teste existente que quebrou por causa da mudança de comportamento, um por um, até a suíte inteira passar.

- [ ] **Step 6: Commit**

```bash
git add api/app/services/personalizacao_jobs.py api/app/api/v1/personalizacao.py api/tests/test_api.py api/tests/test_personalizacao_jobs_loop.py
git commit -m "feat(api): personalizar() enfileira em kind=media_generation em vez de gerar inline

Reaproveita job aberto (inclusive failed) pro mesmo source_hash em vez de
sempre abrir um ciclo novo - a causa raiz do desperdicio de tokens em
retentativas. Cards ficam fora deste corte (follow-up dedicado)."
```

---

## Task 13: Teste de regressão — retomada não regasta o que já funcionou

Teste de integração (com mocks nos limites externos: Gemini via `enrich_base_blocks_fn`/`gerar_capitulo_fn`, microservice via `gerar_audio_fn`/`gerar_apresentacao_fn`) simulando exatamente o cenário relatado: falha só na apresentação, retentativa não rechama LLM pro que já deu certo.

**Files:**
- Test: `api/tests/test_media_generation_jobs.py`

- [ ] **Step 1: Escrever o teste**

Adicionar a `api/tests/test_media_generation_jobs.py`:

```python
@pytest.mark.asyncio
async def test_retentativa_apos_falha_so_na_apresentacao_nao_rechama_enriquecimento_nem_capitulo():
    job = {"id": "job-1", "payload": {"ciclo_id": "c1", "source_hash": "h1", "brainhex_profile_key": "mastermind"}}
    targets = [
        {"id": 1, "media_kind": "enriquecimento", "block_id": "bloco-01", "status": "completed", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-01", "status": "completed", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 3, "media_kind": "audio", "block_id": None, "part_ordem": 1, "status": "completed", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 4, "media_kind": "apresentacao", "block_id": None, "part_ordem": 1, "status": "pending", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
    ]
    repo = FakeJobsRepoCompleto(targets, job)
    blocos_repo = FakeBlocosRepo()
    blocos_repo.rows["bloco-01"] = {
        "block_id": "bloco-01", "enriched_payload": {"id": "bloco-01"},
        "markdown": "## Bloco\n\nTexto", "audio_script": "Narração", "slides": [],
    }

    chamadas_enrich = []
    chamadas_capitulo = []
    chamadas_apresentacao = []

    async def fake_enrich(*, base_blocks, topic, source_hash, settings):
        chamadas_enrich.append(base_blocks)
        raise AssertionError("nao deveria ser chamado - bloco ja enriquecido")

    async def fake_gerar_capitulo(*, settings, content_blocks, profile, presentation_theme=None, guidance_prompt=None, error_sink=None):
        chamadas_capitulo.append(content_blocks)
        raise AssertionError("nao deveria ser chamado - capitulo ja gerado")

    async def fake_gerar_apresentacao(*, settings, markdown, topic, profile, bucket, storage_path):
        chamadas_apresentacao.append(markdown)
        return {"url": "https://fake/apresentacao.html"}

    persistido = []

    async def fake_persistir_parte(*, media_kind, ordem, url, storage_path):
        persistido.append((media_kind, ordem, url))

    job["payload"]["_markdown_by_ordem"] = {1: "## Bloco\n\nTexto"}
    job["payload"]["_titulo_by_ordem"] = {1: "Bloco"}
    job["payload"]["_persistir_parte_fn"] = fake_persistir_parte

    result = await media_generation_jobs.processar_job_media_generation_once(
        jobs_repo=repo,
        blocos_repo=blocos_repo,
        job=job,
        base_blocks_by_id={"bloco-01": {"id": "bloco-01", "conteudo_base": "base"}},
        topic={"titulo": "T"},
        profile="mastermind",
        settings=object(),
        max_retries=3,
        total_partes_calculator=lambda targets: 1,
        enrich_base_blocks_fn=fake_enrich,
        gerar_capitulo_fn=fake_gerar_capitulo,
        gerar_audio_fn=None,
        gerar_apresentacao_fn=fake_gerar_apresentacao,
        bucket="conteudo_aluno",
        storage_path_prefix="brainhex/mastermind/topico-100",
    )

    assert chamadas_enrich == []
    assert chamadas_capitulo == []
    assert chamadas_apresentacao == ["## Bloco\n\nTexto"]
    assert persistido == [("apresentacao", 1, "https://fake/apresentacao.html")]
    assert targets[3]["status"] == "completed"
```

- [ ] **Step 2: Rodar o teste**

Run: `cd api && python -m pytest tests/test_media_generation_jobs.py -k "retentativa_apos_falha_so_na_apresentacao" -v`
Expected: PASS — se `chamadas_enrich`/`chamadas_capitulo` não estiverem vazios, o teste falha explicitamente com `AssertionError` dentro do próprio fake, provando a regressão que motivou este plano inteiro.

- [ ] **Step 3: Rodar a suíte completa da API**

Run: `cd api && python -m pytest -x -q`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/tests/test_media_generation_jobs.py
git commit -m "test(api): regressao - retentativa nao rechama LLM para blocos/partes ja completos"
```

---

## Pendências explícitas fora deste plano (registrar antes de finalizar a branch)

1. ~~**Task 12b**~~ — **RESOLVIDO.** `process_personalizacao_job_once` (kind=`media_generation`) busca o registro `conteudo_personalizado` do ciclo, consolida markdown/audioScript dos blocos completos da Fase A (`consolidar_partes_a_partir_dos_blocos`), monta um `persistir_parte_fn` real (`persistir_parte_em_materiais`) para os targets de áudio/apresentação, e sobe+persiste o material de markdown (via novo `SupabaseStorage.upload_bytes`) uma única vez quando a Fase B é criada. Também corrigido en passant: `processar_target_audio`/`processar_target_apresentacao` não incluíam a subpasta `audio/`/`apresentacao/` no storage path — ambos os media_kinds escreveriam sob o mesmo prefixo. Coberto por teste de integração leve do wiring completo (claim → contexto → orquestrador → finalize) em `test_personalizacao_jobs_loop.py`.
2. **Cards** (`gerar_cards_direto`) ficaram fora do fluxo de `personalizar()` neste corte — decidir se voltam como um `media_kind` granular próprio ou se continuam gerados de outra forma.
3. **Migração de dados em voo** (ver spec, seção "Riscos"): ciclos `failed` anteriores a este deploy não têm targets granulares — comportamento aceito é começarem do zero na próxima tentativa, sem retomada (não é regressão, é o comportamento atual preservado só para esses registros legados).
4. ~~Rodar a suíte `microservice` completa (lint + test) e a suíte `api` completa uma última vez~~ — **FEITO**: `api` 355/355, `microservice` lint limpo + 217/217.
5. **Granularidade de parte fixa em 1** (`total_partes_calculator=lambda _targets: 1` e `consolidar_partes_a_partir_dos_blocos` sempre produz uma única parte): tópicos muito grandes que precisariam de múltiplas partes de entrega (o motivo original de `splitProcessedContentIntoParts` existir no microservice — limite de upload do Storage) não são resplitados aqui. Documentos muito grandes continuam funcionando (sobem como um arquivo só), mas sem o particionamento por tamanho que o microservice já implementa. Reimplementar esse resplitamento em Python (ou delegar a um endpoint do microservice) fica como follow-up caso vire um problema real em produção.
6. **Teste manual ponta-a-ponta** (herdado do handoff original desta sessão): confirmar no app mobile que a apresentação abre o HTML do BrainHexPDF, agora que a config local (`.env` do microservice e do BrainHexPDF) foi corrigida — não executado nesta sessão por exigir o app mobile rodando interativamente.

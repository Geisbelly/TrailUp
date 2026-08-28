# Regeração granular — Plano A: os defeitos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a regeração chegar ao aluno e afetar só o material que o professor pediu.

**Architecture:** Cada material ganha `revisao` (inteiro), incrementado quando aquele material é regerado. O mobile passa a versionar a URL de cache com o mesmo conceito que o console já usa (`materialCacheVersion`), agora incluindo `revisao`. O endpoint de documento deixa de escrever no roteiro do áudio.

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy Core (`text()`) · pytest · React Native (Expo) · TypeScript · `node --test` + tsx (mobile) · vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-08-28-regeneracao-granular-design.md`

---

## Por que este plano é só metade

O spec cobre duas naturezas diferentes: **defeitos** (o aluno não recebe o material regerado; regerar texto mexe no áudio) e **feature** (cinco eixos de parâmetro, preservação por parte).

Este é o plano dos defeitos. Ele entrega valor sozinho — regeração passa a funcionar como já era prometido — e não depende da feature. O Plano B (parâmetros) depende **deste**, porque precisa saber qual endpoint recebe quais parâmetros, e isso só fica definido depois da separação da Task 3.

## Ordem e por quê

A Task 1 (`revisao` no back) vem antes da Task 2 (mobile), porque o mobile precisa do campo existindo para versionar. A Task 3 (desacoplamento) é independente das duas, mas vem depois porque a Task 1 já mexe no mesmo endpoint — fazer as duas no mesmo arquivo em sequência evita conflito de contexto.

**A regeração de áudio que produz `.mp3` novo NÃO está aqui.** Ela é o item mais caro do spec, mexe no microservice (outro runtime, outra linguagem) e depende de cota de TTS que hoje está estourada. Ela tem plano próprio — ver "Fora deste plano" no fim.

---

## Task 1: `revisao` por material, incrementado na regeração

**Files:**
- Create: `api/app/services/material_revisao.py`
- Create: `api/tests/test_material_revisao.py`
- Modify: `api/app/api/v1/personalizacao.py` (dentro de `regenerar_documento_personalizacao`)

Não há migração: `revisao` mora dentro do JSONB `materiais`, ao lado de `metadata` e `payload`. Material antigo sem o campo é tratado como revisão 1.

- [ ] **Step 1: Escrever o teste que falha**

Create `api/tests/test_material_revisao.py`:

```python
from app.services.material_revisao import incrementar_revisao, revisao_atual


def test_material_sem_campo_conta_como_revisao_1():
    # Todo material gerado antes desta mudanca nao tem `revisao`. Tratar
    # ausencia como 0 faria a primeira regeracao gravar 1, que e' igual ao
    # que o mobile ja teria em cache -- e o aluno continuaria preso.
    assert revisao_atual({"payload": {"markdown": "x"}}) == 1


def test_incremento_preserva_o_resto_do_material():
    material = {
        "payload": {"markdown": "antigo"},
        "metadata": {"status": "pronto"},
        "arquivo_url": "https://exemplo/a.md",
    }

    novo = incrementar_revisao(material)

    assert novo["revisao"] == 2
    assert novo["payload"] == {"markdown": "antigo"}
    assert novo["metadata"] == {"status": "pronto"}
    assert novo["arquivo_url"] == "https://exemplo/a.md"


def test_incremento_nao_muta_o_original():
    # A regeracao usa copy.deepcopy dos materiais antes de mexer; esta funcao
    # nao pode depender disso para estar correta.
    material = {"revisao": 3}
    novo = incrementar_revisao(material)
    assert material["revisao"] == 3
    assert novo["revisao"] == 4


def test_valor_invalido_nao_derruba_a_regeracao():
    # `revisao` e' escrito por nos, mas materiais sao JSONB e ja acumularam
    # formatos de varias versoes do pipeline. Um valor sujo nao pode
    # impedir o professor de regerar.
    for sujo in ("abc", None, [], {}, -5):
        assert incrementar_revisao({"revisao": sujo})["revisao"] == 2


def test_material_ausente_vira_material_novo():
    assert incrementar_revisao(None) == {"revisao": 2}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_material_revisao.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.material_revisao'`

- [ ] **Step 3: Implementar**

Create `api/app/services/material_revisao.py`:

```python
"""Contador de revisao por material.

Existe porque o cache do mobile e' chaveado pela URL, e a regeracao faz
UPDATE in place sem trocar `source_hash` -- entao o caminho no Storage
(que embute `generation-<source_hash>`) continua o mesmo e o arquivo local
nunca e' rebaixado. `revisao` da ao cliente um sinal de mudanca que NAO
depende de mexer no source_hash, que governa a dedup de geracao e nao pode
virar gatilho de cache.

Vive dentro do JSONB `materiais.<tipo>`, ao lado de `payload`/`metadata`,
e e' por MATERIAL: regerar o texto nao pode invalidar audio e apresentacao.
"""

from typing import Any

_REVISAO_INICIAL = 1


def revisao_atual(material: dict[str, Any] | None) -> int:
    """Revisao do material, com 1 para o que foi gerado antes deste campo.

    Ausencia conta como 1, nao 0: se contasse 0, a primeira regeracao
    gravaria 1 -- que e' exatamente o que o cliente ja teria assumido para
    o material antigo, e o cache nao invalidaria.
    """
    if not isinstance(material, dict):
        return _REVISAO_INICIAL
    valor = material.get("revisao")
    if isinstance(valor, bool) or not isinstance(valor, int) or valor < 1:
        return _REVISAO_INICIAL
    return valor


def incrementar_revisao(material: dict[str, Any] | None) -> dict[str, Any]:
    """Devolve uma COPIA do material com a revisao seguinte."""
    base = dict(material) if isinstance(material, dict) else {}
    base["revisao"] = revisao_atual(material) + 1
    return base
```

Nota sobre `isinstance(valor, bool)`: em Python `True` é `int`, e `True >= 1`. Sem esse guard, um `revisao: true` no JSONB passaria como revisão 1.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_material_revisao.py -v`
Expected: PASS — 5 testes

- [ ] **Step 5: Ligar na regeração de documento**

Em `api/app/api/v1/personalizacao.py`, dentro de `regenerar_documento_personalizacao`, trocar:

```python
    materiais_atualizados = copy.deepcopy(materiais)
    materiais_atualizados.setdefault("markdown", {}).setdefault("payload", {})["markdown"] = (
        resultado.get("markdown", markdown_atual)
    )
```

por:

```python
    materiais_atualizados = copy.deepcopy(materiais)
    markdown_material = materiais_atualizados.setdefault("markdown", {})
    markdown_material.setdefault("payload", {})["markdown"] = (
        resultado.get("markdown", markdown_atual)
    )
    # Sinaliza ao cliente que este material mudou. Sem isto o mobile mantem
    # o arquivo em cache para sempre: a URL nao muda (o caminho embute
    # generation-<source_hash>, que a regeracao nao toca) e o cache nunca
    # revalida.
    materiais_atualizados["markdown"] = incrementar_revisao(markdown_material)
```

Adicionar o import junto aos demais de `app.services`:

```python
from app.services.material_revisao import incrementar_revisao
```

- [ ] **Step 6: Escrever o teste do endpoint**

Append em `api/tests/test_material_revisao.py`:

```python
def test_endpoint_de_documento_incrementa_a_revisao_do_markdown() -> None:
    import inspect

    from app.api.v1 import personalizacao

    fonte = inspect.getsource(personalizacao.regenerar_documento_personalizacao)
    assert "incrementar_revisao(markdown_material)" in fonte
    # A revisao e' do markdown; o audio tem a dele (Task 3).
    assert 'materiais_atualizados["markdown"] = incrementar_revisao' in fonte
```

- [ ] **Step 7: Rodar a suíte e commitar**

Run: `cd api && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check app tests`
Expected: PASS, `All checks passed!`

```bash
git add api/app/services/material_revisao.py api/tests/test_material_revisao.py api/app/api/v1/personalizacao.py
git commit -m "feat(regeracao): revisao por material para invalidar o cache do cliente"
```

---

## Task 2: Mobile versiona a URL de cache

**Files:**
- Create: `mobile/src/utils/materialCacheVersion.ts`
- Create: `mobile/src/utils/materialCacheVersion.test.ts`
- Modify: `mobile/src/components/DocumentBlock.tsx:964`
- Modify: `mobile/src/context/TrilhaContext.tsx:267`

O console já resolve isto com `materialCacheVersion`/`versionedMaterialUrl` (`frontend/src/components/console/personalizacoes/materialPreview.ts`). Este passo porta o conceito, acrescentando `revisao`.

- [ ] **Step 1: Escrever o teste que falha**

Create `mobile/src/utils/materialCacheVersion.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { materialCacheVersion, versionedCacheKey } from "./materialCacheVersion";

test("versao usa revisao, generation_key e updated_at juntos", () => {
  assert.equal(
    materialCacheVersion({
      revisao: 3,
      metadata: { generation_key: "abc", updated_at: "2026-08-28T04:00:00Z" },
    }),
    "r3|abc|2026-08-28T04:00:00Z",
  );
});

test("material antigo sem revisao conta como r1", () => {
  assert.equal(materialCacheVersion({ metadata: { generation_key: "abc" } }), "r1|abc");
});

test("devolve so a revisao quando nao ha mais nada", () => {
  assert.equal(materialCacheVersion({}), "r1");
  assert.equal(materialCacheVersion(null), "r1");
});

test("chave compoe url e versao", () => {
  assert.equal(versionedCacheKey("https://x/a.mp3", { revisao: 2 }), "https://x/a.mp3#r2");
});

test("chaves diferentes para revisoes diferentes da MESMA url", () => {
  // E o ponto inteiro: a URL nao muda quando o professor regenera.
  const url = "https://x/generation-abc/audio.mp3";
  assert.notEqual(
    versionedCacheKey(url, { revisao: 1 }),
    versionedCacheKey(url, { revisao: 2 }),
  );
});

test("url vazia continua vazia, sem sufixo solto", () => {
  assert.equal(versionedCacheKey("", { revisao: 2 }), "");
});
```

> **O `npm test` do mobile lista os arquivos UM A UM** (ver `mobile/package.json`).
> Um teste novo não roda até ser acrescentado lá — e passaria despercebido como
> "suíte verde". O próximo passo cuida disso.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd mobile && npx tsx --test src/utils/materialCacheVersion.test.ts`
Expected: FAIL — `Cannot find module './materialCacheVersion'`

- [ ] **Step 3: Implementar**

Create `mobile/src/utils/materialCacheVersion.ts`:

```typescript
// Versao de cache de um material personalizado.
//
// O cache nativo (nativeContentCache.ts) e' chaveado pela URL e NUNCA
// revalida: se o arquivo local existe, ele e' devolvido. A unica expiracao
// e' `lastAccessedAt > 3 dias`, e esse campo e' renovado a cada acesso --
// entao material que o aluno usa nunca expira.
//
// Ao mesmo tempo, a regeracao no console faz UPDATE in place sem trocar
// `source_hash`, e o caminho no Storage embute `generation-<source_hash>`.
// A URL, portanto, nao muda. Sem esta versao na chave, o aluno fica com o
// material antigo para sempre.
//
// O console ja faz o equivalente em
// frontend/src/components/console/personalizacoes/materialPreview.ts
// (materialCacheVersion/versionedMaterialUrl). Aqui a mesma ideia, mais
// `revisao`, que e' o sinal que a regeracao incrementa.

type MaterialLike = Record<string, unknown> | null | undefined;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function revisao(material: MaterialLike): number {
  const valor = material?.revisao;
  // Ausencia conta como 1, igual ao back (material_revisao.py): material
  // gerado antes deste campo e' a revisao 1, nao a zero.
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1) return 1;
  return valor;
}

/** Identificador que muda sempre que o material muda. */
export function materialCacheVersion(material: MaterialLike): string {
  const metadata =
    material && typeof material.metadata === "object" && material.metadata
      ? (material.metadata as Record<string, unknown>)
      : {};

  const partes = [
    `r${revisao(material)}`,
    texto(metadata.generation_key) ?? texto(material?.generation_key),
    texto(metadata.updated_at) ?? texto(material?.updated_at),
  ].filter((parte): parte is string => Boolean(parte));

  return partes.join("|");
}

/**
 * Chave de cache da URL, versionada.
 *
 * Usa `#` porque o fragmento nao vai para o servidor: a chave muda sem
 * alterar a requisicao. Query string (`?v=`) tambem funcionaria, mas o
 * Storage do Supabase assina URLs com query, e concatenar ali arriscaria
 * quebrar assinatura.
 */
export function versionedCacheKey(url: string, material: MaterialLike): string {
  const base = texto(url);
  if (!base) return "";
  return `${base}#${materialCacheVersion(material)}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd mobile && npx tsx --test src/utils/materialCacheVersion.test.ts`
Expected: PASS — 6 testes

- [ ] **Step 5: Registrar o teste no `npm test` do mobile**

O script `test` de `mobile/package.json` enumera cada arquivo. Um teste que não
estiver na lista **nunca roda**, e a suíte segue verde mentindo. Acrescentar
`src/utils/materialCacheVersion.test.ts` à lista, mantendo a ordem alfabética
aproximada dos vizinhos em `src/utils/`.

Run: `cd mobile && npm test 2>&1 | grep -c materialCacheVersion`
Expected: maior que 0 — o arquivo aparece na execução

- [ ] **Step 6: Usar no DocumentBlock**

Em `mobile/src/components/DocumentBlock.tsx`, linha 964, trocar:

```typescript
    const cacheKey = sourceUrl?.trim() || resolvedUrl;
```

por:

```typescript
    // Versionado: a URL sozinha nao muda quando o professor regenera o
    // material, e o cache nativo nunca revalida. Ver materialCacheVersion.ts.
    const cacheKey = versionedCacheKey(sourceUrl?.trim() || resolvedUrl, material);
```

Adicionar o import no topo do arquivo:

```typescript
import { versionedCacheKey } from "@/utils/materialCacheVersion";
```

Confirmar que existe uma variável `material` em escopo nesse ponto:

Run: `cd mobile && grep -n "material" src/components/DocumentBlock.tsx | sed -n '1,20p'`
Expected: uma prop ou variável com o material. Se o componente receber só `sourceUrl`/`tipo` sem o objeto do material, passe `revisao` como prop nova a partir de quem o renderiza e use `versionedCacheKey(url, { revisao })`.

- [ ] **Step 7: Usar no prefetch**

Em `mobile/src/context/TrilhaContext.tsx`, no laço de prefetch (linha ~267), trocar:

```typescript
      await ensureCachedNativeContent(
        `${entry.key}:${entry.url}`,
        entry.url,
        { extensionHint: entry.hint ?? undefined }
      );
```

por:

```typescript
      await ensureCachedNativeContent(
        `${entry.key}:${versionedCacheKey(entry.url, entry.material)}`,
        entry.url,
        { extensionHint: entry.hint ?? undefined }
      );
```

Isso exige que `PrefetchEntry` carregue o material. Em `collectPrefetchEntries`, acrescentar o campo ao tipo e ao `pushUrl`:

```typescript
type PrefetchEntry = {
  url: string;
  hint: string | null | undefined;
  key: string;
  material: Record<string, unknown> | null;
};

const pushUrl = (
  url: unknown,
  hint: string | null | undefined,
  key: string,
  material: Record<string, unknown> | null,
) => {
  if (typeof url !== 'string' || !isUrl(url)) return;
  const utilizavel = buildSupabasePublicStorageUrl(url);
  entries.push({ url: utilizavel, hint, key, material });
};
```

e no `handleBlock`, passar o bloco como material:

```typescript
    pushUrl(url, String(block.tipo ?? ''), `${keyPrefix}:${block.id ?? 'block'}`, block);
```

Adicionar o import:

```typescript
import { versionedCacheKey } from '@/utils/materialCacheVersion';
```

- [ ] **Step 8: Rodar a suíte do mobile e commitar**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: PASS; `tsc` sem erro novo

```bash
git add mobile/src/utils/materialCacheVersion.ts mobile/src/utils/materialCacheVersion.test.ts mobile/src/components/DocumentBlock.tsx mobile/src/context/TrilhaContext.tsx
git commit -m "fix(mobile): cache do material versionado por revisao, senao o regerado nunca chega"
```

---

## Task 3: Regenerar texto para de mexer no áudio

**Files:**
- Modify: `api/app/api/v1/personalizacao.py` (`regenerar_documento_personalizacao`)
- Test: `api/tests/test_material_revisao.py`

Hoje o endpoint escreve o roteiro do áudio junto com o markdown. Como o `.mp3` **não** é regerado (o próprio docstring avisa), o material fica inconsistente: o que se ouve deixa de ser o que está escrito.

- [ ] **Step 1: Escrever o teste que falha**

Append em `api/tests/test_material_revisao.py`:

```python
def test_regeneracao_de_texto_nao_toca_no_audio() -> None:
    """O .mp3 NAO e' regerado por este endpoint (ver docstring dele). Escrever
    o roteiro novo aqui deixava o audio dizendo uma coisa e o texto outra."""
    import inspect

    from app.api.v1 import personalizacao

    fonte = inspect.getsource(personalizacao.regenerar_documento_personalizacao)
    assert 'audio_atual.setdefault("payload", {})["roteiro"]' not in fonte
    assert "audioScript" not in fonte
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_material_revisao.py::test_regeneracao_de_texto_nao_toca_no_audio -v`
Expected: FAIL — o trecho ainda existe

- [ ] **Step 3: Remover a escrita no áudio**

Em `regenerar_documento_personalizacao`, remover:

```python
    audio_atual = materiais_atualizados.get("audio")
    if isinstance(audio_atual, dict) and isinstance(resultado.get("audioScript"), str):
        audio_atual.setdefault("payload", {})["roteiro"] = resultado["audioScript"]
```

e substituir por:

```python
    # O roteiro do audio NAO e' escrito aqui. Este endpoint nao regenera o
    # .mp3 (ver docstring), entao gravar um roteiro novo deixaria o material
    # internamente inconsistente: o aluno leria um texto e ouviria outro.
    # A regeracao de audio tem endpoint proprio, que refaz o arquivo.
```

- [ ] **Step 4: Atualizar o docstring do endpoint**

Trocar:

```python
    """Regenera o markdown+roteiro de audio da base por perfil via prompt livre.
    Nao regenera o audio narrado (arquivo_url de materiais.audio) - so o
    texto do roteiro, mesma limitacao do endpoint /api/v1/regenerate/document
    do microservice que este endpoint consome.
    """
```

por:

```python
    """Regenera SO o markdown da base por perfil, via prompt livre.

    Nao toca em audio nem apresentacao. O microservice devolve tambem um
    `audioScript`, que e' deliberadamente ignorado: este endpoint nao refaz o
    .mp3, e gravar so o roteiro deixaria o aluno lendo um texto e ouvindo
    outro.
    """
```

- [ ] **Step 5: Rodar a suíte e commitar**

Run: `cd api && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check app tests`
Expected: PASS, `All checks passed!`

```bash
git add api/app/api/v1/personalizacao.py api/tests/test_material_revisao.py
git commit -m "fix(regeracao): regenerar texto para de reescrever o roteiro do audio"
```

---

## Task 4: Verificação fim a fim

- [ ] **Step 1: Suítes completas**

Run: `cd api && .venv/Scripts/python -m pytest -q`
Expected: PASS

Run: `cd mobile && npm test`
Expected: PASS

Run: `cd frontend && npx vitest run`
Expected: PASS — nenhuma regressão no console

- [ ] **Step 2: Confirmar o incremento em produção**

Depois de deployar, regenerar um documento pelo console e conferir:

```sql
select id,
       (materiais->'markdown'->>'revisao') as revisao_markdown,
       (materiais->'audio'->>'revisao') as revisao_audio,
       jsonb_extract_path_text(materiais, 'audio', 'payload', 'roteiro') is not null as tem_roteiro
from conteudo_personalizado
where id = <id do material regerado>;
```

Expected: `revisao_markdown` = 2 (ou +1 do anterior), `revisao_audio` inalterada, e o roteiro do áudio **igual ao de antes**.

- [ ] **Step 3: Confirmar que o aluno recebe**

No app, abrir o material antes e depois de uma regeração. O texto deve mudar sem precisar reinstalar nem esperar 3 dias.

> Se não mudar, o suspeito é o `material` não estar chegando ao `DocumentBlock`/`PrefetchEntry` — a `revisao` estaria sempre em 1 e a chave nunca mudaria. Conferir com um log da `cacheKey` montada.

- [ ] **Step 4: Registrar no CLAUDE.md**

Acrescentar na seção de tabelas, após o item de `conteudo_personalizado`:

```markdown
> **`materiais.<tipo>.revisao`** é o sinal de "este material mudou" para o
> cliente. A regeração faz `UPDATE` in place sem trocar `source_hash` — e não
> pode trocar, porque `source_hash` governa a dedup de geração —, então a URL
> no Storage (que embute `generation-<source_hash>`) continua a mesma. Sem
> `revisao`, o cache do mobile nunca rebaixa o arquivo: ele é chaveado pela
> URL, não revalida, e a expiração de 3 dias é renovada a cada acesso.
>
> É por MATERIAL, não por personalização: regerar o texto não pode invalidar
> áudio e apresentação.
```

```bash
graphify update .
git add CLAUDE.md
git commit -m "docs(claude): registra revisao por material como sinal de cache"
```

---

## Fora deste plano

**Regeração de áudio que produz `.mp3` novo.** É o item mais caro do spec: mexe no microservice (outro runtime), depende de TTS, e a cota de Gemini está estourada. A Task 3 remove a escrita do roteiro justamente para não deixar o material inconsistente enquanto isso não existe — hoje o áudio simplesmente não muda, o que é honesto; antes ele mudava pela metade.

**Os cinco eixos de parâmetro e a preservação por parte.** Plano B, que depende deste.

## Riscos

**Nada aqui foi validado por execução.** A auditoria que gerou o spec foi leitura de código, e a cota do Gemini impede exercitar o caminho de ponta a ponta. Os testes deste plano cobrem a lógica pura (`revisao`, versão de cache) e a forma do código (inspeção de fonte); a integração real só o Step 2/3 da Task 4 confirma.

**O `material` pode não estar em escopo no `DocumentBlock`.** A Task 2 Step 5 tem uma verificação explícita para isso, com a saída (passar `revisao` como prop). Se o componente hoje só recebe URL e tipo, essa parte cresce.

**Materiais já em cache no aparelho do aluno continuam velhos até a primeira regeração.** A `revisao` só muda quando alguém regenera. Isso é aceitável — o material antigo é o que está correto até ser regerado —, mas significa que este plano não "conserta" retroativamente nada que já esteja errado no aparelho.

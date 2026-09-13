# Diversidade de exemplos visuais no deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o deck exportado usar todas as imagens de referência anexadas pelo professor ao longo do deck, em vez de repetir a mesma imagem em vários subtópicos diferentes.

**Architecture:** Duas camadas — orientação de diversidade no prompt do Gemini (`server.ts`) e um reforço determinístico pós-geração em `resolveSlideIllustrations` (`slideIllustrations.ts`) que redireciona índices repetidos entre subtópicos diferentes para imagens ainda não usadas. Ver spec completa em `docs/superpowers/specs/2026-08-22-diversidade-exemplos-visuais-design.md`.

**Tech Stack:** TypeScript, `node:test`/`node:assert/strict`.

**Worktree:** `.worktrees/diversidade-exemplos-visuais` (branch `feature/diversidade-exemplos-visuais`, a partir de `origin/main`, baseline 73/73 testes).

---

### Task 1: reforço determinístico de diversidade em `resolveSlideIllustrations`

**Files:**
- Modify: `src/utils/slideIllustrations.ts` (linhas 170-212, primeiro loop)
- Test: `src/utils/slideIllustrations.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `src/utils/slideIllustrations.test.ts` (após o último teste do arquivo):

```typescript
test('subtopico diferente repetindo indice ja usado e redirecionado pra imagem nunca usada', async () => {
  const tresAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const slides = [
    makeSlide({ id: 'dns-1', subtopic: 'DNS', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'cache-1', subtopic: 'Cache', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, tresAttachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  // indice 0 ja usado por DNS - Cache (subtopico diferente) e redirecionado
  // pra proxima imagem nunca usada (indice 1), nao repete a mesma
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,BBBB');
});

test('mesmo subtopico reaparecendo com o mesmo indice NAO e redirecionado (reuso legitimo)', async () => {
  const doisAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
  ];
  const slides = [
    makeSlide({ id: 'dns-1', subtopic: 'DNS', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'dns-2', subtopic: 'DNS', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, doisAttachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('todas as imagens ja usadas: mantem o indice repetido (sem alternativa disponivel)', async () => {
  const doisAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/png', dataBase64: 'BBBB', name: 'b.png' },
  ];
  const slides = [
    makeSlide({ id: 'a-1', subtopic: 'A', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'b-1', subtopic: 'B', referenceImageIndex: 1 } as any),
    makeSlide({ id: 'c-1', subtopic: 'C', referenceImageIndex: 0 } as any),
  ];

  const result = await resolveSlideIllustrations(slides, doisAttachments, neverCalledGenerator());

  // so 2 imagens existem e as duas ja foram usadas (A->0, B->1) - o slide C
  // repete o indice 0 mesmo, nao ha pra onde redirecionar
  assert.equal(result[2].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('redirecionamento por diversidade tambem se aplica com restyleReferenceImage=true', async () => {
  const tresAttachments = [
    { mimeType: 'image/png', dataBase64: 'AAAA', name: 'a.png' },
    { mimeType: 'image/jpeg', dataBase64: 'BBBB', name: 'b.jpg' },
    { mimeType: 'image/png', dataBase64: 'CCCC', name: 'c.png' },
  ];
  const calls: Array<{ referenceImage?: { mimeType: string; data: string } }> = [];
  const generator: ImageGenerator = async (params) => {
    calls.push(params);
    return { mimeType: 'image/png', dataBase64: 'ESTILIZADA' };
  };
  const slides = [
    makeSlide({ id: 'dns-1', subtopic: 'DNS', referenceImageIndex: 0 } as any),
    makeSlide({ id: 'cache-1', subtopic: 'Cache', referenceImageIndex: 0, restyleReferenceImage: true } as any),
  ];

  const result = await resolveSlideIllustrations(slides, tresAttachments, generator);

  // o restyle deve ter usado a imagem REDIRECIONADA (indice 1, jpeg/BBBB),
  // nao a originalmente escolhida pelo modelo (indice 0, png/AAAA)
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].referenceImage, { mimeType: 'image/jpeg', data: 'BBBB' });
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,ESTILIZADA');
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test 2>&1 | grep -B2 -A 15 "redirecionad"`
Expected: FAIL nos 2 primeiros novos testes (o código atual não tem nenhuma lógica de diversidade — todo `result[1]` sai igual a `result[0]` mesmo em subtópicos diferentes). Os testes 3 e 4 podem já passar acidentalmente (o 3º porque o comportamento atual já mantém o índice; confirme rodando mesmo assim antes de prosseguir).

- [ ] **Step 3: Implementar a diversidade no primeiro loop**

Em `src/utils/slideIllustrations.ts`, substituir:

```typescript
  const resolved: SlideData[] = [];
  for (const slide of slides) {
    const index = (slide as any).referenceImageIndex;
    const restyle = (slide as any).restyleReferenceImage === true;

    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= attachments.length
    ) {
      resolved.push(slide);
      continue;
    }
    const attachment = attachments[index];
```

por:

```typescript
  const resolved: SlideData[] = [];
  // Rastreia quais indices de attachment ja foram usados no deck inteiro e
  // por qual subtopico, pra evitar que o modelo (que processa cada slide
  // isoladamente) concentre a mesma imagem "obviamente relevante" em varios
  // subtopicos diferentes enquanto outras imagens do professor nunca
  // aparecem em nenhum slide.
  const usedIndices = new Set<number>();
  const usedIndicesBySubtopic = new Map<string, number>();
  for (const slide of slides) {
    let index = (slide as any).referenceImageIndex;
    const restyle = (slide as any).restyleReferenceImage === true;

    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= attachments.length
    ) {
      resolved.push(slide);
      continue;
    }

    // Reuso pelo MESMO subtopico (ex.: "DNS parte 1" e "DNS parte 2") e
    // legitimo e nao e alterado. So redireciona quando um subtopico
    // DIFERENTE repete um indice ja usado e ainda sobra alguma imagem
    // nunca usada no deck inteiro - prioriza cobertura de todas as
    // imagens do professor sobre relevancia estrita alem do basico.
    const subtopicKey = typeof slide.subtopic === 'string' ? slide.subtopic.trim() : '';
    const reuseSameSubtopic = Boolean(subtopicKey) && usedIndicesBySubtopic.get(subtopicKey) === index;
    if (!reuseSameSubtopic && usedIndices.has(index) && usedIndices.size < attachments.length) {
      const nextUnused = attachments.findIndex((_, i) => !usedIndices.has(i));
      if (nextUnused !== -1) index = nextUnused;
    }
    usedIndices.add(index);
    if (subtopicKey) usedIndicesBySubtopic.set(subtopicKey, index);

    const attachment = attachments[index];
```

(o restante do loop, de `if (!attachment || ...)` em diante, fica igual — já usa a variável `index`, que agora pode ter sido redirecionada.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test 2>&1 | grep -B2 -A 10 "redirecionad\|reuso legitimo\|sem alternativa"`
Expected: PASS nos 4 novos testes.

- [ ] **Step 5: Rodar toda a suite**

Run: `npm test 2>&1 | tail -10`
Expected: todos os testes passando (77 nesse ponto).

- [ ] **Step 6: Commit**

```bash
git add src/utils/slideIllustrations.ts src/utils/slideIllustrations.test.ts
git commit -m "feat: redireciona indice de imagem repetido entre subtopicos diferentes pra imagem ainda nao usada"
```

---

### Task 2: orientação de diversidade no prompt

**Files:**
- Modify: `server.ts` (linha 1408, instrução #7 do prompt principal)

- [ ] **Step 1: Editar a instrução**

Em `server.ts`, localizar a linha (dentro do template literal de `fullPrompt`):

```typescript
7. IMAGENS DE REFERÊNCIA: Se houver imagens listadas em "IMAGENS DE REFERÊNCIA ANEXADAS" e alguma for diretamente relevante ao subtópico de um slide, preencha "referenceImageIndex" com o índice correspondente em vez de inventar uma descrição visual genérica para aquele slide. Se nenhuma imagem for relevante, omita o campo — não force um índice arbitrário. Quando a imagem original já é um bom exemplo visual (ex.: diagrama técnico já claro), deixe "restyleReferenceImage" de fora. Quando a imagem se beneficia de uma versão estilizada pro perfil (ex.: foto genérica, ilustração fora do tom do perfil), preencha "restyleReferenceImage": true — no máximo em 2-3 slides do deck inteiro, não em todos.
```

Substituir por (acrescenta uma frase de diversidade ao final, mantendo o resto igual):

```typescript
7. IMAGENS DE REFERÊNCIA: Se houver imagens listadas em "IMAGENS DE REFERÊNCIA ANEXADAS" e alguma for diretamente relevante ao subtópico de um slide, preencha "referenceImageIndex" com o índice correspondente em vez de inventar uma descrição visual genérica para aquele slide. Se nenhuma imagem for relevante, omita o campo — não force um índice arbitrário. Quando a imagem original já é um bom exemplo visual (ex.: diagrama técnico já claro), deixe "restyleReferenceImage" de fora. Quando a imagem se beneficia de uma versão estilizada pro perfil (ex.: foto genérica, ilustração fora do tom do perfil), preencha "restyleReferenceImage": true — no máximo em 2-3 slides do deck inteiro, não em todos. DISTRIBUA o uso das imagens anexadas ao longo do deck inteiro: tente que cada imagem apareça em pelo menos um slide antes de repetir a mesma imagem numa segunda vez, especialmente entre subtópicos diferentes — não concentre o mesmo índice em vários slides enquanto outras imagens anexadas ainda não foram usadas em nenhum.
```

- [ ] **Step 2: Rodar a suite (nenhum teste automatizado cobre texto de prompt — mudança textual sem lógica)**

Run: `npm test 2>&1 | tail -10`
Expected: todos os testes continuam passando (mudança é só texto de string, não afeta nenhuma lógica testada).

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat(prompt): orienta o modelo a distribuir o uso das imagens de referencia entre subtopicos"
```

---

### Encerramento

Após os 2 tasks: rodar `npm test` e `npx tsc --noEmit` uma última vez, depois seguir para **superpowers:finishing-a-development-branch** (mesmo padrão dos PRs #10/#11/#12 — push + PR).

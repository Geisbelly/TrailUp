# Regeração granular de material — design

**Data:** 2026-08-28
**Status:** aguardando aprovação

## O que motivou

Três defeitos no fluxo de regeração, encontrados auditando o caminho de ponta a
ponta. Eles são independentes na causa, mas se somam no sintoma: o professor
regenera, e o resultado não é o que ele pediu nem chega a quem deveria.

### 1. O mobile nunca vê o material regerado

A regeração faz `UPDATE` **na mesma linha** — `atualizar_materiais_e_status(record_id, materiais, status)` — sem tocar em `ciclo_id` nem `source_hash`. Isso está **certo**: era o comportamento pedido (substituir, não bifurcar).

O problema é a consequência em cascata:

- os caminhos no Storage embutem `generation-<source_hash>`, então **a URL não muda**;
- o cache do mobile é chaveado pela URL (`sourceUrl?.trim() || resolvedUrl` em `DocumentBlock.tsx`, `${entry.key}:${entry.url}` no prefetch do `TrilhaContext`);
- `ensureCachedNativeContent` **nunca revalida**: se o arquivo local existe, devolve;
- a única expiração é `lastAccessedAt > 3 dias`, e `lastAccessedAt` é renovado **a cada acesso**.

Ou seja: para quem usa o material, ele nunca expira. O aluno fica com a versão antiga indefinidamente.

> **O console já resolveu isto.** `materialCacheVersion` (`materialPreview.ts`) deriva uma versão de `generation_key + metadata.updated_at` e `versionedMaterialUrl` a acopla como query string. O mobile não tem o equivalente. **A correção é portar o conceito, não inventá-lo.**

### 2. Regenerar texto mexe no áudio

`regenerar_documento_personalizacao` grava dois materiais na mesma chamada:

```python
materiais_atualizados["markdown"]["payload"]["markdown"] = resultado["markdown"]
...
audio_atual["payload"]["roteiro"] = resultado["audioScript"]
```

O professor na aba Texto pede regeração e o roteiro do áudio muda junto, sem ter sido pedido.

Agrava: o docstring avisa que **o áudio narrado não é regerado**, só o roteiro. O `.mp3` continua o antigo enquanto o roteiro já é outro — o material fica internamente inconsistente, e o que se ouve deixa de ser o que está escrito. Não existe endpoint de regeração de áudio: hoje o áudio **não regenera por nenhum caminho**.

### 3. Parâmetros insuficientes

Existem `improvement_prompt` e `expansion_prompt` — dois campos de texto livre. Não há controle estruturado sobre tom, profundidade, tamanho ou preservação.

## Decisões

### Invalidação: contador de revisão

Cada material ganha `revisao` (inteiro, começa em 1), **incrementado a cada regeração daquele material**. Ele entra na versão de cache, ao lado do que `materialCacheVersion` já usa.

Descartadas:

- **Caminho novo no Storage a cada regeração** — a URL mudaria sozinha, mas acumula órfãos no bucket e exige limpeza. Troca um problema de cache por um de armazenamento.
- **Revalidação HTTP (`If-None-Match`)** — corrigiria a classe inteira, não só regeração, mas depende do Storage devolver ETag estável e custa uma requisição por abertura. Fica registrada como evolução, não como o passo agora.

`revisao` é por **material**, não por personalização: regerar o texto não pode invalidar o cache do áudio e da apresentação.

> **Por que não usar `source_hash`:** ele governa a dedup de geração (`_has_completed_current_generation`, `claim_new_generation`). Mexer nele para sinalizar cache faria o worker acreditar que a geração inteira está obsoleta e refazer tudo — exatamente o oposto de uma regeração cirúrgica.

### Granularidade: um material por vez

Cada aba regenera **só o seu material**:

| aba | regenera | não toca |
| --- | --- | --- |
| Texto | `materiais.markdown` | áudio, apresentação |
| Áudio | roteiro **e** o `.mp3` | markdown, apresentação |
| Apresentação | slides (já é isolado hoje) | markdown, áudio |

Isso exige **implementar a regeração de áudio de verdade** — hoje o roteiro muda e o arquivo não. Sem isso, separar as abas só troca uma inconsistência por outra.

### Parâmetros

Quatro eixos, todos opcionais, convivendo com os dois campos livres atuais:

| eixo | forma | efeito |
| --- | --- | --- |
| **Tom** | escala (mais formal ↔ mais próximo) | ajusta voz sem contradizer a assinatura editorial do perfil |
| **Profundidade** | escala (introdutório ↔ avançado) | densidade conceitual |
| **Tamanho** | escala (enxuto ↔ longo) | extensão |
| **Densidade de exemplos** | escala | quantidade de exemplos concretos |
| **Foco** | texto livre | "insista em deadlock", "corta a parte histórica" |
| **Preservar** | seleção de seções | marca o que **não** deve mudar |

> **Restrição que não é negociável:** os parâmetros modulam, não substituem, a assinatura editorial do perfil BrainHex (`_BRAINHEX_EDITORIAL_SIGNATURES`). Um Seeker com tom "mais formal" continua Seeker. Se um parâmetro puder apagar a identidade do perfil, ele está modelado errado — é o ponto onde esta feature pode corroer a premissa do produto.

#### "Preservar o que já está bom" é a parte cara

Os outros cinco eixos são modificadores de prompt: entram no payload, chegam ao microservice, mudam o texto gerado. Este não.

Preservar exige **granularidade por seção**, que hoje não existe para markdown — o material é uma string única em `payload.markdown`. Para marcar "não mexa nisto" é preciso:

1. segmentar o markdown em seções endereçáveis (por heading, provavelmente);
2. persistir essa segmentação, ou derivá-la de forma estável entre regerações;
3. remontar preservando os trechos marcados e substituindo o resto.

O passo 2 é o difícil: se a segmentação for derivada por heading e a regeração mudar um heading, a âncora se perde e a preservação falha em silêncio.

**Recomendação: fase 2.** Os outros cinco eixos entregam a maior parte do valor e não dependem disso. Entregar preservação junto arrisca atrasar tudo por causa da parte com mais incerteza.

A apresentação já é por partes (`materiais.apresentacao.partes[]`, cada uma com `ordem`, `titulo`, `storage_path`), então **para slides a preservação é barata** — dá para regerar uma parte e manter as outras. Isso pode entrar na fase 1 sem o custo do markdown.

## Escopo

**Entra (fase 1):**

- `revisao` por material, incrementado na regeração
- versão de cache no mobile, portando o conceito de `materialCacheVersion`
- separação das abas: texto, áudio e apresentação regeneram só o próprio material
- regeração de áudio que produz `.mp3` novo
- cinco eixos de parâmetro (tom, profundidade, tamanho, exemplos, foco)
- preservação **por parte** na apresentação

**Fase 2:**

- preservação por seção no markdown (segmentação estável)

**Fora:**

- revalidação HTTP por ETag
- regeração de cards e atividades

## Riscos

**A cota do Gemini bloqueia a validação.** O free tier está estourado (uma chave, ~20 req/dia) e o circuito global abre por 5 min a cada 429. Enquanto isso não for resolvido, **nenhuma parte disto pode ser testada de ponta a ponta** — a auditoria que gerou este spec foi por leitura de código, não por execução. Isso não bloqueia escrever o código, mas bloqueia afirmar que funciona.

**Mais parâmetros significam mais chamadas.** Cada regeração é uma geração. Expor controles finos convida o professor a iterar, e cada iteração consome cota. Vale considerar um limite por material/dia.

**O `.mp3` novo custa TTS.** A regeração de áudio hoje não existe em parte porque é cara. Implementá-la aumenta o consumo numa conta que já está no limite.

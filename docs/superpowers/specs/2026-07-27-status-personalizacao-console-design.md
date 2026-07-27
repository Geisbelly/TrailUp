# Design: status da personalização no console do professor

**Data:** 2026-07-27

## Motivação

O console do professor (`PersonalizacoesSection.tsx`, abas "Por perfil" e "Por aluno") só mostra um badge binário — "Gerado" ou "Sem material" — baseado em `tem_personalizacao`. Isso não distingue "ainda não foi pedido" de "travado há uma hora" de "falhou" — exatamente a confusão que levou ao bug investigado nesta sessão (registro preso em `processando_midias` há horas, indistinguível de "gerando agora" para o professor).

## O que já existe (sem mudança de backend)

Os dois endpoints consumidos por essa seção (`GET /personalizar/perfis/{classe_id}/{topico_id}` e `GET /personalizar/contexto/{aluno_id}`) já retornam, via `_to_response()`, um objeto `PersonalizacaoResponse` com:
- `status`: string bruta do banco (`processando_midias`, `pronto`, `failed_quality`, `partial`, `failed`, ...).
- `media_status`: agregado (`ready`/`pending`/`partial`/`failed`), calculado a partir do dict `materiais`.
- `gerado_em` / `updated_at`: timestamps.

Não é necessário nenhum endpoint novo nem mudança de schema — só consumir o que já vem.

## Design

Novo helper puro `getPersonalizacaoStatusBadge()` em `frontend/src/components/console/personalizacoes/statusBadge.ts`:

```ts
type StatusBadge = { label: string; variant: "default" | "outline" | "secondary" | "destructive"; };

function getPersonalizacaoStatusBadge(params: {
  temPersonalizacao: boolean;
  status?: string | null;
  geradoEm?: string | null;
  updatedAt?: string | null;
  now?: Date; // injetavel para teste
}): StatusBadge
```

Regras (nessa ordem):
1. `!temPersonalizacao` → `{ label: "Sem material", variant: "outline" }`.
2. `status === "pronto"` → `{ label: "Pronto", variant: "default" }`.
3. `status === "processando_midias"`:
   - Idade (`now - (updatedAt ?? geradoEm)`) **>= 15 minutos** (mesmo limiar de `personalizacao_job_stale_processing_min` usado no backend, `api/app/services/personalizacao_jobs.py`) → `{ label: "Travado", variant: "destructive" }`.
   - Caso contrário → `{ label: "Gerando...", variant: "secondary" }`.
4. `status` em `{"failed", "failed_quality"}` → `{ label: "Falhou", variant: "destructive" }`.
5. `status === "partial"` → `{ label: "Parcial", variant: "secondary" }`.
6. Fallback (status desconhecido/ausente mas `temPersonalizacao=true`) → `{ label: status ?? "Pronto", variant: "default" }`.

Se `updatedAt`/`geradoEm` ausentes no caso 3, tratar como recém-criado (não travado) — evita falso positivo de "Travado" por falta de dado, já que o registro claramente acabou de ser criado nesse fluxo.

## Onde aplicar

- **`PerfilMaterialCard`** (aba "Por perfil", `PersonalizacoesSection.tsx`): troca o badge atual (`item.tem_personalizacao ? "Gerado" : "Sem material"`) pela chamada ao helper, usando `item.tem_personalizacao`, `item.personalizacao?.status`, `item.personalizacao?.gerado_em`, `item.personalizacao?.updated_at`.
- **`AlunoPreview`** (aba "Por aluno"): adiciona o badge ao lado do badge de `formato_prioritario` já existente, usando os mesmos campos de `efetiva` (a personalização mais recente do aluno).

## Fora de escopo

- Endpoint `/media-status` (granular por tipo de material) — não usado nesta mudança, fica como já estava (não wireado a nenhuma UI).
- Aba "Estrutura e paleta" e aba "Turma" — não mostram status individual de registro, não mudam.
- Nenhuma mudança de backend/schema.

## Testes

- `statusBadge.test.ts` (Vitest): cobre as 6 regras acima, incluindo o caso de fronteira dos 15 minutos (14min59s → "Gerando...", 15min01s → "Travado") e o caso sem `updatedAt`/`geradoEm`.

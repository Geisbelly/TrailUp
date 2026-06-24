# Abstração do Provider de Personalização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir `IPersonalizacaoProvider` injetado via React Context, com `TrailupApiProvider` como impl padrão, sem alterar comportamento.

**Architecture:** Interface declara os 7 métodos efetivamente consumidos por `TrilhaContext` e `IAMentorPanel`. Classe `TrailupApiProvider` move a lógica HTTP/Supabase de `personalizacaoApi.ts` para uma instância injetável. Context React fornece o provider; consumidores usam `usePersonalizacaoProvider()` em vez de imports diretos. O arquivo `personalizacaoApi.ts` vira shim de reexport para callers fora do React tree.

**Tech Stack:** React 19, TypeScript 5.9 strict, React Context, Supabase JS SDK, fetch nativo.

**Validação:** Sem testes automatizados nesta frente. Lint + tsc + smoke manual (carregar trilha personalizada, salvar progresso, chat com mentor).

**Divergência do spec:** O spec listou 6 métodos genéricos. Após inspecionar consumidores reais, o conjunto efetivo é 7 (algumas funções de `personalizacaoApi.ts` são dead code do ponto de vista dos consumidores). A interface terá apenas os 7 que são consumidos. Funções não-consumidas (`listarPersonalizacoesAluno`, `salvarProgressoPersonalizado` HTTP) ficam disponíveis via shim mas FORA da interface.

---

## Métodos da interface (consumo real)

| Método | Consumidor | Origem em `personalizacaoApi.ts` |
|---|---|---|
| `solicitarPersonalizacao` | TrilhaContext L947 | L753 |
| `listarPersonalizacoesPersistidasPerfil` | TrilhaContext L977, L1048 | L597 |
| `listarJobsPersistidosAluno` | TrilhaContext L1081 | L682 |
| `salvarProgressoPersonalizadoDiretoSupabase` | TrilhaContext L1682 | L791 |
| `subscribePersonalizacoesPersistidasClasse` | TrilhaContext L1245 | L718 |
| `hasApiConfigured` (rename de `hasPersonalizacaoApiConfigured`) | TrilhaContext L930 | L359 |
| `conversarComMentorPersonalizacao` | IAMentorPanel | L956 |

Error class `PersonalizacaoRlsError` (usada em TrilhaContext L1693) — fica em `errors.ts` separado, importada por ambos os lados.

## Estrutura de arquivos resultante

```
src/services/personalizacao/
  types.ts                            Tipos de payload/response
  errors.ts                           Classes de erro
  IPersonalizacaoProvider.ts          Interface
  TrailupApiProvider.ts               Impl padrão + defaultTrailupApiProvider
  PersonalizacaoProviderContext.tsx   React Context + hook + Provider
  index.ts                            Reexports

src/services/
  personalizacaoApi.ts                Shim de reexport (~120 linhas, era 963)
```

---

## Task 0: Preparação

**Files:** nenhum

- [ ] **Step 1: Verificar working tree**

```bash
git status
```

Esperado: branch `base-teste` com o commit do spec (`c4090a2`). O WIP de 20 arquivos (incluindo modificações em `TrilhaContext.tsx` e outros) pode estar aplicado ou stashed.

- [ ] **Step 2: Garantir working tree limpo**

Se houver mudanças não commitadas que não pertencem a esta frente:

```bash
git stash push --include-untracked -m "WIP antes do refactor personalizacao-provider"
```

- [ ] **Step 3: Criar branch**

```bash
git checkout -b refactor/personalizacao-provider
```

- [ ] **Step 4: Baseline lint**

```bash
npm run lint
```

Anote o número de warnings esperado (deve ser 34, consistente com base-teste).

---

## Task 1: Criar tipos compartilhados

**Files:**
- Create: `src/services/personalizacao/types.ts`

- [ ] **Step 1: Criar `src/services/personalizacao/types.ts`**

```ts
export type PersonalizacaoRecord = {
  id: number;
  aluno_id: string;
  classe_id?: number | null;
  conteudo_id?: number | null;
  topico_id?: number | null;
  ciclo_id: string;
  status?: string | null;
  source_hash?: string | null;
  formato_prioritario?: string | null;
  formatos_gerados?: string[] | null;
  plano?: Record<string, any> | null;
  materiais?: Record<string, any> | null;
  aiPatch?: Record<string, any> | null;
  ai_patch?: Record<string, any> | null;
  design_tokens?: Record<string, any> | null;
  designTokens?: Record<string, any> | null;
  steps?: Record<string, any>[] | null;
  gerado_em?: string | null;
  updated_at?: string | null;
};

export type PersonalizacaoListResponse = {
  aluno_id: string;
  total: number;
  itens: PersonalizacaoRecord[];
};

export type CardPersonalizadoRecord = {
  id: number;
  aluno_id?: string | null;
  classe_id?: number | null;
  topico_id?: number | null;
  conteudo_id?: number | null;
  ciclo_id?: string | null;
  ordem?: number | null;
  titulo?: string | null;
  descricao?: string | null;
  icone?: string | null;
  dificuldade?: string | null;
  xp?: number | null;
  metadata?: Record<string, any> | null;
  ativo?: boolean | null;
};

export type PersonalizarPayload = {
  classe_id: number;
  topico_id?: number | null;
  conteudo_id?: number | null;
  conteudo_foco_id?: number | null;
  perfis?: { nome: string; afinidade?: number | null }[];
  topico_snapshot?: Record<string, any> | null;
  materiais_origem_cliente?: Record<string, any>[];
};

export type PersonalizacaoProgressPayload = {
  personalizacao_id: number;
  classe_id: number;
  topico_id: number;
  item_key: string;
  item_kind: "content" | "activity" | "cards";
  item_title: string;
  status: "nao_iniciado" | "em_andamento" | "concluido";
  percentual_concluido: number;
  acertos_percentual?: number | null;
  tempo_gasto_min?: number | null;
  pontuacao_obtida?: number | null;
  pontuacao_maxima?: number | null;
  metadata?: Record<string, any> | null;
};

export type PersonalizacaoProgressDirectPayload =
  PersonalizacaoProgressPayload & { aluno_id: string };

export type MentorChatMessagePayload = {
  role: "assistant" | "user";
  content: string;
};

export type MentorChatPayload = {
  classe_id: number;
  topico_id?: number | null;
  conteudo_id?: number | null;
  escopo?: "modulo" | "trilha_home";
  mensagem: string;
  historico?: MentorChatMessagePayload[];
};

export type MentorChatResponse = {
  reply: string;
  scope: "modulo" | "trilha_home";
  should_close?: boolean;
  hinted_actions?: string[];
};

export type PersonalizacaoJobRecord = {
  id: number;
  kind: string;
  status: string;
  classe_id: number;
  aluno_id: string | null;
  topico_id: number | null;
  conteudo_id: number | null;
  total_targets: number | null;
  processed_targets: number | null;
  error_count: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ListarPersonalizacoesPerfilParams = {
  classeId: number;
  topicoId?: number | null;
  conteudoId?: number | null;
  brainhexProfileKey: string;
  limit?: number;
};

export type ListarJobsParams = {
  alunoId: string;
  classeId: number;
  limit?: number;
};

export type SubscribePersonalizacoesClasseParams = {
  classeId: number;
  onChange: () => void;
};
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Esperado: 34 warnings, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/personalizacao/types.ts
git commit -m "refactor(personalizacao): adiciona tipos compartilhados do provider"
```

---

## Task 2: Criar classes de erro

**Files:**
- Create: `src/services/personalizacao/errors.ts`

- [ ] **Step 1: Criar `src/services/personalizacao/errors.ts`**

```ts
export class PersonalizacaoAuthError extends Error {
  readonly code: "no_session" | "token_invalid" | "cooldown";

  constructor(
    message: string,
    code: "no_session" | "token_invalid" | "cooldown"
  ) {
    super(message);
    this.name = "PersonalizacaoAuthError";
    this.code = code;
  }
}

export class PersonalizacaoNetworkError extends Error {
  readonly code: "no_api_config" | "network_cooldown" | "network_unreachable";

  constructor(
    message: string,
    code: "no_api_config" | "network_cooldown" | "network_unreachable"
  ) {
    super(message);
    this.name = "PersonalizacaoNetworkError";
    this.code = code;
  }
}

export class PersonalizacaoRlsError extends Error {
  readonly code: "rls_forbidden";

  constructor(message: string) {
    super(message);
    this.name = "PersonalizacaoRlsError";
    this.code = "rls_forbidden";
  }
}

export function isPersonalizacaoAuthError(error: unknown) {
  return error instanceof PersonalizacaoAuthError;
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/services/personalizacao/errors.ts
git commit -m "refactor(personalizacao): extrai classes de erro do provider"
```

---

## Task 3: Criar a interface

**Files:**
- Create: `src/services/personalizacao/IPersonalizacaoProvider.ts`

- [ ] **Step 1: Criar `src/services/personalizacao/IPersonalizacaoProvider.ts`**

```ts
import type { RealtimeChannel } from "@supabase/supabase-js";

import type {
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";

export interface IPersonalizacaoProvider {
  /** Verifica se há URL base configurada para a API HTTP. */
  hasApiConfigured(): boolean;

  /** Solicita uma nova personalização para um tópico/conteúdo (POST HTTP). */
  solicitarPersonalizacao(
    payload: PersonalizarPayload
  ): Promise<PersonalizacaoRecord>;

  /** Lê personalizações persistidas no Supabase filtradas por perfil BrainHex. */
  listarPersonalizacoesPersistidasPerfil(
    params: ListarPersonalizacoesPerfilParams
  ): Promise<PersonalizacaoListResponse>;

  /** Lista jobs de personalização em execução/concluídos. */
  listarJobsPersistidosAluno(
    params: ListarJobsParams
  ): Promise<PersonalizacaoJobRecord[]>;

  /** Persiste progresso de item personalizado direto no Supabase com merge. */
  salvarProgressoPersonalizadoDiretoSupabase(
    payload: PersonalizacaoProgressDirectPayload
  ): Promise<{ id: number | null; mode: "insert" | "update" }>;

  /** Assina realtime de mudanças em personalizações da classe. */
  subscribePersonalizacoesPersistidasClasse(
    params: SubscribePersonalizacoesClasseParams
  ): RealtimeChannel;

  /** Conversa com o mentor de personalização (POST HTTP). */
  conversarComMentorPersonalizacao(
    payload: MentorChatPayload
  ): Promise<MentorChatResponse>;
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/services/personalizacao/IPersonalizacaoProvider.ts
git commit -m "refactor(personalizacao): define IPersonalizacaoProvider"
```

---

## Task 4: Criar `TrailupApiProvider` (a implementação padrão)

**Files:**
- Create: `src/services/personalizacao/TrailupApiProvider.ts`

Este arquivo concentra a lógica de `personalizacaoApi.ts` (L1–L470 helpers privados; L567–L963 métodos públicos). Como o arquivo original tem 963 linhas, esta task move funções inteiras — não reescreve.

- [ ] **Step 1: Criar `src/services/personalizacao/TrailupApiProvider.ts` com a estrutura abaixo**

```ts
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/database/supabase";
import {
  isNetworkRequestFailedError,
  resolveApiBaseCandidates,
} from "@/services/apiBaseUrl";
import {
  clampPercent,
  normalizeNullableNonNegativeNumber,
  normalizePositiveInteger,
} from "@/utils/dataValidation";

import {
  PersonalizacaoAuthError,
  PersonalizacaoNetworkError,
  PersonalizacaoRlsError,
} from "@/services/personalizacao/errors";
import type { IPersonalizacaoProvider } from "@/services/personalizacao/IPersonalizacaoProvider";
import type {
  CardPersonalizadoRecord,
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";

type AuthHeaders = {
  Authorization: string;
  "Content-Type": "application/json";
};

const AUTH_COOLDOWN_MS = 60_000;
const NETWORK_COOLDOWN_MS = 45_000;

export class TrailupApiProvider implements IPersonalizacaoProvider {
  private authBlockedUntil = 0;
  private networkBlockedUntil = 0;
  private readonly apiBaseCandidates: string[];

  constructor(
    private readonly deps: {
      supabase: SupabaseClient;
      apiBaseCandidates: string[];
    }
  ) {
    this.apiBaseCandidates = deps.apiBaseCandidates;
  }

  hasApiConfigured() {
    return this.apiBaseCandidates.length > 0;
  }

  // ============================================================
  // Cooldown helpers (movidos de personalizacaoApi.ts L155–L177)
  // ============================================================

  private isAuthBlocked() {
    return this.authBlockedUntil > Date.now();
  }

  private blockAuthRequests() {
    this.authBlockedUntil = Date.now() + AUTH_COOLDOWN_MS;
  }

  private clearAuthBlock() {
    this.authBlockedUntil = 0;
  }

  private isNetworkBlocked() {
    return this.networkBlockedUntil > Date.now();
  }

  private blockNetworkRequests() {
    this.networkBlockedUntil = Date.now() + NETWORK_COOLDOWN_MS;
  }

  private clearNetworkBlock() {
    this.networkBlockedUntil = 0;
  }

  // ============================================================
  // URL & auth (movidos de personalizacaoApi.ts L179–L353)
  // ============================================================

  private buildUrls(
    path: string,
    query?: Record<string, string | number | null | undefined>
  ) {
    if (!this.apiBaseCandidates.length) return [] as string[];
    const urls: string[] = [];

    this.apiBaseCandidates.forEach((baseUrl) => {
      const url = new URL(`${baseUrl}${path}`);
      Object.entries(query ?? {}).forEach(([key, value]) => {
        if (value == null || value === "") return;
        url.searchParams.set(key, String(value));
      });
      urls.push(url.toString());
    });

    return urls;
  }

  private async getAuthHeaders(forceRefresh = false): Promise<AuthHeaders> {
    if (!forceRefresh && this.isAuthBlocked()) {
      throw new PersonalizacaoAuthError(
        "Requisicoes de personalizacao pausadas temporariamente apos falha de autenticacao.",
        "cooldown"
      );
    }

    const sessionResult = forceRefresh
      ? await this.deps.supabase.auth.refreshSession()
      : await this.deps.supabase.auth.getSession();

    if (sessionResult.error) throw sessionResult.error;

    const token = sessionResult.data.session?.access_token;
    if (!token && !forceRefresh) {
      return this.getAuthHeaders(true);
    }

    if (!token) {
      this.blockAuthRequests();
      throw new PersonalizacaoAuthError(
        "Sem sessao ativa para buscar personalizacao.",
        "no_session"
      );
    }

    this.clearAuthBlock();

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let payload: any = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const detail =
        payload?.detail ||
        payload?.message ||
        text ||
        `Erro ${response.status} ao consultar personalizacao.`;

      if (
        response.status === 401 ||
        /token invalido|token inv[áa]lido|unauthorized|not authenticated/i.test(
          String(detail)
        )
      ) {
        this.blockAuthRequests();
        throw new PersonalizacaoAuthError(String(detail), "token_invalid");
      }

      throw new Error(String(detail));
    }

    if (!payload && text) {
      throw new Error("Resposta invalida da API de personalizacao.");
    }

    return payload as T;
  }

  private async requestOnce<T>(url: string, init: RequestInit) {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(url, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    return this.parseResponse<T>(response);
  }

  private async requestWithRefreshedToken<T>(url: string, init: RequestInit) {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(url, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    return this.parseResponse<T>(response);
  }

  private async requestWithAuth<T>(
    urls: string[],
    init: RequestInit
  ): Promise<T> {
    if (!urls.length) {
      throw new PersonalizacaoNetworkError(
        "API de personalizacao indisponivel: URL base nao configurada.",
        "no_api_config"
      );
    }
    if (this.isNetworkBlocked()) {
      throw new PersonalizacaoNetworkError(
        "API de personalizacao temporariamente indisponivel apos falha de rede.",
        "network_cooldown"
      );
    }

    let lastNetworkError: unknown = null;

    for (const url of urls) {
      try {
        const payload = await this.requestOnce<T>(url, init);
        this.clearNetworkBlock();
        return payload;
      } catch (error) {
        if (
          error instanceof PersonalizacaoAuthError &&
          error.code === "token_invalid"
        ) {
          try {
            const payload = await this.requestWithRefreshedToken<T>(url, init);
            this.clearNetworkBlock();
            return payload;
          } catch (refreshError) {
            if (isNetworkRequestFailedError(refreshError)) {
              lastNetworkError = refreshError;
              continue;
            }
            throw refreshError;
          }
        }

        if (isNetworkRequestFailedError(error)) {
          lastNetworkError = error;
          continue;
        }

        throw error;
      }
    }

    if (lastNetworkError) {
      this.blockNetworkRequests();
      throw new PersonalizacaoNetworkError(
        "Falha de rede ao comunicar com a API de personalizacao.",
        "network_unreachable"
      );
    }

    throw new PersonalizacaoNetworkError(
      "Nao foi possivel completar a requisicao de personalizacao.",
      "network_unreachable"
    );
  }

  // ============================================================
  // BrainHex helpers (movidos de personalizacaoApi.ts L363–L484)
  // ============================================================
  // COPIAR INTEGRALMENTE de personalizacaoApi.ts:
  //   - normalizeBrainhexProfileKey (L363)
  //   - extractProfileFromStoragePath (L396)
  //   - findProfileInNestedValue (L414)
  //   - extractProfileKeyFromPersonalizacaoRecord (L438)
  //   - extractProfileKeyFromCardRecord (L472)
  //   - mergeCardsIntoPersonalizacaoRecords (L486)
  // Manter como métodos PRIVADOS da classe (`private normalizeBrainhexProfileKey(...)`).
  // Substituir referências a `supabase` por `this.deps.supabase`.

  // ============================================================
  // Card helpers (movidos de personalizacaoApi.ts L567–L595)
  // ============================================================
  // COPIAR `listarCardsPersonalizadosPersistidosPerfil` (L567).
  // Manter como método PRIVADO da classe.

  // ============================================================
  // Métodos PÚBLICOS da interface
  // ============================================================

  async solicitarPersonalizacao(
    payload: PersonalizarPayload
  ): Promise<PersonalizacaoRecord> {
    // COPIAR corpo de personalizacaoApi.ts L753–L760
    const urls = this.buildUrls("/api/v1/personalizar");
    return this.requestWithAuth<PersonalizacaoRecord>(urls, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listarPersonalizacoesPersistidasPerfil(
    params: ListarPersonalizacoesPerfilParams
  ): Promise<PersonalizacaoListResponse> {
    // COPIAR corpo de personalizacaoApi.ts L597–L643
    // Substituir chamadas internas de listarCardsPersonalizadosPersistidosPerfil
    // por this.listarCardsPersonalizadosPersistidosPerfil
    // Substituir supabase por this.deps.supabase
    // ... (corpo inteiro segue verbatim)
  }

  async listarJobsPersistidosAluno(
    params: ListarJobsParams
  ): Promise<PersonalizacaoJobRecord[]> {
    // COPIAR corpo de personalizacaoApi.ts L682–L697
    const { data, error } = await this.deps.supabase
      .from("personalizacao_jobs")
      .select(
        "id, kind, status, classe_id, aluno_id, topico_id, conteudo_id, total_targets, processed_targets, error_count, last_error, created_at, updated_at"
      )
      .eq("classe_id", params.classeId)
      .or(`aluno_id.eq.${params.alunoId},aluno_id.is.null`)
      .order("updated_at", { ascending: false })
      .limit(params.limit ?? 20);

    if (error) throw error;
    return (data ?? []) as PersonalizacaoJobRecord[];
  }

  async salvarProgressoPersonalizadoDiretoSupabase(
    payload: PersonalizacaoProgressDirectPayload
  ): Promise<{ id: number | null; mode: "insert" | "update" }> {
    // COPIAR corpo de personalizacaoApi.ts L791–L954 verbatim
    // Substituir `supabase` por `this.deps.supabase`
    // (corpo é grande — ~160 linhas — copiar integralmente)
  }

  subscribePersonalizacoesPersistidasClasse(
    params: SubscribePersonalizacoesClasseParams
  ): RealtimeChannel {
    // COPIAR corpo de personalizacaoApi.ts L718–L734
    const channel = this.deps.supabase.channel(
      `rt_personalizacao_classe_${params.classeId}`
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conteudo_personalizado",
        filter: `classe_id=eq.${params.classeId}`,
      },
      () => params.onChange()
    );
    return channel.subscribe();
  }

  async conversarComMentorPersonalizacao(
    payload: MentorChatPayload
  ): Promise<MentorChatResponse> {
    // COPIAR corpo de personalizacaoApi.ts L956–L963
    const urls = this.buildUrls("/api/v1/personalizar/chat");
    return this.requestWithAuth<MentorChatResponse>(urls, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export const defaultTrailupApiProvider = new TrailupApiProvider({
  supabase,
  apiBaseCandidates: resolveApiBaseCandidates(
    process.env.EXPO_PUBLIC_APITRAIUP_URL
  ),
});
```

**IMPORTANTE — instruções para o implementador:**

1. **Copiar os corpos das funções verbatim** de `src/services/personalizacaoApi.ts` para os locais marcados com `// COPIAR corpo de ...`. Não reescrever lógica.

2. **Substituições mecânicas obrigatórias ao copiar:**
   - `supabase` → `this.deps.supabase` (toda referência ao client direto)
   - Helpers internos como `buildUrls`, `requestWithAuth`, `getAuthHeaders` → `this.buildUrls`, `this.requestWithAuth`, etc. (já são private methods agora)
   - Helpers privados copiados (BrainHex, cards) → `this.normalizeBrainhexProfileKey`, etc.
   - `API_BASE_CANDIDATES` (const módulo) → `this.apiBaseCandidates` (instance)

3. **Não copiar:**
   - As declarações de tipos (já moveram para `types.ts`)
   - As classes de erro (já moveram para `errors.ts`)
   - Helpers de cooldown (já estão como métodos privados na classe)
   - `hasPersonalizacaoApiConfigured` (vira `hasApiConfigured` método)

4. **Manter privados** (não na interface mas usados internamente):
   - `normalizeBrainhexProfileKey`, `extractProfileFromStoragePath`, `findProfileInNestedValue`, `extractProfileKeyFromPersonalizacaoRecord`, `extractProfileKeyFromCardRecord`, `mergeCardsIntoPersonalizacaoRecords`, `listarCardsPersonalizadosPersistidosPerfil`

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Esperado: 34 warnings, 0 errors. Se houver `no-unused-vars` em métodos privados que não estão sendo usados, verifique se a cópia ficou completa.

- [ ] **Step 3: tsc**

```bash
npx tsc --noEmit 2>&1 | grep -E "personalizacao/TrailupApiProvider" | head -10
```

Esperado: zero erros no novo arquivo.

- [ ] **Step 4: Commit**

```bash
git add src/services/personalizacao/TrailupApiProvider.ts
git commit -m "refactor(personalizacao): implementa TrailupApiProvider"
```

---

## Task 5: Criar Context + hook

**Files:**
- Create: `src/services/personalizacao/PersonalizacaoProviderContext.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
import React, { createContext, ReactNode, useContext } from "react";

import type { IPersonalizacaoProvider } from "@/services/personalizacao/IPersonalizacaoProvider";
import { defaultTrailupApiProvider } from "@/services/personalizacao/TrailupApiProvider";

const PersonalizacaoProviderContext = createContext<IPersonalizacaoProvider>(
  defaultTrailupApiProvider
);

export function PersonalizacaoProviderProvider({
  provider,
  children,
}: {
  provider?: IPersonalizacaoProvider;
  children: ReactNode;
}) {
  return (
    <PersonalizacaoProviderContext.Provider
      value={provider ?? defaultTrailupApiProvider}
    >
      {children}
    </PersonalizacaoProviderContext.Provider>
  );
}

export function usePersonalizacaoProvider(): IPersonalizacaoProvider {
  return useContext(PersonalizacaoProviderContext);
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/services/personalizacao/PersonalizacaoProviderContext.tsx
git commit -m "refactor(personalizacao): adiciona Context + hook do provider"
```

---

## Task 6: Criar index.ts (reexports)

**Files:**
- Create: `src/services/personalizacao/index.ts`

- [ ] **Step 1: Criar arquivo**

```ts
export type { IPersonalizacaoProvider } from "@/services/personalizacao/IPersonalizacaoProvider";
export type {
  CardPersonalizadoRecord,
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatMessagePayload,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  PersonalizacaoProgressPayload,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";
export {
  PersonalizacaoAuthError,
  PersonalizacaoNetworkError,
  PersonalizacaoRlsError,
  isPersonalizacaoAuthError,
} from "@/services/personalizacao/errors";
export {
  TrailupApiProvider,
  defaultTrailupApiProvider,
} from "@/services/personalizacao/TrailupApiProvider";
export {
  PersonalizacaoProviderProvider,
  usePersonalizacaoProvider,
} from "@/services/personalizacao/PersonalizacaoProviderContext";
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/services/personalizacao/index.ts
git commit -m "refactor(personalizacao): adiciona index com reexports"
```

---

## Task 7: Substituir `personalizacaoApi.ts` pelo shim

**Files:**
- Modify: `src/services/personalizacaoApi.ts` (de 963 linhas para ~80 linhas de shim)

- [ ] **Step 1: Substituir TODO o conteúdo de `src/services/personalizacaoApi.ts` por**

```ts
/**
 * @deprecated Use `usePersonalizacaoProvider()` em componentes/hooks React
 *             ou `defaultTrailupApiProvider` diretamente em utils/scripts.
 *             Este arquivo é mantido apenas como shim de compatibilidade.
 */
import { defaultTrailupApiProvider } from "@/services/personalizacao/TrailupApiProvider";
import type {
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatPayload,
  PersonalizacaoProgressDirectPayload,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";

export {
  PersonalizacaoAuthError,
  PersonalizacaoNetworkError,
  PersonalizacaoRlsError,
  isPersonalizacaoAuthError,
} from "@/services/personalizacao/errors";

export type {
  CardPersonalizadoRecord,
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatMessagePayload,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  PersonalizacaoProgressPayload,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";

export const hasPersonalizacaoApiConfigured = () =>
  defaultTrailupApiProvider.hasApiConfigured();

export const solicitarPersonalizacao = (payload: PersonalizarPayload) =>
  defaultTrailupApiProvider.solicitarPersonalizacao(payload);

export const listarPersonalizacoesPersistidasPerfil = (
  params: ListarPersonalizacoesPerfilParams
) => defaultTrailupApiProvider.listarPersonalizacoesPersistidasPerfil(params);

export const listarJobsPersistidosAluno = (params: ListarJobsParams) =>
  defaultTrailupApiProvider.listarJobsPersistidosAluno(params);

export const salvarProgressoPersonalizadoDiretoSupabase = (
  payload: PersonalizacaoProgressDirectPayload
) =>
  defaultTrailupApiProvider.salvarProgressoPersonalizadoDiretoSupabase(payload);

export const subscribePersonalizacoesPersistidasClasse = (
  params: SubscribePersonalizacoesClasseParams
) => defaultTrailupApiProvider.subscribePersonalizacoesPersistidasClasse(params);

export const conversarComMentorPersonalizacao = (payload: MentorChatPayload) =>
  defaultTrailupApiProvider.conversarComMentorPersonalizacao(payload);
```

**Nota:** Funções que estavam exportadas mas não são consumidas (`listarPersonalizacoesAluno`, `salvarProgressoPersonalizado` HTTP, `listarPersonalizacoesPersistidasAluno`, `listarCardsPersonalizadosPersistidosPerfil`, `subscribePersonalizacoesPersistidasAluno`, `listarPersonalizacoesPersistidasPerfil`) NÃO entram no shim. Confirmar com grep que ninguém usa antes de remover.

- [ ] **Step 2: Verificar callers de funções removidas**

```bash
grep -rn "listarPersonalizacoesAluno\|salvarProgressoPersonalizado[^D]\|listarPersonalizacoesPersistidasAluno\|listarCardsPersonalizadosPersistidosPerfil\|subscribePersonalizacoesPersistidasAluno" src/
```

Esperado: nenhum match fora de `src/services/personalizacao/TrailupApiProvider.ts` (onde alguns viraram private). Se houver match em algum consumidor, REVERTER o shim e adicionar a função correspondente — não remover.

- [ ] **Step 3: Lint + tsc**

```bash
npm run lint
npx tsc --noEmit 2>&1 | grep -E "personalizacao" | head -10
```

Esperado: 34 warnings, sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/services/personalizacaoApi.ts
git commit -m "refactor(personalizacao): reduz personalizacaoApi.ts a shim de compat"
```

---

## Task 8: Migrar `TrilhaContext.tsx`

**Files:**
- Modify: `src/context/TrilhaContext.tsx`

- [ ] **Step 1: Localizar imports atuais e usos**

```bash
grep -n "personalizacaoApi\|usePersonalizacaoProvider" src/context/TrilhaContext.tsx
```

Anote as linhas dos 7 usos atuais (mencionadas no início do plano).

- [ ] **Step 2: Substituir o import de `@/services/personalizacaoApi`**

Antes (provavelmente L25–L37):
```ts
import {
  hasPersonalizacaoApiConfigured,
  listarJobsPersistidosAluno,
  listarPersonalizacoesPersistidasPerfil,
  PersonalizacaoRlsError,
  salvarProgressoPersonalizadoDiretoSupabase,
  solicitarPersonalizacao,
  subscribePersonalizacoesPersistidasClasse,
} from '@/services/personalizacaoApi';
```

Depois:
```ts
import { PersonalizacaoRlsError } from "@/services/personalizacao/errors";
import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
```

- [ ] **Step 3: Adicionar o hook dentro do `TrilhaProvider`**

No topo do componente `TrilhaProvider`, logo após os outros hooks/contextos:

```ts
const personalizacaoProvider = usePersonalizacaoProvider();
```

- [ ] **Step 4: Substituir todas as chamadas das funções por chamadas do provider**

Para cada caller, prefixar com `personalizacaoProvider.`:

| Linha original | Antes | Depois |
|---|---|---|
| L930 | `hasPersonalizacaoApiConfigured()` | `personalizacaoProvider.hasApiConfigured()` |
| L947 | `solicitarPersonalizacao({...})` | `personalizacaoProvider.solicitarPersonalizacao({...})` |
| L977 | `listarPersonalizacoesPersistidasPerfil({...})` | `personalizacaoProvider.listarPersonalizacoesPersistidasPerfil({...})` |
| L1048 | `listarPersonalizacoesPersistidasPerfil({...})` | idem |
| L1081 | `listarJobsPersistidosAluno({...})` | `personalizacaoProvider.listarJobsPersistidosAluno({...})` |
| L1245 | `subscribePersonalizacoesPersistidasClasse({...})` | `personalizacaoProvider.subscribePersonalizacoesPersistidasClasse({...})` |
| L1682 | `salvarProgressoPersonalizadoDiretoSupabase({...})` | `personalizacaoProvider.salvarProgressoPersonalizadoDiretoSupabase({...})` |

**Atenção com `useCallback` deps:** se a chamada está dentro de um `useCallback`, adicionar `personalizacaoProvider` ao dep array.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Esperado: 34 warnings. Se aparecerem `exhaustive-deps` warnings novos, adicionar `personalizacaoProvider` aos arrays correspondentes.

- [ ] **Step 6: tsc**

```bash
npx tsc --noEmit 2>&1 | grep -E "TrilhaContext" | head -10
```

Esperado: zero novos erros.

- [ ] **Step 7: Commit**

```bash
git add src/context/TrilhaContext.tsx
git commit -m "refactor(personalizacao): migra TrilhaContext para usePersonalizacaoProvider"
```

---

## Task 9: Migrar `IAMentorPanel.tsx`

**Files:**
- Modify: `src/components/ia/IAMentorPanel.tsx`

- [ ] **Step 1: Substituir import**

Antes:
```ts
import { conversarComMentorPersonalizacao } from "@/services/personalizacaoApi";
```

Depois:
```ts
import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
```

- [ ] **Step 2: Adicionar hook + substituir chamadas**

No topo do componente:
```ts
const personalizacaoProvider = usePersonalizacaoProvider();
```

Substituir todas as chamadas:
```ts
// Antes
const resp = await conversarComMentorPersonalizacao({...});
// Depois
const resp = await personalizacaoProvider.conversarComMentorPersonalizacao({...});
```

Adicionar `personalizacaoProvider` em qualquer `useCallback`/`useEffect` dep array que envolva a chamada.

- [ ] **Step 3: Lint + tsc**

```bash
npm run lint
npx tsc --noEmit 2>&1 | grep -E "IAMentorPanel" | head -5
```

Esperado: 34 warnings, sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/ia/IAMentorPanel.tsx
git commit -m "refactor(personalizacao): migra IAMentorPanel para usePersonalizacaoProvider"
```

---

## Task 10: Montar `<PersonalizacaoProviderProvider>` no root

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Localizar estrutura atual de providers**

```bash
grep -n "Provider" src/app/_layout.tsx | head -20
```

Identificar a árvore atual de providers (SessaoProvider, TrilhaProvider, etc.).

- [ ] **Step 2: Adicionar import**

```tsx
import { PersonalizacaoProviderProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
```

- [ ] **Step 3: Envolver os providers existentes**

`PersonalizacaoProviderProvider` deve envolver `TrilhaProvider`, `MetricasProvider` (se ele consumir) e qualquer Provider que consuma o provider. Localmente o consumo é em `TrilhaContext` e `IAMentorPanel` (componente, não provider) — então envolver TrilhaProvider já basta.

Antes:
```tsx
<SessaoProvider>
  <TrilhaProvider>
    {/* ... */}
  </TrilhaProvider>
</SessaoProvider>
```

Depois:
```tsx
<SessaoProvider>
  <PersonalizacaoProviderProvider>
    <TrilhaProvider>
      {/* ... */}
    </TrilhaProvider>
  </PersonalizacaoProviderProvider>
</SessaoProvider>
```

> **Nota:** Como o Context tem default value (`defaultTrailupApiProvider`), o app funciona MESMO sem o `<PersonalizacaoProviderProvider>` montado. Mas montar é o caminho correto para permitir override em testes/futuros usos.

- [ ] **Step 4: Lint + smoke conceitual**

```bash
npm run lint
```

Smoke: abrir o app no Expo Go e validar que a tela inicial carrega sem erros (não há funcional novo; só estrutura).

- [ ] **Step 5: Commit**

```bash
git add "src/app/_layout.tsx"
git commit -m "refactor(personalizacao): monta PersonalizacaoProviderProvider no root"
```

---

## Task 11: Validação final e PR

**Files:** nenhum

- [ ] **Step 1: Contagens**

```bash
wc -l src/services/personalizacaoApi.ts src/services/personalizacao/*.ts src/services/personalizacao/*.tsx
```

Esperado:
- `personalizacaoApi.ts`: ~80 linhas (de 963 — redução de 91%)
- `types.ts`: ~120 linhas
- `errors.ts`: ~40 linhas
- `IPersonalizacaoProvider.ts`: ~50 linhas
- `TrailupApiProvider.ts`: ~600 linhas (corpo mantido)
- `PersonalizacaoProviderContext.tsx`: ~30 linhas
- `index.ts`: ~30 linhas

- [ ] **Step 2: Lint completo**

```bash
npm run lint
```

Esperado: 34 warnings, 0 errors.

- [ ] **Step 3: tsc**

```bash
npx tsc --noEmit
```

Esperado: nenhum novo erro em relação ao baseline da `base-teste`.

- [ ] **Step 4: Smoke manual no Expo Go**

Cenários:
1. Abrir o app → autenticar → navegar para uma trilha personalizada → conteúdos carregam.
2. Concluir um item personalizado → progresso é gravado no Supabase.
3. Abrir o painel do mentor → enviar mensagem → resposta volta.
4. Verificar log do console: sem erros novos relacionados a `personalizacao`.

- [ ] **Step 5: Push e PR**

```bash
git push -u origin refactor/personalizacao-provider
gh pr create --base base-teste --title "refactor(personalizacao): abstração via IPersonalizacaoProvider + Context" --body "$(cat docs/superpowers/specs/2026-05-16-personalizacao-provider-abstraction-design.md | head -50)"
```

Se `gh` não estiver autenticado, push e criar PR manualmente no GitHub.

---

## Notas finais

- **Cooldowns como instance state:** os timers `authBlockedUntil` e `networkBlockedUntil` agora são por instância de `TrailupApiProvider`. Como o `defaultTrailupApiProvider` é singleton (criado no módulo), o comportamento permanece idêntico ao código atual.

- **Realtime channels:** `subscribePersonalizacoesPersistidasClasse` continua retornando o `RealtimeChannel` para que o caller chame `channel.unsubscribe()` quando precisar. A interface preserva esse contrato.

- **Funções omitidas no shim:** `listarPersonalizacoesAluno`, `salvarProgressoPersonalizado` (HTTP), `listarPersonalizacoesPersistidasAluno`, `listarCardsPersonalizadosPersistidosPerfil`, `subscribePersonalizacoesPersistidasAluno` foram **removidas** porque não há callers. Se aparecer um caller no futuro, adicionar ao `TrailupApiProvider` + interface + shim.

- **Erros pré-existentes do tsc:** 4 erros remanescentes (`ArvoreView.tsx` x2, `ListaSimplesView.tsx`, `usePersonalizedFlow.ts`) não são afetados por esta frente.

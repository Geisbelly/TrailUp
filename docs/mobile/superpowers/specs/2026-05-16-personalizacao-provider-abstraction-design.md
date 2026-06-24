# Abstração de Provider de Personalização/IA

**Data:** 2026-05-16
**Status:** Aprovado para planejamento
**Branch alvo:** `refactor/personalizacao-provider` (criada a partir de `base-teste`)

## Motivação

Hoje, `src/services/personalizacaoApi.ts` exporta 6 funções HTTP/Supabase consumidas diretamente por contextos React (`TrilhaContext`, `MetricasContext`) e componentes (`IAMentorPanel`). O acoplamento direto:

- Inviabiliza trocar de backend (ex.: provider local em dev, OpenAI direto no futuro).
- Inviabiliza mockar o transporte em testes — exigirá `jest.mock()` do módulo inteiro, frágil.
- Mantém estado de cooldown (auth/network) escondido em closures module-level, difícil de inspecionar/resetar.

Esta frente introduz uma **interface única (`IPersonalizacaoProvider`) injetada via React Context** para o transporte de personalização. A implementação atual vira a default; alternativas (mock, OpenAI, local) ficam viáveis sem mudanças nos consumidores.

## Objetivo

- Definir `IPersonalizacaoProvider` com 6 métodos espelhando 1:1 as funções atuais.
- Extrair `personalizacaoApi.ts` em `TrailupApiProvider` (classe com mesma lógica).
- Criar `PersonalizacaoProviderContext` + hook `usePersonalizacaoProvider()`.
- Migrar todos os consumidores em React tree para usar o hook.
- Reduzir `personalizacaoApi.ts` a shim de reexport para callers fora do React tree (compatibilidade).
- Zero mudança de comportamento.

## Não-objetivos

- Consolidar os dois métodos `salvarProgresso*` (HTTP e Supabase direto)
- Criar provider alternativo funcional (apenas a interface + impl padrão)
- Tocar em `IAContext` (já é uma boa abstração; consome via TrilhaContext)
- Escrever testes automatizados (frente subsequente)
- Migrar para outro backend de IA

## Estrutura de arquivos resultante

```
src/services/personalizacao/
  IPersonalizacaoProvider.ts          Interface (contrato)
  TrailupApiProvider.ts               Impl padrão (extrai personalizacaoApi.ts atual)
  PersonalizacaoProviderContext.tsx   React Context + hook
  index.ts                            Reexports principais

src/services/
  personalizacaoApi.ts                Vira shim (~30 linhas) — deprecated
```

## Interface

```ts
export interface IPersonalizacaoProvider {
  solicitarPersonalizacao(
    payload: PersonalizarPayload
  ): Promise<PersonalizacaoRecord>;

  listarPersonalizacoesAluno(
    params: ListarParams
  ): Promise<PersonalizacaoListResponse>;

  listarPersonalizacoesPersistidasAluno(
    params: ListarSupabaseParams
  ): Promise<PersonalizacaoRecord[]>;

  salvarProgressoPersonalizado(
    payload: ProgressoPayload
  ): Promise<Record<string, any>>;

  salvarProgressoPersonalizadoDiretoSupabase(
    payload: ProgressoPayload
  ): Promise<void>;

  conversarComMentorPersonalizacao(
    payload: MentorChatPayload
  ): Promise<MentorChatResponse>;
}
```

Tipos (`PersonalizarPayload`, `PersonalizacaoRecord`, etc.) são reaproveitados dos exports atuais de `personalizacaoApi.ts` — movidos para `IPersonalizacaoProvider.ts` ou para um arquivo `types.ts` no mesmo diretório.

## Implementação padrão (`TrailupApiProvider`)

```ts
import { SupabaseClient } from "@supabase/supabase-js";

export class TrailupApiProvider implements IPersonalizacaoProvider {
  private authCooldownUntil = 0;
  private networkCooldownUntil = 0;

  constructor(
    private deps: {
      supabase: SupabaseClient;
      baseUrlResolver: () => string;
    }
  ) {}

  async solicitarPersonalizacao(payload) {
    /* corpo atual de personalizacaoApi.ts.solicitarPersonalizacao, com
       this.deps.baseUrlResolver() no lugar do getApiBaseUrl, etc. */
  }

  // demais 5 métodos seguem o mesmo padrão
}

export const defaultTrailupApiProvider = new TrailupApiProvider({
  supabase,
  baseUrlResolver: getApiBaseUrl,
});
```

Decisão: cooldowns viram **instance state** (não mais module-level). Como só haverá um provider ativo por vez no app, comportamento é idêntico ao atual.

## React Context

```ts
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

Default value é o `defaultTrailupApiProvider`, então `usePersonalizacaoProvider()` funciona mesmo sem `PersonalizacaoProviderProvider` montado (mas o ideal é montar no root).

## Mudanças nos consumidores

| Arquivo | Antes | Depois |
|---|---|---|
| `src/context/TrilhaContext.tsx` | `import { solicitarPersonalizacao, listarPersonalizacoesAluno, ... } from "@/services/personalizacaoApi"` | `const provider = usePersonalizacaoProvider();` + chamadas via `provider.solicitarPersonalizacao(...)` |
| `src/context/MetricasContext.tsx` | direto | hook |
| `src/components/ia/IAMentorPanel.tsx` | direto | hook |
| Outros consumidores diretos (a confirmar com grep) | direto | hook |

App root (`src/app/_layout.tsx`) monta `<PersonalizacaoProviderProvider>` em volta dos contextos existentes:

```tsx
<PersonalizacaoProviderProvider>
  <SessaoProvider>
    <TrilhaProvider>
      <MetricasProvider>
        <IAProvider>
          {children}
        </IAProvider>
      </MetricasProvider>
    </TrilhaProvider>
  </SessaoProvider>
</PersonalizacaoProviderProvider>
```

Ordem importa: `PersonalizacaoProviderProvider` deve envolver TODOS os providers que consomem o provider.

## Shim de compatibilidade

`src/services/personalizacaoApi.ts` vira:

```ts
/**
 * @deprecated Use usePersonalizacaoProvider() em código React, ou
 *             defaultTrailupApiProvider diretamente em utils/scripts.
 */
import { defaultTrailupApiProvider } from "@/services/personalizacao/TrailupApiProvider";

export const solicitarPersonalizacao = (p: PersonalizarPayload) =>
  defaultTrailupApiProvider.solicitarPersonalizacao(p);

export const listarPersonalizacoesAluno = (p: ListarParams) =>
  defaultTrailupApiProvider.listarPersonalizacoesAluno(p);

// ... 4 demais reexports

// Reexporta tipos para callers existentes
export type {
  PersonalizarPayload,
  PersonalizacaoRecord,
  PersonalizacaoListResponse,
  ProgressoPayload,
  MentorChatPayload,
  MentorChatResponse,
} from "@/services/personalizacao/IPersonalizacaoProvider";
```

Mantém todos os imports atuais funcionais sem mudança. Permite migração incremental para callers fora do React (utils, scripts).

## Plano de execução (alto nível)

1. **Pré-requisito:** decidir destino do WIP atual (20 arquivos modificados) e da branch `refactor/trilha-id-extract`.
2. Criar branch `refactor/personalizacao-provider` a partir de `base-teste`.
3. **Etapa 1** — Criar diretório `src/services/personalizacao/` com:
   - `types.ts` (tipos compartilhados extraídos de `personalizacaoApi.ts`)
   - `IPersonalizacaoProvider.ts` (interface)
4. **Etapa 2** — Criar `TrailupApiProvider.ts` movendo a lógica de `personalizacaoApi.ts` para uma classe. Exportar `defaultTrailupApiProvider`.
5. **Etapa 3** — Criar `PersonalizacaoProviderContext.tsx` com Provider + hook.
6. **Etapa 4** — Substituir conteúdo de `personalizacaoApi.ts` pelo shim de reexport.
7. **Etapa 5** — Migrar `TrilhaContext.tsx` para usar `usePersonalizacaoProvider()`.
8. **Etapa 6** — Migrar `MetricasContext.tsx`.
9. **Etapa 7** — Migrar `IAMentorPanel.tsx` e outros consumidores diretos.
10. **Etapa 8** — Montar `<PersonalizacaoProviderProvider>` em `src/app/_layout.tsx`.
11. **Etapa 9** — Lint, tsc, smoke manual no Expo (fluxos de personalização e mentor).
12. **Etapa 10** — PR para `base-teste`.

A cada etapa: `npm run lint` + smoke pontual.

## Critérios de aceitação

- `IPersonalizacaoProvider` declarada com 6 métodos
- `TrailupApiProvider` implementa a interface; cooldowns como instance state
- `PersonalizacaoProviderContext` provê o default e permite override por subtree
- Todos os consumidores em React tree usam o hook
- `personalizacaoApi.ts` reduzido a shim (~50 linhas)
- App root monta `<PersonalizacaoProviderProvider>`
- `npm run lint` no baseline; `npx tsc --noEmit` sem novos erros
- Smoke manual: abertura de trilha personalizada, salvar progresso, chat com mentor

## Riscos

| Risco | Mitigação |
|---|---|
| Cooldowns como instance state quebrar se múltiplos providers convivem | Garantir um único provider ativo via Context default + comentário explícito |
| Consumidores fora do React tree (utils puros, scripts) | Esses continuam usando o shim ou `defaultTrailupApiProvider` direto |
| Ordem de mount errada → consumidor acessa provider antes do Context | Default value do Context é `defaultTrailupApiProvider` — funciona mesmo sem Provider |
| Migração de muitos consumidores em um único PR ficar grande | Etapas incrementais com commit por consumidor; PR fica explicado |
| `personalizacaoApi.ts` é importado em ~15+ arquivos — alto blast radius | Shim preserva 100% dos imports; só os 3-4 consumidores principais migram nesta frente |

## Exemplo de provider alternativo (fora do escopo)

```ts
export class InMemoryPersonalizacaoProvider implements IPersonalizacaoProvider {
  constructor(
    private fixtures: {
      personalizacao?: PersonalizacaoRecord;
      mentorReply?: MentorChatResponse;
    } = {}
  ) {}

  async solicitarPersonalizacao() {
    return this.fixtures.personalizacao ?? buildEmptyPersonalizacao();
  }

  async conversarComMentorPersonalizacao() {
    return this.fixtures.mentorReply ?? { reply: "ok", scope: "general" };
  }

  // ... demais métodos com defaults seguros
}
```

Será usado na frente seguinte (testes) ou em dev mode.

## Próximos passos pós-frente

- Adicionar testes que injetam `InMemoryPersonalizacaoProvider` via Context.
- Migrar callers fora do React tree para usar `defaultTrailupApiProvider` direto e remover o shim.
- Consolidar `salvarProgresso*` em método único na interface (com flag de transporte).
- Considerar separar `conversarComMentorPersonalizacao` em interface própria (`IMentorChatProvider`).

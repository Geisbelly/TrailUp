import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// Depois de um deploy novo, abas abertas ainda pedem os chunks com hash da
// versao anterior (ex.: /assets/CadastroAluno-WmwpOGPN.js), que nao existem
// mais. O import dinamico falha ("Failed to fetch dynamically imported
// module") e a pagina fica quebrada. A saida e recarregar uma vez para pegar o
// index.html novo — com trava em sessionStorage para nao entrar em loop se o
// chunk estiver faltando de verdade.

export const CHUNK_RELOAD_KEY = "trailup:chunk-reload-at";
/** Janela em que um segundo reload e bloqueado (evita loop). */
export const CHUNK_RELOAD_WINDOW_MS = 10_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface ReloadDeps {
  storage?: StorageLike | null;
  reload?: () => void;
  now?: () => number;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Reconhece os erros de chunk ausente/antigo dos navegadores e do Vite. */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name} ${error.message}` : typeof error === "string" ? error : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    message,
  );
}

/**
 * Recarrega a pagina no maximo uma vez a cada CHUNK_RELOAD_WINDOW_MS.
 * Retorna true se disparou o reload, false se a trava segurou.
 */
export function reloadOnceForStaleChunk(deps: ReloadDeps = {}): boolean {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const now = (deps.now ?? Date.now)();
  const reload = deps.reload ?? (() => window.location.reload());

  if (!storage) return false; // sem como travar: melhor nao arriscar loop

  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) {
      return false;
    }
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }

  reload();
  return true;
}

/** Instala o handler do evento `vite:preloadError` (Vite >= 5). */
export function installChunkReloadHandler(target: Window = window, deps: ReloadDeps = {}): void {
  target.addEventListener("vite:preloadError", (event) => {
    if (reloadOnceForStaleChunk(deps)) {
      // Evita que o Vite relance o erro enquanto a pagina recarrega.
      event.preventDefault();
    }
  });
}

/**
 * `React.lazy` que, se o chunk for de um deploy antigo, recarrega a pagina
 * uma vez em vez de quebrar a tela. Outros erros seguem normalmente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesma assinatura do React.lazy
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  deps: ReloadDeps = {},
): LazyExoticComponent<T> {
  return lazy(() => loadWithReload(factory, deps));
}

export function loadWithReload<T>(factory: () => Promise<T>, deps: ReloadDeps = {}): Promise<T> {
  return factory().catch((error: unknown) => {
    if (isChunkLoadError(error) && reloadOnceForStaleChunk(deps)) {
      // Mantem o Suspense no fallback ate o reload acontecer.
      return new Promise<T>(() => {});
    }
    throw error;
  });
}

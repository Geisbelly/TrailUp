/* eslint-disable @typescript-eslint/no-require-imports -- dependências nativas opcionais são carregadas apenas quando disponíveis */
// Optional polyfills for React Native without adding hard dependency
import { createClient, Session } from '@supabase/supabase-js'
import { Platform } from 'react-native'

try {
   
  require('react-native-url-polyfill/auto')
} catch {}

// Try to load AsyncStorage on native; fall back to a simple storage
let storage: any = undefined
if (Platform.OS !== 'web') {
  // Native: prefer AsyncStorage, then SecureStore
  try {
     
    storage = require('@react-native-async-storage/async-storage').default
  } catch {
    try {
       
      const SecureStore = require('expo-secure-store')
      storage = {
        getItem: async (k: string) => (await SecureStore.getItemAsync(k)) ?? null,
        setItem: async (k: string, v: string) => { await SecureStore.setItemAsync(k, v) },
        removeItem: async (k: string) => { await SecureStore.deleteItemAsync(k) },
      }
    } catch {
      // Last resort native memory store
      const mem: Record<string, string | null> = {}
      storage = {
        getItem: async (k: string) => mem[k] ?? null,
        setItem: async (k: string, v: string) => { mem[k] = v },
        removeItem: async (k: string) => { mem[k] = null },
      }
    }
  }
} else {
  // Web/SSR: avoid touching window during SSR
  const mem: Record<string, string | null> = {}
  storage = {
    getItem: async (k: string) => {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(k)
      return mem[k] ?? null
    },
    setItem: async (k: string, v: string) => {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.setItem(k, v)
      mem[k] = v
    },
    removeItem: async (k: string) => {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.removeItem(k)
      mem[k] = null
    },
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
   
  console.warn('Supabase env missing: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')
}

// No nativo a sessao chega por deep link, entao detectSessionInUrl fica
// desligado (nao ha URL de navegador pra ler). Na web e o unico jeito de
// capturar a sessao: OAuth (Google), confirmacao de e-mail e recuperacao de
// senha devolvem o token na propria URL (fragmento ou query), e com essa
// flag desligada o cliente simplesmente ignorava esse retorno - o aluno
// voltava do consentimento do Google e continuava deslogado, sem erro.
const detectSessionInUrl = Platform.OS === 'web'

export const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    flowType: 'pkce',
    detectSessionInUrl,
  },
})

// Preenchido se a URL de retorno trazia um erro (ex.: link de confirmacao
// expirado, consentimento OAuth negado) - a tela consome uma vez via
// consumeSupabaseUrlAuthError() para mostrar um dialogo em vez de deixar o
// aluno num estado deslogado sem explicacao.
let pendingUrlAuthError: string | null = null

export function consumeSupabaseUrlAuthError(): string | null {
  const error = pendingUrlAuthError
  pendingUrlAuthError = null
  return error
}

if (detectSessionInUrl && typeof window !== 'undefined') {
  const url = new URL(window.location.href)
  const errorDescription = url.searchParams.get('error_description')
  if (errorDescription) {
    pendingUrlAuthError = errorDescription.replace(/\+/g, ' ')
  }

  // O supabase-js consome o token da URL para estabelecer a sessao, mas
  // nao limpa a URL sozinho - o token (ou o erro acima) ficava visivel na
  // barra de enderecos. Uma unica vez, depois que a sessao inicial assenta,
  // tira o fragmento/query de auth sem mexer no resto da URL (ex.: rota
  // profunda que o link de confirmacao aponte).
  let cleaned = false
  supabase.auth.onAuthStateChange((_event, _session) => {
    if (cleaned) return
    cleaned = true

    const hasHashToken = window.location.hash.includes('access_token')
    const authParams = ['code', 'token_hash', 'type', 'error', 'error_description', 'error_code']
    const hadQueryToken = authParams.some((param) => url.searchParams.has(param))
    if (!hasHashToken && !hadQueryToken) return

    authParams.forEach((param) => url.searchParams.delete(param))
    window.history.replaceState({}, document.title, url.pathname + url.search)
  })
}

function looksLikeInvalidRefreshTokenError(error: unknown) {
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  return /invalid refresh token|refresh token not found/i.test(message)
}

function looksLikeNetworkRetryableError(error: unknown) {
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : ''

  return /network request failed|failed to fetch|fetch failed|networkerror/i.test(message) ||
    /AuthRetryableFetchError|FetchError|TypeError/i.test(name)
}

function extractProjectRef(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return null
  try {
    const hostname = new URL(supabaseUrl).hostname
    return hostname.split('.')[0] ?? null
  } catch {
    return null
  }
}

function getAuthStorageKey() {
  const ref = extractProjectRef(SUPABASE_URL)
  if (!ref) return null
  return `sb-${ref}-auth-token`
}

/**
 * Apaga a sessao deste aparelho SEM tocar na rede: storage mais os caches em
 * memoria deste modulo.
 *
 * O `lastKnownSession` precisa cair junto. Ele existe para sobreviver a queda
 * de rede, e `getSessionSafe()` o devolve enquanto o cooldown estiver ativo --
 * ou seja, depois de um logout ele ressuscitaria a sessao que acabou de ser
 * encerrada, e a mesma falha de rede que quebra o logout e a que arma o
 * cooldown.
 */
export async function removerSessaoLocal() {
  lastKnownSession = null
  clearAuthNetworkBlock()

  const key = getAuthStorageKey()
  if (!key || !storage || typeof storage.removeItem !== 'function') return
  await storage.removeItem(key)
}

export async function clearInvalidSupabaseSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // fallback abaixo
  }

  try {
    await removerSessaoLocal()
  } catch {
    // no-op
  }
}

const AUTH_NETWORK_COOLDOWN_MS = 30_000
let authNetworkBlockedUntil = 0
let lastKnownSession: Session | null = null

function isAuthNetworkBlocked() {
  return authNetworkBlockedUntil > Date.now()
}

function blockAuthNetworkTemporarily() {
  authNetworkBlockedUntil = Date.now() + AUTH_NETWORK_COOLDOWN_MS
}

function clearAuthNetworkBlock() {
  authNetworkBlockedUntil = 0
}

export async function getSessionSafe(): Promise<Session | null> {
  if (isAuthNetworkBlocked()) {
    return lastKnownSession
  }

  try {
    const { data, error } = await supabase.auth.getSession()
    const session = data.session ?? null

    if (!error) {
      clearAuthNetworkBlock()
      lastKnownSession = session
      return session
    }

    if (looksLikeInvalidRefreshTokenError(error)) {
      await clearInvalidSupabaseSession()
      clearAuthNetworkBlock()
      lastKnownSession = null
      return null
    }

    if (looksLikeNetworkRetryableError(error)) {
      blockAuthNetworkTemporarily()
      return session ?? lastKnownSession
    }

    throw error
  } catch (error) {
    if (looksLikeInvalidRefreshTokenError(error)) {
      await clearInvalidSupabaseSession()
      clearAuthNetworkBlock()
      lastKnownSession = null
      return null
    }

    if (looksLikeNetworkRetryableError(error)) {
      blockAuthNetworkTemporarily()
      return lastKnownSession
    }

    throw error
  }
}

export default supabase

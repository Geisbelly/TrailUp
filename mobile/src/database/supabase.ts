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

export const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

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

export async function clearInvalidSupabaseSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // fallback abaixo
  }

  const key = getAuthStorageKey()
  if (!key || !storage || typeof storage.removeItem !== 'function') return
  try {
    await storage.removeItem(key)
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

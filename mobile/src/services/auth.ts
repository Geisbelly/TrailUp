import { supabase } from '@/database/supabase';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

export function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

export { getAuthErrorMessage } from './authErrorMessage';

const GOOGLE_REDIRECT_URI = makeRedirectUri({
  scheme: 'trailupappdsm2502',
  path: 'auth/callback',
});

function readCallbackParams(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

  hashParams.forEach((value, key) => params.set(key, value));
  return params;
}

export const autenticarUsuario = async (email: string, senha: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password: senha
  });

  if (error) throw error;
  return data.user;
};

export async function autenticarComGoogle() {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) throw error;
    return null;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: GOOGLE_REDIRECT_URI,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('OAuth URL ausente.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT_URI);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Login com Google cancelado.');
  }
  if (result.type !== 'success') {
    throw new Error('O login com Google não foi concluído.');
  }

  const callbackParams = readCallbackParams(result.url);
  const errorDescription = callbackParams.get('error_description') ?? callbackParams.get('error');
  if (errorDescription) throw new Error(errorDescription);

  const code = callbackParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return supabase.auth.getUser();
  }

  const accessToken = callbackParams.get('access_token');
  const refreshToken = callbackParams.get('refresh_token');
  if (!accessToken || !refreshToken) {
    throw new Error('Resposta OAuth incompleta.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) throw sessionError;
  return { data: { user: sessionData.user }, error: null };
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: 'exp://localhost:19000/reset-senha', // Substitua pelo seu deep link
  });

  if (error) throw error;
}

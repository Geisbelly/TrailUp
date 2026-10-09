import Constants from 'expo-constants';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/database/supabase';
import {
  isExpoGoEnvironment,
  parseOAuthCallbackParams,
  requirePkceAuthorizationCode,
  resolveGoogleRedirectOptions,
} from './googleRedirect.core';

export function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

export { getAuthErrorMessage } from './authErrorMessage';

export const readGoogleCallbackParams = parseOAuthCallbackParams;

export const autenticarUsuario = async (email: string, senha: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password: senha
  });

  if (error) throw error;
  return data.user;
};

function getGoogleRedirectUri() {
  const expoConstants = Constants as typeof Constants & {
    executionEnvironment?: string;
    appOwnership?: string | null;
  };

  return makeRedirectUri(
    resolveGoogleRedirectOptions(
      Constants.expoConfig?.scheme,
      isExpoGoEnvironment(expoConstants),
    ),
  );
}

export async function autenticarComGoogle() {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) throw error;
    return null;
  }

  const redirectUri = getGoogleRedirectUri();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('OAuth URL ausente.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Login com Google cancelado.');
  }
  if (result.type !== 'success') {
    throw new Error('O login com Google não foi concluído.');
  }

  const callbackParams = readGoogleCallbackParams(result.url);
  const providerError =
    callbackParams.get('error_description') ?? callbackParams.get('error');
  if (providerError) throw new Error(providerError);

  const code = requirePkceAuthorizationCode(callbackParams);
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return supabase.auth.getUser();
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: 'exp://localhost:19000/reset-senha', // Substitua pelo seu deep link
  });

  if (error) throw error;
}

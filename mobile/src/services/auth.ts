import { supabase } from '@/database/supabase';

export function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

export function getAuthErrorMessage(error: unknown) {
  const message = String((error as any)?.message ?? "").trim().toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }

  if (message.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado.";
  }

  if (message.includes("too many requests")) {
    return "Muitas tentativas de login. Tente novamente em alguns minutos.";
  }

  if (message.includes("network")) {
    return "Não foi possível conectar. Verifique sua internet e tente novamente.";
  }

  return "Não foi possível realizar o login agora.";
}

export const autenticarUsuario = async (email: string, senha: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password: senha
  });

  if (error) throw error;
  return data.user;
};

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: 'exp://localhost:19000/reset-senha', // Substitua pelo seu deep link
  });

  if (error) throw error;
}

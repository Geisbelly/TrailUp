import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Links explícitos são processados antes de qualquer sessão de outra conta. */
export async function confirmarSessao(auth: SupabaseClient['auth'], url: URL): Promise<User> {
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (url.searchParams.has('error')) throw new Error('O link de confirmação é inválido ou expirou. Solicite outro link.');
  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else if (token_hash) {
    if (type !== 'signup' && type !== 'email' && type !== 'invite' && type !== 'magiclink') {
      throw new Error('Tipo de confirmação inválido.');
    }
    const { error } = await auth.verifyOtp({ token_hash, type });
    if (error) throw error;
  }
  const { data: sessionData, error: sessionError } = await auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('Confirme seu e-mail ou faça login para continuar o cadastro.');
  const { data, error } = await auth.getUser();
  if (error) throw error;
  if (!data.user?.email || !(data.user.email_confirmed_at ?? data.user.confirmed_at)) {
    throw new Error('E-mail ainda não confirmado. Abra o link enviado para você.');
  }
  return data.user;
}

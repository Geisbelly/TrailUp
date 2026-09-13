// SUPABASE_SERVICE_ROLE_KEY ignora RLS e o endpoint /api/v1/render-and-store
// grava em bucket/path informados pelo chamador. Sem API_SHARED_SECRET
// configurado nesse cenario, esse endpoint vira uma primitiva de escrita
// arbitraria nao autenticada em qualquer bucket que a service role key
// alcance. HARD-FAIL (recusa subir o servidor) em vez de so avisar - decisao
// consciente de 2026-08-17: a alternativa opt-in (so console.warn) depende
// de alguem notar o aviso em producao.
export function checkSupabaseSecretGuard(
  env: Record<string, string | undefined>,
): void {
  const hasServiceRoleKey = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  const hasApiSharedSecret = Boolean((env.API_SHARED_SECRET ?? "").trim());
  if (hasServiceRoleKey && !hasApiSharedSecret) {
    throw new Error(
      "[SEGURANÇA] SUPABASE_SERVICE_ROLE_KEY está configurada mas API_SHARED_SECRET não. "
      + "O endpoint /api/v1/render-and-store ficaria sem autenticação, permitindo escrita "
      + "arbitrária no Supabase Storage via service role key para qualquer chamador. "
      + "Configure API_SHARED_SECRET antes de subir este serviço com a service role key.",
    );
  }
}

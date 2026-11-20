// Pedido do servidor (worker da API) a esta função: só no modo `desafios`, com a chave de serviço
// no Authorization. Os outros modos continuam exigindo professor logado. Ver
// docs/superpowers/specs/2026-11-20-desafios-gerados-automaticamente-design.md §5.
//
// Quem confere se a chave é mesmo de serviço é `criarConferenciaDeServico`
// (`../storage-upload-url/pedido.ts`), a mesma de `storage-redirect` e `storage-upload-url`: a chave
// da API não é byte a byte a `SUPABASE_SERVICE_ROLE_KEY` do ambiente (medido em 03/11), e a
// conferência pergunta ao Auth admin quando a comparação exata falha. Aqui fica só o filtro barato
// que decide se vale perguntar, para o pedido do professor não ganhar um fetch a mais.

function tokenDo(authHeader: string | null | undefined): string {
  const limpo = (authHeader ?? "").trim();
  return limpo.replace(/^bearer\s+/i, "").trim();
}

function payloadDoJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const completo = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binario = atob(completo);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const lido: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return lido && typeof lido === "object" && !Array.isArray(lido) ? (lido as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * O token tem cara de chave de serviço: JWT com `role` `service_role` (chave legada) ou chave
 * `sb_secret_...`. Só decodifica, não valida: quem valida é a conferência. JWT de professor
 * (`authenticated`) ou `anon` dá `false` e segue direto para `requireAuthenticatedUser`.
 */
export function pareceChaveDeServico(authHeader: string | null | undefined): boolean {
  const token = tokenDo(authHeader);
  if (!token) return false;
  if (token.startsWith("sb_secret_")) return true;
  return payloadDoJwt(token)?.role === "service_role";
}

/** Usuário logado passa em qualquer modo; o servidor, só em `desafios`. */
export function autorizar(p: { servidor: boolean; usuario: boolean; mode: string }): "ok" | "recusado" {
  if (p.usuario) return "ok";
  if (p.servidor && p.mode === "desafios") return "ok";
  return "recusado";
}

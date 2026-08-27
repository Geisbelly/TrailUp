export type ConquistaEscopo = "comum" | "perfil";

export type ConquistaComAudiencia = {
  escopo?: string | null;
  perfil_alvo?: string | null;
};

export function normalizeConquistaEscopo(value: unknown): ConquistaEscopo {
  return String(value ?? "").trim().toLowerCase() === "perfil"
    ? "perfil"
    : "comum";
}

export function conquistaVisivelParaPerfis(
  conquista: ConquistaComAudiencia,
  perfis: readonly string[] | null | undefined,
) {
  if (normalizeConquistaEscopo(conquista.escopo) === "comum") return true;

  const alvo = String(conquista.perfil_alvo ?? "").trim().toLowerCase();
  const representativos = new Set(
    (perfis ?? [])
      .map((perfil) => String(perfil ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  return Boolean(alvo && representativos.has(alvo));
}

export function conquistaVisivelParaPerfil(
  conquista: ConquistaComAudiencia,
  perfil: string | null | undefined,
) {
  return conquistaVisivelParaPerfis(conquista, perfil ? [perfil] : []);
}

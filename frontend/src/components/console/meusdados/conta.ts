import { SENHA_MINIMA } from "@/features/auth/passwordPolicy";

/** Limite do campo "Descrição / apresentação" (protótipo: contador 148 / 400). */
export const DESCRICAO_MAX = 400;

export type ForcaSenha = { nivel: 0 | 1 | 2 | 3 | 4; rotulo: string };

/**
 * Medidor visual da nova senha. Não é regra: quem barra é `validarNovaSenha`
 * (mínimo de SENHA_MINIMA). Aqui só se mede, para orientar a escolha.
 */
export function forcaDaSenha(senha: string): ForcaSenha {
  if (!senha) return { nivel: 0, rotulo: "" };
  if (senha.length < SENHA_MINIMA) return { nivel: 1, rotulo: "curta" };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(senha)).length;
  const pontos = (senha.length >= 10 ? 1 : 0) + (senha.length >= 14 ? 1 : 0) + (classes >= 3 ? 1 : 0);
  if (pontos === 0) return { nivel: 2, rotulo: "fraca" };
  if (pontos === 1) return { nivel: 3, rotulo: "boa" };
  return { nivel: 4, rotulo: "forte" };
}

/** "março de 2026", ou null se a data faltar/for inválida. */
export function desdeQuando(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0];
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

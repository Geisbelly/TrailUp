const DIA_MS = 86_400_000;

/** Dias inteiros desde o cadastro (por data de calendário local, nunca negativo). */
export function diasAguardando(criadoEm: string, agora: Date = new Date()): number {
  const d = new Date(criadoEm);
  if (Number.isNaN(d.getTime())) return 0;
  const a = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((a - b) / DIA_MS));
}

export function rotuloEspera(dias: number): string {
  if (dias === 0) return "aguardando desde hoje";
  return `aguardando ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** A partir de quantos dias a espera ganha destaque âmbar (protótipo: 8 dias é urgente, 3 não). */
export const DIAS_URGENTE = 7;

/** "instituição · disciplina", omitindo o que faltar. */
export function resumoProfessor(instituicao: string | null, disciplina: string | null): string {
  return [instituicao, disciplina].map((x) => x?.trim()).filter(Boolean).join(" · ") || "Instituição não informada";
}

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

// ---- E-mail do cadastro: de que instituição é? ----

const PROVEDORES_GRATUITOS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "proton.me", "protonmail.com",
  "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br",
]);

// Segundo nível que, junto de um código de país, forma o domínio registrável (ifto.edu.br, algo.com.br).
const SEGUNDO_NIVEL = new Set(["com", "edu", "org", "gov", "net", "ac", "mil"]);

/** Domínio completo do e-mail em minúsculas, ou null se não parecer um e-mail. */
export function dominioDoEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const partes = email.trim().toLowerCase().split("@");
  if (partes.length !== 2 || !partes[0] || !partes[1].includes(".")) return null;
  return partes[1];
}

/** Domínio registrável: rede.ulbra.br → ulbra.br; mail.ifto.edu.br → ifto.edu.br. */
export function dominioBase(dominio: string): string {
  const labels = dominio.split(".");
  if (labels.length <= 2) return dominio;
  const ultimo = labels[labels.length - 1];
  const penultimo = labels[labels.length - 2];
  const tamanho = ultimo.length === 2 && SEGUNDO_NIVEL.has(penultimo) ? 3 : 2;
  return labels.slice(-tamanho).join(".");
}

/**
 * O cadastro veio de uma instituição diferente da do dono? Só responde "sim" quando
 * dá para comparar: se o e-mail de qualquer dos dois for de provedor gratuito
 * (gmail etc.) ou estiver ausente, não há instituição para comparar e a resposta é
 * "não" — avisar nesse caso seria ruído em toda linha.
 */
export function emailDeOutraInstituicao(candidato: string | null | undefined, dono: string | null | undefined): boolean {
  const a = dominioDoEmail(candidato);
  const b = dominioDoEmail(dono);
  if (!a || !b) return false;
  if (PROVEDORES_GRATUITOS.has(a) || PROVEDORES_GRATUITOS.has(b)) return false;
  return dominioBase(a) !== dominioBase(b);
}

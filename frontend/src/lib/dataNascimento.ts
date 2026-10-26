/**
 * Data de nascimento no cadastro web (#195).
 *
 * A regra que vale é a do banco (`aluno_registrar_data_nascimento`, migração
 * 20261024_02): data única, nem futura nem com mais de 120 anos, "hoje"
 * calculado em Brasília. Aqui só se valida antes da ida ao servidor.
 *
 * A data NÃO vai para os metadados do auth (que o próprio usuário edita e que
 * circulam no JWT). Fica no registro pendente do `localStorage` até o cadastro
 * do aluno existir, e é removida junto com ele. Se o link de confirmação for
 * aberto em outro aparelho, o app pede a data no primeiro acesso.
 */

export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Valor de `<input type="date">` (AAAA-MM-DD) → mensagem de erro, ou null se válido. */
export function validarDataNascimento(iso: string, agora: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "Informe sua data de nascimento.";
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return "Data de nascimento inválida.";
  }
  const hoje = hojeEmBrasilia(agora);
  if (iso > hoje) return "A data de nascimento não pode estar no futuro.";
  if (ano < Number(hoje.slice(0, 4)) - 120) return "Data de nascimento inválida.";
  return null;
}

export function ehMenorDeIdade(iso: string, agora: Date = new Date()): boolean {
  const hoje = hojeEmBrasilia(agora);
  return iso > `${Number(hoje.slice(0, 4)) - 18}${hoje.slice(4)}`;
}

/** Lê a data guardada no registro pendente do cadastro; null se ausente/inválida. */
export function dataDoPendente(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { data_nascimento?: unknown };
    const iso = typeof p.data_nascimento === "string" ? p.data_nascimento : "";
    return validarDataNascimento(iso) ? null : iso;
  } catch {
    return null;
  }
}

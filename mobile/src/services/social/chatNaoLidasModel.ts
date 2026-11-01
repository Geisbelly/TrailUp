/**
 * Mensagens não lidas por conversa, como `chat_nao_lidas()` devolve (`20261102_06`).
 *
 * O banco já conta só o que os OUTROS mandaram, tira remetente bloqueado e, na guilda, conta só
 * enquanto o aluno é membro. Aqui o dado só é organizado para a tela: por colega, por guilda e o
 * total que vai na aba Conversa.
 */
export type TipoDeConversa = "privado" | "guilda";

export type NaoLidas = {
  /** Não lidas por colega (`aluno_id` de quem mandou). */
  privado: Readonly<Record<string, number>>;
  /** Não lidas por guilda. */
  guilda: Readonly<Record<string, number>>;
  total: number;
};

export const SEM_NAO_LIDAS: NaoLidas = { privado: {}, guilda: {}, total: 0 };

/** Linha inválida é descartada: contador errado é pior que contador nenhum. */
export function agruparNaoLidas(linhas: unknown): NaoLidas {
  if (!Array.isArray(linhas)) return SEM_NAO_LIDAS;
  const privado: Record<string, number> = {};
  const guilda: Record<string, number> = {};
  let total = 0;
  for (const linha of linhas) {
    if (!linha || typeof linha !== "object") continue;
    const { tipo, conversa_id: conversa, nao_lidas: bruto } = linha as Record<string, unknown>;
    const n = Number(bruto);
    if (typeof conversa !== "string" || !conversa || !Number.isInteger(n) || n <= 0) continue;
    const destino = tipo === "privado" ? privado : tipo === "guilda" ? guilda : null;
    if (!destino) continue;
    destino[conversa] = (destino[conversa] ?? 0) + n;
    total += n;
  }
  return total === 0 ? SEM_NAO_LIDAS : { privado, guilda, total };
}

/** Zera a conversa na hora em que ela abre, sem esperar a próxima leitura do banco. */
export function zerarConversa(atual: NaoLidas, tipo: TipoDeConversa, conversaId: string): NaoLidas {
  const n = atual[tipo][conversaId] ?? 0;
  if (n === 0) return atual;
  const resto = { ...atual[tipo] };
  delete resto[conversaId];
  const total = atual.total - n;
  if (total <= 0) return SEM_NAO_LIDAS;
  return { ...atual, [tipo]: resto, total };
}

/** Selo curto: o número até 9, depois "9+". */
export function rotuloDoContador(n: number): string {
  return n > 9 ? "9+" : String(Math.max(0, Math.trunc(n)));
}

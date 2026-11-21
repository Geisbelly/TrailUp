/**
 * Textos da aba "Momentos de cuidado" (`cuidado_da_turma`, migração `20261120_05`).
 *
 * O professor vê o que ACONTECEU (origem, fatos de uso, o que o app e o Guia fizeram, se o aluno
 * pausou), nunca o que o aluno escreveu nem o nível que o Guia identificou: a RPC não devolve
 * `nivel`. Nenhuma frase daqui rotula o aluno ("ansiedade", "crise", "estresse"): fala do uso e
 * das ações.
 */

export type OrigemDoMomento = "aluno_disse" | "sinais_de_uso";
export type RespostaAoAviso = "pausou" | "continuou" | null;

export type MomentoDeCuidado = {
  criado_em: string;
  topico_id: number | null;
  origem: OrigemDoMomento;
  fatos: Record<string, number>;
  acoes: Record<string, boolean>;
  resposta: RespostaAoAviso;
  tentativas_antes: number;
  acerto_antes_pct: number | null;
  tentativas_depois: number;
  acerto_depois_pct: number | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : num(v));

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function normalizarMomento(l: Record<string, unknown>): MomentoDeCuidado {
  const fatos: Record<string, number> = {};
  for (const [k, v] of Object.entries(objeto(l.fatos))) fatos[k] = num(v);
  const acoes: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(objeto(l.acoes))) acoes[k] = v === true;
  return {
    criado_em: String(l.criado_em ?? ""),
    topico_id: numOuNulo(l.topico_id),
    origem: l.origem === "aluno_disse" ? "aluno_disse" : "sinais_de_uso",
    fatos,
    acoes,
    resposta: l.resposta === "pausou" || l.resposta === "continuou" ? l.resposta : null,
    tentativas_antes: num(l.tentativas_antes),
    acerto_antes_pct: numOuNulo(l.acerto_antes_pct),
    tentativas_depois: num(l.tentativas_depois),
    acerto_depois_pct: numOuNulo(l.acerto_depois_pct),
  };
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Junta com vírgulas e "e" antes do último. */
function lista(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

export function textoDosFatos(fatos: Record<string, number>): string {
  const partes: string[] = [];
  if (fatos.erros_seguidos) partes.push(plural(fatos.erros_seguidos, "erro seguido", "erros seguidos"));
  if (fatos.minutos_sem_parar) partes.push(`${fatos.minutos_sem_parar} min sem parar`);
  if (fatos.abandonos) partes.push(plural(fatos.abandonos, "atividade largada sem concluir", "atividades largadas sem concluir"));
  return partes.join(", ");
}

export function textoDaOrigem(m: Pick<MomentoDeCuidado, "origem" | "fatos">): string {
  if (m.origem === "aluno_disse") return "O aluno disse ao Guia que não estava bem";
  const fatos = textoDosFatos(m.fatos);
  return fatos ? `Sinais de uso: ${fatos}` : "Sinais de uso";
}

export function textoDasAcoes(acoes: Record<string, boolean>): string {
  const doApp: string[] = [];
  if (acoes.pausa_sugerida) doApp.push("sugeriu uma pausa");
  if (acoes.cronometro_desligado) doApp.push("desligou o cronômetro");
  if (acoes.tecnica_oferecida) doApp.push("ofereceu uma técnica de calma");
  const frases: string[] = [];
  if (doApp.length) frases.push(`O app ${lista(doApp)}`);
  if (acoes.cvv_indicado) frases.push(frases.length ? "o Guia indicou o CVV 188" : "O Guia indicou o CVV 188");
  return frases.length ? `${frases.join(", e ")}.` : "";
}

export function textoDaResposta(r: RespostaAoAviso): string {
  if (r === "pausou") return "Fez a pausa";
  if (r === "continuou") return "Preferiu continuar";
  return "";
}

export function rpcAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "42883" ||
    erro.code === "PGRST202" ||
    /function .* does not exist|could not find the function/i.test(erro.message ?? "")
  );
}

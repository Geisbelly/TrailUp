/**
 * Conversão entre o `<input type="date">` do console e `atividades.data_entrega`
 * (`timestamptz`).
 *
 * O PROBLEMA. O input devolve `AAAA-MM-DD` — data sem hora e sem fuso. Gravada
 * crua, o Postgres lê como meia-noite no fuso da SESSÃO, que no Supabase é UTC.
 * Medido: `'2026-09-20'::timestamptz` em Brasília é `2026-09-19 21:00`. O
 * professor marca dia 20 e o prazo vence às 21h do dia 19 — três horas antes de
 * o dia começar, e o aluno perde um dia inteiro sem ter como entender por quê.
 *
 * A REGRA. Grava-se o **fim do dia escolhido, no fuso de quem escolheu**, como
 * instante absoluto. "20/09" passa a significar "até o fim de 20/09 para quem
 * marcou", e cada leitor renderiza no próprio fuso.
 *
 * O CAMINHO DE VOLTA É PARTE DA CORREÇÃO, não um extra. `<input type="date">`
 * não aceita um ISO completo: reabrir uma atividade com prazo mostrava o campo
 * VAZIO, e salvar de novo gravava `null` — apagando o prazo sem aviso. Por isso
 * as duas funções nascem juntas e o teste de ida-e-volta é o que importa.
 */

/** `AAAA-MM-DD` do input. Vazio/invalido vira `null`. */
export function prazoParaBanco(dataLocal: string | null | undefined): string | null {
  const texto = String(dataLocal ?? "").trim();
  if (!texto) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // `new Date(ano, mes-1, dia, ...)` constrói no fuso LOCAL, que é o de quem
  // escolheu. 23:59:59.999 e' o ultimo instante do dia — usar 00:00 do dia
  // seguinte faria "vence dia 20" aparecer como 21 em qualquer formatação.
  const instante = new Date(ano, mes - 1, dia, 23, 59, 59, 999);

  // Rejeita data impossivel (31/02 vira 03/03 no construtor do JS).
  if (
    instante.getFullYear() !== ano ||
    instante.getMonth() !== mes - 1 ||
    instante.getDate() !== dia
  ) {
    return null;
  }

  return instante.toISOString();
}

/** Instante absoluto do banco -> `AAAA-MM-DD` para o input, no fuso local. */
export function prazoParaFormulario(valor: string | null | undefined): string {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";

  const instante = new Date(texto);
  if (Number.isNaN(instante.getTime())) return "";

  const ano = String(instante.getFullYear()).padStart(4, "0");
  const mes = String(instante.getMonth() + 1).padStart(2, "0");
  const dia = String(instante.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

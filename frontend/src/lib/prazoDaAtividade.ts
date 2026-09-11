// Prazo de entrega da atividade: o que o console grava e o que ele reexibe.
//
// `atividades.data_entrega` e `timestamptz`, e o formulario usa
// `<input type="date">`, que devolve `AAAA-MM-DD` -- uma data sem hora e sem
// fuso. Gravar essa string crua e o defeito: o Postgres a le como MEIA-NOITE no
// fuso da sessao, que no Supabase e UTC. Medido no banco:
//
//   '2026-09-20'::timestamptz                              -> 2026-09-20 00:00+00
//   '2026-09-20'::timestamptz AT TIME ZONE 'America/Sao_Paulo' -> 2026-09-19 21:00
//
// Ou seja: o prazo de 20/09 vencia as 21h do dia 19, tres horas antes de o dia
// comecar. O aluno perderia um dia inteiro sem entender por que.
//
// A correcao e gravar o FIM do dia escolhido, no fuso de quem escolheu, como
// instante absoluto. Assim "20/09" significa "ate o fim de 20/09 para o
// professor que marcou", e cada leitor renderiza esse instante no proprio fuso.

/** Formato do `<input type="date">`. */
const DATA_LOCAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `AAAA-MM-DD` -> instante ISO do fim daquele dia, no fuso local.
 *
 * Devolve `null` para vazio (prazo e opcional) e para o que nao e data --
 * gravar lixo num `timestamptz` faria o INSERT falhar longe daqui.
 */
export function prazoParaGravar(dataLocal: string | null | undefined): string | null {
  const bruta = (dataLocal ?? "").trim();
  if (!bruta || !DATA_LOCAL.test(bruta)) return null;

  const [ano, mes, dia] = bruta.split("-").map(Number);

  // `new Date(ano, mes-1, dia, ...)` usa o fuso local, que e exatamente o que
  // se quer aqui. `new Date('2026-09-20')` faria o oposto: interpreta como UTC.
  const fimDoDia = new Date(ano, mes - 1, dia, 23, 59, 59, 999);

  // Data invalida (31/02, por exemplo) rola para o mes seguinte em vez de
  // estourar. Conferir o dia de volta e o unico jeito de pegar isso.
  if (
    fimDoDia.getFullYear() !== ano ||
    fimDoDia.getMonth() !== mes - 1 ||
    fimDoDia.getDate() !== dia
  ) {
    return null;
  }

  return fimDoDia.toISOString();
}

/**
 * Instante ISO -> `AAAA-MM-DD` no fuso local, para reabrir no formulario.
 *
 * Sem isto, editar uma atividade com prazo mostrava campo vazio: o
 * `<input type="date">` nao aceita um ISO completo, e o valor sumia -- salvar
 * de novo apagaria o prazo sem o professor perceber.
 */
export function prazoParaFormulario(iso: string | null | undefined): string {
  if (!iso) return "";

  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return "";

  const mes = String(quando.getMonth() + 1).padStart(2, "0");
  const dia = String(quando.getDate()).padStart(2, "0");
  return `${quando.getFullYear()}-${mes}-${dia}`;
}

/** Como o prazo aparece na lista do console. */
export function formatarPrazo(iso: string | null | undefined): string {
  const local = prazoParaFormulario(iso);
  if (!local) return "sem prazo";
  const [ano, mes, dia] = local.split("-");
  return `${dia}/${mes}/${ano}`;
}

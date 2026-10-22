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
 * QUAL PAR USAR. O editor de trilha usa `<input type="datetime-local">`, então o par vivo é
 * `prazoLocalParaBanco`/`prazoBancoParaLocal` (abaixo). `prazoParaBanco`/`prazoParaFormulario`
 * são para `<input type="date">` e implementam a regra de "fim do dia escolhido" — ficam porque
 * a regra continua válida se um formulário voltar a pedir só a data, e porque é a semântica que
 * a issue #177 propôs. Nenhum dos dois estava ligado em nenhuma tela até 22/10: a lib nasceu
 * para um input `date` que o editor já não usava, e o bug seguiu vivo com outra cara.
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

// ── `<input type="datetime-local">`: o par que o editor de trilha usa ──────────────────────

/**
 * `AAAA-MM-DDTHH:MM` (ou `...:SS`) do input -> instante absoluto, lido no fuso de quem escolheu.
 *
 * É o conserto do defeito que sobrou da #177. O valor de `datetime-local` **não tem fuso**:
 * gravado cru, o Postgres o lê como UTC. Medido: o professor em Brasília marcando
 * `2026-09-20T00:00` ficava com `2026-09-20 00:00+00`, que é **19/09 21:00** na tela dele — o
 * prazo vence no dia anterior. Qualquer hora antes de 03:00 cai no dia errado; o resto fica
 * deslocado pelo offset.
 *
 * `new Date(ano, mes-1, dia, hora, minuto)` constrói no fuso LOCAL, então `toISOString()` sai
 * com o instante certo para o momento que a pessoa viu na tela.
 */
export function prazoLocalParaBanco(valorDoInput: string | null | undefined): string | null {
  const texto = String(valorDoInput ?? "").trim();
  if (!texto) return null;

  // JÁ TEM FUSO: passa adiante sem reinterpretar.
  //
  // Isto não é zelo extra — é o que permite esta função ser o único ponto de conversão. O
  // caminho de edição carrega no formulário o valor que veio do banco (um ISO em UTC) e o grava
  // de volta; se os dígitos dele fossem lidos como hora local, cada salvamento deslocaria o
  // prazo pelo offset, acumulando. Com a passagem adiante, dá para converter na camada que
  // grava (`topicsApi.saveActivity`) e cobrir todos os chamadores de uma vez.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(texto)) {
    const jaAbsoluto = new Date(texto);
    return Number.isNaN(jaAbsoluto.getTime()) ? null : jaAbsoluto.toISOString();
  }

  // SÓ A DATA, sem hora: aplica a regra de "fim do dia escolhido" da #177.
  //
  // Nenhum formulário do editor manda isto hoje (todos usam `datetime-local`), mas devolver
  // `null` aqui apagaria um prazo em silêncio — que é exatamente o efeito colateral que a #177
  // descreve. Aceitar as três formas num ponto só é o que torna seguro converter na camada que
  // grava.
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return prazoParaBanco(texto);

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(texto);
  if (!m) return null;

  const [ano, mes, dia, hora, minuto] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  const segundo = m[6] === undefined ? 0 : Number(m[6]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 59) {
    return null;
  }

  const instante = new Date(ano, mes - 1, dia, hora, minuto, segundo, 0);
  // Data impossível (31/02 vira 03/03 no construtor do JS) não vira prazo silencioso.
  if (
    instante.getFullYear() !== ano ||
    instante.getMonth() !== mes - 1 ||
    instante.getDate() !== dia
  ) {
    return null;
  }
  return instante.toISOString();
}

/**
 * Instante do banco -> `AAAA-MM-DDTHH:MM` para o input, no fuso local.
 *
 * Sem isto o formulário de edição não pode ter campo de prazo: `datetime-local` não aceita um
 * ISO com fuso, e o campo apareceria vazio. Era assim que a #177 descrevia o efeito colateral
 * "editar apaga o prazo" — no editor atual o sintoma é outro (não havia campo nenhum, então não
 * dava para mudar nem limpar), mas a raiz é a mesma: faltava o caminho de volta.
 */
export function prazoBancoParaLocal(valor: string | null | undefined): string {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";

  const instante = new Date(texto);
  if (Number.isNaN(instante.getTime())) return "";

  const dois = (n: number) => String(n).padStart(2, "0");
  return (
    `${String(instante.getFullYear()).padStart(4, "0")}-${dois(instante.getMonth() + 1)}-` +
    `${dois(instante.getDate())}T${dois(instante.getHours())}:${dois(instante.getMinutes())}`
  );
}

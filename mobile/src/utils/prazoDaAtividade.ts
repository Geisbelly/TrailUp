/**
 * Prazo de entrega da atividade, do ponto de vista do aluno.
 *
 * `atividades.data_entrega` guarda um INSTANTE (o fim do dia escolhido pelo
 * professor, no fuso dele). Aqui ele é traduzido para o que o aluno precisa
 * saber: falta quanto, é hoje, ou já passou.
 *
 * ## A conta é em DIAS DE CALENDÁRIO, não em horas
 *
 * Dividir a diferença por 24h daria "faltam 0 dias" para uma atividade que
 * vence amanhã às 23h59 -- são 20 horas, que arredondam para zero. O aluno
 * leria "0 dias" como "é hoje". O que ele conta é dia de calendário: hoje,
 * amanhã, depois. Por isso a comparação normaliza as duas pontas para o começo
 * do dia local antes de subtrair.
 *
 * ## Prazo não bloqueia
 *
 * Atrasado é AVISO, não porta fechada: a atividade continua aberta e continua
 * pagando. Bloquear prenderia o aluno que voltou depois de uma semana doente, e
 * descontar pontos exigiria que o banco soubesse do prazo na hora de pagar --
 * `fn_pontos_do_evento` recebe só o tipo do evento. Se o desconto for desejado,
 * é uma decisão de produto com mudança no banco, não um detalhe desta tela.
 */

export type EstadoDoPrazo = "sem-prazo" | "futuro" | "amanha" | "hoje" | "atrasado";

export interface SituacaoDoPrazo {
  estado: EstadoDoPrazo;
  /** `null` quando não há prazo -- a tela não mostra nada. */
  rotulo: string | null;
  /**
   * Dias de calendário até o prazo. Negativo quando já passou, `null` sem
   * prazo. Zero é hoje.
   */
  dias: number | null;
}

const SEM_PRAZO: SituacaoDoPrazo = { estado: "sem-prazo", rotulo: null, dias: null };

/** Começo do dia local, para a diferença sair em dias de calendário. */
function inicioDoDia(quando: Date): number {
  return new Date(
    quando.getFullYear(),
    quando.getMonth(),
    quando.getDate(),
  ).getTime();
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export function situacaoDoPrazo(
  dataEntrega: string | null | undefined,
  agora: Date = new Date(),
): SituacaoDoPrazo {
  if (!dataEntrega) return SEM_PRAZO;

  const prazo = new Date(dataEntrega);
  if (Number.isNaN(prazo.getTime())) {
    // Data ilegível não pode virar "atrasado": seria acusar o aluno por um
    // defeito de dado.
    return SEM_PRAZO;
  }

  const dias = Math.round((inicioDoDia(prazo) - inicioDoDia(agora)) / UM_DIA_MS);

  if (dias < 0) {
    const atraso = Math.abs(dias);
    return {
      estado: "atrasado",
      dias,
      rotulo:
        atraso === 1 ? "Atrasado desde ontem" : `Atrasado há ${atraso} dias`,
    };
  }

  if (dias === 0) return { estado: "hoje", dias, rotulo: "Entrega hoje" };
  if (dias === 1) return { estado: "amanha", dias, rotulo: "Entrega amanhã" };

  return { estado: "futuro", dias, rotulo: `Faltam ${dias} dias` };
}

/** `true` quando vale destacar -- hoje, amanhã ou atrasado. */
export function prazoMereceDestaque(situacao: SituacaoDoPrazo): boolean {
  return (
    situacao.estado === "hoje" ||
    situacao.estado === "amanha" ||
    situacao.estado === "atrasado"
  );
}

/**
 * Data do prazo em `DD/MM`, para a linha de apoio.
 *
 * Sem o ano: o prazo relevante é de dias, e o ano ocuparia espaço sem informar.
 * Aparece quando o prazo cai em outro ano, onde omitir enganaria.
 */
export function formatarPrazoCurto(
  dataEntrega: string | null | undefined,
  agora: Date = new Date(),
): string | null {
  if (!dataEntrega) return null;

  const prazo = new Date(dataEntrega);
  if (Number.isNaN(prazo.getTime())) return null;

  const dia = String(prazo.getDate()).padStart(2, "0");
  const mes = String(prazo.getMonth() + 1).padStart(2, "0");

  if (prazo.getFullYear() !== agora.getFullYear()) {
    return `${dia}/${mes}/${prazo.getFullYear()}`;
  }

  return `${dia}/${mes}`;
}

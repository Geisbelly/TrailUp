/**
 * Estado do prazo de uma atividade, para o selo no app do aluno.
 *
 * CONTAGEM EM DIAS DE CALENDARIO, nao em blocos de 24h. A diferenca importa:
 * algo que vence amanha as 23h esta' a 33 horas de distancia; dividir por 24
 * daria "faltam 1 dia" — mas se o aluno abre as 14h de hoje e o prazo e' hoje
 * as 23h, a divisao daria "faltam 0 dias", e ele leria como "e' hoje" quando
 * ainda tem nove horas. Pior no sentido inverso: 25 horas vira "1 dia" mesmo
 * quando o vencimento e' depois de amanha.
 *
 * O aluno pensa em "hoje", "amanha", "atrasado" — nao em multiplos de 24h.
 * Entao a conta e' feita sobre a MEIA-NOITE local de cada data.
 *
 * NAO BLOQUEIA E NAO DESCONTA, de proposito (ver issue #177): atrasado e'
 * aviso. A atividade continua aberta e continua pagando — bloquear prenderia
 * quem voltou depois de uma semana doente.
 */

export type EstadoDoPrazo =
  | { tipo: "sem_prazo" }
  | { tipo: "atrasado"; dias: number }
  | { tipo: "hoje" }
  | { tipo: "amanha" }
  | { tipo: "futuro"; dias: number };

/** Meia-noite local da data do instante — a base da contagem por calendário. */
function meiaNoiteLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export function estadoDoPrazo(
  dataEntrega: string | null | undefined,
  agora: Date = new Date(),
): EstadoDoPrazo {
  const texto = String(dataEntrega ?? "").trim();
  if (!texto) return { tipo: "sem_prazo" };

  const prazo = new Date(texto);
  if (Number.isNaN(prazo.getTime())) return { tipo: "sem_prazo" };

  // Diferenca entre as MEIA-NOITES, nao entre os instantes. O resultado e'
  // sempre inteiro, e imune a que horas do dia o aluno abriu o app.
  const diffMs = meiaNoiteLocal(prazo).getTime() - meiaNoiteLocal(agora).getTime();
  // `Math.round` e nao `floor`: o horario de verao faz um "dia" ter 23 ou 25
  // horas, e floor transformaria isso em erro de um dia.
  const dias = Math.round(diffMs / UM_DIA_MS);

  if (dias < 0) return { tipo: "atrasado", dias: Math.abs(dias) };
  if (dias === 0) return { tipo: "hoje" };
  if (dias === 1) return { tipo: "amanha" };
  return { tipo: "futuro", dias };
}

/** Texto curto para o selo. */
export function rotuloDoPrazo(estado: EstadoDoPrazo): string | null {
  switch (estado.tipo) {
    case "sem_prazo":
      return null;
    case "hoje":
      return "Entrega hoje";
    case "amanha":
      return "Entrega amanhã";
    case "atrasado":
      return estado.dias === 1 ? "Atrasada 1 dia" : `Atrasada ${estado.dias} dias`;
    case "futuro":
      return `Faltam ${estado.dias} dias`;
  }
}

/** Urgência do selo, para a cor. Não é cor: a tela decide a paleta. */
export function urgenciaDoPrazo(estado: EstadoDoPrazo): "nenhuma" | "atencao" | "critica" {
  if (estado.tipo === "atrasado") return "critica";
  if (estado.tipo === "hoje" || estado.tipo === "amanha") return "atencao";
  return "nenhuma";
}

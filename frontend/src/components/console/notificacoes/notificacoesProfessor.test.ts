import { describe, expect, it } from "vitest";
import {
  caminhoDaNotificacao,
  contarNaoLidas,
  eTabelaAusente,
  ordenarNotificacoes,
  rotuloDaContagem,
  tempoRelativo,
  type NotificacaoDoProfessor,
} from "./notificacoesProfessor";

const base: NotificacaoDoProfessor = {
  id: 1,
  professor_id: "p1",
  classe_id: 10,
  tipo: "recomendacao_ia",
  titulo: "Recomendações da IA aguardando decisão",
  corpo: "A IA propôs algo.",
  destino: "recomendacoes",
  contagem: 1,
  dedupe_key: "rec:10:g1",
  lida_em: null,
  created_at: "2026-11-02T10:00:00Z",
  atualizado_em: "2026-11-02T10:00:00Z",
};
const n = (p: Partial<NotificacaoDoProfessor>): NotificacaoDoProfessor => ({ ...base, ...p });

describe("caminhoDaNotificacao", () => {
  it("leva à aba que resolve o assunto", () => {
    expect(caminhoDaNotificacao({ destino: "recomendacoes" })).toBe("/console/recomendacoes");
    expect(caminhoDaNotificacao({ destino: "notas" })).toBe("/console/notas");
    expect(caminhoDaNotificacao({ destino: "personalizacoes" })).toBe("/console/personalizacoes");
    expect(caminhoDaNotificacao({ destino: "eventos" })).toBe("/console/eventos");
  });
  it("sem destino ou com destino de uma versão futura, cai na Visão geral", () => {
    expect(caminhoDaNotificacao({ destino: null })).toBe("/console");
    expect(caminhoDaNotificacao({ destino: "alguma_aba_nova" })).toBe("/console");
    // `in` olharia o protótipo: "toString" não pode virar uma aba.
    expect(caminhoDaNotificacao({ destino: "toString" })).toBe("/console");
  });
});

describe("contarNaoLidas e ordenarNotificacoes", () => {
  it("conta só as sem lida_em", () => {
    expect(contarNaoLidas([n({ id: 1 }), n({ id: 2, lida_em: "2026-11-02T11:00:00Z" }), n({ id: 3 })])).toBe(2);
    expect(contarNaoLidas([])).toBe(0);
  });
  it("mais recente primeiro, com desempate estável pelo id", () => {
    const lista = [
      n({ id: 1, atualizado_em: "2026-11-02T10:00:00Z" }),
      n({ id: 3, atualizado_em: "2026-11-02T12:00:00Z" }),
      n({ id: 2, atualizado_em: "2026-11-02T12:00:00Z" }),
    ];
    expect(ordenarNotificacoes(lista).map((x) => x.id)).toEqual([3, 2, 1]);
  });
  it("não muda a lista original", () => {
    const lista = [n({ id: 1 }), n({ id: 2, atualizado_em: "2026-11-02T12:00:00Z" })];
    ordenarNotificacoes(lista);
    expect(lista.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("tempoRelativo", () => {
  const agora = new Date("2026-11-02T12:00:00Z");
  it("escolhe a unidade pelo tamanho do intervalo", () => {
    expect(tempoRelativo("2026-11-02T11:59:40Z", agora)).toBe("agora");
    expect(tempoRelativo("2026-11-02T11:15:00Z", agora)).toBe("há 45 min");
    expect(tempoRelativo("2026-11-02T07:00:00Z", agora)).toBe("há 5 h");
    expect(tempoRelativo("2026-11-01T11:00:00Z", agora)).toBe("há 1 dia");
    expect(tempoRelativo("2026-10-29T12:00:00Z", agora)).toBe("há 4 dias");
  });
  it("relógio atrasado não gera tempo negativo", () => {
    expect(tempoRelativo("2026-11-02T12:05:00Z", agora)).toBe("agora");
  });
});

describe("rotuloDaContagem", () => {
  it("só aparece quando o assunto se repetiu", () => {
    expect(rotuloDaContagem(1)).toBeNull();
    expect(rotuloDaContagem(3)).toBe("3 ocorrências");
  });
});

describe("eTabelaAusente", () => {
  it("reconhece migration não aplicada, pelos dois códigos e pela mensagem", () => {
    expect(eTabelaAusente({ code: "42P01" })).toBe(true);
    expect(eTabelaAusente({ code: "PGRST205" })).toBe(true);
    expect(eTabelaAusente({ message: 'relation "public.professor_notificacoes" does not exist' })).toBe(true);
  });
  it("outro erro não esconde o sino", () => {
    expect(eTabelaAusente(null)).toBe(false);
    expect(eTabelaAusente({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

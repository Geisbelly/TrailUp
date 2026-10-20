import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventoEmDestaque,
  faseDoEvento,
  minhaPosicao,
  normalizeEvento,
  podioDoEvento,
  rotuloDaFase,
  type EventoDaTurma,
} from "./eventoModel";

const AGORA = new Date("2026-10-19T15:00:00Z");

const cru = (extra: Record<string, unknown> = {}) => ({
  id: "ev-1",
  titulo: " Gincana de outubro ",
  descricao: "Vale medalha",
  status: "aberto",
  inicio: "2026-10-19T12:00:00Z",
  fim: "2026-10-19T18:00:00Z",
  modalidade_guilda: false,
  pontos: 50,
  moedas: 10,
  medalha_participacao: true,
  medalha_destaque: true,
  recompensa: null,
  missoes: [
    { atividade_id: 1367, atividade: { titulo: "Prova de fogo" } },
    { atividade_id: 0 },
  ],
  posicoes: [],
  ...extra,
});

const evento = (extra: Record<string, unknown> = {}) => normalizeEvento(cru(extra))!;

describe("normalizeEvento", () => {
  it("limpa o título e lê as recompensas", () => {
    const e = evento();
    assert.equal(e.titulo, "Gincana de outubro");
    assert.equal(e.pontos, 50);
    assert.equal(e.moedas, 10);
    assert.equal(e.medalhaDestaque, true);
  });

  it("missão sem atividade válida é descartada", () => {
    assert.deepEqual(evento().missoes, [{ atividadeId: 1367, titulo: "Prova de fogo" }]);
  });

  it("sem título da atividade, o id ainda identifica a missão", () => {
    const e = evento({ missoes: [{ atividade_id: 99 }] });
    assert.equal(e.missoes[0].titulo, "Atividade 99");
  });

  it("sem id não há evento", () => {
    assert.equal(normalizeEvento({ ...cru(), id: null }), null);
    assert.equal(normalizeEvento(null), null);
  });

  it("status desconhecido não vira encerrado", () => {
    // `rascunho` não chega por policy, mas se chegasse não poderia virar "encerrado".
    assert.equal(evento({ status: "rascunho" }).status, "aberto");
    assert.equal(evento({ status: "encerrado" }).status, "encerrado");
  });
});

describe("faseDoEvento", () => {
  it("dentro da janela e aberto: em andamento", () => {
    assert.equal(faseDoEvento(evento(), AGORA), "em_andamento");
  });

  it("antes do início: agendado", () => {
    const e = evento({ inicio: "2026-10-20T12:00:00Z", fim: "2026-10-20T18:00:00Z" });
    assert.equal(faseDoEvento(e, AGORA), "agendado");
  });

  it("janela vencida mas ainda aberto: aguardando apuração, não em andamento", () => {
    // O professor é quem encerra; dizer "em andamento" aqui seria mentira.
    const e = evento({ inicio: "2026-10-18T12:00:00Z", fim: "2026-10-18T18:00:00Z" });
    assert.equal(faseDoEvento(e, AGORA), "aguardando_apuracao");
  });

  it("encerrado manda, mesmo dentro da janela", () => {
    assert.equal(faseDoEvento(evento({ status: "encerrado" }), AGORA), "encerrado");
  });

  it("sem janela, aberto é em andamento", () => {
    assert.equal(faseDoEvento(evento({ inicio: null, fim: null }), AGORA), "em_andamento");
  });

  it("data inválida não derruba a fase", () => {
    assert.equal(faseDoEvento(evento({ inicio: "não é data" }), AGORA), "em_andamento");
  });

  it("toda fase tem rótulo", () => {
    for (const fase of ["agendado", "em_andamento", "aguardando_apuracao", "encerrado"] as const) {
      assert.ok(rotuloDaFase(fase).trim().length > 0, fase);
    }
  });
});

describe("resultado", () => {
  const comPosicoes = () =>
    evento({
      status: "encerrado",
      posicoes: [
        { aluno_id: "a2", pontos: 30, participou: true, posicao: 2, destaque: true },
        { aluno_id: "a1", pontos: 50, participou: true, posicao: 1, destaque: true },
        { aluno_id: "a3", pontos: 0, participou: false, posicao: null, destaque: false },
      ],
    });

  it("o pódio ordena por posição e tira quem não participou", () => {
    // `fn_evento_classe_apurar` grava `posicao` só para quem participou, e a linha de quem
    // ficou de fora existe para o professor — não é pódio.
    assert.deepEqual(podioDoEvento(comPosicoes()).map((p) => p.alunoId), ["a1", "a2"]);
  });

  it("minha posição é a minha linha", () => {
    assert.equal(minhaPosicao(comPosicoes(), "a2")!.pontos, 30);
    assert.equal(minhaPosicao(comPosicoes(), "ninguem"), null);
    assert.equal(minhaPosicao(comPosicoes(), null), null);
  });

  it("evento aberto não tem resultado, e isso não é falha", () => {
    // `eventos_classe_resultado_aluno_sel` exige `status = 'encerrado'`: a lista vem vazia.
    const aberto = evento();
    assert.deepEqual(aberto.posicoes, []);
    assert.deepEqual(podioDoEvento(aberto), []);
    assert.equal(minhaPosicao(aberto, "a1"), null);
  });
});

describe("eventoEmDestaque", () => {
  const lista = (): EventoDaTurma[] => [
    evento({ id: "encerrado", status: "encerrado" }),
    evento({ id: "agora", inicio: "2026-10-19T12:00:00Z", fim: "2026-10-19T18:00:00Z" }),
    evento({ id: "amanha", inicio: "2026-10-20T12:00:00Z", fim: "2026-10-20T18:00:00Z" }),
  ];

  it("o que está acontecendo ganha do encerrado e do agendado", () => {
    assert.equal(eventoEmDestaque(lista(), AGORA)!.id, "agora");
  });

  it("sem evento em andamento, o agendado ganha do encerrado", () => {
    const sem = lista().filter((e) => e.id !== "agora");
    assert.equal(eventoEmDestaque(sem, AGORA)!.id, "amanha");
  });

  it("lista vazia é null", () => {
    assert.equal(eventoEmDestaque([], AGORA), null);
  });

  it("empate de fase: o mais recente", () => {
    const dois = [
      evento({ id: "velho", status: "encerrado", inicio: "2026-01-01T00:00:00Z" }),
      evento({ id: "novo", status: "encerrado", inicio: "2026-10-01T00:00:00Z" }),
    ];
    assert.equal(eventoEmDestaque(dois, AGORA)!.id, "novo");
  });
});

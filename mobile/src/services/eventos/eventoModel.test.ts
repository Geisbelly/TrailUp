import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventoEmDestaque,
  faseDoEvento,
  enfaseDoRank,
  fraseDoRank,
  mensagemDaInscricao,
  minhaPosicao,
  montarRanksDoEvento,
  podeMexerNaInscricao,
  normalizeEvento,
  podioDoEvento,
  rankingDasGuildas,
  rotuloDaFase,
  vizinhanca,
  type EventoDaTurma,
  type RankDoEvento,
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

describe("rankingDasGuildas", () => {
  const guildas = [
    { id: "a", nome: "Legião Azul", souMembro: true },
    { id: "b", nome: "Exploradores do Norte", souMembro: false },
    { id: "c", nome: "Fênix Rubra", souMembro: false },
    { id: "d", nome: "Lobos", souMembro: false },
  ];

  it("ordena pela posição, mostra o pódio e nomeia pela guilda da turma", () => {
    const r = rankingDasGuildas(
      [
        { guilda_id: "c", pontos: 10, posicao: 3 },
        { guilda_id: "b", pontos: 30, posicao: 1 },
        { guilda_id: "a", pontos: "20", posicao: 2 },
        { guilda_id: "d", pontos: 5, posicao: 4 },
      ],
      guildas,
    );
    assert.deepEqual(r.map((g) => [g.posicao, g.nome, g.minha]), [
      [1, "Exploradores do Norte", false],
      [2, "Legião Azul", true],
      [3, "Fênix Rubra", false],
    ]);
    assert.equal(r[1].pontos, 20);
  });

  it("a guilda do aluno fora do pódio aparece depois dele", () => {
    const r = rankingDasGuildas(
      [
        { guilda_id: "b", posicao: 1 },
        { guilda_id: "c", posicao: 2 },
        { guilda_id: "d", posicao: 3 },
        { guilda_id: "a", posicao: 5 },
      ],
      guildas,
    );
    assert.deepEqual(r.map((g) => g.guildaId), ["b", "c", "d", "a"]);
  });

  it("guilda que não existe mais vira 'Guilda'; linha inválida sai", () => {
    const r = rankingDasGuildas([{ guilda_id: "z", posicao: 1 }, { guilda_id: "", posicao: 2 }, { guilda_id: "b", posicao: null }, null], guildas);
    assert.deepEqual(r.map((g) => g.nome), ["Guilda"]);
    assert.deepEqual(rankingDasGuildas(null, guildas), []);
  });
});

describe("rank do evento (#155)", () => {
  it("temRank vem da peça arena; build sem a coluna fica sem rank", () => {
    assert.equal(evento({ pecas: ["missoes", "arena"] }).temRank, true);
    assert.equal(evento({ pecas: ["missoes"] }).temRank, false);
    assert.equal(evento().temRank, false);
  });

  it("entrar e sair só com o evento aberto e antes do fim, como nas RPCs", () => {
    const comRank = evento({ pecas: ["arena"] });
    assert.equal(podeMexerNaInscricao(comRank, new Date("2026-10-19T10:00:00Z")), true); // aberto, antes do início
    assert.equal(podeMexerNaInscricao(comRank, AGORA), true);
    assert.equal(podeMexerNaInscricao(comRank, new Date("2026-10-19T18:00:00Z")), false);
    assert.equal(podeMexerNaInscricao(evento({ pecas: ["arena"], status: "encerrado" }), AGORA), false);
    assert.equal(podeMexerNaInscricao(evento(), AGORA), false);
  });

  it("monta os ranks na ordem dos critérios, com as linhas ordenadas e a minha marcada", () => {
    const ranks = [
      { id: 2, tipo: { nome: "Missões", criterio: "missoes" } },
      { id: 1, tipo: { nome: "Ranqueada", criterio: "ranqueada" } },
      { id: 3, tipo: null },
      { id: 4, tipo: { nome: "Tempo de Estudo", criterio: "tempo" } },
      null,
    ];
    const posicoes = [
      { rank_id: 1, posicao: 2, id_aluno: "eu", nome_aluno: "Eu", pontuacao: "12" },
      { rank_id: 1, posicao: 1, id_aluno: "b", nome_aluno: " Bia ", pontuacao: 30 },
      { rank_id: 2, posicao: 0, id_aluno: "x" },
      { rank_id: 9, posicao: 1, id_aluno: "c" },
    ];
    const r = montarRanksDoEvento(ranks, posicoes, "eu");
    assert.deepEqual(r.map((x) => [x.rankId, x.nome]), [[1, "Pontos de batalha"], [2, "Missões cumpridas"], [4, "Tempo de estudo"], [3, "Rank do evento"]]);
    assert.deepEqual(r[0].linhas.map((l) => [l.posicao, l.nome, l.pontos, l.eu]), [[1, "Bia", 30, false], [2, "Eu", 12, true]]);
    assert.deepEqual(r[1].linhas, []);
    assert.deepEqual(montarRanksDoEvento(null, posicoes, "eu"), []);
  });

  // 12 no rank, eu em 7º: o caso do meio da tabela no protótipo 06b-rank-do-evento.html.
  const linhasDoRank = (minha: number | null, total = 12, criterio = "ranqueada") =>
    Array.from({ length: total }, (_, i) => ({
      posicao: i + 1,
      alunoId: i + 1 === minha ? "eu" : `a${i + 1}`,
      nome: i + 1 === minha ? "Eu" : ["Bia P.", "Caio R.", "Duda L.", "Enzo M.", "Flor D.", "Gui N.", "Hana K."][i] ?? `A${i + 1}`,
      pontos: 60 - i * 7,
      eu: i + 1 === minha,
      percentualDoLider: total >= 8 ? Math.round(((60 - i * 7) / 60) * 100) : null,
    })).map((l) => ({ ...l, criterio }));
  const rank = (minha: number | null, total = 12, criterio = "ranqueada"): RankDoEvento => ({
    rankId: 1,
    nome: "Pontos de batalha",
    criterio,
    linhas: linhasDoRank(minha, total, criterio).map(({ criterio: _c, ...l }) => l),
  });
  const ev = evento({ pecas: ["arena"], inicio: "2026-11-03T12:00:00Z", fim: "2026-11-10T12:00:00Z" });

  it("vizinhança: um acima, eu e um abaixo, fora do pódio, com os saltos marcados", () => {
    const itens = vizinhanca(rank(7));
    assert.deepEqual(itens.map((x) => (x.tipo === "linha" ? x.linha.posicao : x.chave)), ["antes", 6, 7, 8, "depois"]);
    // Logo abaixo do pódio não há salto antes; no fim da lista não há salto depois.
    assert.deepEqual(vizinhanca(rank(4)).map((x) => (x.tipo === "linha" ? x.linha.posicao : x.chave)), [4, 5, "depois"]);
    assert.deepEqual(vizinhanca(rank(12)).map((x) => (x.tipo === "linha" ? x.linha.posicao : x.chave)), ["antes", 11, 12]);
    // No pódio ou fora do rank, a vizinhança some: o pódio já mostra.
    assert.deepEqual(vizinhanca(rank(2)), []);
    assert.deepEqual(vizinhanca(rank(null)), []);
  });

  it("cada perfil tem ênfase e ordem própria; sem perfil vale a do Mastermind", () => {
    assert.equal(enfaseDoRank("Conqueror").foco, "rival");
    assert.equal(enfaseDoRank("achiever").foco, "meta");
    assert.deepEqual(enfaseDoRank("socializer").ordem, ["podio", "foco", "vizinhanca"]);
    assert.deepEqual(enfaseDoRank("survivor").ordem, ["foco", "vizinhanca", "podio"]);
    assert.deepEqual(enfaseDoRank(null), enfaseDoRank("mastermind"));
    for (const p of ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"])
      assert.deepEqual([...enfaseDoRank(p).ordem].sort(), ["foco", "podio", "vizinhanca"], p);
  });

  it("dentro do rank, a frase usa só posição, pontos e nomes da view", () => {
    assert.deepEqual(fraseDoRank("conqueror", ev, rank(7), true), { titulo: "Faltam 8 pts para passar Gui N.", detalhe: "Gui N. está em 6º, com 25 pts." });
    assert.deepEqual(fraseDoRank("achiever", ev, rank(7), true), { titulo: "29 pts para o pódio.", detalhe: "O 3º lugar tem 46 pts." });
    assert.equal(fraseDoRank("achiever", ev, rank(2), true).titulo, "Você está no pódio.");
    assert.equal(fraseDoRank("mastermind", ev, rank(7), true).titulo, "18 pts de 03/11 a 10/11.");
    assert.equal(fraseDoRank("mastermind", ev, rank(7), true).detalhe, "30% do que o líder tem.");
    // Abaixo de 8 a view manda o percentual nulo: a frase não inventa um.
    assert.match(fraseDoRank("mastermind", ev, rank(4, 5), true).detalhe, /não aparece/);
    assert.equal(fraseDoRank("socializer", ev, rank(7), true).titulo, "Você e mais 11 colegas.");
    assert.equal(fraseDoRank("socializer", ev, rank(1, 1), true).titulo, "Você lidera.");
    assert.deepEqual(fraseDoRank("daredevil", ev, rank(1), true), { titulo: "Você lidera.", detalhe: "Caio R. vem 7 pts atrás." });
    const missoes: RankDoEvento = { ...rank(3, 12, "missoes"), rankId: 2, nome: "Missões cumpridas" };
    assert.equal(fraseDoRank("seeker", ev, rank(7), true, [missoes]).detalhe, "Em missões cumpridas você está em 3º.");
    assert.equal(fraseDoRank("survivor", ev, rank(7), true).titulo, "Você está no rank.");
    // Inscrito, mas a linha ainda não veio: não finge posição.
    assert.match(fraseDoRank("conqueror", ev, rank(null), true).detalhe, /assim que a lista atualizar/);
  });

  it("fora do rank, o convite muda de assunto por perfil", () => {
    const fora = rank(null, 11);
    assert.deepEqual(fraseDoRank("conqueror", ev, fora, false), { titulo: "Bia P. lidera com 60 pts.", detalhe: "11 colegas na disputa agora." });
    assert.equal(fraseDoRank("achiever", ev, fora, false).titulo, "Pódio a partir de 46 pts.");
    assert.equal(fraseDoRank("achiever", ev, rank(null, 2), false).titulo, "O pódio ainda tem lugar.");
    assert.equal(fraseDoRank("mastermind", ev, fora, false).titulo, "Conta pontos de batalha de 03/11 a 10/11.");
    assert.deepEqual(fraseDoRank("socializer", ev, fora, false), { titulo: "Bia P., Caio R. e mais 9 colegas", detalhe: "já entraram no rank." });
    assert.deepEqual(fraseDoRank("socializer", ev, rank(null, 1), false), { titulo: "Bia P.", detalhe: "já entrou no rank." });
    assert.equal(fraseDoRank("seeker", ev, fora, false, [rank(null), rank(null)]).titulo, "3 jeitos de disputar neste evento.");
    assert.equal(fraseDoRank("survivor", ev, fora, false).titulo, "É opcional e reversível.");
    assert.equal(fraseDoRank("conqueror", ev, rank(null, 0), false).titulo, "Ninguém entrou ainda.");
    const missoes = { ...rank(null, 11, "missoes"), linhas: rank(null, 11).linhas.map((l) => ({ ...l, pontos: 1 })) };
    assert.equal(fraseDoRank("conqueror", ev, missoes, false).titulo, "Bia P. lidera com 1 missão.");
    // Tempo (#932): minutos de estudo ativo, no mesmo formato do pódio.
    const tempo = { ...rank(null, 11, "tempo"), linhas: rank(null, 11).linhas.map((l) => ({ ...l, pontos: 75.4 })) };
    assert.equal(fraseDoRank("conqueror", ev, tempo, false).titulo, "Bia P. lidera com 1h 15min.");
    assert.match(fraseDoRank("mastermind", ev, tempo, false).titulo, /^Conta minutos de estudo ativo /);
  });

  it("traduz o erro das RPCs sem inventar motivo", () => {
    assert.match(mensagemDaInscricao({ code: "42501", message: "x" }), /não está nesta turma/);
    assert.equal(mensagemDaInscricao({ code: "22023", message: "O evento não está aberto." }), "O evento não está aberto.");
    assert.match(mensagemDaInscricao(new Error("Failed to fetch")), /conexão/);
    assert.match(mensagemDaInscricao(null), /conexão/);
  });
});

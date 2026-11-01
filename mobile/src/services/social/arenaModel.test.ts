import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  argumentosDeCriacao,
  mensagemDaArena,
  normalizeArena,
  normalizeMeuElo,
  rotuloDoElo,
  pendentes,
  resultadoParaMim,
  situacaoNaArena,
  sortearParaArena,
  tituloDoDesafio,
  validarNovoDesafio,
} from "./arenaModel";

const ANA = "00000000-0000-0000-0000-00000000000a";
const BIA = "00000000-0000-0000-0000-00000000000b";
const CAIO = "00000000-0000-0000-0000-00000000000c";

const linha = (extra: Record<string, unknown> = {}) => ({
  id: "d1",
  formato: "solo",
  modo: "precisao",
  status: "aberto",
  resultado: null,
  vencedor_equipe: null,
  guilda_nome: null,
  guilda_rival_nome: null,
  sou_criador: true,
  meu_estado: "aceito",
  minha_equipe: 1,
  questoes: 3,
  minhas_respostas: 0,
  participantes: [
    { aluno_id: ANA, nome: "Ana", equipe: 1, estado: "aceito", acertos: 0, respondidas: 0 },
    { aluno_id: BIA, nome: "Bia", apelido: "Bi", equipe: 2, estado: "convidado", acertos: 0, respondidas: 0 },
  ],
  equipes: [{ equipe: 1, pontos: 0, integrantes: 1 }],
  created_at: "2026-10-20T12:00:00Z",
  ...extra,
});

describe("arenaModel", () => {
  it("lista só o que tem equipe 2: cooperativo da guilda fica no chat", () => {
    const coop = linha({
      id: "coop",
      formato: "guilda",
      participantes: [{ aluno_id: ANA, nome: "Ana", equipe: 1, estado: "aceito" }],
    });
    const lista = normalizeArena([linha(), coop, null, { sem: "id" }]);
    assert.deepEqual(lista.map((d) => d.id), ["d1"]);
    assert.equal(lista[0].participantes[1].nome, "Bi");
  });

  it("devolve lista vazia para resposta que não é lista", () => {
    assert.deepEqual(normalizeArena(null), []);
    assert.deepEqual(normalizeArena({}), []);
  });

  it("situação: convite, jogar, aguardando, encerrado, fora", () => {
    const [d] = normalizeArena([linha()]);
    assert.equal(situacaoNaArena(d), "jogar");
    assert.equal(situacaoNaArena({ ...d, minhasRespostas: 3 }), "aguardando");
    assert.equal(situacaoNaArena({ ...d, meuEstado: "convidado" }), "convite");
    assert.equal(situacaoNaArena({ ...d, meuEstado: "recusado" }), "fora");
    // Recusa fecha na hora (decisão 4): para quem recusou continua "fora", não "encerrado".
    assert.equal(situacaoNaArena({ ...d, meuEstado: "recusado", status: "encerrado" }), "fora");
    assert.equal(situacaoNaArena({ ...d, status: "encerrado" }), "encerrado");
  });

  it("resultado é do ponto de vista de quem olha", () => {
    const [d] = normalizeArena([linha({ status: "encerrado", resultado: "vitoria", vencedor_equipe: 2 })]);
    assert.equal(resultadoParaMim(d), "derrota");
    assert.equal(resultadoParaMim({ ...d, minhaEquipe: 2 }), "vitoria");
    assert.equal(resultadoParaMim({ ...d, resultado: "empate", vencedorEquipe: null }), "empate");
    assert.equal(resultadoParaMim({ ...d, resultado: "sem_adversario" }), "sem_adversario");
    assert.equal(resultadoParaMim({ ...d, status: "aberto" }), null);
  });

  it("título: pessoas no duelo, guildas no guilda x guilda", () => {
    const [d] = normalizeArena([linha()]);
    assert.equal(tituloDoDesafio(d, ANA), "Você x Bi");
    assert.equal(tituloDoDesafio({ ...d, formato: "guilda", guildaNome: "Lobos", rivalNome: "Corujas" }, ANA), "Lobos x Corujas");
  });

  it("pendentes são os convidados que ainda não responderam", () => {
    const [d] = normalizeArena([linha()]);
    assert.deepEqual(pendentes(d).map((p) => p.alunoId), [BIA]);
  });

  it("valida o formato como o banco valida", () => {
    const base = { aliado: null, adversarios: [], guildaId: null, guildaRival: null };
    assert.equal(validarNovoDesafio({ ...base, formato: "solo", adversarios: [BIA] }, ANA), null);
    assert.equal(validarNovoDesafio({ ...base, formato: "solo" }, ANA), "Escolha um adversário.");
    assert.equal(validarNovoDesafio({ ...base, formato: "solo", adversarios: [ANA] }, ANA), "Você não pode desafiar a si mesmo.");
    assert.equal(validarNovoDesafio({ ...base, formato: "dupla", adversarios: [BIA, CAIO] }, ANA), "Escolha sua dupla.");
    assert.equal(
      validarNovoDesafio({ ...base, formato: "dupla", aliado: CAIO, adversarios: [BIA, CAIO] }, ANA),
      "Cada colega só pode aparecer uma vez.",
    );
    assert.equal(validarNovoDesafio({ ...base, formato: "guilda", guildaId: "g1" }, ANA), "Escolha a guilda rival.");
    assert.equal(validarNovoDesafio({ ...base, formato: "guilda", guildaId: "g1", guildaRival: "g1" }, ANA), "A rival tem de ser outra guilda.");
    assert.equal(validarNovoDesafio({ ...base, formato: "guilda", guildaId: "g1", guildaRival: "g2" }, ANA), null);
  });

  it("argumentos de criação zeram o que não é do formato", () => {
    const n = { formato: "solo" as const, aliado: CAIO, adversarios: [BIA], guildaId: "g1", guildaRival: "g2" };
    assert.deepEqual(argumentosDeCriacao(65, n, "precisao", 50), {
      p_classe_id: 65,
      p_formato: "solo",
      p_modo: "precisao",
      p_quantidade: 10,
      p_guilda_id: null,
      p_aliado: null,
      p_adversarios: [BIA],
      p_guilda_rival: null,
    });
    const g = argumentosDeCriacao(65, { ...n, formato: "guilda" }, "todos", 5);
    assert.equal(g.p_adversarios, null);
    assert.equal(g.p_guilda_rival, "g2");
  });

  it("traduz os códigos do banco", () => {
    assert.equal(mensagemDaArena({ message: "arena_convite_indisponivel" }), "Este convite já não está aberto.");
    assert.equal(mensagemDaArena(new Error("guilda_desafio_e_da_arena")), "Este desafio é da Arena: jogue pela aba Arena.");
    assert.equal(mensagemDaArena("arena_sem_permissao"), "Você não está neste desafio.");
    assert.equal(mensagemDaArena("outra coisa"), "Não foi possível concluir. Tente de novo.");
  });

  it("variação de Elo: lê a minha linha e escreve com sinal (decisão 10)", () => {
    const [d] = normalizeArena([linha({ status: "encerrado", resultado: "vitoria", vencedor_equipe: 1, meu_elo: { delta: 20, rating_antes: 1000, rating_depois: 1020 } })]);
    assert.deepEqual(d.meuElo, { delta: 20, ratingAntes: 1000, ratingDepois: 1020 });
    assert.equal(rotuloDoElo(d.meuElo!), "+20 Elo");
    assert.equal(rotuloDoElo({ delta: -22, ratingAntes: 1020, ratingDepois: 998 }), "−22 Elo");
    assert.equal(rotuloDoElo({ delta: 0, ratingAntes: 1000, ratingDepois: 1000 }), "±0 Elo");
    assert.equal(normalizeArena([linha()])[0].meuElo, null);
    assert.equal(normalizeMeuElo({ delta: "x" }), null);
    assert.deepEqual(normalizeMeuElo({ delta: 5, rating_depois: 1005 }), { delta: 5, ratingAntes: 1000, ratingDepois: 1005 });
  });

  it("limite diário: mensagem com o número que o banco manda no HINT (decisão 5)", () => {
    assert.equal(
      mensagemDaArena({ message: "arena_limite_diario_adversario", hint: "3" }),
      "Vocês já jogaram 3 partidas ranqueadas hoje um contra o outro, o limite do dia. Amanhã tem revanche.",
    );
    assert.equal(
      mensagemDaArena({ message: "arena_limite_diario_adversario" }),
      "Vocês já jogaram o limite de partidas ranqueadas de hoje um contra o outro. Amanhã tem revanche.",
    );
  });
});

describe("sortearParaArena (busca aleatória)", () => {
  const DUDA = "00000000-0000-0000-0000-00000000000d";
  const vazio = { aliado: null, adversarios: [], guildaId: null, guildaRival: null };
  // Sorteio fixo: sempre 0 deixa a ordem embaralhada previsível.
  const zero = () => 0;
  const colegas = [
    { alunoId: ANA, online: false },
    { alunoId: BIA, online: true },
    { alunoId: CAIO, online: false },
    { alunoId: DUDA, online: true },
  ];

  it("duelo: sorteia um adversário, online primeiro, e o desafio fica válido", () => {
    const n = sortearParaArena({ ...vazio, formato: "solo" }, colegas, [], zero);
    assert.equal(n.adversarios.length, 1);
    assert.ok([BIA, DUDA].includes(n.adversarios[0]));
    assert.equal(validarNovoDesafio(n, null), null);
  });

  it("dupla: completa a dupla e os dois adversários, sem repetir ninguém", () => {
    const n = sortearParaArena({ ...vazio, formato: "dupla" }, colegas, [], zero);
    assert.ok(n.aliado);
    assert.equal(n.adversarios.length, 2);
    assert.equal(new Set([n.aliado, ...n.adversarios]).size, 3);
    assert.equal(validarNovoDesafio(n, null), null);
  });

  it("dupla: a dupla que o aluno escolheu fica, e só os adversários são sorteados", () => {
    const n = sortearParaArena({ ...vazio, formato: "dupla", aliado: BIA }, colegas, [], zero);
    assert.equal(n.aliado, BIA);
    assert.ok(!n.adversarios.includes(BIA));
    assert.equal(n.adversarios.length, 2);
  });

  it("guilda: sorteia uma rival que não é a própria guilda", () => {
    const n = sortearParaArena({ ...vazio, formato: "guilda", guildaId: "g1" }, [], [{ id: "g1" }, { id: "g2" }], zero);
    assert.equal(n.guildaRival, "g2");
    assert.equal(validarNovoDesafio(n, null), null);
  });

  it("sem gente suficiente, o desafio fica incompleto e a validação diz o que falta", () => {
    const n = sortearParaArena({ ...vazio, formato: "dupla" }, [{ alunoId: ANA, online: true }], [], zero);
    assert.equal(n.aliado, ANA);
    assert.deepEqual(n.adversarios, []);
    assert.equal(validarNovoDesafio(n, null), "Escolha os dois adversários.");
  });

  it("todos online ou todos offline: qualquer um pode sair, nunca alguém de fora da lista", () => {
    for (let i = 0; i < 20; i++) {
      const n = sortearParaArena({ ...vazio, formato: "solo" }, colegas.map((c) => ({ ...c, online: false })), []);
      assert.ok(colegas.some((c) => c.alunoId === n.adversarios[0]));
    }
  });
});

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

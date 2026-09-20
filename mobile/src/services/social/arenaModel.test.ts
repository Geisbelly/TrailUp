import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVERSARIOS_POR_FORMATO,
  alternativasDaQuestao,
  faltaParaCriar,
  formatarTempo,
  integrantesDaEquipe,
  normalizarDesafio,
  normalizarDesafios,
  normalizarFormato,
  normalizarModo,
  normalizarRodada,
  ordenarDesafios,
  placarDaEquipe,
  situacaoDoDesafio,
  terminei,
  type ArenaDesafio,
} from "./arenaModel";

function desafio(patch: Partial<ArenaDesafio> = {}): ArenaDesafio {
  return {
    id: "d1",
    classeId: 32,
    formato: "solo",
    modo: "precisao",
    status: "aberto",
    titulo: "Desafio",
    guildaId: null,
    guildaNome: null,
    criadoPor: "a",
    souCriador: true,
    criadoEm: "2026-09-20T10:00:00Z",
    encerradoEm: null,
    vencedorEquipe: null,
    questoes: 3,
    meuEstado: "aceito",
    minhaEquipe: 1,
    minhasRespostas: 0,
    participantes: [],
    equipes: [],
    ...patch,
  };
}

test("formato e modo sao normalizados de forma independente", () => {
  // Sao colunas diferentes no banco desde a `20260920_05`. Um valor de formato
  // chegando no campo de modo (ou o contrario) nao pode ser aceito calado.
  assert.equal(normalizarFormato("DUPLA"), "dupla");
  assert.equal(normalizarModo("VELOCIDADE"), "velocidade");
  assert.equal(normalizarFormato("velocidade"), "solo");
  assert.equal(normalizarModo("duelo"), "precisao");
});

test("guilda nao convoca ninguem, dupla convoca dois, solo convoca um", () => {
  assert.deepEqual(ADVERSARIOS_POR_FORMATO, { guilda: 0, dupla: 2, solo: 1 });
});

test("a situacao separa quem terminou de quem ainda joga", () => {
  // O estado que faltava: quem respondeu tudo e espera o adversario nao esta
  // "jogando" nem tem resultado. Mostrar como se fosse a vez dele faz a pessoa
  // reabrir a rodada procurando questao que nao existe mais.
  assert.equal(situacaoDoDesafio(desafio({ minhasRespostas: 1 })), "jogando");
  assert.equal(situacaoDoDesafio(desafio({ minhasRespostas: 3 })), "aguardando");
  assert.equal(terminei(desafio({ minhasRespostas: 3 })), true);
  assert.equal(terminei(desafio({ minhasRespostas: 2 })), false);
});

test("desafio sem questao nenhuma nao conta como terminado", () => {
  // `0 >= 0` seria verdadeiro e o card apareceria como concluido antes de
  // existir rodada.
  assert.equal(terminei(desafio({ questoes: 0, minhasRespostas: 0 })), false);
});

test("resultado sai do vencedor comparado com a MINHA equipe", () => {
  const encerrado = { status: "encerrado" as const, minhasRespostas: 3 };
  assert.equal(
    situacaoDoDesafio(desafio({ ...encerrado, vencedorEquipe: 1, minhaEquipe: 1 })),
    "venci",
  );
  assert.equal(
    situacaoDoDesafio(desafio({ ...encerrado, vencedorEquipe: 1, minhaEquipe: 2 })),
    "perdi",
  );
  assert.equal(
    situacaoDoDesafio(desafio({ ...encerrado, vencedorEquipe: null })),
    "empate",
  );
});

test("convite e recusa vencem o status do desafio", () => {
  assert.equal(situacaoDoDesafio(desafio({ meuEstado: "convidado" })), "convite");
  assert.equal(
    situacaoDoDesafio(desafio({ meuEstado: "recusado", status: "encerrado" })),
    "recusado",
  );
});

test("a lista poe na frente o que pede acao", () => {
  const ordenados = ordenarDesafios([
    desafio({ id: "encerrado", status: "encerrado", vencedorEquipe: 1 }),
    desafio({ id: "minha-vez", minhasRespostas: 0 }),
    desafio({ id: "convite", meuEstado: "convidado" }),
    desafio({ id: "esperando", minhasRespostas: 3 }),
  ]);
  assert.deepEqual(
    ordenados.map((d) => d.id),
    ["convite", "minha-vez", "esperando", "encerrado"],
  );
});

test("dentro do mesmo grupo, o mais recente vem primeiro", () => {
  const ordenados = ordenarDesafios([
    desafio({ id: "velho", criadoEm: "2026-09-01T00:00:00Z" }),
    desafio({ id: "novo", criadoEm: "2026-09-19T00:00:00Z" }),
  ]);
  assert.deepEqual(ordenados.map((d) => d.id), ["novo", "velho"]);
});

test("normalizar le a resposta do banco com as chaves em snake_case", () => {
  const normalizado = normalizarDesafio({
    id: "abc",
    classe_id: 32,
    formato: "dupla",
    modo: "velocidade",
    status: "encerrado",
    titulo: "Desafio em dupla",
    guilda_id: null,
    guilda_nome: null,
    criado_por: "aluno-1",
    sou_criador: true,
    created_at: "2026-09-20T10:00:00Z",
    encerrado_em: "2026-09-20T10:05:00Z",
    vencedor_equipe: 2,
    questoes: 4,
    meu_estado: "aceito",
    minha_equipe: 1,
    minhas_respostas: 4,
    participantes: [
      { aluno_id: "p1", nome: "Ana", equipe: 1, estado: "aceito", acertos: 2, respondidas: 4, tempo_ms: 8000 },
      { aluno_id: "p2", equipe: 2, estado: "aceito", acertos: 3, respondidas: 4, tempo_ms: 6000 },
    ],
    equipes: [
      { equipe: 1, pontos: 2, tempo_ms: 8000, integrantes: 1 },
      { equipe: 2, pontos: 3, tempo_ms: 6000, integrantes: 1 },
    ],
  });

  assert.ok(normalizado);
  assert.equal(normalizado!.formato, "dupla");
  assert.equal(normalizado!.vencedorEquipe, 2);
  assert.equal(normalizado!.participantes[1].nome, "Colega");
  assert.equal(situacaoDoDesafio(normalizado!), "perdi");
  assert.equal(placarDaEquipe(normalizado!, 2).pontos, 3);
  assert.equal(integrantesDaEquipe(normalizado!, 1).length, 1);
});

test("equipe ausente devolve placar zerado em vez de undefined", () => {
  // O formato guilda nao tem equipe 2, e a tela le as duas sem saber disso.
  const vazio = placarDaEquipe(desafio({ formato: "guilda" }), 2);
  assert.deepEqual(vazio, { equipe: 2, pontos: 0, tempoMs: 0, integrantes: 0 });
});

test("linha sem id e descartada em vez de virar desafio fantasma", () => {
  assert.equal(normalizarDesafio({ formato: "solo" }), null);
  assert.deepEqual(normalizarDesafios([{ formato: "solo" }, null, "x"]), []);
  assert.deepEqual(normalizarDesafios(null), []);
});

test("a rodada so traz gabarito na questao ja respondida", () => {
  // O banco manda `resposta_correta` nulo antes de responder -- e a tela nao
  // pode inventar um valor para ele.
  const rodada = normalizarRodada({
    id: "d1",
    formato: "solo",
    modo: "precisao",
    status: "aberto",
    meu_estado: "aceito",
    minha_equipe: 1,
    questoes: [
      { ordem: 1, questao_id: 10, enunciado: "Q1", minha_resposta: null, correta: null, resposta_correta: null },
      { ordem: 2, questao_id: 11, enunciado: "Q2", minha_resposta: "b", correta: true, resposta_correta: "b", tempo_ms: 4200 },
      { ordem: 3, questao_id: 0, enunciado: "lixo" },
    ],
  });

  assert.ok(rodada);
  assert.equal(rodada!.questoes.length, 2, "questao sem id valido sai da lista");
  assert.equal(rodada!.questoes[0].respostaCorreta, null);
  assert.equal(rodada!.questoes[1].respostaCorreta, "b");
  assert.equal(rodada!.questoes[1].tempoMs, 4200);
});

test("alternativas aceitam as tres formas que o professor cadastrou", () => {
  assert.deepEqual(alternativasDaQuestao(["a", "b"]), ["a", "b"]);
  assert.deepEqual(alternativasDaQuestao([{ texto: "a" }, { opcao: "b" }]), ["a", "b"]);
  assert.deepEqual(alternativasDaQuestao({ A: "a", B: "b" }), ["a", "b"]);
  assert.deepEqual(alternativasDaQuestao(null), [], "dissertativa nao tem alternativa");
  assert.deepEqual(alternativasDaQuestao(["  ", "a"]), ["a"]);
});

test("a validacao da tela repete a regra da RPC", () => {
  // Sao a MESMA regra: se divergirem, o aluno toma erro do servidor num botao
  // que a tela deixou habilitado.
  assert.equal(faltaParaCriar({ formato: "solo", adversarios: ["b"] }), null);
  assert.match(
    String(faltaParaCriar({ formato: "solo", adversarios: [] })),
    /adversário/i,
  );
  assert.match(
    String(faltaParaCriar({ formato: "dupla", adversarios: ["b", "c"] })),
    /aliado/i,
  );
  assert.equal(
    faltaParaCriar({ formato: "dupla", aliadoId: "a", adversarios: ["b", "c"] }),
    null,
  );
  assert.match(
    String(faltaParaCriar({ formato: "dupla", aliadoId: "b", adversarios: ["b", "c"] })),
    /uma vez/i,
  );
  assert.equal(faltaParaCriar({ formato: "guilda", guildaId: "g", adversarios: [] }), null);
  assert.match(
    String(faltaParaCriar({ formato: "guilda", guildaId: null, adversarios: [] })),
    /guilda/i,
  );
});

test("tempo zero vira travessao em vez de 0s", () => {
  // Zero aqui e "nao mediu", nao "foi instantaneo".
  assert.equal(formatarTempo(0), "--");
  assert.equal(formatarTempo(4200), "4s");
  assert.equal(formatarTempo(65000), "1min 05s");
});

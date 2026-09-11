import assert from "node:assert/strict";
import test from "node:test";

import {
  COLUNAS_DERIVADAS,
  construirEscritaDeAtividade,
  construirEscritaDeConteudo,
  construirEscritaDePontos,
  construirEscritaDeTopico,
  normalizarStatus,
  resolverStatusPorPercentual,
  statusConhecido,
  type EscritaPendente,
} from "./progressoEscritas";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const AGORA = "2026-09-11T12:00:00.000Z";

test("o status sai do percentual, e as bordas importam", () => {
  assert.equal(resolverStatusPorPercentual(0), "não iniciado");
  assert.equal(
    resolverStatusPorPercentual(0.1),
    "em andamento",
    "começou é diferente de não começou",
  );
  assert.equal(resolverStatusPorPercentual(99.9), "em andamento");
  assert.equal(resolverStatusPorPercentual(100), "concluido");
});

test("normalizarStatus devolve o rótulo acentuado do enum", () => {
  // 'nao iniciado' compila e só falha em produção, na atribuição ao enum.
  assert.equal(normalizarStatus("nao iniciado"), "não iniciado");
  assert.equal(normalizarStatus("não iniciado"), "não iniciado");
  assert.equal(normalizarStatus("CONCLUIDO"), "concluido");
  assert.equal(normalizarStatus("concluído"), "concluido");
  assert.equal(normalizarStatus(" em andamento "), "em andamento");
});

test("normalizarStatus descarta o que não reconhece, em vez de chutar", () => {
  // `undefined` significa "não mando a coluna", e preservar o que está no
  // banco é sempre melhor do que escrever um palpite.
  assert.equal(normalizarStatus(null), undefined);
  assert.equal(normalizarStatus(""), undefined);
  assert.equal(normalizarStatus("pendente"), undefined);
});

test("nenhum construtor escreve coluna derivada por trigger", () => {
  // `tempo_gasto_min` vem da telemetria (`20260826_19`). Um upsert com essa
  // coluna apaga o que o trigger somou -- foi assim que concluir uma atividade
  // zerava o tempo dela.
  const escritas: EscritaPendente[] = [
    construirEscritaDeConteudo({ alunoId: ALUNO, conteudoId: 7, percentual: 100 }),
    construirEscritaDeAtividade({
      alunoId: ALUNO,
      atividadeId: 9,
      percentual: 100,
      acertosPercentual: 80,
    }),
    construirEscritaDeTopico({ alunoId: ALUNO, topicoId: 4 }),
    construirEscritaDePontos({ alunoId: ALUNO, valor: 10 }),
  ];

  for (const escrita of escritas) {
    for (const coluna of COLUNAS_DERIVADAS) {
      assert.equal(
        coluna in escrita.valores,
        false,
        `${escrita.tabela} não pode mandar ${coluna}`,
      );
    }
  }
});

test("conteúdo: upsert na identidade da linha, com percentual limitado a 0..100", () => {
  const escrita = construirEscritaDeConteudo({
    alunoId: ALUNO,
    conteudoId: 7,
    percentual: 140,
    agora: AGORA,
  });

  assert.equal(escrita.operacao, "upsert");
  assert.equal(escrita.tabela, "conteudo_aluno");
  assert.equal(
    escrita.operacao === "upsert" ? escrita.onConflict : null,
    "aluno_id,conteudo_id",
    "sem o alvo certo o upsert cria linha duplicada em vez de convergir",
  );
  assert.deepEqual(escrita.valores, {
    aluno_id: ALUNO,
    conteudo_id: 7,
    status: "concluido",
    percentual_concluido: 100,
    ultima_visualizacao: AGORA,
    updated_at: AGORA,
  });
});

test("conteúdo: sem percentual nem status, só a visita é gravada", () => {
  // Quem não sabe o progresso não pode mandar zero: o `ON CONFLICT` só toca no
  // que foi enviado, então omitir preserva o que está no banco.
  const escrita = construirEscritaDeConteudo({
    alunoId: ALUNO,
    conteudoId: 7,
    agora: AGORA,
  });

  assert.deepEqual(escrita.valores, {
    aluno_id: ALUNO,
    conteudo_id: 7,
    ultima_visualizacao: AGORA,
    updated_at: AGORA,
  });
});

test("status e percentual nunca saem discordando um do outro", () => {
  // Uma atividade "em andamento" com 100% é o que se vê quando os dois são
  // escritos por caminhos diferentes.
  const escrita = construirEscritaDeConteudo({
    alunoId: ALUNO,
    conteudoId: 7,
    percentual: 0,
    agora: AGORA,
  });
  assert.equal(escrita.valores.status, "não iniciado");
});

test("atividade: acertos ausentes não entram no upsert", () => {
  // Zero é "errou tudo"; ausente é "não há nota". Trocar um pelo outro faz
  // registrar visita derrubar a taxa de acertos da atividade.
  const visita = construirEscritaDeAtividade({
    alunoId: ALUNO,
    atividadeId: 9,
    status: "em andamento",
    agora: AGORA,
  });
  assert.equal("acertos_percentual" in visita.valores, false);

  const errouTudo = construirEscritaDeAtividade({
    alunoId: ALUNO,
    atividadeId: 9,
    percentual: 100,
    acertosPercentual: 0,
    agora: AGORA,
  });
  assert.equal(errouTudo.valores.acertos_percentual, 0);

  const semNota = construirEscritaDeAtividade({
    alunoId: ALUNO,
    atividadeId: 9,
    percentual: 100,
    acertosPercentual: null,
    agora: AGORA,
  });
  assert.equal(
    semNota.valores.acertos_percentual,
    null,
    "mandar null de propósito é diferente de não mandar",
  );
});

test("atividade: a conclusão carrega nota, pontuação e metadata", () => {
  const escrita = construirEscritaDeAtividade({
    alunoId: ALUNO,
    atividadeId: 9,
    status: "concluido",
    percentual: 100,
    acertosPercentual: 250,
    pontuacaoObtida: 8,
    pontuacaoMaxima: 10,
    avaliacaoMetadata: null,
    agora: AGORA,
  });

  assert.equal(escrita.tabela, "atividade_aluno");
  assert.equal(
    escrita.operacao === "upsert" ? escrita.onConflict : null,
    "aluno_id,atividade_id",
  );
  assert.equal(escrita.valores.acertos_percentual, 100);
  assert.equal(escrita.valores.pontuacao_obtida, 8);
  assert.equal(escrita.valores.pontuacao_maxima, 10);
  assert.deepEqual(
    escrita.valores.avaliacao_metadata,
    {},
    "a coluna é JSONB NOT NULL; null vira objeto vazio",
  );
});

test("tópico: NÃO escreve percentual -- quem calcula é o banco", () => {
  // A conta local é sobre o material do professor apenas, e roda DEPOIS do
  // trigger: gravá-la aqui escreve um número menor por cima do certo, e ele
  // fica de pé até alguma outra escrita disparar o recálculo. Ver 20260826_18.
  const escrita = construirEscritaDeTopico({
    alunoId: ALUNO,
    topicoId: 4,
    status: "concluido",
    agora: AGORA,
  });

  assert.equal(
    "percentual_concluido" in escrita.valores,
    false,
    "o percentual do tópico é do trigger, não do cliente",
  );
  assert.deepEqual(escrita.valores, {
    aluno_id: ALUNO,
    topico_id: 4,
    status: "concluido",
    ultima_visualizacao: AGORA,
    updated_at: AGORA,
  });
});

test("tópico: sem ultimaAtividadeId a coluna não entra no upsert", () => {
  // Mandar null apagaria a última atividade que o aluno abriu -- é o ponto de
  // retomada dele.
  const semInformar = construirEscritaDeTopico({
    alunoId: ALUNO,
    topicoId: 4,
    agora: AGORA,
  });
  assert.equal("ultima_atividade" in semInformar.valores, false);
  assert.equal("status" in semInformar.valores, false);

  const limpandoDeProposito = construirEscritaDeTopico({
    alunoId: ALUNO,
    topicoId: 4,
    ultimaAtividadeId: null,
    agora: AGORA,
  });
  assert.equal(limpandoDeProposito.valores.ultima_atividade, null);
});

test("pontos: a escrita nasce com chave de idempotência", () => {
  const escrita = construirEscritaDePontos({ alunoId: ALUNO, valor: 10 });

  assert.equal(escrita.operacao, "insert");
  assert.equal(escrita.tabela, "eventos_aluno");
  assert.match(
    String(escrita.valores.idempotencia_key),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("pontos: a chave sobrevive ao disco -- é o que impede pagar duas vezes", () => {
  // A fila guarda a intenção serializada. Se a chave fosse gerada na hora de
  // reenviar, cada tentativa teria uma nova e o ponto duplicaria.
  const escrita = construirEscritaDePontos({ alunoId: ALUNO, valor: 10 });
  const depoisDoDisco = JSON.parse(JSON.stringify(escrita));

  assert.equal(
    depoisDoDisco.valores.idempotencia_key,
    escrita.valores.idempotencia_key,
  );
});

test("pontos: dois eventos distintos não compartilham chave", () => {
  const a = construirEscritaDePontos({ alunoId: ALUNO, valor: 10 });
  const b = construirEscritaDePontos({ alunoId: ALUNO, valor: 10 });

  assert.notEqual(a.valores.idempotencia_key, b.valores.idempotencia_key);
});

test("pontos: chave informada é respeitada, para o chamador poder deduplicar", () => {
  const chave = "22222222-2222-4222-8222-222222222222";
  const escrita = construirEscritaDePontos({ alunoId: ALUNO, chave });
  assert.equal(escrita.valores.idempotencia_key, chave);
});

test("pontos: tipo e referência são normalizados antes de sair do aparelho", () => {
  const escrita = construirEscritaDePontos({
    alunoId: ALUNO,
    tipo: "  Conquista Desbloqueada  ",
    referencia: "conquista:42",
    valor: -3,
  });

  assert.equal(escrita.valores.tipo, "conquista_desbloqueada");
  assert.equal(escrita.valores.referencia, "conquista:42");
  assert.equal(escrita.valores.valor, 0, "ponto negativo não tira pontuação");
});

test("pontos: referência fora do formato conhecido vira nula", () => {
  const escrita = construirEscritaDePontos({
    alunoId: ALUNO,
    referencia: "sem formato nenhum",
  });
  assert.equal(escrita.valores.referencia, null);
});

test("statusConhecido nunca inventa 'em andamento'", () => {
  // O palpite demoveu uma atividade concluída em produção: `registrarVisita`
  // mandava `this.status ?? "em andamento"` e, com o modelo local sem o rótulo
  // carregado, gravava isso por cima da linha concluída -- o percentual ficou
  // em 100 e o status caiu.
  assert.equal(statusConhecido({ status: null, percentual: null }), undefined);
  assert.equal(statusConhecido({ status: undefined, percentual: 40 }), undefined);
  assert.equal(statusConhecido({}), undefined);
});

test("statusConhecido confia no rótulo quando ele existe", () => {
  assert.equal(statusConhecido({ status: "concluido" }), "concluido");
  assert.equal(statusConhecido({ status: "em andamento" }), "em andamento");
  assert.equal(statusConhecido({ status: "nao iniciado" }), "não iniciado");
});

test("statusConhecido deduz a conclusão do percentual, e só ela", () => {
  // 100 prova que acabou; 99 não prova nada além de "não acabou".
  assert.equal(statusConhecido({ status: null, percentual: 100 }), "concluido");
  assert.equal(statusConhecido({ status: null, percentual: 140 }), "concluido");
  assert.equal(statusConhecido({ status: null, percentual: 99.9 }), undefined);
});

test("visita à atividade sem status conhecido não manda a coluna", () => {
  // É o caminho que causou a divergência. Omitir preserva o que está no banco;
  // a linha nova cai no default da coluna, `não iniciado`.
  const escrita = construirEscritaDeAtividade({
    alunoId: ALUNO,
    atividadeId: 1063,
    status: statusConhecido({ status: null, percentual: null }),
    agora: AGORA,
  });

  assert.equal("status" in escrita.valores, false);
  assert.equal("percentual_concluido" in escrita.valores, false);
  assert.deepEqual(escrita.valores, {
    aluno_id: ALUNO,
    atividade_id: 1063,
    ultima_visualizacao: AGORA,
    updated_at: AGORA,
  });
});

test("visita a uma atividade já concluída não a demove", () => {
  const escrita = construirEscritaDeAtividade({
    alunoId: ALUNO,
    atividadeId: 1063,
    status: statusConhecido({ status: null, percentual: 100 }),
    agora: AGORA,
  });

  assert.equal(escrita.valores.status, "concluido");
});

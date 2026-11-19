import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { atividadeDoCriterio, montarMissoes, pedeAtividade } from "./missaoModel";
import {
  comDestino,
  destinoDaMissao,
  diasAtePrazo,
  montarRastreador,
  percentualDaMissao,
  prazoDaMissao,
  resolverRecompensa,
  rotaDoDestino,
  rotuloDaRecompensa,
  topicoDaVez,
  topicosDoGrafo,
  conteudosDosDesafios,
  topicosDosDesafios,
  type MissaoComExtras,
  type TopicoDoRastreador,
} from "./rastreadorDeMissoes.core";

// Meio-dia local: longe da virada do dia em qualquer fuso do CI.
const AGORA = new Date(2026, 10, 1, 12, 0, 0);
const meiaNoiteSeguinte = (d: Date, dias = 1) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).toISOString();

const T = (over: Partial<TopicoDoRastreador> & { id: number }): TopicoDoRastreador => ({
  locked: false,
  completed: false,
  sequence: over.id,
  atividadeIds: [],
  conteudoIds: [],
  ...over,
});

const M = (over: Partial<MissaoComExtras> & { id: number }): MissaoComExtras => ({
  titulo: `m${over.id}`,
  descricao: "",
  progresso: 0,
  status: "pendente",
  criterioRotulo: "",
  metrica: "minutos_no_dia",
  atividadeId: null,
  pedeAtividade: false,
  origem: "professor",
  escopo: "aluno",
  prazo: null,
  dia: null,
  slot: null,
  categoria: "secundaria",
  recompensa: null,
  ...over,
});

describe("atividadeDoCriterio", () => {
  it("só a missão-entrega aponta atividade", () => {
    assert.equal(atividadeDoCriterio({ metrica: "atividade_especifica", atividade_id: 42 }), 42);
    assert.equal(atividadeDoCriterio({ metrica: "atividade_especifica", atividade_id: "42" }), 42);
    assert.equal(atividadeDoCriterio({ metrica: "atividades_concluidas", minimo: 3 }), null);
    assert.equal(atividadeDoCriterio({ metrica: "atividade_especifica" }), null);
    assert.equal(atividadeDoCriterio(null), null);
  });

  it("montarMissoes leva a métrica e a atividade para a missão", () => {
    const [m] = montarMissoes(
      [
        {
          id: 1, titulo: "Entregue", descricao: null, perfil_alvo: null, dia: null, slot: null,
          origem: "professor", escopo: "aluno", janela_inicio: null, janela_fim: null,
          criterio: { metrica: "atividade_especifica", atividade_id: 9 },
        },
      ],
      [],
      { agora: AGORA },
    );
    assert.equal(m.metrica, "atividade_especifica");
    assert.equal(m.atividadeId, 9);
  });
});

describe("topicoDaVez", () => {
  const topicos = [T({ id: 1, completed: true }), T({ id: 2 }), T({ id: 3, locked: true })];

  it("o de retomada, se ainda tiver o que fazer", () => {
    assert.equal(topicoDaVez([...topicos, T({ id: 4 })], "4")?.id, 4);
  });

  it("de retomada concluído: o primeiro liberado e não concluído", () => {
    assert.equal(topicoDaVez(topicos, "1")?.id, 2);
  });

  it("nunca um selado", () => {
    assert.equal(topicoDaVez(topicos, "3")?.id, 2);
  });

  it("tudo concluído: o de retomada, para revisar", () => {
    assert.equal(topicoDaVez([T({ id: 1, completed: true })], 1)?.id, 1);
    assert.equal(topicoDaVez([T({ id: 1, completed: true })], null), null);
  });
});

describe("destinoDaMissao", () => {
  const topicos = [
    T({ id: 10, atividadeIds: [100, 101] }),
    T({ id: 20, atividadeIds: [200], locked: true }),
  ];

  it("missão-entrega abre o tópico na atividade", () => {
    assert.deepEqual(destinoDaMissao({ atividadeId: 101, pedeAtividade: false }, topicos, null), {
      tipo: "atividade",
      topicoId: 10,
      atividadeId: 101,
    });
  });

  it("atividade em tópico selado mostra o tópico, não abre", () => {
    assert.deepEqual(destinoDaMissao({ atividadeId: 200, pedeAtividade: false }, topicos, null), { tipo: "bloqueado", topicoId: 20 });
  });

  it("missão-meta, ou atividade fora da trilha: o próximo passo", () => {
    assert.deepEqual(destinoDaMissao({ atividadeId: null, pedeAtividade: false }, topicos, null), { tipo: "topico", topicoId: 10 });
    assert.deepEqual(destinoDaMissao({ atividadeId: 999, pedeAtividade: false }, topicos, null), { tipo: "topico", topicoId: 10 });
  });

  it("missão de atividade pula o tópico de leitura", () => {
    const trilha = [T({ id: 1 }), T({ id: 2, locked: true, atividadeIds: [20] }), T({ id: 3, atividadeIds: [30] })];
    assert.deepEqual(destinoDaMissao({ atividadeId: null, pedeAtividade: true }, trilha, "1"), { tipo: "topico", topicoId: 3 });
    // A meta de minutos continua no passo da vez.
    assert.deepEqual(destinoDaMissao({ atividadeId: null, pedeAtividade: false }, trilha, "1"), { tipo: "topico", topicoId: 1 });
    // Nenhum tópico liberado com atividade: o passo da vez, em vez de botão morto.
    assert.deepEqual(destinoDaMissao({ atividadeId: null, pedeAtividade: true }, [T({ id: 1 })], "1"), { tipo: "topico", topicoId: 1 });
  });

  it("pedeAtividade lê o critério", () => {
    assert.equal(pedeAtividade({ metrica: "atividades_concluidas", minimo: 2 }), true);
    assert.equal(pedeAtividade({ metrica: "acertos_percentual", percentual: 70 }), true);
    assert.equal(pedeAtividade({ metrica: "eventos_no_dia", evento: "atividade_concluida", minimo: 2 }), true);
    assert.equal(pedeAtividade({ metrica: "eventos_no_dia", evento: "conteudo_concluido" }), false);
    assert.equal(pedeAtividade({ metrica: "minutos_no_dia", minutos: 10 }), false);
    assert.equal(pedeAtividade(null), false);
  });

  it("sem trilha, sem destino", () => {
    assert.equal(destinoDaMissao({ atividadeId: null, pedeAtividade: false }, [], null), null);
  });

  it("destino de missão com desafio é a tela do desafio", () => {
    const desafio = { tipo: "logica", enunciado: "Quanto é 2+2?", formato: "curta" } as const;
    const destino = destinoDaMissao({ id: 7, atividadeId: null, pedeAtividade: false, desafio }, topicos, null);
    assert.deepEqual(destino, { tipo: "desafio", missaoId: 7 });
    // Pilha raiz, fora das abas: o "Resolver" do rastreador não passa por cima do cadeado da aba
    // Social (que mora no `tabPress`) e o "voltar" volta para onde o aluno estava.
    assert.equal(rotaDoDestino(destino!), "/desafio/7");
    // Na lista do rastreador, o desafio não conta como "no tópico onde o aluno está".
    const [comD] = comDestino([M({ id: 7, desafio })], topicos, "10");
    assert.deepEqual(comD.destino, { tipo: "desafio", missaoId: 7 });
    assert.deepEqual(
      montarRastreador([comD, ...comDestino([M({ id: 8 })], topicos, "10")], "10", AGORA).abertas.map((m) => m.id),
      [8, 7],
    );
  });
});

describe("topicosDosDesafios", () => {
  it("o tópico da vez e o de sequence imediatamente menor", () => {
    const trilha = [T({ id: 1, sequence: 1, completed: true }), T({ id: 2, sequence: 2, completed: true }), T({ id: 3, sequence: 3 })];
    assert.deepEqual(topicosDosDesafios(trilha, "3"), [3, 2]);
    // O de retomada concluído: a vez passa ao próximo, e o anterior é o de antes dele.
    assert.deepEqual(topicosDosDesafios(trilha, "1"), [3, 2]);
    // Primeiro tópico: não tem anterior.
    assert.deepEqual(topicosDosDesafios([T({ id: 1, sequence: 1 }), T({ id: 2, sequence: 2 })], "1"), [1]);
    // Anterior selado não entra.
    assert.deepEqual(topicosDosDesafios([T({ id: 1, sequence: 1, locked: true }), T({ id: 2, sequence: 2 })], "2"), [2]);
    assert.deepEqual(topicosDosDesafios([], null), []);
  });
});

describe("conteudosDosDesafios", () => {
  it("os conteúdos do tópico da vez e do anterior, que a turma já carregou", () => {
    const trilha = [
      T({ id: 1, sequence: 1, completed: true, conteudoIds: [10, 11] }),
      T({ id: 2, sequence: 2, completed: true, conteudoIds: [20] }),
      T({ id: 3, sequence: 3, conteudoIds: [30, 31] }),
    ];
    assert.deepEqual(conteudosDosDesafios(trilha, "3"), [30, 31, 20]);
    assert.deepEqual(conteudosDosDesafios([], null), []);
  });
});

describe("topicosDoGrafo", () => {
  it("o bloqueio vem do grafo e as atividades e os conteúdos do professor, da turma", () => {
    const nos = [
      { id: "7", locked: false, completed: true, sequence: 1 },
      { id: "8", locked: true, completed: false, sequence: 2 },
    ];
    const topicos = [
      { id: 7, atividades: [{ id: 70 }, { id: "71" }], conteudos: [{ id: 700 }, { id: "701" }] },
      { id: 9, atividades: [{ id: 90 }] },
    ];
    assert.deepEqual(topicosDoGrafo(nos, topicos), [
      { id: 7, locked: false, completed: true, sequence: 1, atividadeIds: [70, 71], conteudoIds: [700, 701] },
      { id: 8, locked: true, completed: false, sequence: 2, atividadeIds: [], conteudoIds: [] },
    ]);
    assert.deepEqual(topicosDoGrafo([], topicos), []);
  });
});

describe("rotaDoDestino", () => {
  it("a atividade vai como parâmetro do tópico", () => {
    assert.equal(rotaDoDestino({ tipo: "atividade", topicoId: 10, atividadeId: 101 }), "/(tabs)/trilha/10?atividade=101");
    assert.equal(rotaDoDestino({ tipo: "topico", topicoId: 10 }), "/(tabs)/trilha/10");
    assert.equal(rotaDoDestino({ tipo: "bloqueado", topicoId: 20 }), null);
  });
});

describe("prazo", () => {
  it("a meia-noite seguinte (fim exclusivo da diária) é hoje, não amanhã", () => {
    assert.equal(diasAtePrazo(meiaNoiteSeguinte(AGORA), AGORA), 0);
    assert.equal(prazoDaMissao(meiaNoiteSeguinte(AGORA), AGORA)?.rotulo, "Termina hoje");
  });

  it("conta dias de calendário", () => {
    assert.equal(prazoDaMissao(meiaNoiteSeguinte(AGORA, 2), AGORA)?.rotulo, "Termina amanhã");
    assert.equal(prazoDaMissao(meiaNoiteSeguinte(AGORA, 5), AGORA)?.rotulo, "Faltam 4 dias");
    assert.equal(prazoDaMissao(meiaNoiteSeguinte(AGORA, -1), AGORA)?.urgencia, "critica");
    assert.equal(prazoDaMissao(null, AGORA), null);
  });
});

describe("montarRastreador: a missão do botão", () => {
  it("prazo mais perto primeiro; sem prazo por último", () => {
    const r = montarRastreador(
      comDestino([M({ id: 1 }), M({ id: 2, prazo: meiaNoiteSeguinte(AGORA, 5) }), M({ id: 3, prazo: meiaNoiteSeguinte(AGORA) })], [], null),
      null,
      AGORA,
    );
    assert.deepEqual(r.abertas.map((m) => m.id), [3, 2, 1]);
    assert.equal(r.atual?.id, 3);
  });

  it("mesmo dia: principal antes de secundária", () => {
    const hoje = meiaNoiteSeguinte(AGORA);
    const r = montarRastreador(
      comDestino([M({ id: 1, prazo: hoje }), M({ id: 2, prazo: hoje, categoria: "principal" })], [], null),
      null,
      AGORA,
    );
    assert.equal(r.atual?.id, 2);
  });

  it("mesmo peso: a do tópico onde o aluno está", () => {
    const topicos = [T({ id: 10, atividadeIds: [100] }), T({ id: 20, atividadeIds: [200] })];
    const r = montarRastreador(
      comDestino([M({ id: 1, atividadeId: 100 }), M({ id: 2, atividadeId: 200 })], topicos, "20"),
      "20",
      AGORA,
    );
    assert.equal(r.atual?.id, 2);
  });

  it("depois, a mais adiantada", () => {
    const r = montarRastreador(comDestino([M({ id: 1, progresso: 10 }), M({ id: 2, progresso: 70 })], [], null), null, AGORA);
    assert.equal(r.atual?.id, 2);
  });

  it("cumprida e expirada nunca vão para o botão, mas ficam na lista", () => {
    const r = montarRastreador(
      comDestino([M({ id: 1, status: "concluida" }), M({ id: 2, status: "expirada" })], [], null),
      null,
      AGORA,
    );
    assert.equal(r.atual, null);
    assert.equal(r.abertas.length, 0);
    assert.deepEqual(r.encerradas.map((m) => m.id), [1, 2]);
  });

  it("empate total mantém a ordem recebida (a lista não dança)", () => {
    const r = montarRastreador(comDestino([M({ id: 7 }), M({ id: 3 })], [], null), null, AGORA);
    assert.deepEqual(r.abertas.map((m) => m.id), [7, 3]);
  });
});

describe("percentualDaMissao", () => {
  it("prende em 0..100 e cumprida é 100", () => {
    assert.equal(percentualDaMissao({ progresso: 140, status: "em_andamento" }), 100);
    assert.equal(percentualDaMissao({ progresso: -5, status: "pendente" }), 0);
    assert.equal(percentualDaMissao({ progresso: 30, status: "concluida" }), 100);
  });
});

describe("recompensa", () => {
  const globais = [{ tipo: "missao_concluida", pontos: 20, moedas: 5 }];

  it("pontos só do global: os da turma não têm efeito no banco", () => {
    // `fn_pontos_do_evento(text)` não lê a turma (20260909_05; 20261021_06:25-28).
    assert.deepEqual(resolverRecompensa("missao_concluida", globais, [{ tipo: "missao_concluida", pontos: 50, moedas: null }]), {
      pontos: 20,
      moedas: 5,
    });
  });

  it("moedas: a turma sobrepõe o global; NULL herda", () => {
    // `fn_moedas_do_evento(tipo, classe)` lê `eventos_pontuacao_classe` (20260912_02).
    assert.deepEqual(resolverRecompensa("missao_concluida", globais, [{ tipo: "missao_concluida", pontos: null, moedas: 9 }]), {
      pontos: 20,
      moedas: 9,
    });
    assert.deepEqual(resolverRecompensa("desafio_logica", [{ tipo: "desafio_logica", pontos: 10, moedas: 2 }], []), {
      pontos: 10,
      moedas: 2,
    });
  });

  it("zero nos dois é sem recompensa — sem selo de +0", () => {
    assert.equal(resolverRecompensa("missao_concluida", [{ tipo: "missao_concluida", pontos: 0, moedas: 0 }], []), null);
    assert.equal(resolverRecompensa(null, globais, []), null);
    assert.equal(rotuloDaRecompensa(null), "");
  });

  it("rótulo em pts, como no ranking", () => {
    assert.equal(rotuloDaRecompensa({ pontos: 20, moedas: 5 }), "+20 pts · +5 moedas");
    assert.equal(rotuloDaRecompensa({ pontos: 0, moedas: 5 }), "+5 moedas");
  });
});

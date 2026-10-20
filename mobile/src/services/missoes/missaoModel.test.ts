import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  montarMissoes,
  ordenarMissoes,
  perfilDaMissao,
  perfisRepresentativos,
  rotuloCriterio,
  rotuloDoEscopo,
  rotuloDoPrazo,
  statusDe,
  vigente,
  type MissaoDoAluno,
} from "./missaoModel";

const AGORA = new Date("2026-10-19T15:00:00Z");

const linha = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  titulo: "Dez minutos hoje",
  descricao: "Passe 10 minutos estudando",
  criterio: { metrica: "minutos_no_dia", minutos: 10 },
  perfil_alvo: null,
  dia: "2026-10-19",
  slot: 1,
  origem: "sistema",
  escopo: "aluno",
  janela_inicio: null,
  janela_fim: null,
  ...extra,
});

describe("statusDe", () => {
  it("reconhece as variações que o banco grava", () => {
    assert.equal(statusDe("concluido"), "concluida");
    assert.equal(statusDe("concluída"), "concluida");
    assert.equal(statusDe("em andamento"), "em_andamento");
    assert.equal(statusDe("in_progress"), "em_andamento");
    assert.equal(statusDe(null), "pendente");
    assert.equal(statusDe("qualquer coisa"), "pendente");
  });
});

describe("rotuloCriterio", () => {
  it("as duas métricas de delta da diária", () => {
    assert.equal(rotuloCriterio({ metrica: "minutos_no_dia", minutos: 10 }), "10 min hoje");
    assert.equal(rotuloCriterio({ metrica: "eventos_no_dia", minimo: 2, evento: "atividade_concluida" }), "2 atividade(s)");
    assert.equal(rotuloCriterio({ metrica: "eventos_no_dia", minimo: 1, evento: "conteudo_concluido" }), "1 conteúdo(s)");
    assert.equal(rotuloCriterio({ metrica: "eventos_no_dia", minimo: 5 }), "5 ação(ões) na trilha");
  });

  it("as acumuladas que o professor usa, com a chave certa de cada uma", () => {
    // A chave vem de `CHAVE_DO_ALVO` no console: errar a chave é alvo zero, e aí a missão
    // nasce cumprida. O rótulo tem de ler a mesma chave que foi gravada.
    assert.equal(rotuloCriterio({ metrica: "minutos_totais", minutos: 120 }), "120 min no total");
    assert.equal(rotuloCriterio({ metrica: "dias_seguidos", dias_seguidos: 3 }), "3 dia(s) seguidos");
    assert.equal(rotuloCriterio({ metrica: "topicos_concluidos", minimo: 2 }), "2 tópico(s)");
    assert.equal(rotuloCriterio({ metrica: "acertos_percentual", percentual: 80 }), "80% de acerto");
    assert.equal(rotuloCriterio({ metrica: "trilha_percentual", percentual: 50 }), "50% da trilha");
    assert.equal(rotuloCriterio({ metrica: "atividade_especifica", atividade_id: 7 }), "entregar a atividade");
  });

  it("métrica desconhecida mostra o nome dela em vez de sumir", () => {
    assert.equal(rotuloCriterio({ metrica: "metrica_nova" }), "metrica_nova");
    assert.equal(rotuloCriterio(null), "missão");
  });
});

describe("vigente", () => {
  it("sem janela, vale sempre", () => {
    assert.equal(vigente({ prazo: null }, AGORA), true);
  });

  it("antes de começar e depois de vencer, não vale", () => {
    assert.equal(vigente({ prazo: null, inicio: "2026-10-20T00:00:00Z" }, AGORA), false);
    assert.equal(vigente({ prazo: "2026-10-18T23:59:00Z" }, AGORA), false);
  });

  it("dentro da janela, vale", () => {
    assert.equal(vigente({ prazo: "2026-10-25T00:00:00Z", inicio: "2026-10-01T00:00:00Z" }, AGORA), true);
  });

  it("data inválida não invalida a missão", () => {
    assert.equal(vigente({ prazo: "não é data" }, AGORA), true);
  });
});

describe("rotuloDoPrazo", () => {
  it("hoje, amanhã, data e vencido", () => {
    assert.equal(rotuloDoPrazo("2026-10-19T23:00:00Z", AGORA), "até hoje");
    assert.equal(rotuloDoPrazo("2026-10-20T23:00:00Z", AGORA), "até amanhã");
    assert.equal(rotuloDoPrazo("2026-10-25T23:00:00Z", AGORA), "até 25/10");
    assert.equal(rotuloDoPrazo("2026-10-18T23:00:00Z", AGORA), "prazo encerrado");
  });

  it("sem prazo, sem rótulo", () => {
    assert.equal(rotuloDoPrazo(null, AGORA), "");
    assert.equal(rotuloDoPrazo("lixo", AGORA), "");
  });
});

describe("ordenarMissoes", () => {
  const m = (over: Partial<MissaoDoAluno>): MissaoDoAluno => ({
    id: 1, titulo: "t", descricao: "", progresso: 0, status: "pendente", criterioRotulo: "",
    origem: "sistema", escopo: "aluno", prazo: null, dia: null, slot: null, ...over,
  });

  it("a diária vem primeiro, por slot", () => {
    const r = ordenarMissoes([
      m({ id: 3, origem: "professor" }),
      m({ id: 2, origem: "sistema", slot: 2 }),
      m({ id: 1, origem: "sistema", slot: 1 }),
    ]);
    assert.deepEqual(r.map((x) => x.id), [1, 2, 3]);
  });

  it("a do professor vem pelo prazo mais próximo, e sem prazo vai para o fim", () => {
    const r = ordenarMissoes([
      m({ id: 1, origem: "professor", prazo: null }),
      m({ id: 2, origem: "professor", prazo: "2026-10-25T00:00:00Z" }),
      m({ id: 3, origem: "professor", prazo: "2026-10-20T00:00:00Z" }),
    ]);
    assert.deepEqual(r.map((x) => x.id), [3, 2, 1]);
  });

  it("a ordem é estável entre carregamentos iguais", () => {
    // O cuidado do plano: a lista era ordenada por `dia`, e missão de professor não tem `dia`.
    // Ordenar por chave nula joga todas juntas numa ordem que muda a cada carregamento.
    const lista = [
      m({ id: 7, origem: "professor", prazo: null, dia: null }),
      m({ id: 3, origem: "professor", prazo: null, dia: null }),
      m({ id: 5, origem: "professor", prazo: null, dia: null }),
    ];
    assert.deepEqual(ordenarMissoes(lista).map((x) => x.id), [3, 5, 7]);
    assert.deepEqual(ordenarMissoes([...lista].reverse()).map((x) => x.id), [3, 5, 7]);
  });
});

describe("montarMissoes", () => {
  it("junta o progresso do aluno com a missão", () => {
    const r = montarMissoes([linha()], [{ missao_id: 1, status: "em andamento", progresso: 40 }], { agora: AGORA });
    assert.equal(r[0].progresso, 40);
    assert.equal(r[0].status, "em_andamento");
    assert.equal(r[0].criterioRotulo, "10 min hoje");
  });

  it("missão de outro perfil não é minha", () => {
    const outra = linha({ id: 2, perfil_alvo: "Seeker" });
    assert.deepEqual(montarMissoes([outra], [], { perfilAtivo: "mastermind", agora: AGORA }), []);
    assert.equal(montarMissoes([outra], [], { perfilAtivo: "seeker", agora: AGORA }).length, 1);
    // Sem perfil ativo, não filtra — melhor mostrar do que esconder por engano.
    assert.equal(montarMissoes([outra], [], { agora: AGORA }).length, 1);
  });

  it("a do professor fora da janela não aparece", () => {
    const vencida = linha({ id: 9, origem: "professor", dia: null, slot: null, janela_fim: "2026-10-18T00:00:00Z" });
    assert.deepEqual(montarMissoes([vencida], [], { agora: AGORA }), []);
  });

  it("a diária não é filtrada pela janela, só pelo dia", () => {
    // A janela da diária é meia-noite a meia-noite de Brasília (`20261021_05`); filtrar por
    // ela no cliente arriscaria esconder a missão do dia por diferença de fuso.
    const diaria = linha({ janela_fim: "2026-10-19T03:00:00Z" });
    assert.equal(montarMissoes([diaria], [], { agora: AGORA }).length, 1);
  });

  it("escopo desconhecido cai em turma, não em guilda", () => {
    assert.equal(montarMissoes([linha({ escopo: "qualquer" })], [], { agora: AGORA })[0].escopo, "turma");
    assert.equal(montarMissoes([linha({ escopo: "guilda" })], [], { agora: AGORA })[0].escopo, "guilda");
  });

  it("origem desconhecida cai em sistema", () => {
    assert.equal(montarMissoes([linha({ origem: "ia" })], [], { agora: AGORA })[0].origem, "sistema");
  });
});

describe("rotuloDoEscopo", () => {
  it("só diz algo quando muda de quem é a missão", () => {
    assert.equal(rotuloDoEscopo("guilda"), "da guilda");
    assert.equal(rotuloDoEscopo("turma"), "da turma");
    assert.equal(rotuloDoEscopo("aluno"), "");
  });
});

describe("perfisRepresentativos — a regra do banco (20261021_20)", () => {
  // Os dois alunos de produção em 20/10, anonimizados.
  const espalhado = [
    { nome: "Daredevil", afinidade: 13 },
    { nome: "Seeker", afinidade: 17 },
    { nome: "Survivor", afinidade: 13 },
    { nome: "Achiever", afinidade: 17 },
    { nome: "Socializer", afinidade: 13 },
    { nome: "Conqueror", afinidade: 13 },
    { nome: "Mastermind", afinidade: 13 },
  ];

  it("abaixo de 20 só entram os 2 primeiros, desempatando por nome como o SQL", () => {
    assert.deepEqual(perfisRepresentativos(espalhado), ["achiever", "seeker"]);
  });

  it("o empate na fronteira do 2º lugar é decidido pelo nome, não pela ordem de chegada", () => {
    const a = [
      { nome: "Survivor", afinidade: 30 },
      { nome: "Socializer", afinidade: 10 },
      { nome: "Conqueror", afinidade: 10 },
    ];
    assert.deepEqual(perfisRepresentativos(a), ["survivor", "conqueror"]);
    assert.deepEqual(perfisRepresentativos([...a].reverse()), ["survivor", "conqueror"]);
  });

  it("de 20 para cima entra mesmo fora dos 2 primeiros; afinidade 0 nunca entra", () => {
    const a = [
      { nome: "Mastermind", afinidade: 85 },
      { nome: "Conqueror", afinidade: 60 },
      { nome: "Seeker", afinidade: 20 },
      { nome: "Survivor", afinidade: 19 },
    ];
    assert.deepEqual(perfisRepresentativos(a), ["mastermind", "conqueror", "seeker"]);
    assert.deepEqual(perfisRepresentativos([{ nome: "Seeker", afinidade: 0 }]), []);
  });
});

describe("perfilDaMissao", () => {
  const perfis = [
    { nome: "Mastermind", afinidade: 85 },
    { nome: "Conqueror", afinidade: 60 },
    { nome: "Survivor", afinidade: 5 },
  ];

  it("mantém o perfil ativo quando ele ainda é representativo", () => {
    assert.equal(perfilDaMissao(perfis, "conqueror"), "conqueror");
    assert.equal(perfilDaMissao(perfis, "Conqueror"), "conqueror");
  });

  it("perfil ativo velho, que deixou de ser representativo, cai no primeiro representativo", () => {
    assert.equal(perfilDaMissao(perfis, "survivor"), "mastermind");
    assert.equal(perfilDaMissao(perfis, null), "mastermind");
  });

  it("sem perfis ou sem nenhum representativo é null, como fn_perfil_da_missao", () => {
    assert.equal(perfilDaMissao([], "seeker"), null);
    assert.equal(perfilDaMissao(undefined, null), null);
    assert.equal(perfilDaMissao([{ nome: "Seeker", afinidade: 0 }], "seeker"), null);
  });

  it("os dois alunos de produção: o perfil ativo salvo vale porque é representativo", () => {
    // b49f…: mastermind 85, conqueror 60, perfil_ativo = mastermind.
    assert.equal(perfilDaMissao(perfis, "mastermind"), "mastermind");
    // 6ee7…: todos entre 13 e 17, perfil_ativo = achiever (representativo pelo desempate por nome).
    const espalhado = ["Daredevil", "Mastermind", "Socializer", "Conqueror", "Survivor"].map((nome) => ({
      nome,
      afinidade: 13,
    }));
    espalhado.push({ nome: "Seeker", afinidade: 17 }, { nome: "Achiever", afinidade: 17 });
    assert.equal(perfilDaMissao(espalhado, "achiever"), "achiever");
    assert.equal(perfilDaMissao(espalhado, "daredevil"), "achiever");
  });

  it("perfil null em montarMissoes mostra só as missões sem perfil_alvo; undefined não filtra", () => {
    const linhas = [linha({ id: 1, perfil_alvo: "mastermind" }), linha({ id: 2, perfil_alvo: null, slot: 2 })];
    assert.deepEqual(
      montarMissoes(linhas as never, [], { perfilAtivo: null, agora: AGORA }).map((m) => m.id),
      [2],
    );
    assert.equal(montarMissoes(linhas as never, [], { agora: AGORA }).length, 2);
  });

  it("o filtro da lista usa o perfil resolvido: missão de coorte não representativa some", () => {
    const linhas = [
      { ...linha({ id: 1, perfil_alvo: "mastermind" }) },
      { ...linha({ id: 2, perfil_alvo: "survivor", slot: 2 }) },
    ];
    const lista = montarMissoes(linhas as never, [], { perfilAtivo: perfilDaMissao(perfis, "survivor"), agora: AGORA });
    assert.deepEqual(lista.map((m) => m.id), [1]);
  });
});

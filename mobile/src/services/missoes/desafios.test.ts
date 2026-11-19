import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

/*
 * Leitura dos desafios e "Conferir", com o Supabase de mentira (molde de `Rank.semFallback.test.ts`).
 * Cada consulta grava os filtros que recebeu, e a resposta sai de `respostas[tabela]`, uma por
 * chamada, na ordem.
 */
type Resposta = { data: unknown; error: unknown; status?: number };
type Chamada = { tabela: string; filtros: unknown[][] };

let chamadas: Chamada[] = [];
let respostas: Record<string, Resposta[]> = {};
let rpc: { nome: string; args: unknown } | null = null;
let respostaDaRpc: () => Resposta | Promise<Resposta> = () => ({ data: null, error: null });

function consulta(tabela: string) {
  const registro: Chamada = { tabela, filtros: [] };
  chamadas.push(registro);
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "in", "is", "not", "or", "order", "limit", "maybeSingle"]) {
    q[metodo] = (...args: unknown[]) => {
      registro.filtros.push([metodo, ...args]);
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    const fila = respostas[tabela] ?? [];
    const r = fila.length ? fila.shift()! : { data: [], error: null };
    return Promise.resolve(r).then(ok, ko);
  };
  return q;
}

const supabaseStub = {
  from: (tabela: string) => consulta(tabela),
  rpc: (nome: string, args: unknown) => {
    rpc = { nome, args };
    return Promise.resolve().then(respostaDaRpc);
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
(require.cache as Record<string, unknown>)[require.resolve("@/database/supabase")] = {
  exports: { supabase: supabaseStub },
};
const { carregarDesafioDaMissao, conferirDesafio } = require("./desafios") as typeof import("./desafios");
const { carregarMissoesDoRastreador, chaveDosDesafios } = require("./rastreadorDeMissoes") as typeof import("./rastreadorDeMissoes");
const { carregarDesafiosDoTopico, carregarMissoesDoAluno } = require("./missoesDoDia") as typeof import("./missoesDoDia");
/* eslint-enable @typescript-eslint/no-require-imports */

const filtrosDe = (tabela: string, n = 0) => chamadas.filter((c) => c.tabela === tabela)[n]?.filtros ?? [];
const temFiltro = (filtros: unknown[][], ...esperado: unknown[]) =>
  filtros.some((f) => JSON.stringify(f) === JSON.stringify(esperado));

beforeEach(() => {
  chamadas = [];
  respostas = {};
  rpc = null;
  respostaDaRpc = () => ({ data: null, error: null });
});

const LINHA = {
  id: 9,
  titulo: "Desafio de lógica: Bancos",
  descricao: "",
  criterio: { metrica: "desafio" },
  perfil_alvo: "mastermind",
  dia: null,
  slot: null,
  origem: "ia",
  escopo: "aluno",
  janela_inicio: null,
  janela_fim: null,
  desafio: { tipo: "logica", enunciado: "Quanto é 2+2?", formato: "curta" },
  conteudo_id: 50,
  desafio_grupo: "grupo-a",
};

describe("carregarMissoesDoAluno", () => {
  it("a consulta comum pede desafio IS NULL, para o desafio não aparecer duas vezes", async () => {
    respostas.missoes = [{ data: [], error: null }];
    await carregarMissoesDoAluno(1, "mastermind");
    assert.ok(temFiltro(filtrosDe("missoes"), "is", "desafio", null));
  });

  it("banco sem a coluna desafio (42703): repete sem o filtro e a lista não quebra", async () => {
    respostas.missoes = [
      { data: null, error: { code: "42703", message: "column missoes.desafio does not exist" } },
      { data: [{ ...LINHA, id: 3, desafio: undefined, conteudo_id: undefined, desafio_grupo: undefined, origem: "professor", perfil_alvo: null }], error: null },
    ];
    respostas.missao_aluno = [{ data: [], error: null }];
    const lista = await carregarMissoesDoAluno(1, "mastermind");
    assert.deepEqual(lista.map((m) => m.id), [3]);
    assert.equal(temFiltro(filtrosDe("missoes", 1), "is", "desafio", null), false);
  });

  it("banco também sem alvo_por_membro: cai até as colunas de antes", async () => {
    const semColuna = { data: null, error: { code: "42703", message: "column does not exist" } };
    respostas.missoes = [semColuna, semColuna, { data: [], error: null }];
    assert.deepEqual(await carregarMissoesDoAluno(1, null), []);
    assert.equal(chamadas.filter((c) => c.tabela === "missoes").length, 3);
  });
});

describe("carregarDesafiosDoTopico", () => {
  it("filtra no servidor pelo conteúdo dos tópicos e pelos perfis representativos", async () => {
    respostas.missoes = [{ data: [LINHA], error: null }];
    respostas.missao_aluno = [{ data: [{ missao_id: 9, status: "concluida", progresso: 100 }], error: null }];

    const desafios = await carregarDesafiosDoTopico(1, [50, 51], ["mastermind", "achiever"]);

    const f = filtrosDe("missoes");
    assert.ok(temFiltro(f, "eq", "classe_id", 1));
    assert.ok(temFiltro(f, "not", "desafio", "is", null));
    assert.ok(temFiltro(f, "in", "conteudo_id", [50, 51]));
    assert.ok(temFiltro(f, "in", "perfil_alvo", ["mastermind", "achiever"]));
    assert.equal(desafios.length, 1);
    assert.equal(desafios[0].status, "concluida");
    assert.equal(desafios[0].desafioGrupo, "grupo-a");
  });

  it("os ids de conteúdo vêm da turma já carregada: nenhuma consulta a conteudos", async () => {
    respostas.missoes = [{ data: [LINHA], error: null }];
    await carregarDesafiosDoTopico(1, [50], ["mastermind"]);
    assert.equal(chamadas.filter((c) => c.tabela === "conteudos").length, 0);
  });

  it("sem conteúdo ou sem perfil: nem consulta as missões", async () => {
    assert.deepEqual(await carregarDesafiosDoTopico(1, [], ["mastermind"]), []);
    assert.deepEqual(await carregarDesafiosDoTopico(1, [50], []), []);
    assert.equal(chamadas.filter((c) => c.tabela === "missoes").length, 0);
  });

  it("banco sem as colunas do desafio (42703 ou PGRST204): nenhum desafio, sem erro", async () => {
    for (const code of ["42703", "PGRST204"]) {
      respostas.missoes = [{ data: null, error: { code, message: "column missoes.desafio does not exist" } }];
      assert.deepEqual(await carregarDesafiosDoTopico(1, [50], ["mastermind"]), []);
    }
  });

  it("ordena por id, do mais novo, antes do limite: o corte de 30 linhas fica com os desafios recentes", async () => {
    respostas.missoes = [{ data: [], error: null }];
    await carregarDesafiosDoTopico(1, [50], ["mastermind"]);
    const f = filtrosDe("missoes");
    const ordem = f.findIndex((x) => JSON.stringify(x) === JSON.stringify(["order", "id", { ascending: false }]));
    const limite = f.findIndex((x) => x[0] === "limit");
    assert.ok(ordem >= 0 && ordem < limite, JSON.stringify(f));
  });

  it("outro erro sobe: quem chama decide", async () => {
    respostas.missoes = [{ data: null, error: { code: "PGRST100", message: "erro de sintaxe" } }];
    await assert.rejects(carregarDesafiosDoTopico(1, [50], ["mastermind"]));
  });
});

describe("conferirDesafio", () => {
  const resposta = { palavras: { "1h": "BANCO" } };

  it("manda a resposta à RPC e devolve só os campos dela", async () => {
    respostaDaRpc = () => ({
      data: { acertou: false, ja_concluida: false, palavras_certas: 1, palavras_total: 4 },
      error: null,
    });
    assert.deepEqual(await conferirDesafio(9, resposta), {
      acertou: false,
      ja_concluida: false,
      palavras_certas: 1,
      palavras_total: 4,
    });
    assert.deepEqual(rpc, { nome: "missao_desafio_responder", args: { p_missao_id: 9, p_resposta: resposta } });
  });

  it("limite_de_tentativas vira erro limite", async () => {
    respostaDaRpc = () => ({ data: null, error: { code: "P0001", message: "limite_de_tentativas" }, status: 400 });
    assert.deepEqual(await conferirDesafio(9, resposta), { erro: "limite" });
  });

  it("falha de rede vira erro rede, lançada ou devolvida pelo supabase-js", async () => {
    // O postgrest-js devolve a falha do fetch como erro com status 0, sem lançar.
    respostaDaRpc = () => ({ data: null, error: { code: "", message: "TypeError: Network request failed" }, status: 0 });
    assert.deepEqual(await conferirDesafio(9, resposta), { erro: "rede" });
    respostaDaRpc = () => {
      throw new TypeError("Network request failed");
    };
    assert.deepEqual(await conferirDesafio(9, resposta), { erro: "rede" });
  });

  it("só a falha de rede vira rede: 5xx, statement timeout e exceção do código são outro", async () => {
    for (const r of [
      { data: null, error: { code: "", message: "Internal Server Error" }, status: 500 },
      { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, status: 500 },
      { data: null, error: { code: "PGRST000", message: "upstream" }, status: 503 },
    ]) {
      respostaDaRpc = () => r;
      assert.deepEqual(await conferirDesafio(9, resposta), { erro: "outro" }, JSON.stringify(r));
    }
    for (const e of [new Error("boom"), new TypeError("Cannot read properties of undefined (reading 'x')")]) {
      respostaDaRpc = () => {
        throw e;
      };
      assert.deepEqual(await conferirDesafio(9, resposta), { erro: "outro" }, String(e));
    }
    for (const mensagem of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
      respostaDaRpc = () => {
        throw new TypeError(mensagem);
      };
      assert.deepEqual(await conferirDesafio(9, resposta), { erro: "rede" }, mensagem);
    }
  });

  it("sem acesso (42501: tópico oculto, turma retida, perfil de fora) é indisponível: tentar de novo não adianta", async () => {
    for (const erro of [
      { code: "42501", message: "topico_nao_publicado" },
      { code: "42501", message: "personalizacao_retida" },
      { code: "42501", message: "Desafio não encontrado ou sem acesso." },
    ]) {
      respostaDaRpc = () => ({ data: null, error: erro, status: 403 });
      assert.deepEqual(await conferirDesafio(9, resposta), { erro: "indisponivel" }, erro.message);
    }
  });

  it("o resto vira outro, sem lançar", async () => {
    respostaDaRpc = () => ({ data: null, error: { code: "22023", message: "Mande as palavras da cruzadinha." }, status: 400 });
    assert.deepEqual(await conferirDesafio(9, resposta), { erro: "outro" });
  });
});

describe("carregarDesafioDaMissao", () => {
  const LINHA_DA_TELA = {
    id: 9,
    titulo: "Desafio de lógica: Bancos",
    descricao: "Pense antes de responder.",
    classe_id: 1,
    desafio: { tipo: "logica", enunciado: "Quanto é 2+2?", formato: "curta" },
    desafio_grupo: "grupo-a",
    perfil_alvo: "mastermind",
  };
  const PERFIS_DO_ALUNO = ["mastermind", "achiever"];

  it("lê a missão, o resolvido pela tentativa certa do grupo e o prêmio do banco", async () => {
    respostas.missoes = [
      { data: LINHA_DA_TELA, error: null },
      { data: [{ id: 9, categoria: "secundaria", recompensa_tipo: "desafio_logica" }], error: null },
    ];
    respostas.missao_desafio_tentativa = [{ data: [{ id: 1 }], error: null }];
    respostas.eventos_pontuacao = [{ data: [{ tipo: "desafio_logica", pontos: 20, moedas: 5 }], error: null }];
    respostas.eventos_pontuacao_classe = [{ data: [{ tipo: "desafio_logica", moedas: 8 }], error: null }];

    const d = await carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO);

    assert.deepEqual(d, {
      missaoId: 9,
      titulo: "Desafio de lógica: Bancos",
      descricao: "Pense antes de responder.",
      desafio: { tipo: "logica", enunciado: "Quanto é 2+2?", formato: "curta" },
      desafioGrupo: "grupo-a",
      resolvido: true,
      recompensa: { pontos: 20, moedas: 8 },
    });
    assert.ok(temFiltro(filtrosDe("missoes"), "eq", "id", 9));
    const t = filtrosDe("missao_desafio_tentativa");
    assert.ok(temFiltro(t, "eq", "desafio_grupo", "grupo-a"));
    assert.ok(temFiltro(t, "eq", "acertou", true));
    assert.ok(temFiltro(t, "eq", "aluno_id", "aluno-1"));
    // A resposta nunca é pedida: nem o gabarito, nem coluna com esse nome.
    assert.equal(chamadas.some((c) => c.tabela === "missao_desafio_gabarito"), false);
    for (const c of chamadas) {
      for (const f of c.filtros) if (f[0] === "select") assert.doesNotMatch(String(f[1]), /resposta|gabarito|aceitas/);
    }
  });

  it("sem tentativa certa, ou com a leitura dela falhando, não está resolvido", async () => {
    for (const tentativa of [{ data: [], error: null }, { data: null, error: { code: "42P01", message: "sem tabela" } }]) {
      respostas.missoes = [{ data: LINHA_DA_TELA, error: null }, { data: [], error: null }];
      respostas.missao_desafio_tentativa = [tentativa];
      const d = await carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO);
      assert.equal(d?.resolvido, false);
      assert.equal(d?.recompensa, null);
    }
  });

  it("missão que não existe, não é desafio ou o app não sabe desenhar: null", async () => {
    for (const linha of [null, { ...LINHA_DA_TELA, desafio: null }, { ...LINHA_DA_TELA, desafio: { tipo: "sudoku" } }, { ...LINHA_DA_TELA, desafio_grupo: null }]) {
      respostas.missoes = [{ data: linha, error: null }];
      assert.equal(await carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO), null, JSON.stringify(linha));
    }
    respostas.missoes = [{ data: null, error: { code: "42703", message: "column missoes.desafio does not exist" } }];
    assert.equal(await carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO), null);
  });

  it("desafio de um perfil que não é representativo do aluno (link direto): null, como não encontrado", async () => {
    for (const perfil_alvo of ["seeker", null, ""]) {
      respostas.missoes = [{ data: { ...LINHA_DA_TELA, perfil_alvo }, error: null }];
      assert.equal(await carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO), null, String(perfil_alvo));
    }
    // Sem perfil representativo nenhum, também: o banco recusaria o "Conferir".
    respostas.missoes = [{ data: LINHA_DA_TELA, error: null }];
    assert.equal(await carregarDesafioDaMissao(9, "aluno-1", []), null);
    // A leitura pede a coluna, e o banco compara com lower(btrim(...)).
    assert.match(String(filtrosDe("missoes")[0][1]), /perfil_alvo/);
    respostas.missoes = [{ data: { ...LINHA_DA_TELA, perfil_alvo: " Achiever " }, error: null }, { data: [], error: null }];
    assert.equal((await carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO))?.missaoId, 9);
  });

  it("outro erro na leitura da missão sobe: a tela mostra o erro com tentar de novo", async () => {
    respostas.missoes = [{ data: null, error: { code: "57014", message: "timeout" } }];
    await assert.rejects(carregarDesafioDaMissao(9, "aluno-1", PERFIS_DO_ALUNO));
  });
});

describe("rastreador com desafios", () => {
  const TOPICOS = [{ id: 7, locked: false, completed: false, sequence: 1, atividadeIds: [], conteudoIds: [50] }];
  const PERFIS = [{ nome: "mastermind", afinidade: 60 }];

  it("a falha na leitura dos desafios não derruba as missões comuns", async () => {
    // A ordem das respostas de `missoes`: a comum, a dos desafios (que falha) e a dos extras.
    respostas.missoes = [
      { data: [{ ...LINHA, id: 3, desafio: undefined, conteudo_id: undefined, desafio_grupo: undefined, origem: "professor", perfil_alvo: null }], error: null },
      { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
      { data: [{ id: 3, categoria: null, recompensa_tipo: null }], error: null },
    ];
    respostas.missao_aluno = [{ data: [], error: null }];
    const lista = await carregarMissoesDoRastreador(1, "mastermind", { topicos: TOPICOS, atualId: "7", perfis: PERFIS });
    assert.deepEqual(lista.map((m) => m.id), [3]);
    const desafios = chamadas.filter((c) => c.tabela === "missoes")[1].filtros;
    assert.ok(temFiltro(desafios, "in", "conteudo_id", [50]), JSON.stringify(desafios));
  });

  it("chaveDosDesafios muda só com o que muda a leitura: tópicos dos desafios e perfis representativos", () => {
    const a = chaveDosDesafios({ topicos: TOPICOS, atualId: "7", perfis: PERFIS });
    assert.equal(a, chaveDosDesafios({ topicos: [...TOPICOS.map((t) => ({ ...t }))], atualId: 7, perfis: [{ ...PERFIS[0] }] }));
    assert.notEqual(a, chaveDosDesafios({ topicos: TOPICOS, atualId: "7", perfis: [...PERFIS, { nome: "achiever", afinidade: 40 }] }));
    assert.notEqual(a, chaveDosDesafios({ topicos: [], atualId: "7", perfis: PERFIS }));
    // Conteúdo novo no tópico da vez também muda a leitura.
    assert.notEqual(a, chaveDosDesafios({ topicos: [{ ...TOPICOS[0], conteudoIds: [50, 52] }], atualId: "7", perfis: PERFIS }));
  });
});

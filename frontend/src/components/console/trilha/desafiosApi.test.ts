import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropostaDeDesafio } from "../../../../supabase/functions/generate-content-ai/desafios.ts";

type Resp = { data?: unknown; error?: unknown };
const sb = vi.hoisted(() => ({
  respostas: {} as Record<string, Resp>,
  lancar: null as Error | null,
  chamadas: [] as unknown[][],
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: sb.rpc,
    functions: { invoke: sb.invoke },
    from: (tabela: string) => {
      if (sb.lancar) throw sb.lancar;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "is", "limit", "order"]) {
        q[m] = (...args: unknown[]) => (sb.chamadas.push([tabela, m, ...args]), q);
      }
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(sb.respostas[tabela] ?? { data: [], error: null }).then(resolve);
      return q;
    },
  },
}));

import { FuncaoSemDesafiosError, criarDesafios, desafiosAplicadosDoConteudo, gerarDesafios } from "./desafiosApi";
import { alternarPerfil, gradeDaCruzadinha, textosDosDesafios } from "./desafiosNaRevisao";

const logica: PropostaDeDesafio = {
  tipo: "logica",
  titulo: "Sequência",
  desafio: { tipo: "logica", enunciado: "Qual o próximo: 2, 4, 8, ?", formato: "multipla", alternativas: ["10", "16", "12", "14"] },
  resposta: { aceitas: ["16"] },
  perfis: ["mastermind", "achiever"],
};

const cruzadinha: PropostaDeDesafio = {
  tipo: "cruzadinha",
  titulo: "Termos",
  desafio: {
    tipo: "cruzadinha",
    linhas: 3,
    colunas: 4,
    palavras: [
      { numero: 1, direcao: "h", linha: 0, coluna: 0, tamanho: 4, pista: "Guarda dados" },
      { numero: 2, direcao: "v", linha: 0, coluna: 2, tamanho: 3, pista: "Ligação" },
    ],
  },
  resposta: { palavras: { "1h": "BASE", "2v": "SOL" } },
  perfis: ["seeker", "mastermind"],
};

beforeEach(() => {
  sb.respostas = {};
  sb.lancar = null;
  sb.chamadas = [];
  sb.rpc.mockReset();
  sb.invoke.mockReset();
});

describe("criarDesafios", () => {
  it("criarDesafios chama a RPC com p_conteudo_id, p_desafio, p_resposta e p_perfis", async () => {
    sb.rpc.mockResolvedValue({ data: [{ missao_id: 1 }], error: null });
    const r = await criarDesafios(77, [logica, { ...cruzadinha, perfis: ["daredevil"] }]);
    expect(r).toEqual({ criados: 2, falhas: [], recusados: [] });
    expect(sb.rpc).toHaveBeenNthCalledWith(1, "missao_desafio_criar", {
      p_conteudo_id: 77,
      p_desafio: logica.desafio,
      p_resposta: logica.resposta,
      p_perfis: ["mastermind", "achiever"],
    });
    expect(sb.rpc).toHaveBeenNthCalledWith(2, "missao_desafio_criar", {
      p_conteudo_id: 77,
      p_desafio: cruzadinha.desafio,
      p_resposta: cruzadinha.resposta,
      p_perfis: ["daredevil"],
    });
  });

  it("não manda o título do modelo: a RPC monta o próprio", async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    await criarDesafios(5, [logica]);
    const args = sb.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(["p_conteudo_id", "p_desafio", "p_perfis", "p_resposta"]);
    expect(JSON.stringify(args)).not.toContain("Sequência");
  });

  it("uma falha não impede as outras e volta em falhas com a mensagem do banco", async () => {
    sb.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Perfil inválido: x." } })
      .mockRejectedValueOnce(new Error("rede caiu"))
      .mockResolvedValueOnce({ data: [{ missao_id: 9 }], error: null });
    const r = await criarDesafios(3, [logica, cruzadinha, logica]);
    expect(sb.rpc).toHaveBeenCalledTimes(3);
    expect(r.criados).toBe(1);
    expect(r.falhas).toHaveLength(2);
    expect(r.falhas[0]).toContain("Perfil inválido: x.");
    expect(r.falhas[0]).toContain("Sequência");
    expect(r.falhas[1]).toContain("rede caiu");
    expect(r.recusados).toEqual([0, 1]);
  });

  it("RPC que o banco ainda não tem (PGRST202, 42883) vira um aviso em PT-BR", async () => {
    sb.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.missao_desafio_criar" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42883", message: "function missao_desafio_criar does not exist" } });
    const r = await criarDesafios(3, [logica, cruzadinha]);
    expect(r.falhas).toEqual([
      "Sequência: Os desafios ainda não estão disponíveis neste banco.",
      "Termos: Os desafios ainda não estão disponíveis neste banco.",
    ]);
    expect(r.recusados).toEqual([0, 1]);
  });

  it("sem propostas não chama a RPC", async () => {
    expect(await criarDesafios(3, [])).toEqual({ criados: 0, falhas: [], recusados: [] });
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("gerarDesafios", () => {
  it("gerarDesafios manda mode desafios e devolve a lista", async () => {
    sb.invoke.mockResolvedValue({ data: { desafios: [logica, cruzadinha], descartados: 1 }, error: null });
    const r = await gerarDesafios({ topicName: "Bancos", mode: "content", existentes: { questoes: ["a"], cards: [] } });
    expect(sb.invoke).toHaveBeenCalledWith("generate-content-ai", {
      body: { topicName: "Bancos", mode: "desafios", existentes: { questoes: ["a"], cards: [] } },
    });
    expect(r).toEqual({ desafios: [logica, cruzadinha], descartados: 1 });
  });

  it("200 com a lista vazia devolve os descartados para o aviso", async () => {
    sb.invoke.mockResolvedValue({ data: { desafios: [], descartados: 4 }, error: null });
    expect(await gerarDesafios({})).toEqual({ desafios: [], descartados: 4 });
  });

  it("resposta sem desafios é a edge antiga: erro próprio, para o drawer não pedir de novo", async () => {
    // A edge publicada antes do modo desafios responde como `content`: 200, com cards e atividades.
    sb.invoke.mockResolvedValue({ data: { cards: [], atividades: [] }, error: null });
    const erro = await gerarDesafios({}).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FuncaoSemDesafiosError);
    expect((erro as Error).message).toBe("A função de IA publicada ainda não gera desafios.");
    sb.invoke.mockResolvedValue({ data: null, error: null });
    await expect(gerarDesafios({})).rejects.toBeInstanceOf(FuncaoSemDesafiosError);
  });

  it("descartados que não são número contam como 0", async () => {
    sb.invoke.mockResolvedValue({ data: { desafios: [], descartados: "x" }, error: null });
    expect(await gerarDesafios({})).toEqual({ desafios: [], descartados: 0 });
  });

  it("o 502 invalid_ai_response sobe com a mensagem PT-BR da edge", async () => {
    const corpo = { error: "invalid_ai_response", message: "Não foi possível gerar desafios a partir deste material. Tente de novo." };
    sb.invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify(corpo), { status: 502 }) },
    });
    await expect(gerarDesafios({})).rejects.toThrow("Não foi possível gerar desafios a partir deste material. Tente de novo.");
  });
});

describe("desafiosAplicadosDoConteudo", () => {
  it("lê os desafios do conteúdo em missoes e devolve enunciados e pistas, sem repetir o grupo", async () => {
    sb.respostas.missoes = {
      data: [
        { desafio: logica.desafio },
        { desafio: logica.desafio }, // a mesma do grupo, em outro perfil
        { desafio: cruzadinha.desafio },
      ],
      error: null,
    };
    const r = await desafiosAplicadosDoConteudo(77);
    expect(r).toEqual(["Qual o próximo: 2, 4, 8, ?", "Guarda dados", "Ligação"]);
    expect(sb.chamadas).toContainEqual(["missoes", "eq", "conteudo_id", 77]);
    expect(sb.chamadas).toContainEqual(["missoes", "not", "desafio", "is", null]);
  });

  it("falha de leitura não bloqueia: devolve vazio", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sb.respostas.missoes = { data: null, error: { code: "42703", message: "column missoes.conteudo_id does not exist" } };
    expect(await desafiosAplicadosDoConteudo(77)).toEqual([]);
    aviso.mockRestore();
  });

  it("exceção na leitura também não bloqueia", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sb.lancar = new Error("rede caiu");
    expect(await desafiosAplicadosDoConteudo(77)).toEqual([]);
    aviso.mockRestore();
  });
});

describe("textosDosDesafios", () => {
  it("enunciado da lógica e pistas da cruzadinha; o que não é desafio fica de fora", () => {
    expect(textosDosDesafios([logica.desafio, cruzadinha.desafio, null, { tipo: "outro" }])).toEqual([
      "Qual o próximo: 2, 4, 8, ?",
      "Guarda dados",
      "Ligação",
    ]);
  });
});

describe("alternarPerfil", () => {
  it("tira e põe o perfil, na ordem dos 7", () => {
    expect(alternarPerfil(["mastermind", "achiever"], "seeker")).toEqual(["seeker", "mastermind", "achiever"]);
    expect(alternarPerfil(["mastermind", "achiever"], "achiever")).toEqual(["mastermind"]);
  });

  it("não deixa a proposta sem perfil", () => {
    expect(alternarPerfil(["mastermind"], "mastermind")).toEqual(["mastermind"]);
  });
});

describe("gradeDaCruzadinha", () => {
  it("põe as letras da resposta nas casas e marca o número da primeira casa", () => {
    if (cruzadinha.tipo !== "cruzadinha") throw new Error("tipo");
    const grade = gradeDaCruzadinha(cruzadinha.desafio, cruzadinha.resposta);
    expect(grade).toHaveLength(3);
    expect(grade[0].map((c) => c?.letra ?? ".").join("")).toBe("BASE");
    expect(grade[1].map((c) => c?.letra ?? ".").join("")).toBe("..O.");
    expect(grade[2].map((c) => c?.letra ?? ".").join("")).toBe("..L.");
    expect(grade[0][0]?.numero).toBe(1);
    expect(grade[0][2]?.numero).toBe(2);
    expect(grade[0][1]?.numero).toBeUndefined();
  });
});

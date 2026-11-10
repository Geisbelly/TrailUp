import { describe, expect, it } from "vitest";
import {
  agruparPorTopicoEPerfil,
  estadoPorPerfil,
  itensParaDecidir,
  mapearRegistroAprovacao,
  mensagemDoErro,
  resumir,
  textoDaConfirmacao,
  type RegistroAprovacao,
} from "./aprovacao";

function registro(parcial: Partial<RegistroAprovacao> & { id: number }): RegistroAprovacao {
  return {
    topicoId: 10,
    conteudoId: 100,
    alunoId: null,
    perfil: "seeker",
    status: "pronto",
    aprovacao: "pendente",
    aprovacaoEm: null,
    aprovacaoMotivo: null,
    versao: 1,
    formatos: ["markdown"],
    ...parcial,
  };
}

describe("mapearRegistroAprovacao", () => {
  it("lê a linha do banco e normaliza o perfil", () => {
    expect(
      mapearRegistroAprovacao({
        id: 7, topico_id: 10, conteudo_id: null, aluno_id: null, brainhex_profile_key: " Socialiser ",
        status: "pronto", aprovacao: "aprovado", aprovacao_em: "2026-11-10T12:00:00Z",
        aprovacao_motivo: null, conteudo_versao: 3, formatos_gerados: ["audio", 1],
      }),
    ).toEqual({
      id: 7, topicoId: 10, conteudoId: null, alunoId: null, perfil: "socializer", status: "pronto",
      aprovacao: "aprovado", aprovacaoEm: "2026-11-10T12:00:00Z", aprovacaoMotivo: null, versao: 3,
      formatos: ["audio"],
    });
  });

  it("estado desconhecido vira pendente: na dúvida, o aluno não vê", () => {
    expect(mapearRegistroAprovacao({ id: 1, aprovacao: "talvez" })?.aprovacao).toBe("pendente");
    expect(mapearRegistroAprovacao({ id: 1 })?.aprovacao).toBe("pendente");
  });

  it("descarta linha sem id", () => {
    expect(mapearRegistroAprovacao({ id: null })).toBeNull();
  });
});

describe("agruparPorTopicoEPerfil", () => {
  it("agrupa por tópico × perfil na ordem da trilha e dos perfis", () => {
    const grupos = agruparPorTopicoEPerfil(
      [
        registro({ id: 1, topicoId: 11, perfil: "achiever" }),
        registro({ id: 2, topicoId: 10, perfil: "mastermind", aprovacao: "aprovado" }),
        registro({ id: 3, topicoId: 10, perfil: "seeker" }),
        registro({ id: 4, topicoId: 10, perfil: "seeker", conteudoId: 101, aprovacao: "aprovado" }),
      ],
      [10, 11],
    );
    expect(grupos.map((g) => [g.topicoId, g.perfil, g.estado])).toEqual([
      [10, "seeker", "pendente"],
      [10, "mastermind", "aprovado"],
      [11, "achiever", "pendente"],
    ]);
    expect(grupos[0].registros.map((r) => r.id)).toEqual([3, 4]);
  });

  it("separa o que está gerando do que espera decisão", () => {
    const [g] = agruparPorTopicoEPerfil([
      registro({ id: 1, status: "processando_midias" }),
      registro({ id: 2, aprovacao: "aprovado" }),
    ]);
    expect([g.emGeracao, g.aprovados, g.pendentes, g.estado]).toEqual([1, 1, 0, "misto"]);
    const [so] = agruparPorTopicoEPerfil([registro({ id: 1, status: "processando_midias" })]);
    expect(so.estado).toBe("em_geracao");
  });

  it("todo recusado é recusado", () => {
    const [g] = agruparPorTopicoEPerfil([registro({ id: 1, aprovacao: "recusado" })]);
    expect(g.estado).toBe("recusado");
  });
});

describe("itensParaDecidir", () => {
  const lote = [
    registro({ id: 1 }),
    registro({ id: 2, aprovacao: "aprovado", versao: 4 }),
    registro({ id: 3, status: "processando_midias" }),
    registro({ id: 4, aprovacao: "recusado", versao: 2 }),
  ];

  it("aprovar leva só o que não está aprovado e já terminou de gerar, com a versão vista", () => {
    expect(itensParaDecidir(lote, "aprovado")).toEqual([
      { id: 1, versao: 1 },
      { id: 4, versao: 2 },
    ]);
  });

  it("recusar e tirar do ar levam o que ainda não está naquele estado", () => {
    expect(itensParaDecidir(lote, "recusado").map((i) => i.id)).toEqual([1, 2, 3]);
    expect(itensParaDecidir(lote, "pendente").map((i) => i.id)).toEqual([2, 4]);
  });
});

describe("resumir", () => {
  it("conta pendentes e quantos já podem ser aprovados", () => {
    expect(
      resumir([
        registro({ id: 1 }),
        registro({ id: 2, status: "processando_midias" }),
        registro({ id: 3, aprovacao: "aprovado" }),
        registro({ id: 4, aprovacao: "recusado" }),
      ]),
    ).toEqual({ total: 4, pendentes: 2, aprovados: 1, recusados: 1, emGeracao: 1, prontosParaAprovar: 1 });
  });
});

describe("textoDaConfirmacao", () => {
  it("diz o que muda para o aluno", () => {
    expect(textoDaConfirmacao("aprovado", 1, "“Frações”")).toContain("1 material de “Frações” ficará disponível");
    expect(textoDaConfirmacao("aprovado", 3, "toda a turma")).toContain("3 materiais de toda a turma ficarão disponíveis");
    expect(textoDaConfirmacao("aprovado", 3, "x")).toContain("volta a esperar a sua aprovação");
    expect(textoDaConfirmacao("recusado", 2, "x")).toContain("voltam a ver o material do professor");
    expect(textoDaConfirmacao("pendente", 1, "x")).toContain("sairá do ar");
  });
});

describe("mensagemDoErro", () => {
  it("traduz os erros da RPC", () => {
    expect(mensagemDoErro({ code: "40001", message: "x" })).toContain("mudou depois que você o abriu");
    expect(mensagemDoErro({ code: "42501" })).toContain("suas turmas");
    expect(mensagemDoErro({ code: "22023", message: "Material ainda em geracao" })).toContain("sendo gerado");
    expect(mensagemDoErro({ message: "falhou" })).toBe("falhou");
    expect(mensagemDoErro(null)).toBe("Não foi possível registrar a decisão.");
  });
});

describe("estadoPorPerfil", () => {
  const lote = [
    registro({ id: 1, perfil: "seeker", conteudoId: 100 }),
    registro({ id: 2, perfil: "seeker", conteudoId: 101, aprovacao: "aprovado" }),
    registro({ id: 3, perfil: "achiever", conteudoId: 100, aprovacao: "aprovado" }),
    registro({ id: 4, perfil: "mastermind", topicoId: 11, aprovacao: "recusado" }),
  ];

  it("recorta pelo tópico e pelo conteúdo escolhidos", () => {
    expect(estadoPorPerfil(lote, 10, 100)).toEqual({ seeker: "pendente", achiever: "aprovado" });
    expect(estadoPorPerfil(lote, 10, 101)).toEqual({ seeker: "aprovado" });
  });

  it("sem conteúdo escolhido, olha o tópico inteiro", () => {
    expect(estadoPorPerfil(lote, 10)).toEqual({ seeker: "pendente", achiever: "aprovado" });
    expect(estadoPorPerfil(lote, 11, null)).toEqual({ mastermind: "recusado" });
  });

  it("perfil sem registro não tem selo", () => {
    expect(estadoPorPerfil(lote, 99)).toEqual({});
  });
});

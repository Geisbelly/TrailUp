import { describe, expect, it } from "vitest";
import { COR_DO_PERFIL } from "../dashboard/perfilCores";
import { expandirEmLinhas, FORMULARIO_VAZIO, NOME_MAX, type FormularioDeConquista } from "./formulario";

const base = (extra: Partial<FormularioDeConquista> = {}): FormularioDeConquista => ({
  ...FORMULARIO_VAZIO,
  nome: "Maratonista",
  metrica: "dias_seguidos",
  limiar: "5",
  pontos: "20",
  ...extra,
});

const linhas = (f: FormularioDeConquista) => {
  const r = expandirEmLinhas(f);
  if (!r.ok) throw new Error(`esperava ok: ${JSON.stringify(r.erros)}`);
  return r.linhas!;
};
const erros = (f: FormularioDeConquista) => {
  const r = expandirEmLinhas(f);
  if (r.ok) throw new Error("esperava erro");
  return r.erros!;
};

describe("conquista geral", () => {
  it("vira uma única linha 'comum', sem perfil, com critério e aparência", () => {
    const [l] = linhas(base({ descricao: " 5 dias seguidos ", icone: "chama", cor: "#4fd1c5" }));
    expect(l).toEqual({
      nome: "Maratonista",
      descricao: "5 dias seguidos",
      escopo: "comum",
      perfil_alvo: null,
      criterio: { metrica: "dias_seguidos", dias_seguidos: 5, aparencia: { icone: "chama", cor: "#4fd1c5" } },
      pontos_recompensa: 20,
    });
  });

  it("ícone ou cor fora das listas caem nos padrões, nunca vão para o banco", () => {
    const [l] = linhas(base({ icone: "http://evil/x.png", cor: "#123456" }));
    expect(l.criterio.aparencia).toEqual({ icone: "trofeu", cor: "#9b5de5" });
  });
});

describe("conquista por perfil", () => {
  it("mesmo limiar para vários perfis = uma linha por perfil, com a cor-assinatura de cada um", () => {
    const ls = linhas(base({ escopo: "perfil", perfis: ["seeker", "achiever"], cor: "#e2574c" }));
    expect(ls.map((l) => l.perfil_alvo)).toEqual(["seeker", "achiever"]);
    expect(ls.every((l) => l.escopo === "perfil")).toBe(true);
    expect((ls[0].criterio.aparencia as { cor: string }).cor).toBe(COR_DO_PERFIL.seeker.marca);
    expect((ls[1].criterio.aparencia as { cor: string }).cor).toBe(COR_DO_PERFIL.achiever.marca);
    expect(ls.map((l) => l.criterio.dias_seguidos)).toEqual([5, 5]);
  });

  it("com mais de um perfil o nome ganha o perfil; com um só, não", () => {
    expect(linhas(base({ escopo: "perfil", perfis: ["seeker", "achiever"] })).map((l) => l.nome)).toEqual([
      "Maratonista · Seeker",
      "Maratonista · Achiever",
    ]);
    expect(linhas(base({ escopo: "perfil", perfis: ["seeker"] }))[0].nome).toBe("Maratonista");
  });

  it("limiar por perfil: cada linha leva o seu valor", () => {
    const ls = linhas(base({ escopo: "perfil", perfis: ["seeker", "achiever"], modoLimiar: "por_perfil", limiaresPorPerfil: { seeker: "3", achiever: "7" } }));
    expect(ls.map((l) => l.criterio.dias_seguidos)).toEqual([3, 7]);
  });

  it("limiar por perfil: o erro aponta o perfil que falhou", () => {
    const e = erros(base({ escopo: "perfil", perfis: ["seeker", "achiever"], modoLimiar: "por_perfil", limiaresPorPerfil: { seeker: "3" } }));
    expect(e["limiar:achiever"]).toBeTruthy();
    expect(e["limiar:seeker"]).toBeUndefined();
  });

  it("escopo por perfil sem nenhum perfil é erro", () => {
    expect(erros(base({ escopo: "perfil" })).perfis).toBeTruthy();
  });
});

describe("validação", () => {
  it("nome curto, longo e descrição longa", () => {
    expect(erros(base({ nome: "ab" })).nome).toBeTruthy();
    expect(erros(base({ nome: "x".repeat(NOME_MAX + 1) })).nome).toBeTruthy();
    expect(erros(base({ descricao: "x".repeat(141) })).descricao).toBeTruthy();
  });

  it("métrica obrigatória e da lista", () => {
    expect(erros(base({ metrica: "" })).metrica).toBeTruthy();
    expect(erros(base({ metrica: "inventada" as never })).metrica).toBeTruthy();
  });

  it("limiar segue as regras da métrica escolhida", () => {
    expect(erros(base({ metrica: "acertos_percentual", limiar: "150" })).limiar).toBeTruthy();
    expect(linhas(base({ metrica: "topicos_visitados", limiar: "todos" }))[0].criterio.visitados).toBe("todos");
  });

  it("pontos: inteiro de 0 ao teto", () => {
    expect(erros(base({ pontos: "" })).pontos).toBeTruthy();
    expect(erros(base({ pontos: "-1" })).pontos).toBeTruthy();
    expect(erros(base({ pontos: "2.5" })).pontos).toBeTruthy();
    expect(erros(base({ pontos: "101" })).pontos).toBeTruthy();
    expect(linhas(base({ pontos: "0" }))[0].pontos_recompensa).toBe(0);
  });

  it("reporta os erros de todos os campos independentes de uma vez (o limiar espera a métrica)", () => {
    const e = erros(FORMULARIO_VAZIO);
    expect(Object.keys(e).sort()).toEqual(["metrica", "nome", "pontos"]);
  });
});

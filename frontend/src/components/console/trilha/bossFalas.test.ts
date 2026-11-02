import { describe, expect, it } from "vitest";
import {
  eMigracaoPendente,
  lerMomentos,
  ordenarPorPerfil,
  resumoDasFalas,
  rotuloDoPerfil,
  totalDeFalas,
  type FalaDoBoss,
} from "./bossFalas";

const linha = (p: Partial<FalaDoBoss>): FalaDoBoss => ({
  id: 1,
  conteudo_id: 10,
  perfil: "conqueror",
  nome: "Soberano do Denominador",
  falas: {},
  ativa: true,
  desativada_em: null,
  gerado_em: "2026-11-01T16:54:45Z",
  ...p,
});

describe("lerMomentos", () => {
  it("devolve só os momentos com fala, na ordem da batalha", () => {
    const momentos = lerMomentos({
      vitoria: ["Você venceu!"],
      entrada: ["Defina a sua meta!", "Enfrente este impacto!"],
      dano: ["Golpe certeiro!"],
    });
    expect(momentos.map((m) => m.chave)).toEqual(["entrada", "dano", "vitoria"]);
    expect(momentos[0]).toEqual({ chave: "entrada", rotulo: "Entrada", falas: ["Defina a sua meta!", "Enfrente este impacto!"] });
  });

  it("não confia no formato: momento que não é lista, texto vazio e não-texto somem", () => {
    const momentos = lerMomentos({ entrada: "texto solto", dano: ["  ", "", 42, null, "ok"], derrota: { a: 1 }, chave_nova: ["x"] });
    expect(momentos).toEqual([{ chave: "dano", rotulo: "Quando leva dano", falas: ["ok"] }]);
  });

  it("entrada que não é objeto vira lista vazia, sem estourar", () => {
    expect(lerMomentos(null)).toEqual([]);
    expect(lerMomentos(undefined)).toEqual([]);
    expect(lerMomentos("x")).toEqual([]);
    expect(lerMomentos(["entrada"])).toEqual([]);
  });

  it("apara o texto", () => {
    expect(lerMomentos({ entrada: ["  oi  "] })[0].falas).toEqual(["oi"]);
  });
});

describe("totalDeFalas", () => {
  it("soma as falas de todos os momentos válidos", () => {
    expect(totalDeFalas({ entrada: ["a", "b"], dano: ["c"], derrota: [] })).toBe(3);
    expect(totalDeFalas(null)).toBe(0);
  });
});

describe("rotuloDoPerfil", () => {
  it("usa o nome em português e cai na chave para perfil desconhecido", () => {
    expect(rotuloDoPerfil("conqueror")).toBe("Conquistador");
    expect(rotuloDoPerfil("daredevil")).toBe("Aventureiro");
    expect(rotuloDoPerfil("novo")).toBe("novo");
  });
});

describe("ordenarPorPerfil", () => {
  it("segue a ordem fixa do produto, não a do banco, e desempata pelo id", () => {
    const linhas = [
      linha({ id: 3, perfil: "conqueror" }),
      linha({ id: 1, perfil: "survivor" }),
      linha({ id: 2, perfil: "daredevil" }),
      linha({ id: 5, perfil: "desconhecido" }),
      linha({ id: 4, perfil: "survivor" }),
    ];
    expect(ordenarPorPerfil(linhas).map((l) => l.id)).toEqual([1, 4, 2, 3, 5]);
  });
  it("não muda a lista original", () => {
    const linhas = [linha({ id: 2, perfil: "conqueror" }), linha({ id: 1, perfil: "survivor" })];
    ordenarPorPerfil(linhas);
    expect(linhas.map((l) => l.id)).toEqual([2, 1]);
  });
});

describe("resumoDasFalas", () => {
  it("conta o total e as desligadas", () => {
    expect(resumoDasFalas([linha({}), linha({ id: 2, ativa: false }), linha({ id: 3, ativa: false })])).toEqual({ total: 3, desligadas: 2 });
    expect(resumoDasFalas([])).toEqual({ total: 0, desligadas: 0 });
  });
});

describe("eMigracaoPendente", () => {
  it("reconhece tabela ou coluna ausente", () => {
    expect(eMigracaoPendente({ code: "42P01" })).toBe(true);
    expect(eMigracaoPendente({ code: "42703" })).toBe(true);
    expect(eMigracaoPendente({ code: "PGRST205" })).toBe(true);
    expect(eMigracaoPendente({ message: 'column boss_falas.ativa does not exist' })).toBe(true);
  });
  it("outro erro não esconde o painel", () => {
    expect(eMigracaoPendente(null)).toBe(false);
    expect(eMigracaoPendente({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

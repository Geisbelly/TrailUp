import { describe, expect, it } from "vitest";
import { csvDasNotas, gerarCsv, lerEmailsDoCsv, lerNotas, nomeDoArquivo, planejarImportacao } from "./csvTurma";

describe("gerarCsv", () => {
  it("BOM, ponto e vírgula, vírgula decimal, aspas quando precisa e CRLF", () => {
    const csv = gerarCsv(["A", "B"], [["Ana; Silva", 7.5], ['Diz "oi"', null]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1)).toBe('A;B\r\n"Ana; Silva";7,5\r\n"Diz ""oi""";\r\n');
  });
});

describe("csvDasNotas", () => {
  it("uma linha por aluno com as colunas do arquivo", () => {
    const notas = lerNotas([
      { nome: "Bia", email: "bia@x.com", xp: "35", nota_media: 7.456, progresso_pct: 60, atividades_avaliadas: 2, pontos_obtidos: 14, pontos_maximos: 20 },
      { nome: "Caio", email: null, xp: 0, nota_media: null, progresso_pct: null, atividades_avaliadas: 0, pontos_obtidos: null, pontos_maximos: null },
    ])!;
    const linhas = csvDasNotas(notas).slice(1).trim().split("\r\n");
    expect(linhas[0]).toBe("Aluno;E-mail;XP;Nota média;Progresso (%);Atividades avaliadas;Pontos obtidos;Pontos possíveis");
    expect(linhas[1]).toBe("Bia;bia@x.com;35;7,46;60;2;14;20");
    expect(linhas[2]).toBe("Caio;;0;;;0;;");
  });

  it("resposta que não é lista: null", () => {
    expect(lerNotas({ erro: 1 })).toBeNull();
  });

  it("nome do arquivo sem acento nem espaço", () => {
    expect(nomeDoArquivo("Programação Web · 2026/1", new Date("2026-11-01T12:00:00Z"))).toBe("notas-programacao-web-2026-1-2026-11-01.csv");
  });
});

describe("lerEmailsDoCsv", () => {
  it("usa a coluna e-mail do cabeçalho, ignora repetidos e aponta linhas inválidas", () => {
    const r = lerEmailsDoCsv("\uFEFFNome;E-mail\r\nAna;ANA@x.com\r\nBeto;sem-email\r\n\r\nAna de novo;ana@x.com\r\n");
    expect(r).toEqual({ emails: ["ana@x.com"], invalidas: [3] });
  });

  it("sem cabeçalho, pega a primeira célula com @, com vírgula ou tab", () => {
    expect(lerEmailsDoCsv("Ana,ana@x.com\nbeto@y.org\tBeto").emails).toEqual(["ana@x.com", "beto@y.org"]);
  });
});

describe("planejarImportacao", () => {
  const candidatos = [
    { id: "a", nome: "Ana", email: "Ana@x.com" },
    { id: "b", nome: "Beto", email: "beto@y.org" },
    { id: "c", nome: "Caio", email: null },
  ];
  it("separa quem entra, quem já está e quem não tem conta ou vínculo", () => {
    const p = planejarImportacao(["ana@x.com", "beto@y.org", "zeca@z.com"], candidatos, new Set(["b"]));
    expect(p.matricular.map((a) => a.id)).toEqual(["a"]);
    expect(p.jaMatriculados).toEqual(["beto@y.org"]);
    expect(p.naoEncontrados).toEqual(["zeca@z.com"]);
  });
});

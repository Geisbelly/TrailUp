import { describe, expect, it } from "vitest";

import { dataDoPendente, ehMenorDeIdade, hojeEmBrasilia, validarDataNascimento } from "./dataNascimento";

describe("data de nascimento no cadastro (#195)", () => {
  const agora = new Date("2026-10-24T15:00:00Z");

  it("aceita uma data valida e recusa vazio, calendario impossivel, futuro e mais de 120 anos", () => {
    expect(validarDataNascimento("2011-03-05", agora)).toBeNull();
    expect(validarDataNascimento("", agora)).toMatch(/Informe/);
    expect(validarDataNascimento("2011-02-31", agora)).toMatch(/inválida/);
    expect(validarDataNascimento("2026-10-25", agora)).toMatch(/futuro/);
    expect(validarDataNascimento("1900-01-01", agora)).toMatch(/inválida/);
  });

  it("calcula hoje e a maioridade em Brasilia, como o banco", () => {
    const madrugadaUtc = new Date("2026-10-25T01:30:00Z");
    expect(hojeEmBrasilia(madrugadaUtc)).toBe("2026-10-24");
    expect(ehMenorDeIdade("2008-10-24", madrugadaUtc)).toBe(false);
    expect(ehMenorDeIdade("2008-10-25", madrugadaUtc)).toBe(true);
  });

  it("le a data do registro pendente e ignora lixo", () => {
    expect(dataDoPendente(JSON.stringify({ tipo: "aluno", data_nascimento: "2011-03-05" }))).toBe("2011-03-05");
    expect(dataDoPendente(JSON.stringify({ tipo: "aluno" }))).toBeNull();
    expect(dataDoPendente("{nao e json")).toBeNull();
    expect(dataDoPendente(null)).toBeNull();
  });
});

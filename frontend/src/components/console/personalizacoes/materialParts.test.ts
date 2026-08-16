import { describe, expect, it } from "vitest";
import { getMaterialPartes } from "./materialParts";

describe("getMaterialPartes", () => {
  it("retorna array vazio quando material e null", () => {
    expect(getMaterialPartes(null)).toEqual([]);
  });

  it("sintetiza 1 parte a partir dos campos top-level quando partes esta ausente", () => {
    expect(
      getMaterialPartes({
        arquivo_url: "https://cdn.example/material.mp3",
        storage_path: "aluno/audio/material.mp3",
      }),
    ).toEqual([
      {
        ordem: 1,
        titulo: null,
        arquivo_url: "https://cdn.example/material.mp3",
        storage_path: "aluno/audio/material.mp3",
      },
    ]);
  });

  it("sintetiza 1 parte quando partes e um array vazio", () => {
    expect(
      getMaterialPartes({
        arquivo_url: "https://cdn.example/material.mp3",
        partes: [],
      }),
    ).toEqual([
      { ordem: 1, titulo: null, arquivo_url: "https://cdn.example/material.mp3", storage_path: null },
    ]);
  });

  it("usa partes quando presente, ordenado por ordem", () => {
    expect(
      getMaterialPartes({
        arquivo_url: "https://cdn.example/parte-01.mp3",
        partes: [
          { ordem: 2, titulo: "Parte 2: Conceito X", arquivo_url: "https://cdn.example/parte-02.mp3", storage_path: "p2" },
          { ordem: 1, titulo: "Parte 1: Introdução", arquivo_url: "https://cdn.example/parte-01.mp3", storage_path: "p1" },
        ],
      }),
    ).toEqual([
      { ordem: 1, titulo: "Parte 1: Introdução", arquivo_url: "https://cdn.example/parte-01.mp3", storage_path: "p1" },
      { ordem: 2, titulo: "Parte 2: Conceito X", arquivo_url: "https://cdn.example/parte-02.mp3", storage_path: "p2" },
    ]);
  });

  it("ignora entradas malformadas dentro de partes", () => {
    expect(
      getMaterialPartes({
        partes: [null, "string invalida", { ordem: 1, arquivo_url: "https://cdn.example/x.mp3" }],
      }),
    ).toEqual([
      { ordem: 1, titulo: null, arquivo_url: "https://cdn.example/x.mp3", storage_path: null },
    ]);
  });
});

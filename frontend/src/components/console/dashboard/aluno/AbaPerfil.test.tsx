import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapearDiversidade, type DiversidadeDaTurma } from "../diversidade";

let diversidade: DiversidadeDaTurma | null = null;
vi.mock("../useDiversidadeDaTurma", () => ({ useDiversidadeDaTurma: () => diversidade }));

import AbaPerfil from "./AbaPerfil";
import { DiversidadeDaTurmaCard } from "../../personalizacoes/DiversidadeDaTurmaCard";
import type { Aluno } from "./tipos";

const ALUNO = {
  id: "a",
  classe_id: 1,
  perfilDominante: "seeker",
  perfis: [
    { nome: "seeker", afinidade: 50 },
    { nome: "survivor", afinidade: 46 },
  ],
} as unknown as Aluno;

const BRUTO = {
  classe_id: 1,
  margem_misto: 10,
  alunos: 3,
  alunos_com_vetor: 2,
  alunos_mistos: 1,
  perfis_efetivos: 2.95,
  pares: [{ primeiro: "seeker", segundo: "survivor", alunos: 1 }],
  por_aluno: [
    { aluno_id: "a", primeiro: "seeker", segundo: "survivor", margem: 4.2, misto: true },
    { aluno_id: "b", primeiro: "achiever", segundo: "seeker", margem: 40, misto: false },
  ],
};

beforeEach(() => {
  diversidade = null;
});

describe("AbaPerfil", () => {
  it("sem a leitura da diversidade, o card é o de hoje: perfil dominante", () => {
    const html = renderToStaticMarkup(createElement(AbaPerfil, { aluno: ALUNO }));
    expect(html).toContain("Perfil dominante");
    expect(html).not.toContain("Perfil misto");
  });

  it("aluno misto: os dois perfis e a margem entre eles", () => {
    diversidade = mapearDiversidade(BRUTO);
    const html = renderToStaticMarkup(createElement(AbaPerfil, { aluno: ALUNO }));
    expect(html).toContain("Perfil misto");
    expect(html).not.toContain("Perfil dominante");
    expect(html).toContain("Seeker");
    expect(html).toContain("Survivor");
    expect(html).toContain("4,2 pontos entre os dois");
  });

  it("aluno não misto continua com o perfil dominante", () => {
    diversidade = mapearDiversidade(BRUTO);
    const html = renderToStaticMarkup(createElement(AbaPerfil, { aluno: { ...ALUNO, id: "b" } }));
    expect(html).toContain("Perfil dominante");
  });
});

describe("DiversidadeDaTurmaCard", () => {
  it("não desenha nada sem a leitura (função ausente no banco, turma de outro professor)", () => {
    expect(renderToStaticMarkup(createElement(DiversidadeDaTurmaCard, { classeId: 1 }))).toBe("");
  });

  it("mostra perfis efetivos, mistos com o número absoluto e os pares", () => {
    diversidade = mapearDiversidade(BRUTO);
    const html = renderToStaticMarkup(createElement(DiversidadeDaTurmaCard, { classeId: 1 }));
    expect(html).toContain("Diversidade da turma");
    expect(html).toContain("como 3 perfis de peso igual"); // 2,95 com uma casa
    expect(html).toContain("1 de 2");
    expect(html).toContain("Seeker + Survivor");
    expect(html).toContain("Sem questionário");
  });

  it("turma sem questionário respondido diz isso em vez de números zerados", () => {
    diversidade = mapearDiversidade({ classe_id: 1, margem_misto: 10, alunos: 2, alunos_com_vetor: 0 });
    const html = renderToStaticMarkup(createElement(DiversidadeDaTurmaCard, { classeId: 1 }));
    expect(html).toContain("Nenhum aluno da turma respondeu");
    expect(html).not.toContain("Perfis efetivos");
  });
});

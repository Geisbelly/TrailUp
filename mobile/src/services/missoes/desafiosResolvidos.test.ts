import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  assinarDesafiosResolvidos,
  comDesafiosResolvidos,
  desafiosResolvidosDe,
  esquecerDesafiosResolvidos,
  marcarDesafioResolvido,
} from "./desafiosResolvidos";

beforeEach(() => esquecerDesafiosResolvidos());

describe("desafiosResolvidos", () => {
  it("marca o desafio resolvido do aluno e avisa quem assina", () => {
    let avisos = 0;
    const parar = assinarDesafiosResolvidos(() => avisos++);
    marcarDesafioResolvido("aluno-a", 9);
    assert.deepEqual([...desafiosResolvidosDe("aluno-a")], [9]);
    assert.equal(avisos, 1);
    parar();
    marcarDesafioResolvido("aluno-a", 10);
    assert.equal(avisos, 1);
  });

  it("marcar de novo o mesmo desafio não avisa outra vez", () => {
    let avisos = 0;
    assinarDesafiosResolvidos(() => avisos++);
    marcarDesafioResolvido("aluno-a", 9);
    marcarDesafioResolvido("aluno-a", 9);
    assert.equal(avisos, 1);
  });

  it("é por aluno: no aparelho da escola, o acerto do aluno A não aparece para o B", () => {
    marcarDesafioResolvido("aluno-a", 9);
    assert.equal(desafiosResolvidosDe("aluno-b").size, 0);
  });

  it("sem aluno, nada é marcado nem lido", () => {
    marcarDesafioResolvido(null, 9);
    marcarDesafioResolvido(undefined, 9);
    assert.equal(desafiosResolvidosDe(null).size, 0);
    assert.equal(desafiosResolvidosDe("aluno-a").size, 0);
  });

  it("a identidade do conjunto só muda quando o aluno marca um novo (useSyncExternalStore)", () => {
    const antes = desafiosResolvidosDe("aluno-a");
    assert.equal(desafiosResolvidosDe("aluno-a"), antes);
    marcarDesafioResolvido("aluno-a", 9);
    assert.notEqual(desafiosResolvidosDe("aluno-a"), antes);
  });
});

describe("comDesafiosResolvidos", () => {
  const missoes = [
    { id: 9, status: "pendente" as const, progresso: 0 },
    { id: 10, status: "em_andamento" as const, progresso: 40 },
  ];

  it("a missão resolvida nesta sessão vira concluida; as outras ficam como o servidor disse", () => {
    const lista = comDesafiosResolvidos(missoes, new Set([9]));
    assert.equal(lista[0].status, "concluida");
    assert.deepEqual(lista[1], missoes[1]);
  });

  it("sem nada resolvido, devolve a mesma lista (sem render a mais)", () => {
    assert.equal(comDesafiosResolvidos(missoes, new Set()), missoes);
  });

  it("não ressuscita a expirada: o servidor já encerrou", () => {
    const expirada = [{ id: 9, status: "expirada" as const, progresso: 0 }];
    assert.equal(comDesafiosResolvidos(expirada, new Set([9]))[0].status, "expirada");
  });
});

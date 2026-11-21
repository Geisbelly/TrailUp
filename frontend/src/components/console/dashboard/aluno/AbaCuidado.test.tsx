import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentoDeCuidado } from "./cuidado";
import type { DadosDoCuidado, EstadoDoCuidado } from "./useCuidadoDoAluno";

let dados: DadosDoCuidado = { momentos: [], topicos: new Map() };
let estado: EstadoDoCuidado = { tipo: "pronto" };
vi.mock("./useCuidadoDoAluno", () => ({ useCuidadoDoAluno: () => ({ dados, estado }) }));

import AbaCuidado from "./AbaCuidado";
import type { Aluno } from "./tipos";

const ANA = { id: "a", nome: "Ana", classe_id: 1 } as unknown as Aluno;
const render = () => renderToStaticMarkup(createElement(AbaCuidado, { aluno: ANA }));

const MOMENTO: MomentoDeCuidado = {
  criado_em: "2026-11-20T15:00:00Z",
  topico_id: 10,
  origem: "aluno_disse",
  fatos: {},
  acoes: { pausa_sugerida: true, tecnica_oferecida: true, cvv_indicado: true },
  resposta: "pausou",
  tentativas_antes: 2,
  acerto_antes_pct: 40,
  tentativas_depois: 1,
  acerto_depois_pct: 80,
};

beforeEach(() => {
  dados = { momentos: [], topicos: new Map() };
  estado = { tipo: "pronto" };
});

describe("AbaCuidado", () => {
  it("aba vazia diz que nenhum momento foi registrado e que só aparece quem consentiu", () => {
    const html = render();
    expect(html).toContain("Nenhum momento de cuidado foi registrado");
    expect(html).toContain("Só aparece aqui quem consentiu");
  });

  it("RPC ausente (42883) mostra 'ainda não disponível', não erro", () => {
    estado = { tipo: "indisponivel" };
    const html = render();
    expect(html).toContain("ainda não disponíveis");
    expect(html).not.toContain('role="alert"');
  });

  it("mostra o momento com tópico, ações, resposta e antes/depois, sem rotular o aluno", () => {
    dados = { momentos: [MOMENTO], topicos: new Map([[10, "Frações"]]) };
    const html = render();
    expect(html).toContain("Frações");
    expect(html).toContain("O aluno disse ao Guia que não estava bem");
    expect(html).toContain("o Guia indicou o CVV 188");
    expect(html).toContain("Fez a pausa");
    expect(html).toContain("40% → 80%");
    expect(html).not.toMatch(/ansiedade|ansios|crise|estresse|risco/i);
  });
});

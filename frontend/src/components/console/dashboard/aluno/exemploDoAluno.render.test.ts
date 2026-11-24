import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { alunosDeExemplo } from "../exemploDaPesquisa";
import { cuidadoDeExemplo, jornadaDeExemplo, personalizacaoDeExemplo, tentativasDeExemplo } from "./exemploDoAluno";

// As abas de verdade, com os hooks devolvendo o que eles devolvem para um aluno de exemplo.
const HOJE = new Date("2026-11-24T15:00:00");
vi.mock("./useTentativasDoAluno", () => ({
  useTentativasDoAluno: (id: string) => ({ dados: tentativasDeExemplo(id, HOJE), carregando: false, erro: null }),
}));
vi.mock("./useCuidadoDoAluno", () => ({
  useCuidadoDoAluno: (id: string) => ({ dados: cuidadoDeExemplo(id, HOJE), estado: { tipo: "pronto" } }),
}));
vi.mock("./useJornadaDoAluno", () => ({
  useJornadaDoAluno: (id: string) => ({ dados: jornadaDeExemplo(id, HOJE), carregando: false, erro: null }),
  useIntervencoesDoPasso: () => ({ lista: [], estado: "pronto", salvar: async () => {} }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import AbaCuidado from "./AbaCuidado";
import AbaPersonalizacao from "./AbaPersonalizacao";
import AbaTentativas from "./AbaTentativas";
import JornadaReal from "./JornadaReal";

const ALUNOS = alunosDeExemplo(7, "Turma de demonstração", HOJE);
// Felipe: risco alto, Seeker (sem cronômetro). Isadora: risco alto, Survivor (cronômetro desligado pela IA).
const FELIPE = ALUNOS.find((a) => a.nome.startsWith("Felipe"))!;
const ISADORA = ALUNOS.find((a) => a.nome.startsWith("Isadora"))!;
const PAULA = ALUNOS.find((a) => a.nome.startsWith("Paula"))!;

describe("abas do detalhe com aluno de exemplo", () => {
  it("tentativas mostram atividades, nota e o cronômetro desligado pela IA", () => {
    const html = renderToStaticMarkup(createElement(AbaTentativas, { aluno: ISADORA }));
    expect(html).toContain("Sequência de passos");
    expect(html).toContain("decisão da IA");
    expect(html).not.toContain("ainda não começou");
  });

  it("cuidado mostra os momentos de quem está em risco", () => {
    const html = renderToStaticMarkup(createElement(AbaCuidado, { aluno: FELIPE }));
    expect(html).toContain("Momentos de cuidado");
    expect(html).toContain("sugeriu uma pausa");
  });

  it("personalização mostra material, consumo e itens", () => {
    const p = personalizacaoDeExemplo(PAULA.id, HOJE)!;
    const html = renderToStaticMarkup(
      createElement(AbaPersonalizacao, {
        aluno: PAULA,
        carregando: false,
        erro: null,
        personalizacoes: p.personalizacoes,
        progressoItens: p.progressoItens,
      }),
    );
    expect(html).toContain("Algoritmos e lógica");
    expect(html).toContain("dos itens concluídos");
    expect(html).not.toContain("Nenhuma personalização");
  });

  it("jornada monta os passos sem erro", () => {
    const html = renderToStaticMarkup(createElement(JornadaReal, { aluno: PAULA }));
    expect(html).toContain("Algoritmos e lógica");
  });
});

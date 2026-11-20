import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TurmaResumo } from "@/lib/turmaResumo";
import KpisPrincipais from "./KpisPrincipais";
import KpisSecundarios from "./KpisSecundarios";

const rotulo = (nome: string) => `aria-label="Como funciona: ${nome}"`;

describe("KPIs da turma explicam como são medidos", () => {
  it("os três KPIs principais têm o ícone, mesmo sem dado", () => {
    const html = renderToStaticMarkup(
      createElement(KpisPrincipais, { totalAlunos: 0, mediaNotas: null, mediaConclusao: 0, temDados: false }),
    );
    for (const nome of ["Total de alunos", "Média de notas", "Conclusão média"]) expect(html).toContain(rotulo(nome));
  });

  it("os seis KPIs secundários mantêm o ícone quando a leitura falhou", () => {
    const vazio = new Proxy({}, { get: () => null }) as unknown as TurmaResumo;
    const html = renderToStaticMarkup(
      createElement(KpisSecundarios, {
        mediaAcertos: null,
        turmaResumo: vazio,
        temDadosTurma: false,
        erroTurma: "falhou",
        disponibilidade: new Map(),
      }),
    );
    for (const nome of [
      "Taxa de acertos",
      "Abandono médio",
      "Retorno semanal",
      "Chat após erro",
      "Tempo médio de uso",
      "Tempo ativo médio",
    ]) {
      expect(html).toContain(rotulo(nome));
    }
  });
});

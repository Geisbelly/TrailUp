import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Roda o Planilha.gs de verdade: o gatilho ao editar só pode disparar o processamento quando a
// edição aprovou alguém, senão toda digitação na planilha chamaria a edge function.
const PLANILHA_GS = readFileSync(
  fileURLToPath(new URL("../../../../scripts/apps-script-formulario-professores/Planilha.gs", import.meta.url)),
  "utf-8",
);

const CABECALHO = ["Carimbo de data/hora", "Nome completo", "E-mail", "Decisão", "Situação"];
const DECISAO = CABECALHO.indexOf("Decisão") + 1;

/** Aba de respostas falsa: `linhas` são as linhas de dados (a partir da linha 2). */
function aba(linhas: string[][], deFormulario = true) {
  const grade = [CABECALHO, ...linhas];
  const self = {
    getFormUrl: () => (deFormulario ? "https://docs.google.com/forms/d/x/edit" : null),
    getLastColumn: () => CABECALHO.length,
    getRange: (linha: number, coluna: number, nLinhas = 1, nColunas = 1) => ({
      getValues: () =>
        Array.from({ length: nLinhas }, (_, i) =>
          Array.from({ length: nColunas }, (_, j) => grade[linha - 1 + i]?.[coluna - 1 + j] ?? ""),
        ),
    }),
  };
  return self;
}

function intervalo(folha: ReturnType<typeof aba>, linha: number, coluna: number, nLinhas = 1, nColunas = 1) {
  return {
    getSheet: () => folha,
    getRow: () => linha,
    getColumn: () => coluna,
    getNumRows: () => nLinhas,
    getNumColumns: () => nColunas,
  };
}

function carregar() {
  const contexto: Record<string, unknown> = {};
  runInNewContext(PLANILHA_GS, contexto);
  let rodadas = 0;
  contexto.processarAprovados = () => {
    rodadas += 1;
  };
  const aoEditar = contexto.aoEditarPlanilha as (e: unknown) => void;
  return { aoEditar, rodadas: () => rodadas, contexto };
}

describe("gatilho ao editar a planilha de inscrições", () => {
  it("aprovar uma linha processa na hora", () => {
    const { aoEditar, rodadas } = carregar();
    const folha = aba([["", "Ana", "ana@x.com", "Aprovado", ""]]);
    aoEditar({ range: intervalo(folha, 2, DECISAO) });
    expect(rodadas()).toBe(1);
  });

  it("colar várias linhas na Decisão, com uma aprovada, também processa", () => {
    const { aoEditar, rodadas } = carregar();
    const folha = aba([
      ["", "Ana", "ana@x.com", "Recusado", ""],
      ["", "Bia", "bia@x.com", "Aprovado", ""],
    ]);
    aoEditar({ range: intervalo(folha, 2, 1, 2, CABECALHO.length) });
    expect(rodadas()).toBe(1);
  });

  it.each([
    ["Em análise na Decisão", aba([["", "Ana", "ana@x.com", "Em análise", ""]]), 2, DECISAO],
    ["Aprovado digitado na Situação", aba([["", "Ana", "ana@x.com", "Em análise", "Aprovado"]]), 2, DECISAO + 1],
    ["edição do cabeçalho", aba([["", "Ana", "ana@x.com", "Aprovado", ""]]), 1, DECISAO],
    ["aba que não é a de respostas", aba([["", "Ana", "ana@x.com", "Aprovado", ""]], false), 2, DECISAO],
  ])("não processa: %s", (_, folha, linha, coluna) => {
    const { aoEditar, rodadas } = carregar();
    aoEditar({ range: intervalo(folha, linha, coluna) });
    expect(rodadas()).toBe(0);
  });

  it("instalar troca os gatilhos antigos pelos dois, sem duplicar", () => {
    const { contexto } = carregar();
    const criados: string[] = [];
    const apagados: string[] = [];
    const antigos = ["processarAprovados", "aoEditarPlanilha", "outraCoisa"].map(nome => ({
      getHandlerFunction: () => nome,
    }));
    const construtor = (nome: string) => {
      const fim = { create: () => criados.push(nome) };
      return {
        timeBased: () => ({ everyMinutes: () => fim }),
        forSpreadsheet: () => ({ onEdit: () => fim }),
      };
    };
    contexto.ScriptApp = {
      getProjectTriggers: () => antigos,
      deleteTrigger: (t: { getHandlerFunction: () => string }) => apagados.push(t.getHandlerFunction()),
      newTrigger: construtor,
    };
    contexto.PropertiesService = { getScriptProperties: () => ({ getProperty: () => "planilha-id" }) };
    contexto.Logger = { log: () => undefined };
    (contexto.instalarProcessamentoAutomatico as () => void)();
    expect(apagados.sort()).toEqual(["aoEditarPlanilha", "processarAprovados"]);
    expect(criados.sort()).toEqual(["aoEditarPlanilha", "processarAprovados"]);
  });
});

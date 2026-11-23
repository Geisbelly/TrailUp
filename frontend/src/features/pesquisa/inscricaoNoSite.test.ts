import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACEITE,
  AJUDA_DO_ACEITE,
  FORMULARIOS_DO_SITE,
  PERGUNTA_DO_ACEITE,
  PERGUNTA_DO_EMAIL,
  RECUSA,
  TERMO_DE_CONSENTIMENTO,
  corpoDoEnvio,
  emailAceito,
  formularioDoSite,
  lerConfirmacao,
  linkDaConfirmacao,
  urlDaConferencia,
  urlDoEnvio,
} from "./inscricaoNoSite";
import { CAMPOS_DE_IDENTIFICACAO } from "./pesquisaProfessores";

const pasta = "../../../../scripts/apps-script-formulario-professores/";
const ler = (arquivo: string) => readFileSync(fileURLToPath(new URL(pasta + arquivo, import.meta.url)), "utf-8");
const CODE = ler("Code.gs");
const PLANILHA = ler("Planilha.gs");

const LINK = "https://docs.google.com/forms/d/e/1FAIpQLSd8tEkjERY2u8ukrV_t1tNhBKG1biVycaqhC3shKjYZ7masLg/viewform";
const CODIGO = "0f8e6a52-3c1d-4b7a-9e21-5d6c7b8a9f10";

describe("termo e perguntas iguais aos do Code.gs", () => {
  it("o termo é o CONFIG.tcle, seção por seção", () => {
    const acesso = (0, eval)(CODE.match(/const ACESSO_TCLE = ('.*?');\n/)![1]) as string;
    const tcle = new Function("ACESSO_TCLE", `return ${CODE.match(/ {2}tcle: (\[[\s\S]*?\n {2}\]),/)![1]}`)(acesso);
    expect(TERMO_DE_CONSENTIMENTO).toEqual(tcle);
  });

  it("aceite, recusa e o campo do código", () => {
    [PERGUNTA_DO_ACEITE, AJUDA_DO_ACEITE, ACEITE, RECUSA].forEach(t => expect(CODE).toContain(`'${t}'`));
    expect(CODE).toContain("const CAMPO_CODIGO_DO_SITE = 'Código do site (preenchido automaticamente)'");
  });

  it("todo campo de identificação tem entry, e só eles", () => {
    for (const formulario of FORMULARIOS_DO_SITE) {
      expect(Object.keys(formulario.campos)).toEqual(CAMPOS_DE_IDENTIFICACAO.map(c => c.pergunta));
      const entries = [formulario.aceite, formulario.codigo, ...Object.values(formulario.campos)];
      entries.forEach(e => expect(e).toMatch(/^entry\.\d+$/));
      expect(new Set(entries).size).toBe(entries.length);
    }
    expect(PERGUNTA_DO_EMAIL.startsWith("E-mail")).toBe(true);
  });

  it("o doGet aceita o mesmo formato de código que a página gera e só devolve recebida", () => {
    const formato = new RegExp(PLANILHA.match(/const CODIGO_DO_SITE_FORMATO = \/(.+)\/;/)![1]);
    expect(formato.test(CODIGO)).toBe(true);
    expect(formato.test("geisbelly@exemplo.com")).toBe(false);
    expect(PLANILHA).toContain("JSON.stringify({ recebida: recebida })");
  });
});

describe("qual formulário a página usa", () => {
  it("só o formulário cujos entry.* conhecemos", () => {
    expect(formularioDoSite(LINK)?.id).toBe(FORMULARIOS_DO_SITE[0].id);
    expect(formularioDoSite("https://docs.google.com/forms/d/e/1FAIpQLSoutroformulario/viewform")).toBeNull();
    expect(formularioDoSite("https://forms.gle/abc")).toBeNull();
    expect(formularioDoSite(null)).toBeNull();
  });

  it("confirmação só do App da Web do Apps Script", () => {
    const exec = "https://script.google.com/macros/s/AKfycbx_abc-123/exec";
    expect(linkDaConfirmacao(` ${exec} `)).toBe(exec);
    expect(linkDaConfirmacao(`${exec}?codigo=1`)).toBe(exec);
    expect(linkDaConfirmacao("http://script.google.com/macros/s/AKfy/exec")).toBeNull();
    expect(linkDaConfirmacao("https://script.google.com/macros/s/AKfy/dev")).toBeNull();
    expect(linkDaConfirmacao("https://exemplo.com/macros/s/AKfy/exec")).toBeNull();
    expect(linkDaConfirmacao("")).toBeNull();
    expect(linkDaConfirmacao(undefined)).toBeNull();
  });
});

describe("envio", () => {
  const formulario = FORMULARIOS_DO_SITE[0];

  it("manda aceite, o que foi respondido, o código e as duas páginas", () => {
    const corpo = corpoDoEnvio(formulario, { "Nome completo": "  Ana Souza ", "Maior titulação": "Mestrado", "Instituição em que atua": "  " }, CODIGO);
    expect(corpo.get(formulario.aceite)).toBe(ACEITE);
    expect(corpo.get(formulario.campos["Nome completo"])).toBe("Ana Souza");
    expect(corpo.get(formulario.campos["Maior titulação"])).toBe("Mestrado");
    expect(corpo.has(formulario.campos["Instituição em que atua"])).toBe(false);
    expect(corpo.get(formulario.codigo)).toBe(CODIGO);
    expect(corpo.get("pageHistory")).toBe("0,1");
    expect(urlDoEnvio(formulario)).toBe(`https://docs.google.com/forms/d/e/${formulario.id}/formResponse`);
  });

  it("e-mail: vazio passa, inválido não (o Forms recusaria em silêncio)", () => {
    expect(emailAceito("")).toBe(true);
    expect(emailAceito(" ana@ulbra.br ")).toBe(true);
    expect(emailAceito("ana@ulbra")).toBe(false);
    expect(emailAceito("ana ulbra.br")).toBe(false);
  });

  it("conferência: só recebida === true conta", () => {
    expect(urlDaConferencia("https://script.google.com/macros/s/A/exec", CODIGO)).toBe(
      `https://script.google.com/macros/s/A/exec?codigo=${CODIGO}`,
    );
    expect(lerConfirmacao({ recebida: true })).toBe(true);
    expect(lerConfirmacao({ recebida: "true" })).toBe(false);
    expect(lerConfirmacao({ recebida: false })).toBe(false);
    expect(lerConfirmacao(null)).toBe(false);
    expect(lerConfirmacao("<html>")).toBe(false);
  });
});

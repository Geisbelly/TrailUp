import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_SECTIONS } from "@/pages/consoleSections";
import { ABAS_DA_ECONOMIA } from "../economia/economiaRegras";
import { TODAS } from "./constantes";
import { alvoNaTela, caminhoDoPasso, posicaoDoBalao, TUTORIAIS, tutorialPorId } from "./tutoriais";

const RAIZ = join(__dirname, "..");
function fontes(pasta: string): string {
  return readdirSync(pasta)
    .map((nome) => {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) return fontes(caminho);
      return nome.endsWith(".tsx") && !nome.endsWith(".test.tsx") ? readFileSync(caminho, "utf-8") : "";
    })
    .join("\n");
}

describe("catálogo de tutoriais", () => {
  const codigo = fontes(RAIZ);

  it("todo alvo existe numa tela: passo apontando para o vazio cairia no meio da página", () => {
    const fixos = new Set([...codigo.matchAll(/data-tutorial="([\w-]+)"/g)].map((m) => m[1]));
    const dinamicos = new Set([...CONSOLE_SECTIONS.map((s) => `menu-${s.view}`), ...ABAS_DA_ECONOMIA.map((a) => `economia-${a.id}`)]);
    const alvos = TUTORIAIS.flatMap((t) => t.passos.flatMap((p) => (p.alvo ? [p.alvo] : [])));
    expect(alvos.filter((a) => !fixos.has(a) && !dinamicos.has(a))).toEqual([]);
  });

  it("passo só cita aba que existe na Economia", () => {
    const abas: string[] = ABAS_DA_ECONOMIA.map((a) => a.id);
    const citadas = TUTORIAIS.flatMap((t) => t.passos.flatMap((p) => (p.aba ? [p.aba] : [])));
    expect(citadas.length).toBeGreaterThan(0);
    expect(citadas.filter((a) => !abas.includes(a))).toEqual([]);
  });

  it("ids são únicos e nenhum tutorial fica sem passo", () => {
    expect(new Set(TUTORIAIS.map((t) => t.id)).size).toBe(TUTORIAIS.length);
    expect(TUTORIAIS.filter((t) => t.passos.length === 0)).toEqual([]);
  });

  it("id fora do catálogo não abre nada", () => {
    expect(tutorialPorId("criar_turma")?.titulo).toBe("Criar uma turma");
    expect(tutorialPorId("hackear")).toBeNull();
  });
});

describe("caminhoDoPasso", () => {
  it("leva a turma e a aba", () => {
    expect(caminhoDoPasso({ view: "economia", aba: "loja", titulo: "", texto: "" }, "54")).toBe("/console/economia?turma=54&aba=loja");
    expect(caminhoDoPasso({ view: "classes", titulo: "", texto: "" }, TODAS)).toBe("/console/turmas");
  });
});

describe("balão", () => {
  const tela = { width: 1000, height: 700 };
  const balao = { width: 320, height: 180 };

  it("sem alvo vai ao centro", () => {
    expect(posicaoDoBalao(null, tela, balao)).toEqual({ top: 260, left: 340 });
  });

  it("alvo no menu à esquerda: ao lado", () => {
    expect(posicaoDoBalao({ top: 100, left: 10, width: 200, height: 40 }, tela, balao)).toEqual({ top: 100, left: 224 });
  });

  it("alvo embaixo: acima dele, sem sair da tela", () => {
    const p = posicaoDoBalao({ top: 640, left: 700, width: 280, height: 40 }, tela, balao);
    expect(p).toEqual({ top: 446, left: 664 });
  });

  it("nunca sai da tela do celular", () => {
    const celular = { width: 375, height: 700 };
    const p = posicaoDoBalao({ top: 300, left: 300, width: 60, height: 30 }, celular, { width: 343, height: 200 });
    expect(p.left).toBe(16);
    expect(p.left + 343).toBeLessThanOrEqual(375 - 16);
  });

  it("menu em gaveta fechada não conta como alvo", () => {
    expect(alvoNaTela({ top: 100, left: -280, width: 260, height: 40 }, tela)).toBe(false);
    expect(alvoNaTela({ top: 100, left: 0, width: 0, height: 0 }, tela)).toBe(false);
    expect(alvoNaTela({ top: 100, left: 10, width: 260, height: 40 }, tela)).toBe(true);
  });
});

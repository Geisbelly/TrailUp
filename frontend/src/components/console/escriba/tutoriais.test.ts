import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_SECTIONS } from "@/pages/consoleSections";
import { ABAS_DA_ECONOMIA } from "../economia/economiaRegras";
import { TODAS } from "./constantes";
import { alvoAlcancavel, alvoAlternativo, alvoNaTela, balaoCobreAlvo, caminhoDoPasso, posicaoDoBalao, TUTORIAIS, tutorialPorId } from "./tutoriais";

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

  it("tela baixa: usa o lado livre em vez de cobrir o alvo", () => {
    const deitado = { width: 667, height: 375 };
    const medida = { width: 320, height: 200 };
    expect(posicaoDoBalao({ top: 150, left: 480, width: 150, height: 52 }, deitado, medida)).toEqual({ top: 150, left: 146 });
    expect(balaoCobreAlvo({ top: 150, left: 480, width: 150, height: 52 }, deitado, medida)).toBe(false);
  });

  it("tela baixa e alvo no meio: avisa que só rolando cabe, e não sai da tela", () => {
    const deitado = { width: 667, height: 375 };
    const medida = { width: 320, height: 200 };
    const meio = { top: 150, left: 267, width: 149, height: 52 };
    expect(balaoCobreAlvo(meio, deitado, medida)).toBe(true);
    const p = posicaoDoBalao(meio, deitado, medida);
    expect(p.top + medida.height).toBeLessThanOrEqual(375 - 16);
    expect(p.left).toBe(16);
    expect(balaoCobreAlvo({ ...meio, top: 72 }, deitado, medida)).toBe(false);
  });

  it("alvo abaixo da dobra pode ser alcançado rolando; gaveta fechada, não", () => {
    const abaixoDaDobra = { top: 900, left: 100, width: 160, height: 40 };
    expect(alvoNaTela(abaixoDaDobra, tela)).toBe(false);
    expect(alvoAlcancavel(abaixoDaDobra)).toBe(true);
    expect(alvoAlcancavel({ top: 100, left: -280, width: 260, height: 40 })).toBe(false);
    expect(alvoAlcancavel({ top: 100, left: 0, width: 0, height: 0 })).toBe(false);
  });

  it("menu em gaveta fechada não conta como alvo", () => {
    expect(alvoNaTela({ top: 100, left: -280, width: 260, height: 40 }, tela)).toBe(false);
    expect(alvoNaTela({ top: 100, left: 0, width: 0, height: 0 }, tela)).toBe(false);
    expect(alvoNaTela({ top: 100, left: 10, width: 260, height: 40 }, tela)).toBe(true);
  });
});

describe("alvoAlternativo", () => {
  it("leva o item do menu em gaveta ao botão que abre a gaveta, e só ele", () => {
    expect(alvoAlternativo("menu-trilha")).toBe("menu-gaveta");
    expect(alvoAlternativo("menu-gaveta")).toBeNull();
    expect(alvoAlternativo("turma-nova")).toBeNull();
  });
});

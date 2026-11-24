import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONSOLE_SECTIONS } from "@/pages/consoleSections";
import { TAREFAS } from "./pesquisaProfessores";
import {
  ETAPAS_DO_ROTEIRO,
  SLUG_DO_VIDEO_DO_ROTEIRO,
  andamentoDoRoteiro,
  anotacoesEmTexto,
  anotacoesPorEtapa,
  etapaDaView,
  lerAnotacoes,
  lerMeuRoteiro,
  proximaEtapa,
  textoDaAnotacao,
} from "./roteiroDaPesquisa";
import { videoPorSlug } from "./videosDaPesquisa";

const MIGRATION = readFileSync(
  fileURLToPath(new URL("../../../../api/alembic/versions/20261123_03_pesquisa_roteiro_e_anotacoes.py", import.meta.url)),
  "utf-8",
);
const DO_APP = readFileSync(
  fileURLToPath(new URL("../../../../mobile/src/services/pesquisa/roteiro.ts", import.meta.url)),
  "utf-8",
);

const titulo = (e: (typeof ETAPAS_DO_ROTEIRO)[number]) => (e.tarefa ? `${e.tarefa}. ${e.titulo}` : e.titulo);

describe("roteiro da avaliação", () => {
  it("segue o vídeo: vídeo, tarefas do console, entrar no app, tarefas do aluno e os blocos", () => {
    expect(ETAPAS_DO_ROTEIRO.map(e => e.id)).toEqual([
      "video", "t1", "t2", "t3", "t4", "t5", "t6", "aluno-acesso", "t7", "t8", "blocos",
    ]);
    expect(videoPorSlug(SLUG_DO_VIDEO_DO_ROTEIRO)).not.toBeNull();
  });

  it("cada tarefa vem de TAREFAS, sem cópia de texto", () => {
    for (const tarefa of TAREFAS) {
      const etapa = ETAPAS_DO_ROTEIRO.find(e => e.tarefa === tarefa.id);
      expect(etapa, tarefa.id).toBeDefined();
      expect(etapa?.passos).toBe(tarefa.passos);
      expect(etapa?.observar).toBe(tarefa.observar);
      expect(etapa?.onde).toBe(tarefa.onde === "aluno" ? "app" : "console");
    }
  });

  it("os ids cabem na regra do banco", () => {
    const regra = /CHECK \(etapa ~ '(\^\[a-z0-9-\]\{1,40\}\$)'\)/.exec(MIGRATION)?.[1];
    expect(regra).toBe("^[a-z0-9-]{1,40}$");
    for (const etapa of ETAPAS_DO_ROTEIRO) expect(etapa.id).toMatch(new RegExp(regra!));
  });

  it("toda aba citada existe e cada aba leva a uma etapa só", () => {
    const views = new Set(CONSOLE_SECTIONS.map(s => s.view));
    const vistas: string[] = [];
    for (const etapa of ETAPAS_DO_ROTEIRO) {
      for (const view of etapa.views ?? []) {
        expect(views.has(view), view).toBe(true);
        vistas.push(view);
      }
      if (etapa.onde === "console") expect(etapa.views?.length, etapa.id).toBeGreaterThan(0);
    }
    expect(new Set(vistas).size).toBe(vistas.length);
    expect(etapaDaView("trilha")?.id).toBe("t2");
    expect(etapaDaView("guildas")?.id).toBe("t6");
    expect(etapaDaView("avaliacao")?.id).toBe("blocos");
    expect(etapaDaView("profile")).toBeNull();
  });

  it("próxima etapa e andamento", () => {
    expect(proximaEtapa(new Set())?.id).toBe("video");
    expect(proximaEtapa(new Set(["video", "t1"]))?.id).toBe("t2");
    expect(proximaEtapa(new Set(ETAPAS_DO_ROTEIRO.map(e => e.id)))).toBeNull();
    expect(andamentoDoRoteiro(new Set(["video", "t1", "inventada"]))).toEqual({ feitas: 2, total: 11, porcento: 18 });
  });
});

describe("o app tem o mesmo roteiro", () => {
  it("mesmos ids e títulos, na mesma ordem", () => {
    const doApp = [...DO_APP.matchAll(/^ {2}\["([a-z0-9-]+)", "([^"]+)"\],$/gm)].map(m => [m[1], m[2]]);
    expect(doApp).toEqual(ETAPAS_DO_ROTEIRO.map(e => [e.id, titulo(e)]));
  });

  it("todas as etapas têm o mesmo texto: o app mostra o roteiro inteiro, como o console", () => {
    for (const etapa of ETAPAS_DO_ROTEIRO) {
      expect(DO_APP, etapa.id).toContain(`id: "${etapa.id}"`);
      expect(DO_APP, etapa.id).toContain(`titulo: "${etapa.titulo}"`);
      for (const passo of etapa.passos) expect(DO_APP, etapa.id).toContain(JSON.stringify(passo));
      if (etapa.observar) expect(DO_APP, etapa.id).toContain(`observar: ${JSON.stringify(etapa.observar)}`);
      if (etapa.onde !== "app") expect(DO_APP, etapa.id).toContain(`onde: "${etapa.onde}"`);
    }
  });
});

describe("o que vem do banco", () => {
  it("roteiro: null para quem não é avaliador", () => {
    expect(lerMeuRoteiro(null)).toBeNull();
    expect(lerMeuRoteiro({ papel: "dono" })).toBeNull();
    const r = lerMeuRoteiro({ papel: "professor", classe_id: 4, marcas: [{ etapa: "t1" }, { etapa: 2 }, null] });
    expect(r?.papel).toBe("professor");
    expect(r?.classeId).toBe(4);
    expect([...(r?.marcadas ?? [])]).toEqual(["t1"]);
  });

  it("anotações: agrupadas pela ordem do roteiro e prontas para colar", () => {
    const anotacoes = lerAnotacoes([
      { id: 2, etapa: "t7", plataforma: "app", texto: "áudio demorou", criada_em: "2026-11-23T10:05:00Z" },
      { id: 1, etapa: "t2", plataforma: "console", texto: "não achei as questões", criada_em: "2026-11-23T10:00:00Z" },
      { id: 3, etapa: null, plataforma: "console", texto: "geral", criada_em: "2026-11-23T10:06:00Z" },
      { id: 4, etapa: "t2", plataforma: "site", texto: "ignorada", criada_em: "2026-11-23T10:00:00Z" },
    ]);
    expect(anotacoesPorEtapa(anotacoes).map(g => g.etapa?.id ?? null)).toEqual(["t2", "t7", null]);
    expect(anotacoesEmTexto(anotacoes)).toBe(
      "T2. Explorar a trilha\n- não achei as questões\n\nT7. Estudar como aluno\n- áudio demorou\n\nOutras\n- geral",
    );
  });

  it("texto da anotação: vazio não grava e o limite é o do banco", () => {
    expect(textoDaAnotacao("  \n ")).toBeNull();
    expect(textoDaAnotacao("  ok ")).toBe("ok");
    expect(MIGRATION).toContain("BETWEEN 1 AND 2000");
    expect(textoDaAnotacao("x".repeat(2100))).toHaveLength(2000);
  });
});

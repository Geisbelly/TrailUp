import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import console_ from "./explicacoes.json";

// Os dois clientes têm textos próprios (o do app fala com o aluno), mas a confiança de uma métrica
// não pode mudar de um para o outro: o selo das métricas que os dois mostram tem de ser o mesmo.
const app = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../mobile/src/constants/metricasExplicadas.json", import.meta.url)), "utf-8"),
) as Record<string, { selo: string }>;
const web = console_ as Record<string, { selo: string }>;

// Mesma métrica, mesma chave nos dois. A lista é explícita para o teste não passar com a interseção
// vazia (ou encolhendo) sem ninguém perceber.
const MESMA_CHAVE = ["aluno.progresso", "aluno.acertos", "aluno.tempo_total", "aluno.afinidades", "aluno.ultimo_estudo"];
// Mesma métrica com nome diferente: no console é a visão do professor, no app é a do aluno.
const PARES: [string, string][] = [["aluno.ranking", "prof.ranking"]];

describe("paridade de selo entre console e app", () => {
  const pares: [string, string][] = [...MESMA_CHAVE.map((c): [string, string] => [c, c]), ...PARES];

  it.each(pares)("%s do app existe no console (%s)", (chaveApp, chaveWeb) => {
    expect(app[chaveApp], `${chaveApp} falta no app`).toBeDefined();
    expect(web[chaveWeb], `${chaveWeb} falta no console`).toBeDefined();
  });

  it("toda métrica comum tem o mesmo selo nos dois", () => {
    const comuns = new Map<string, string>(Object.keys(web).filter((c) => c in app).map((c) => [c, c]));
    for (const [a, w] of PARES) comuns.set(a, w);
    expect(comuns.size).toBeGreaterThanOrEqual(MESMA_CHAVE.length + PARES.length);
    const diferentes = [...comuns].filter(([a, w]) => app[a]?.selo !== web[w]?.selo);
    expect(diferentes).toEqual([]);
  });
});

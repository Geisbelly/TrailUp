import { describe, expect, it } from "vitest";

import {
  BRAINHEX_QUESTIONS,
  SCALE_MAX,
  calculateAxisScores,
  type BrainHexAxis,
} from "./brainhex";

const EIXOS: BrainHexAxis[] = [
  "curiosity", "challenge", "risk", "mastery",
  "competition", "social", "completion", "immersion",
];

describe("instrumento", () => {
  it("todo eixo tem o mesmo numero de itens", () => {
    // Antes: `immersion` tinha 3 e os outros 4. A soma bruta dele era
    // estruturalmente menor, e ele entra com peso em tres perfis.
    const porEixo = new Map<string, number>();
    for (const q of BRAINHEX_QUESTIONS) porEixo.set(q.axis, (porEixo.get(q.axis) ?? 0) + 1);
    const contagens = new Set(porEixo.values());
    expect(contagens.size, `contagens diferentes: ${JSON.stringify([...porEixo])}`).toBe(1);
    expect(porEixo.size).toBe(EIXOS.length);
  });

  it("todo eixo tem pelo menos um item reverso", () => {
    // Sem reverso nao da' para separar preferencia de aquiescencia.
    for (const eixo of EIXOS) {
      const reversos = BRAINHEX_QUESTIONS.filter((q) => q.axis === eixo && q.reverse);
      expect(reversos.length, `eixo ${eixo} sem item reverso`).toBeGreaterThanOrEqual(1);
    }
  });

  it("todo item reverso aponta um item direto existente do mesmo eixo", () => {
    for (const q of BRAINHEX_QUESTIONS.filter((i) => i.reverse)) {
      expect(q.reversoDe, `${q.id} sem reversoDe`).toBeTruthy();
      const par = BRAINHEX_QUESTIONS.find((i) => i.id === q.reversoDe);
      expect(par, `${q.id} aponta ${q.reversoDe}, que nao existe`).toBeTruthy();
      expect(par?.axis).toBe(q.axis);
      expect(par?.reverse).toBeFalsy();
    }
  });

  it("os ids sao unicos", () => {
    const ids = BRAINHEX_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("concordar com tudo NAO maximiza todos os eixos", () => {
    // O defeito central do instrumento antigo. Com um reverso por eixo, marcar
    // SCALE_MAX em tudo deixa cada eixo no meio da escala, nao no topo.
    const tudoMax = Object.fromEntries(BRAINHEX_QUESTIONS.map((q) => [q.id, SCALE_MAX]));
    const escores = calculateAxisScores(tudoMax);
    const itensPorEixo = BRAINHEX_QUESTIONS.length / EIXOS.length;
    const maximoTeorico = itensPorEixo * SCALE_MAX;
    for (const eixo of EIXOS) {
      expect(escores[eixo], `eixo ${eixo} saturou`).toBeLessThan(maximoTeorico);
    }
  });

  it("o item reverso empurra o eixo para o lado certo", () => {
    const reverso = BRAINHEX_QUESTIONS.find((q) => q.reverse)!;
    const concordando = calculateAxisScores({ [reverso.id]: SCALE_MAX });
    const discordando = calculateAxisScores({ [reverso.id]: 0 });
    // Discordar do reverso e evidencia A FAVOR do eixo.
    expect(discordando[reverso.axis]).toBeGreaterThan(concordando[reverso.axis]);
  });
});

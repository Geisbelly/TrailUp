import { describe, expect, it } from "vitest";
import { fraseDoTom, META_ABANDONO_PCT, META_ACERTOS_PCT, tomDaMetrica } from "./metas";

describe("tomDaMetrica", () => {
  it("acertos: bom ao atingir a meta, atenção abaixo dela", () => {
    expect(tomDaMetrica(71, META_ACERTOS_PCT, "maior_melhor")).toBe("bom");
    expect(tomDaMetrica(70, META_ACERTOS_PCT, "maior_melhor")).toBe("bom");
    expect(tomDaMetrica(69.9, META_ACERTOS_PCT, "maior_melhor")).toBe("atencao");
  });

  it("abandono: bom até a meta, atenção acima dela", () => {
    expect(tomDaMetrica(12, META_ABANDONO_PCT, "menor_melhor")).toBe("bom");
    expect(tomDaMetrica(15, META_ABANDONO_PCT, "menor_melhor")).toBe("bom");
    expect(tomDaMetrica(18.5, META_ABANDONO_PCT, "menor_melhor")).toBe("atencao");
  });
});

describe("fraseDoTom", () => {
  it("descreve o lado da meta conforme o sentido", () => {
    expect(fraseDoTom("bom", 70, "maior_melhor")).toBe("Bom · meta 70%");
    expect(fraseDoTom("atencao", 70, "maior_melhor")).toBe("Atenção · abaixo da meta de 70%");
    expect(fraseDoTom("atencao", 15, "menor_melhor")).toBe("Atenção · acima da meta de 15%");
  });
});

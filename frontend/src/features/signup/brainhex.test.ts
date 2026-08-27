import { describe, expect, it } from "vitest";

import { resolveRepresentativeBrainHexResults } from "./brainhex";

describe("resolveRepresentativeBrainHexResults", () => {
  it("mantém os dois perfis positivos mais fortes", () => {
    const result = resolveRepresentativeBrainHexResults([
      { key: "seeker" as const, percent: 38 },
      { key: "socializer" as const, percent: 27 },
      { key: "achiever" as const, percent: 8 },
    ]);

    expect(result.map((profile) => profile.key)).toEqual(["seeker", "socializer"]);
  });

  it("inclui perfis adicionais com pelo menos vinte por cento", () => {
    const result = resolveRepresentativeBrainHexResults([
      { key: "mastermind" as const, percent: 31 },
      { key: "achiever" as const, percent: 25 },
      { key: "conqueror" as const, percent: 21 },
      { key: "survivor" as const, percent: 4 },
    ]);

    expect(result.map((profile) => profile.key)).toEqual([
      "mastermind",
      "achiever",
      "conqueror",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { buildRevision } from "./revision";

describe("revisão pública do build", () => {
  it("usa o SHA do checkout fornecido pela Vercel", () => {
    expect(buildRevision({ VERCEL_GIT_COMMIT_SHA: "a".repeat(40), SECRET: "privado" }))
      .toEqual({ service: "frontend", build_commit: "a".repeat(40) });
  });
  it("prioriza o SHA explícito e normaliza caixa/espaços", () => {
    expect(buildRevision({ TRAILUP_BUILD_COMMIT: ` ${"B".repeat(40)} `, VERCEL_GIT_COMMIT_SHA: "a".repeat(40) }).build_commit)
      .toBe("b".repeat(40));
  });
  it.each([undefined, "", "main", "abcdef1", "secret", "a".repeat(41)])("não inventa revisão para %s", (value) => {
    expect(buildRevision({ TRAILUP_BUILD_COMMIT: value }).build_commit).toBeNull();
  });
  it("não mascara configuração explícita inválida com o SHA da Vercel", () => {
    expect(buildRevision({ TRAILUP_BUILD_COMMIT: "main", VERCEL_GIT_COMMIT_SHA: "a".repeat(40) }).build_commit)
      .toBeNull();
  });
});

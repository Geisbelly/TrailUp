import { describe, it, expect } from "vitest";
import { createRequestGuard } from "./requestGuard";

describe("createRequestGuard", () => {
  it("isCurrent() é true enquanto nenhuma requisição mais nova começou", () => {
    const guard = createRequestGuard();
    const { isCurrent } = guard.next();

    expect(isCurrent()).toBe(true);
  });

  it("invalida a requisição anterior quando uma nova começa antes dela responder", () => {
    const guard = createRequestGuard();
    const first = guard.next();
    const second = guard.next();

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("cada chamada a next() invalida todas as anteriores, mesmo várias em sequência", () => {
    const guard = createRequestGuard();
    const first = guard.next();
    const second = guard.next();
    const third = guard.next();

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(false);
    expect(third.isCurrent()).toBe(true);
  });
});

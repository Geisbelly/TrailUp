import { describe, it, expect } from "vitest";
import { cn, formatFileSize } from "./utils";

describe("cn", () => {
  it("combina classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignora valores falsy", () => {
    expect(cn("a", undefined, null as never, false as never, "b")).toBe("a b");
  });

  it("resolve conflitos tailwind", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("aceita arrays e objetos condicionais", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});

describe("formatFileSize", () => {
  it("formata bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formata kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formata megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

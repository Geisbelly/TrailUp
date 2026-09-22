import { expect, it } from "vitest";
import { resolverStatusDeGeracao } from "./materialGenerationStatus";

it("reporta status e erro quando a geracao falhou", () => {
  const material = {
    metadata: { status: "failed", error: "storage_object_ausente: ..." },
  };
  expect(resolverStatusDeGeracao(material)).toEqual({
    status: "failed",
    erro: "storage_object_ausente: ...",
  });
});

it("reporta status pending sem erro quando a geracao ainda esta rodando", () => {
  const material = { metadata: { status: "pending" } };
  expect(resolverStatusDeGeracao(material)).toEqual({ status: "pending", erro: null });
});

it("nao acusa falha para material completo", () => {
  const material = { metadata: { status: "completed" } };
  expect(resolverStatusDeGeracao(material)).toEqual({ status: "completed", erro: null });
});

it("devolve status nulo quando nao ha metadata (materiais antigos, sem essa checagem)", () => {
  expect(resolverStatusDeGeracao({})).toEqual({ status: null, erro: null });
  expect(resolverStatusDeGeracao(null)).toEqual({ status: null, erro: null });
  expect(resolverStatusDeGeracao(undefined)).toEqual({ status: null, erro: null });
});

it("ignora metadata que nao e objeto", () => {
  expect(resolverStatusDeGeracao({ metadata: "nao-e-objeto" })).toEqual({ status: null, erro: null });
  expect(resolverStatusDeGeracao({ metadata: null })).toEqual({ status: null, erro: null });
});

it("ignora status/error com tipo inesperado", () => {
  expect(resolverStatusDeGeracao({ metadata: { status: 42, error: {} } })).toEqual({
    status: null,
    erro: null,
  });
});

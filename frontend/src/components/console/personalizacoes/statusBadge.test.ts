import { describe, it, expect } from "vitest";
import { getPersonalizacaoStatusBadge } from "./statusBadge";

const NOW = new Date("2026-07-27T12:00:00.000Z");

describe("getPersonalizacaoStatusBadge", () => {
  it("sem personalizacao -> Sem material", () => {
    expect(getPersonalizacaoStatusBadge({ temPersonalizacao: false, now: NOW })).toEqual({
      label: "Sem material",
      variant: "outline",
    });
  });

  it("status pronto -> Pronto", () => {
    expect(
      getPersonalizacaoStatusBadge({ temPersonalizacao: true, status: "pronto", now: NOW })
    ).toEqual({ label: "Pronto", variant: "default" });
  });

  it("processando ha menos de 15min -> Gerando...", () => {
    const updatedAt = new Date(NOW.getTime() - 14 * 60 * 1000 - 59 * 1000).toISOString();
    expect(
      getPersonalizacaoStatusBadge({
        temPersonalizacao: true,
        status: "processando_midias",
        updatedAt,
        now: NOW,
      })
    ).toEqual({ label: "Gerando...", variant: "secondary" });
  });

  it("processando ha exatamente 15min -> Travado (limiar inclusivo)", () => {
    const updatedAt = new Date(NOW.getTime() - 15 * 60 * 1000).toISOString();
    expect(
      getPersonalizacaoStatusBadge({
        temPersonalizacao: true,
        status: "processando_midias",
        updatedAt,
        now: NOW,
      })
    ).toEqual({ label: "Travado", variant: "destructive" });
  });

  it("processando ha mais de 15min -> Travado", () => {
    const updatedAt = new Date(NOW.getTime() - 15 * 60 * 1000 - 1000).toISOString();
    expect(
      getPersonalizacaoStatusBadge({
        temPersonalizacao: true,
        status: "processando_midias",
        updatedAt,
        now: NOW,
      })
    ).toEqual({ label: "Travado", variant: "destructive" });
  });

  it("processando sem updatedAt nem geradoEm -> Gerando... (nao trava por falta de dado)", () => {
    expect(
      getPersonalizacaoStatusBadge({
        temPersonalizacao: true,
        status: "processando_midias",
        now: NOW,
      })
    ).toEqual({ label: "Gerando...", variant: "secondary" });
  });

  it("usa geradoEm quando updatedAt ausente", () => {
    const geradoEm = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    expect(
      getPersonalizacaoStatusBadge({
        temPersonalizacao: true,
        status: "processando_midias",
        geradoEm,
        now: NOW,
      })
    ).toEqual({ label: "Travado", variant: "destructive" });
  });

  it("status failed -> Falhou", () => {
    expect(
      getPersonalizacaoStatusBadge({ temPersonalizacao: true, status: "failed", now: NOW })
    ).toEqual({ label: "Falhou", variant: "destructive" });
  });

  it("status falha legado -> Falhou", () => {
    expect(
      getPersonalizacaoStatusBadge({ temPersonalizacao: true, status: "falha", now: NOW })
    ).toEqual({ label: "Falhou", variant: "destructive" });
  });

  it("status failed_quality -> Falhou", () => {
    expect(
      getPersonalizacaoStatusBadge({ temPersonalizacao: true, status: "failed_quality", now: NOW })
    ).toEqual({ label: "Falhou", variant: "destructive" });
  });

  it("status partial -> Parcial", () => {
    expect(
      getPersonalizacaoStatusBadge({ temPersonalizacao: true, status: "partial", now: NOW })
    ).toEqual({ label: "Parcial", variant: "secondary" });
  });

  it("status desconhecido com personalizacao -> fallback usa o proprio status", () => {
    expect(
      getPersonalizacaoStatusBadge({ temPersonalizacao: true, status: "algo_novo", now: NOW })
    ).toEqual({ label: "algo_novo", variant: "default" });
  });

  it("sem status mas com personalizacao -> fallback Pronto", () => {
    expect(getPersonalizacaoStatusBadge({ temPersonalizacao: true, now: NOW })).toEqual({
      label: "Pronto",
      variant: "default",
    });
  });
});

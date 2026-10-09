import assert from "node:assert/strict";
import test from "node:test";

import {
  CODIGO_JA_REGISTRADO,
  linhaDeConsentimento,
  precisaRegistrar,
  registrarConsentimento,
} from "./consentimentoRemoto";
import type { TelemetryConsentRecord } from "../utils/telemetryConsent";

const ACEITE: TelemetryConsentRecord = {
  version: "2026-10-02-v4",
  status: "accepted",
  updatedAt: "2026-10-07T12:00:00.000Z",
  cameraPermissionRequested: true,
  cameraPermissionGranted: true,
  preferences: {
    cameraEnabled: false,
    usageEnabled: true,
    performanceEnabled: true,
    chatEnabled: true,
  },
};

function inserirFalso(resposta: { error: { code?: string; message?: string } | null }) {
  const enviadas: unknown[] = [];
  return {
    enviadas,
    inserir: async (linha: unknown) => {
      enviadas.push(linha);
      return resposta;
    },
  };
}

test("a linha nao leva registrado_em: esse carimbo e do servidor", () => {
  const linha = linhaDeConsentimento(ACEITE, "aluno-1", { plataforma: "ios" });
  assert.equal("registrado_em" in linha, false);
  assert.equal(linha.decidido_em, "2026-10-07T12:00:00.000Z");
  assert.equal(linha.versao, "2026-10-02-v4");
  assert.deepEqual(linha.origem, { plataforma: "ios" });
});

test("as finalidades vao uma a uma, nao um booleano so", () => {
  const linha = linhaDeConsentimento(ACEITE, "aluno-1");
  assert.deepEqual(linha.preferencias, {
    cameraEnabled: false,
    usageEnabled: true,
    performanceEnabled: true,
    chatEnabled: true,
  });
});

test("sem aluno ou sem versao nao ha o que registrar", () => {
  assert.equal(precisaRegistrar(ACEITE, null), false);
  assert.equal(precisaRegistrar(ACEITE, ""), false);
  assert.equal(precisaRegistrar(null, "aluno-1"), false);
  assert.equal(precisaRegistrar({ ...ACEITE, version: "" }, "aluno-1"), false);
  assert.equal(precisaRegistrar(ACEITE, "aluno-1"), true);
});

test("recusa tambem e registrada -- revogar nao e apagar", () => {
  const recusa: TelemetryConsentRecord = { ...ACEITE, status: "rejected" };
  assert.equal(precisaRegistrar(recusa, "aluno-1"), true);
  assert.equal(linhaDeConsentimento(recusa, "aluno-1").status, "rejected");
});

test("reenvio da mesma decisao e SUCESSO, nao falha", async () => {
  // 23505 = unique_violation. Tratar como erro faria a retentativa ficar presa
  // para sempre numa decisao que ja esta no banco.
  const { inserir } = inserirFalso({ error: { code: CODIGO_JA_REGISTRADO } });
  const r = await registrarConsentimento({
    inserir,
    record: ACEITE,
    alunoId: "aluno-1",
  });
  assert.deepEqual(r, { ok: true, motivo: "ja_registrado" });
});

test("erro de rede volta como erro, para a retentativa acontecer", async () => {
  const { inserir } = inserirFalso({ error: { code: "08006", message: "sem conexao" } });
  const r = await registrarConsentimento({
    inserir,
    record: ACEITE,
    alunoId: "aluno-1",
  });
  assert.deepEqual(r, { ok: false, motivo: "erro", detalhe: "sem conexao" });
});

test("insert que estoura nao derruba quem chamou", async () => {
  const inserir = async () => {
    throw new Error("boom");
  };
  const r = await registrarConsentimento({
    inserir,
    record: ACEITE,
    alunoId: "aluno-1",
  });
  assert.deepEqual(r, { ok: false, motivo: "erro", detalhe: "boom" });
});

test("sem sessao nao chega a tocar a rede", async () => {
  const { inserir, enviadas } = inserirFalso({ error: null });
  const r = await registrarConsentimento({
    inserir,
    record: ACEITE,
    alunoId: null,
  });
  assert.deepEqual(r, { ok: true, motivo: "nada_a_fazer" });
  assert.equal(enviadas.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  CODIGO_JA_REGISTRADO,
  comPrazo,
  escolherDecisao,
  linhaDeConsentimento,
  registroDaDecisao,
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

// --- Leitura de volta: o aceite e da conta, nao do aparelho ----------------

const VIGENTE = "2026-11-05-v6";

const LINHA_ACEITA = {
  versao: VIGENTE,
  status: "accepted",
  decidido_em: "2026-11-14T04:10:45.752Z",
  preferencias: { chatEnabled: true, usageEnabled: true, cameraEnabled: true, performanceEnabled: false },
};

test("a decisao gravada na conta volta como registro, com a data de quando o aluno decidiu", () => {
  const r = registroDaDecisao(LINHA_ACEITA, VIGENTE);
  assert.ok(r);
  assert.equal(r.version, VIGENTE);
  assert.equal(r.status, "accepted");
  assert.equal(r.updatedAt, "2026-11-14T04:10:45.752Z");
  assert.equal(r.preferences.usageEnabled, true);
  assert.equal(r.preferences.performanceEnabled, false);
  assert.equal(r.preferences.chatEnabled, true);
});

test("reenviar a decisao lida da conta nao cria linha nova: mesma chave unica", () => {
  const r = registroDaDecisao(LINHA_ACEITA, VIGENTE)!;
  const linha = linhaDeConsentimento(r, "aluno-1");
  assert.equal(linha.versao, LINHA_ACEITA.versao);
  assert.equal(linha.decidido_em, LINHA_ACEITA.decidido_em);
});

test("a camera volta desligada: a permissao do sistema e deste aparelho", () => {
  const r = registroDaDecisao(LINHA_ACEITA, VIGENTE)!;
  assert.equal(r.preferences.cameraEnabled, false);
  assert.equal(r.cameraPermissionGranted, false);
  assert.equal(r.cameraPermissionRequested, false);
});

test("recusa gravada tambem volta, e com tudo desligado", () => {
  const r = registroDaDecisao({ ...LINHA_ACEITA, status: "rejected" }, VIGENTE)!;
  assert.equal(r.status, "rejected");
  assert.deepEqual(r.preferences, {
    cameraEnabled: false,
    usageEnabled: false,
    performanceEnabled: false,
    chatEnabled: false,
  });
});

test("decisao de versao antiga nao vale: o termo novo tem de aparecer", () => {
  assert.equal(registroDaDecisao({ ...LINHA_ACEITA, versao: "2026-10-24-v5" }, VIGENTE), null);
});

test("linha vazia, status estranho ou data invalida nao viram registro", () => {
  assert.equal(registroDaDecisao(null, VIGENTE), null);
  assert.equal(registroDaDecisao({ ...LINHA_ACEITA, status: "talvez" }, VIGENTE), null);
  assert.equal(registroDaDecisao({ ...LINHA_ACEITA, decidido_em: null }, VIGENTE), null);
  assert.equal(registroDaDecisao({ ...LINHA_ACEITA, decidido_em: "ontem" }, VIGENTE), null);
});

test("preferencia ausente na linha entra como o padrao do aceite", () => {
  const r = registroDaDecisao({ ...LINHA_ACEITA, preferencias: null }, VIGENTE)!;
  assert.equal(r.preferences.usageEnabled, true);
  assert.equal(r.preferences.performanceEnabled, true);
  assert.equal(r.preferences.chatEnabled, true);
  assert.equal(r.preferences.cameraEnabled, false);
});

const LOCAL_VIGENTE = { ...ACEITE, version: VIGENTE, updatedAt: "2026-11-10T00:00:00.000Z" };

test("aparelho sem registro (reinstalado, outro navegador) usa a decisao da conta", () => {
  const remota = registroDaDecisao(LINHA_ACEITA, VIGENTE);
  assert.equal(escolherDecisao(null, remota, VIGENTE), remota);
});

test("registro local de versao antiga perde para a decisao da conta na vigente", () => {
  const remota = registroDaDecisao(LINHA_ACEITA, VIGENTE);
  assert.equal(escolherDecisao({ ...ACEITE, version: "2026-10-24-v5" }, remota, VIGENTE), remota);
});

test("sem nada que valha para a versao vigente, o termo aparece", () => {
  assert.equal(escolherDecisao(null, null, VIGENTE), null);
  assert.equal(escolherDecisao({ ...ACEITE, version: "2026-10-24-v5" }, null, VIGENTE), null);
});

test("sem a conta (rede fora), vale o registro local como antes", () => {
  assert.equal(escolherDecisao(LOCAL_VIGENTE, null, VIGENTE), LOCAL_VIGENTE);
});

test("local mais recente ou do mesmo instante continua valendo", () => {
  const remotaVelha = registroDaDecisao({ ...LINHA_ACEITA, decidido_em: "2026-11-01T00:00:00.000Z" }, VIGENTE);
  assert.equal(escolherDecisao(LOCAL_VIGENTE, remotaVelha, VIGENTE), LOCAL_VIGENTE);
  const mesma = registroDaDecisao({ ...LINHA_ACEITA, decidido_em: LOCAL_VIGENTE.updatedAt }, VIGENTE);
  assert.equal(escolherDecisao(LOCAL_VIGENTE, mesma, VIGENTE), LOCAL_VIGENTE);
});

test("recusa mais recente noutro aparelho chega a este", () => {
  const recusa = registroDaDecisao({ ...LINHA_ACEITA, status: "rejected" }, VIGENTE)!;
  const r = escolherDecisao(LOCAL_VIGENTE, recusa, VIGENTE)!;
  assert.equal(r.status, "rejected");
  assert.equal(r.preferences.usageEnabled, false);
});

test("aceite mais recente noutro aparelho preserva a camera deste", () => {
  const localComCamera = {
    ...LOCAL_VIGENTE,
    cameraPermissionGranted: true,
    preferences: { ...LOCAL_VIGENTE.preferences, cameraEnabled: true },
  };
  const remota = registroDaDecisao(LINHA_ACEITA, VIGENTE)!;
  const r = escolherDecisao(localComCamera, remota, VIGENTE)!;
  assert.equal(r.updatedAt, remota.updatedAt);
  assert.equal(r.preferences.performanceEnabled, false);
  assert.equal(r.preferences.cameraEnabled, true);
  assert.equal(r.cameraPermissionGranted, true);
});

test("comPrazo devolve o valor quando a rede responde a tempo", async () => {
  assert.equal(await comPrazo(Promise.resolve(7), 50), 7);
});

test("comPrazo devolve null quando a rede demora ou falha", async () => {
  assert.equal(await comPrazo(new Promise<number>(() => undefined), 10), null);
  assert.equal(await comPrazo(Promise.reject(new Error("rede")), 50), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  TempoDoEnvioEsgotado,
  comLimiteDeTempo,
  enviarUmaVez,
  envioEsgotado,
  mensagemDaFalhaNaConclusao,
  mensagemDaFalhaNoEnvio,
} from "./envioDaResposta";

test("rede pendurada vira erro de tempo em vez de esperar para sempre", async () => {
  const nunca = new Promise<number>(() => {});
  await assert.rejects(comLimiteDeTempo(nunca, 20, "questao_responder"), (erro: unknown) => {
    assert.ok(erro instanceof TempoDoEnvioEsgotado);
    assert.equal(envioEsgotado(erro), true);
    return true;
  });
});

test("resposta a tempo passa intacta, e o erro do banco sobe como veio", async () => {
  assert.equal(await comLimiteDeTempo(Promise.resolve(7), 1000, "x"), 7);
  const recusa = { code: "P0001", message: "prazo_expirado" };
  await assert.rejects(comLimiteDeTempo(Promise.reject(recusa), 1000, "x"), (erro) => erro === recusa);
});

test("dois toques seguidos rodam o envio uma vez só", async () => {
  const trava = { current: false };
  const estados: boolean[] = [];
  let envios = 0;
  let soltar!: () => void;
  const tarefa = () =>
    new Promise<void>((r) => {
      envios += 1;
      soltar = r;
    });
  const primeiro = enviarUmaVez(trava, tarefa, (e) => estados.push(e));
  const segundo = await enviarUmaVez(trava, tarefa, (e) => estados.push(e));
  assert.equal(segundo, false);
  soltar();
  assert.equal(await primeiro, true);
  assert.equal(envios, 1);
  assert.deepEqual(estados, [true, false]);
  assert.equal(trava.current, false);
});

test("a trava é solta mesmo quando o envio falha, e o botão volta a funcionar", async () => {
  const trava = { current: false };
  await assert.rejects(enviarUmaVez(trava, async () => { throw new Error("rede"); }));
  assert.equal(trava.current, false);
  assert.equal(await enviarUmaVez(trava, async () => {}), true);
});

test("a mensagem diz se foi lentidão ou falha, e se a resposta ficou salva", () => {
  assert.equal(mensagemDaFalhaNoEnvio(new TempoDoEnvioEsgotado("x", 1)).titulo, "Sem resposta do servidor");
  assert.equal(mensagemDaFalhaNoEnvio(new Error("boom")).titulo, "Resposta não salva");
  assert.match(mensagemDaFalhaNaConclusao(new Error("boom")), /foi salva/);
  assert.match(mensagemDaFalhaNaConclusao({ code: "tempo_esgotado" }), /conexão caiu/);
});

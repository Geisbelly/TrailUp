import assert from "node:assert/strict";
import test from "node:test";

import {
  ESTADO_DESCONHECIDO,
  NENHUMA_FINALIDADE,
  aceiteResponsavelValido,
  argumentosAceiteResponsavel,
  ehMenorDeIdade,
  erroDeModoRestrito,
  hojeEmBrasilia,
  lerEstadoConsentimento,
  mensagemDoModo,
  ModoRestritoError,
  parseDataBr,
  preferenciasEfetivas,
  proximoPasso,
  CONSENTIMENTO_PESQUISA_VERSAO,
  CONSENTIMENTO_RESPONSAVEL_VERSAO,
} from "./consentimentoResponsavel";
import { CHAVE_LEGADA_DO_CONSENTIMENTO, chaveDoConsentimento } from "./telemetryConsentVersao";

const TUDO = { camera: true, telemetria: true, emocional: true, mentor: true, pesquisa: true };
const PREFS = { cameraEnabled: true, usageEnabled: true, performanceEnabled: true, chatEnabled: true };

test("estado desconhecido (sem rede, RPC sem resposta) e restrito", () => {
  assert.equal(lerEstadoConsentimento(null).modoRestrito, true);
  assert.equal(lerEstadoConsentimento("lixo").modoRestrito, true);
  assert.equal(lerEstadoConsentimento({}).modoRestrito, true, "sem modo_restrito=false explicito");
  assert.deepEqual(lerEstadoConsentimento({ modo_restrito: "false" }).finalidades, NENHUMA_FINALIDADE);
});

test("le o jsonb de aluno_meu_consentimento", () => {
  const e = lerEstadoConsentimento({
    data_nascimento_informada: true,
    menor: true,
    modo_restrito: false,
    responsavel: { status: "accepted", versao: "v", metodo: "papel", finalidades: {}, pesquisa_versao: null, decidido_em: "2026-10-01T03:00:00Z", vigente: true },
    pesquisa: { aceito: true, vigente: true },
    finalidades: { camera: false, telemetria: true, emocional: "true", mentor: true, pesquisa: false },
  });
  assert.equal(e.modoRestrito, false);
  assert.equal(e.menor, true);
  assert.equal(e.pesquisaAceita, true);
  assert.equal(e.responsavel?.metodo, "papel");
  assert.deepEqual(e.finalidades, { camera: false, telemetria: true, emocional: false, mentor: true, pesquisa: false });
});

test("proximo passo do Gate: data, depois responsavel so para menor restrito", () => {
  assert.equal(proximoPasso(ESTADO_DESCONHECIDO), "data_nascimento");
  const base = { ...ESTADO_DESCONHECIDO, dataNascimentoInformada: true };
  assert.equal(proximoPasso({ ...base, menor: false, modoRestrito: false }), "liberado");
  assert.equal(proximoPasso({ ...base, menor: true, modoRestrito: true }), "responsavel");
  assert.equal(proximoPasso({ ...base, menor: true, modoRestrito: false }), "liberado");
});

test("recusa vigente do responsavel nao e reapresentada a cada abertura", () => {
  const recusa = {
    status: "rejected" as const, versao: CONSENTIMENTO_RESPONSAVEL_VERSAO, metodo: "aparelho" as const,
    finalidades: {}, pesquisa_versao: null, decidido_em: "2026-10-01T03:00:00Z",
  };
  const base = { ...ESTADO_DESCONHECIDO, dataNascimentoInformada: true, menor: true, modoRestrito: true };
  assert.equal(proximoPasso({ ...base, responsavel: { ...recusa, vigente: true } }), "liberado");
  // Versao nova do termo: pede de novo.
  assert.equal(proximoPasso({ ...base, responsavel: { ...recusa, vigente: false } }), "responsavel");
});

test("parseDataBr valida formato, calendario, futuro e limite de 120 anos", () => {
  const agora = new Date("2026-10-24T15:00:00Z");
  assert.equal(parseDataBr("05/03/2011", agora), "2011-03-05");
  assert.equal(parseDataBr("2011-03-05", agora), null);
  assert.equal(parseDataBr("31/02/2011", agora), null);
  assert.equal(parseDataBr("29/02/2012", agora), "2012-02-29");
  assert.equal(parseDataBr("25/10/2026", agora), null, "futuro");
  assert.equal(parseDataBr("01/01/1900", agora), null, "mais de 120 anos");
});

test("hoje e maioridade calculados em Brasilia, como no banco", () => {
  // 01:30 UTC de 25/10 ainda e 24/10 em Brasilia.
  const agora = new Date("2026-10-25T01:30:00Z");
  assert.equal(hojeEmBrasilia(agora), "2026-10-24");
  assert.equal(ehMenorDeIdade("2008-10-24", agora), false, "faz 18 hoje");
  assert.equal(ehMenorDeIdade("2008-10-25", agora), true, "faz 18 amanha (em Brasilia)");
});

test("preferencia local so liga o que o servidor libera; camera exige emocional", () => {
  assert.deepEqual(preferenciasEfetivas(PREFS, ESTADO_DESCONHECIDO), {
    cameraEnabled: false, usageEnabled: false, performanceEnabled: false, chatEnabled: false,
  });
  const soCamera = { ...ESTADO_DESCONHECIDO, finalidades: { ...NENHUMA_FINALIDADE, camera: true } };
  assert.equal(preferenciasEfetivas(PREFS, soCamera).cameraEnabled, false);
  const liberado = { ...ESTADO_DESCONHECIDO, modoRestrito: false, finalidades: TUDO };
  assert.deepEqual(preferenciasEfetivas(PREFS, liberado), PREFS);
  // Nunca liga o que o aluno desligou.
  const desligado = { ...PREFS, usageEnabled: false };
  assert.equal(preferenciasEfetivas(desligado, liberado).usageEnabled, false);
});

test("aceite do responsavel exige nome, relacao e declaracao; revogar nao", () => {
  const ok = { aceito: true, nome: "Maria Souza", relacao: "mae" as const, declaracao: true, finalidades: TUDO };
  assert.equal(aceiteResponsavelValido(ok), null);
  assert.ok(aceiteResponsavelValido({ ...ok, nome: " a " }));
  assert.ok(aceiteResponsavelValido({ ...ok, relacao: null }));
  assert.ok(aceiteResponsavelValido({ ...ok, declaracao: false }));
  assert.equal(aceiteResponsavelValido({ aceito: false, nome: "", relacao: null, declaracao: false, finalidades: TUDO }), null);
});

test("argumentos da RPC: versoes vigentes, revogacao zera finalidades e identidade", () => {
  const agora = new Date("2026-10-24T12:00:00Z");
  const a = argumentosAceiteResponsavel(
    { aceito: true, nome: "  Maria Souza ", relacao: "mae", declaracao: true, finalidades: TUDO }, agora);
  assert.equal(a.p_versao, CONSENTIMENTO_RESPONSAVEL_VERSAO);
  assert.equal(a.p_nome_responsavel, "Maria Souza");
  assert.equal(a.p_pesquisa_versao, CONSENTIMENTO_PESQUISA_VERSAO);
  assert.equal(a.p_decidido_em, agora.toISOString());
  const r = argumentosAceiteResponsavel(
    { aceito: false, nome: "Maria", relacao: "mae", declaracao: true, finalidades: TUDO }, agora);
  assert.deepEqual(r.p_finalidades, NENHUMA_FINALIDADE);
  assert.equal(r.p_nome_responsavel, null);
  assert.equal(r.p_pesquisa_versao, null);
});

test("403 modo_restrito da API vira ModoRestritoError com a mensagem do servidor", () => {
  const e = erroDeModoRestrito({ codigo: "modo_restrito", mensagem: "Mentor desligado." });
  assert.ok(e instanceof ModoRestritoError);
  assert.equal(e?.message, "Mentor desligado.");
  assert.ok(erroDeModoRestrito({ codigo: "modo_restrito" })?.message);
  assert.equal(erroDeModoRestrito("Token invalido"), null);
  assert.equal(erroDeModoRestrito({ codigo: "outro" }), null);
});

test("mensagem do modo restrito explica o motivo; liberado nao mostra nada", () => {
  assert.match(mensagemDoModo(ESTADO_DESCONHECIDO) ?? "", /data de nascimento/);
  assert.match(
    mensagemDoModo({ ...ESTADO_DESCONHECIDO, dataNascimentoInformada: true, menor: true }) ?? "",
    /responsável/
  );
  assert.equal(mensagemDoModo({ ...ESTADO_DESCONHECIDO, modoRestrito: false }), null);
});

test("chave local do consentimento e por aluno, nunca a do aparelho", () => {
  assert.equal(chaveDoConsentimento("abc"), `${CHAVE_LEGADA_DO_CONSENTIMENTO}:abc`);
  assert.notEqual(chaveDoConsentimento("a"), chaveDoConsentimento("b"));
  assert.equal(chaveDoConsentimento(null), null);
  assert.equal(chaveDoConsentimento("  "), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: React.ReactElement) => string;
};

// Modo de cuidado no aparelho (spec 2026-11-20, seção 4). A lógica é testada no core, sem React
// (não há renderizador com efeitos neste ambiente); a ligação com o IAContext é testada com o
// provider real, como em `IAContext.battle.test.tsx`.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
mockModule("@/context/SessaoContext", {
  useUsuario: () => ({
    usuario: { id: "aluno", perfilAtivo: "conqueror", perfis: [{ nome: "conqueror", afinidade: 100 }] },
  }),
});
mockModule("@/constants/profileImages", { getBrainHexGuideName: () => "Guia" });
mockModule("react-native", {
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
});
mockModule("@react-native-async-storage/async-storage", {
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined },
});
mockModule("@/utils/trilhaCheckpoint", { clearTrilhaCheckpoint: async () => undefined });

const { criarModoDeCuidado, criarContadorSemParar, publicarModoDeCuidadoAtivo } =
  require("./modoDeCuidado.core") as typeof import("./modoDeCuidado.core");
const { IAProvider, useIA } = require("./IAContext") as typeof import("./IAContext");
type RegistroDoCuidado = import("@/services/cuidadoNoBanco").RegistroDoCuidado;
type CuidadoAtivo = import("@/services/cuidadoNoBanco").CuidadoAtivo;

const CONFIG = { limites: { errosSeguidos: 5, minutosSemParar: 50, abandonos: 2 }, duracaoMin: 120 };
const T0 = Date.parse("2026-11-20T12:00:00Z");

function montar(opcoes: { registro?: RegistroDoCuidado; ativo?: CuidadoAtivo | null } = {}) {
  let agora = T0;
  const registros: unknown[] = [];
  const respostas: [number, string][] = [];
  const modo = criarModoDeCuidado({
    registrar: async (params) => {
      registros.push(params);
      return opcoes.registro ?? { ok: true, momentoId: 77, expiraEm: T0 + 120 * 60_000, atualizado: false };
    },
    lerAtivo: async () => opcoes.ativo ?? null,
    responder: async (momentoId, resposta) => {
      respostas.push([momentoId, resposta]);
      return true;
    },
    agora: () => agora,
  });
  modo.definirConfig(CONFIG);
  return {
    modo,
    registros,
    respostas,
    avancar: (ms: number) => {
      agora += ms;
    },
  };
}

const esperarRede = () => new Promise((resolve) => setImmediate(resolve));

function errar(modo: ReturnType<typeof montar>["modo"], vezes: number) {
  for (let i = 0; i < vezes; i += 1) modo.registrarSinal({ type: "activity_wrong", topicoId: 31, activityId: 900 + i });
}

test("sinal de uso liga o modo, chama cuidado_registrar com os fatos e mostra o aviso", async () => {
  const { modo, registros } = montar();
  await modo.definirTurma(4);
  errar(modo, 4);
  assert.equal(modo.estado().ativo, false);
  errar(modo, 1);

  // O alívio liga antes da rede responder.
  assert.equal(modo.estado().ativo, true);
  assert.equal(modo.estado().avisoVisivel, true);
  assert.equal(modo.estado().origem, "sinais_de_uso");
  assert.deepEqual(registros, [
    {
      classeId: 4,
      topicoId: 31,
      fatos: { erros_seguidos: 5 },
      acoes: { pausa_sugerida: true, cronometro_desligado: true },
    },
  ]);

  await esperarRede();
  assert.equal(modo.estado().momentoId, 77);
  assert.equal(modo.estado().expiraEm, T0 + 120 * 60_000);
});

test("sem consentimento (motivo sem_consentimento) alivia mesmo assim, só no aparelho", async () => {
  const { modo, registros } = montar({ registro: { ok: false, motivo: "sem_consentimento" } });
  await modo.definirTurma(4);
  errar(modo, 5);
  await esperarRede();

  assert.equal(registros.length, 1);
  assert.equal(modo.estado().ativo, true);
  assert.equal(modo.estado().avisoVisivel, true);
  assert.equal(modo.estado().momentoId, null);
  // Duração local, de `cuidado_duracao_min`.
  assert.equal(modo.estado().expiraEm, T0 + 120 * 60_000);
});

test("falha de rede no registro não derruba o alívio", async () => {
  let agora = T0;
  const modo = criarModoDeCuidado({
    registrar: async () => {
      throw new Error("rede");
    },
    lerAtivo: async () => {
      throw new Error("rede");
    },
    responder: async () => {
      throw new Error("rede");
    },
    agora: () => agora,
  });
  modo.definirConfig(CONFIG);
  await modo.definirTurma(4);
  errar(modo, 5);
  await esperarRede();
  assert.equal(modo.estado().ativo, true);
  modo.continuar();
  agora += 1;
  assert.equal(modo.estado().avisoVisivel, false);
});

test("sem os limites do banco, o detector não dispara", async () => {
  const { modo, registros } = montar();
  modo.definirConfig(null);
  await modo.definirTurma(4);
  errar(modo, 20);
  modo.registrarMinutosNaTrilha(500);
  assert.equal(modo.estado().ativo, false);
  assert.equal(registros.length, 0);
});

test("restaura o modo de cuidado ao abrir", async () => {
  const expira = T0 + 45 * 60_000;
  const { modo } = montar({ ativo: { ativo: true, expiraEm: expira, origem: "aluno_disse" } });
  await modo.definirTurma(4);
  assert.equal(modo.estado().ativo, true);
  assert.equal(modo.estado().expiraEm, expira);
  assert.equal(modo.estado().origem, "aluno_disse");
  // O aviso é do momento do sinal: reabrir não o mostra de novo.
  assert.equal(modo.estado().avisoVisivel, false);
});

test("restaurar ignora prazo vencido e resposta que não deu", async () => {
  const vencido = montar({ ativo: { ativo: true, expiraEm: T0 - 1, origem: "sinais_de_uso" } });
  await vencido.modo.definirTurma(4);
  assert.equal(vencido.modo.estado().ativo, false);
  const semResposta = montar({ ativo: null });
  await semResposta.modo.definirTurma(4);
  assert.equal(semResposta.modo.estado().ativo, false);
});

test("expira sozinho em expira_em", async () => {
  const { modo, avancar } = montar();
  await modo.definirTurma(4);
  errar(modo, 5);
  await esperarRede();
  avancar(120 * 60_000 - 1);
  modo.conferirExpiracao();
  assert.equal(modo.estado().ativo, true);
  avancar(1);
  modo.conferirExpiracao();
  assert.deepEqual(modo.estado(), {
    ativo: false,
    expiraEm: null,
    origem: null,
    avisoVisivel: false,
    tecnicasVisiveis: false,
    momentoId: null,
  });
  // Depois de expirar, o detector está rearmado e começa do zero.
  errar(modo, 4);
  assert.equal(modo.estado().ativo, false);
  errar(modo, 1);
  assert.equal(modo.estado().ativo, true);
});

test("Continuar fecha o aviso e o alívio continua", async () => {
  const { modo } = montar();
  await modo.definirTurma(4);
  errar(modo, 5);
  modo.continuar();
  assert.equal(modo.estado().avisoVisivel, false);
  assert.equal(modo.estado().tecnicasVisiveis, false);
  assert.equal(modo.estado().ativo, true);
  // Já em cuidado, mais erros não repetem o aviso.
  errar(modo, 10);
  assert.equal(modo.estado().avisoVisivel, false);
});

test("Fazer uma pausa e Continuar chamam cuidado_responder com o momento_id; sem momento gravado, não chamam", async () => {
  const pausa = montar();
  await pausa.modo.definirTurma(4);
  errar(pausa.modo, 5);
  await esperarRede();
  pausa.modo.fazerPausa();
  assert.equal(pausa.modo.estado().tecnicasVisiveis, true);
  assert.equal(pausa.modo.estado().avisoVisivel, false);
  pausa.modo.continuar();
  assert.deepEqual(pausa.respostas, [[77, "pausou"]], "uma resposta por momento");

  const continua = montar();
  await continua.modo.definirTurma(4);
  errar(continua.modo, 5);
  await esperarRede();
  continua.modo.continuar();
  assert.deepEqual(continua.respostas, [[77, "continuou"]]);

  const semMomento = montar({ registro: { ok: false, motivo: "sem_consentimento" } });
  await semMomento.modo.definirTurma(4);
  errar(semMomento.modo, 5);
  await esperarRede();
  semMomento.modo.fazerPausa();
  assert.equal(semMomento.modo.estado().tecnicasVisiveis, true);
  assert.deepEqual(semMomento.respostas, []);
});

test("sem turma, alivia sem chamar o banco", () => {
  const { modo, registros } = montar();
  errar(modo, 5);
  assert.equal(modo.estado().ativo, true);
  assert.equal(registros.length, 0);
});

test("tempo na trilha sem parar dispara com os minutos do banco", async () => {
  const { modo, registros } = montar();
  await modo.definirTurma(4);
  modo.registrarMinutosNaTrilha(49);
  assert.equal(modo.estado().ativo, false);
  modo.registrarMinutosNaTrilha(50);
  assert.equal(modo.estado().ativo, true);
  assert.deepEqual((registros[0] as { fatos: unknown }).fatos, { minutos_sem_parar: 50 });
});

test("o Guia liga o modo sem o aviso do uso, com o prazo do servidor ou o local", () => {
  const { modo } = montar();
  modo.ligarPeloGuia("crise", "2026-11-20T13:30:00Z");
  assert.equal(modo.estado().ativo, true);
  assert.equal(modo.estado().origem, "aluno_disse");
  assert.equal(modo.estado().avisoVisivel, false);
  assert.equal(modo.estado().expiraEm, Date.parse("2026-11-20T13:30:00Z"));

  const semPrazo = montar();
  semPrazo.modo.ligarPeloGuia("desconforto", null);
  assert.equal(semPrazo.modo.estado().expiraEm, T0 + 120 * 60_000);
});

test("contador sem parar: só tempo visível, e 5 minutos fora é pausa", () => {
  const minuto = 60_000;
  const contador = criarContadorSemParar(5 * minuto);
  assert.equal(contador.marcar(true, 0), 0);
  assert.equal(contador.marcar(true, 10 * minuto), 10);
  assert.equal(contador.marcar(false, 12 * minuto), 12);
  // 2 minutos fora: não é pausa, e o tempo fora não conta.
  assert.equal(contador.marcar(true, 14 * minuto), 12);
  assert.equal(contador.marcar(true, 20 * minuto), 18);
  assert.equal(contador.marcar(false, 20 * minuto), 18);
  assert.equal(contador.marcar(false, 25 * minuto), 0);
  assert.equal(contador.marcar(true, 26 * minuto), 0);
  assert.equal(contador.marcar(true, 30 * minuto), 4);
});

test("com o modo ativo, activity_timer, reading_timer e battle_mode ficam disabledReason modo_cuidado", () => {
  let contexto!: ReturnType<typeof useIA>;
  function Sonda() {
    contexto = useIA();
    return null;
  }
  const chaves = ["activity_timer", "reading_timer", "battle_mode"] as const;
  const escopo = { scope: "topic", topicoId: 131 } as const;

  publicarModoDeCuidadoAtivo(false);
  renderToString(
    <IAProvider>
      <Sonda />
    </IAProvider>
  );
  contexto.emitSignal({ type: "topic_open", topicoId: 131 });
  for (const chave of chaves) {
    assert.notEqual(contexto.resolveFeature(escopo, chave).disabledReason, "modo_cuidado", chave);
  }
  assert.equal(contexto.resolveFeature(escopo, "activity_timer").enabled, true, "o perfil tem cronômetro");

  publicarModoDeCuidadoAtivo(true);
  try {
    renderToString(
      <IAProvider>
        <Sonda />
      </IAProvider>
    );
    for (const chave of chaves) {
      const resolvido = contexto.resolveFeature(escopo, chave);
      assert.equal(resolvido.enabled, false, chave);
      assert.equal(resolvido.disabledReason, "modo_cuidado", chave);
    }
    // O Guia continua: o modo de cuidado não cala quem acolhe.
    assert.notEqual(contexto.resolveFeature(escopo, "mentor_character").disabledReason, "modo_cuidado");
  } finally {
    publicarModoDeCuidadoAtivo(false);
  }
});

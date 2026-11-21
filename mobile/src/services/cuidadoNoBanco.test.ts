import assert from "node:assert/strict";
import test from "node:test";

import {
  lerConfigDoCuidado,
  lerCuidadoAtivo,
  registrarCuidadoNoBanco,
  responderCuidado,
  type ClienteDoCuidado,
} from "./cuidadoNoBanco";

// Formato real das RPCs da `20261121_02`. Nenhuma função daqui lança: o alívio na tela nunca
// cai porque a rede caiu.

function cliente(rpc: (funcao: string, args?: Record<string, unknown>) => unknown, linhas?: unknown): ClienteDoCuidado {
  return {
    rpc: async (funcao, args) => rpc(funcao, args) as { data: unknown; error: unknown },
    from: () => ({
      select: () => ({
        in: async () => (linhas instanceof Error ? Promise.reject(linhas) : { data: linhas, error: null }),
      }),
    }),
  };
}

const fatos = { erros_seguidos: 5 };
const acoes = { pausa_sugerida: true };

test("cuidado_registrar: argumentos, sucesso e motivos", async () => {
  const chamadas: unknown[] = [];
  const ok = await registrarCuidadoNoBanco(
    cliente((funcao, args) => {
      chamadas.push([funcao, args]);
      return { data: { ok: true, momento_id: 9, expira_em: "2026-11-20T14:00:00+00:00", atualizado: false }, error: null };
    }),
    { classeId: 4, topicoId: null, fatos, acoes }
  );
  assert.deepEqual(chamadas, [
    ["cuidado_registrar", { p_classe_id: 4, p_topico_id: null, p_origem: "sinais_de_uso", p_fatos: fatos, p_acoes: acoes }],
  ]);
  assert.deepEqual(ok, { ok: true, momentoId: 9, expiraEm: Date.parse("2026-11-20T14:00:00Z"), atualizado: false });

  const sem = await registrarCuidadoNoBanco(
    cliente(() => ({ data: { ok: false, motivo: "sem_consentimento" }, error: null })),
    { classeId: 4, topicoId: 1, fatos, acoes }
  );
  assert.deepEqual(sem, { ok: false, motivo: "sem_consentimento" });

  const erro = await registrarCuidadoNoBanco(
    cliente(() => {
      throw new Error("rede");
    }),
    { classeId: 4, topicoId: 1, fatos, acoes }
  );
  assert.deepEqual(erro, { ok: false, motivo: "falha" });
});

test("cuidado_ativo e cuidado_responder", async () => {
  const ativo = await lerCuidadoAtivo(
    cliente(() => ({ data: { ativo: true, expira_em: "2026-11-20T14:00:00+00:00", origem: "aluno_disse" }, error: null })),
    4
  );
  assert.deepEqual(ativo, { ativo: true, expiraEm: Date.parse("2026-11-20T14:00:00Z"), origem: "aluno_disse" });
  assert.equal(await lerCuidadoAtivo(cliente(() => ({ data: null, error: { message: "x" } })), 4), null);

  assert.equal(await responderCuidado(cliente(() => ({ data: true, error: null })), 9, "pausou"), true);
  assert.equal(
    await responderCuidado(
      cliente(() => {
        throw new Error("rede");
      }),
      9,
      "pausou"
    ),
    false
  );
});

test("config: as quatro chaves, ou nada", async () => {
  const linhas = [
    { chave: "cuidado_erros_seguidos", valor: "5" },
    { chave: "cuidado_minutos_sem_parar", valor: "50" },
    { chave: "cuidado_abandonos", valor: "2" },
    { chave: "cuidado_duracao_min", valor: "120" },
  ];
  assert.deepEqual(await lerConfigDoCuidado(cliente(() => null, linhas)), {
    limites: { errosSeguidos: 5, minutosSemParar: 50, abandonos: 2 },
    duracaoMin: 120,
  });
  assert.equal(await lerConfigDoCuidado(cliente(() => null, linhas.slice(1))), null);
  assert.equal(await lerConfigDoCuidado(cliente(() => null, new Error("rede"))), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import { encerrarSessaoDoAluno } from "./encerrarSessao";

function deps(over: Partial<Parameters<typeof encerrarSessaoDoAluno>[0]> = {}) {
  const chamadas: string[] = [];
  const base = {
    signOutRemoto: async () => {
      chamadas.push("remoto");
      return { error: null };
    },
    limparSessaoLocal: async () => {
      chamadas.push("local");
    },
    ...over,
  };
  return { base, chamadas };
}

test("logout normal: tenta o remoto e ainda assim limpa o local", async () => {
  const { base, chamadas } = deps();

  const r = await encerrarSessaoDoAluno(base);

  assert.equal(r.remotoOk, true);
  assert.deepEqual(chamadas, ["remoto", "local"]);
});

test("erro DEVOLVIDO pelo remoto ainda encerra a sessao local", async () => {
  // O bug: `supabase.auth.signOut()` nao lanca, devolve `{ error }`. Um
  // `try/catch` em volta nao ve nada, e a auth-js pula o `_removeSession()`
  // quando o POST /logout falha -- sem SIGNED_OUT, o app continua logado.
  const { base, chamadas } = deps({
    signOutRemoto: async () => {
      chamadas.push("remoto");
      return { error: { name: "AuthRetryableFetchError", message: "Network request failed" } };
    },
  });

  const r = await encerrarSessaoDoAluno(base);

  assert.equal(r.remotoOk, false);
  assert.deepEqual(chamadas, ["remoto", "local"], "a limpeza local nao pode depender da rede");
});

test("sessao ja invalida no inicio do signOut tambem encerra o local", async () => {
  // Segundo caminho da auth-js que pula o `_removeSession()`: o refresh token
  // ja venceu, entao o proprio `_useSession` devolve erro antes de tentar a
  // rede. Era o caso em que so fechar e reabrir o app deslogava.
  const { base, chamadas } = deps({
    signOutRemoto: async () => {
      chamadas.push("remoto");
      return { error: { name: "AuthApiError", message: "Invalid Refresh Token: Already Used" } };
    },
  });

  const r = await encerrarSessaoDoAluno(base);

  assert.equal(r.remotoOk, false);
  assert.deepEqual(chamadas, ["remoto", "local"]);
});

test("excecao lancada pelo remoto nao impede a limpeza local", async () => {
  const { base, chamadas } = deps({
    signOutRemoto: async () => {
      chamadas.push("remoto");
      throw new Error("boom");
    },
  });

  const r = await encerrarSessaoDoAluno(base);

  assert.equal(r.remotoOk, false);
  assert.deepEqual(chamadas, ["remoto", "local"]);
});

test("falha na limpeza local nao derruba o logout", async () => {
  // O aluno pediu para sair. Propagar um erro de storage aqui deixaria a tela
  // presa no estado logado -- exatamente o sintoma que este modulo existe para
  // eliminar. Quem chama precisa poder derrubar o estado em memoria de todo
  // jeito.
  const { base } = deps({
    limparSessaoLocal: async () => {
      throw new Error("storage indisponivel");
    },
  });

  const r = await encerrarSessaoDoAluno(base);

  assert.equal(r.localOk, false);
});

test("reporta a falha para quem quiser registrar", async () => {
  const vistos: unknown[] = [];
  const { base } = deps({
    signOutRemoto: async () => ({ error: { message: "Network request failed" } }),
    aoFalhar: (erro: unknown) => vistos.push(erro),
  });

  await encerrarSessaoDoAluno(base);

  assert.equal(vistos.length, 1, "a falha silenciosa era metade do bug");
});

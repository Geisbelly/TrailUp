import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { criarColetor } from "./coletor";
import { avisarFalha, definirColetor, destinoCriticoDoAluno, fetchMedido } from "./medicao";

test("entrar, abrir a trilha e concluir atividade são críticos; ler atividade não", () => {
  assert.equal(destinoCriticoDoAluno("auth/token", "POST"), true);
  assert.equal(destinoCriticoDoAluno("topico_aluno", "GET"), true);
  assert.equal(destinoCriticoDoAluno("atividade_aluno", "PATCH"), true);
  assert.equal(destinoCriticoDoAluno("atividade_aluno", "GET"), false);
  assert.equal(destinoCriticoDoAluno("rpc/loja_saldo", "POST"), false);
});

test("o fetch do cliente conta no coletor ativo e devolve a mesma resposta", async () => {
  const coletor = criarColetor({
    superficie: "app",
    versao: "1.0.6",
    plataforma: "android",
    formato: "celular",
    armazenamento: { ler: () => null, gravar: () => undefined },
    enviar: async () => true,
    podeEnviar: () => true,
    novoId: () => "s1",
    destinoCritico: destinoCriticoDoAluno,
  });
  definirColetor(coletor);
  const original = globalThis.fetch;
  const resposta = new Response("{}", { status: 500 });
  globalThis.fetch = (async () => resposta) as typeof fetch;
  try {
    assert.equal(await fetchMedido("https://a.co/rest/v1/topico_aluno?x=1"), resposta);
  } finally {
    globalThis.fetch = original;
  }
  const { sessao } = coletor.fotografia();
  assert.equal(sessao.chamadas, 1);
  assert.equal(sessao.criticas_falha, 1);
  assert.deepEqual(sessao.falhas_por_destino, { topico_aluno: 1 });
});

test("o coletor é o mesmo arquivo do console", () => {
  const raiz = resolve(__dirname, "../../../..");
  assert.equal(
    readFileSync(resolve(raiz, "mobile/src/services/saude/coletor.ts"), "utf8"),
    readFileSync(resolve(raiz, "frontend/src/lib/saude/coletor.ts"), "utf8"),
  );
});

test("falha tratada avisa no console e conta como `tratado`, separada por lugar", () => {
  const coletor = criarColetor({
    superficie: "app",
    versao: "1.0.8",
    plataforma: "android",
    formato: "celular",
    armazenamento: { ler: () => null, gravar: () => undefined },
    enviar: async () => true,
    podeEnviar: () => true,
    novoId: () => "s2",
    destinoCritico: destinoCriticoDoAluno,
  });
  definirColetor(coletor);
  const avisos: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void avisos.push(args);
  try {
    const recusa = { message: "tentativa_ja_respondida", code: "P0001", details: null, hint: null };
    avisarFalha("questao/confirmar", "[QuestionActivity] Falha ao confirmar a resposta:", recusa);
    avisarFalha("questao/confirmar", "[QuestionActivity] Falha ao confirmar a resposta:", recusa);
    avisarFalha("arena/responder", "[Desafio] Falha ao responder:", recusa);
  } finally {
    console.warn = warn;
  }
  assert.equal(avisos.length, 3);
  const erros = coletor.fotografia().erros;
  assert.deepEqual(
    erros.map((e) => [e.tipo, e.nome, e.mensagem, e.rota, e.vezes]),
    [
      ["tratado", "Supabase", "tentativa_ja_respondida", "questao/confirmar", 2],
      ["tratado", "Supabase", "tentativa_ja_respondida", "arena/responder", 1],
    ],
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  extrairReferenciaDeDeck,
  hostSoAlcancavelNoDeploy,
  origemDeStorageConfiavel,
  reancorarDeckNaOrigemPublica,
  reancorarNaOrigemDoApp,
} from "./storageOrigin";

const APP = "https://xrebtkmdewolzmpsdwgh.supabase.co";
const INTERNO = "http://trailup-microservice-gmgqkw:3000";

test("origem igual a do app e confiavel", () => {
  assert.equal(origemDeStorageConfiavel(APP, APP), true);
});

test("host interno do deploy NAO e confiavel (caso real do ERR_NAME_NOT_RESOLVED)", () => {
  assert.equal(origemDeStorageConfiavel(INTERNO, APP), false);
});

test("compara ignorando barra final e caixa", () => {
  assert.equal(origemDeStorageConfiavel(`${APP}/`, APP), true);
  assert.equal(origemDeStorageConfiavel(APP.toUpperCase(), APP), true);
});

test("sem origem conhecida do app, mantem o que veio (nao quebra o que funciona)", () => {
  assert.equal(origemDeStorageConfiavel(INTERNO, null), true);
  assert.equal(origemDeStorageConfiavel(INTERNO, ""), true);
});

test("reancora o caminho do bucket na origem do app", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: APP,
    bucket: "conteudo_aluno",
    objectPath: "brainhex/survivor/classe-32/apresentacao/material-abc.html",
  });

  assert.equal(
    url,
    `${APP}/storage/v1/object/public/conteudo_aluno/brainhex/survivor/classe-32/apresentacao/material-abc.html`,
  );
});

test("escapa cada segmento, sem transformar as barras em %2F", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: APP,
    bucket: "conteudo_aluno",
    objectPath: "pasta com espaco/arquivo final.html",
  });

  assert.match(url ?? "", /pasta%20com%20espaco\/arquivo%20final\.html$/);
  assert.ok(!(url ?? "").includes("%2F"));
});

test("ignora barra final da origem, sem duplicar", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: `${APP}/`,
    bucket: "b",
    objectPath: "x.html",
  });

  assert.equal(url, `${APP}/storage/v1/object/public/b/x.html`);
});

test("sem dados suficientes devolve null (quem chama mantem a url original)", () => {
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: null, bucket: "b", objectPath: "x" }), null);
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: APP, bucket: null, objectPath: "x" }), null);
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: APP, bucket: "b", objectPath: "" }), null);
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: APP, bucket: "b", objectPath: "///" }), null);
});

// --- URL de deck resservido (caso real de 2026-08-25) ----------------------

const DECK_INTERNO =
  "https://trailup-microservice-gmgqkw:3000/api/v1/decks/conteudo_aluno/" +
  "brainhex/survivor/classe-32/topico-125/conteudo-174/generation-d536/" +
  "apresentacao/material-3572_b5101f4e-parte-01.html";

test("extrai bucket e caminho do objeto da URL de deck", () => {
  const referencia = extrairReferenciaDeDeck(DECK_INTERNO);

  assert.equal(referencia?.bucket, "conteudo_aluno");
  assert.equal(
    referencia?.objectPath,
    "brainhex/survivor/classe-32/topico-125/conteudo-174/generation-d536/apresentacao/material-3572_b5101f4e-parte-01.html"
  );
});

test("preserva a query do deck", () => {
  // O deck le a propria location.search pra decidir o que esconder; perder a
  // flag traz de volta o quiz duplicado que ela existe pra suprimir.
  const referencia = extrairReferenciaDeDeck(`${DECK_INTERNO}?hideQuiz=1&hideNotes=1`);

  assert.equal(referencia?.search, "?hideQuiz=1&hideNotes=1");
});

test("URL de storage de verdade nao e tratada como deck", () => {
  // Ela ja tem caminho proprio; casar aqui duplicaria o tratamento.
  assert.equal(
    extrairReferenciaDeDeck(
      "https://projeto.supabase.co/storage/v1/object/public/conteudo_aluno/x/y.html"
    ),
    null
  );
});

test("outras URLs nao casam", () => {
  assert.equal(extrairReferenciaDeDeck("https://exemplo.com/api/v1/audio/x.mp3"), null);
  assert.equal(extrairReferenciaDeDeck(""), null);
  assert.equal(extrairReferenciaDeDeck(null), null);
});

test("deck sem caminho depois do bucket nao vira referencia", () => {
  assert.equal(extrairReferenciaDeDeck("https://host:3000/api/v1/decks/conteudo_aluno"), null);
});

test("caminho relativo tambem e reconhecido", () => {
  const referencia = extrairReferenciaDeDeck("/api/v1/decks/conteudo_aluno/a/b.html?x=1");

  assert.equal(referencia?.bucket, "conteudo_aluno");
  assert.equal(referencia?.objectPath, "a/b.html");
  assert.equal(referencia?.search, "?x=1");
});

test("bucket percent-encoded na URL e decodificado", () => {
  const referencia = extrairReferenciaDeDeck(
    "https://host:3000/api/v1/decks/conteudo%5Faluno/a/b.html"
  );

  assert.equal(referencia?.bucket, "conteudo_aluno");
});

test("reancoragem do deck devolve URL publica de storage com a query", () => {
  const referencia = extrairReferenciaDeDeck(`${DECK_INTERNO}?hideQuiz=1`)!;

  const url = reancorarNaOrigemDoApp({
    appOrigin: "https://projeto.supabase.co",
    bucket: referencia.bucket,
    objectPath: referencia.objectPath,
    search: referencia.search,
  });

  assert.equal(
    url,
    "https://projeto.supabase.co/storage/v1/object/public/conteudo_aluno/" +
      "brainhex/survivor/classe-32/topico-125/conteudo-174/generation-d536/" +
      "apresentacao/material-3572_b5101f4e-parte-01.html?hideQuiz=1"
  );
});

test("reancoragem sem query nao deixa interrogacao solta", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: "https://projeto.supabase.co",
    bucket: "conteudo_aluno",
    objectPath: "a/b.html",
    search: "",
  });

  assert.equal(url, "https://projeto.supabase.co/storage/v1/object/public/conteudo_aluno/a/b.html");
});

test("sem origem do app nao inventa URL", () => {
  // Melhor manter a URL errada (que falha visivelmente) do que fabricar uma
  // que aponta pra lugar nenhum.
  assert.equal(
    reancorarNaOrigemDoApp({
      appOrigin: null,
      bucket: "conteudo_aluno",
      objectPath: "a/b.html",
      search: "",
    }),
    null
  );
});

// --- host interno e reancoragem do deck -----------------------------------

test("nome de servico do deploy e reconhecido como interno", () => {
  assert.equal(hostSoAlcancavelNoDeploy("https://trailup-microservice-gmgqkw:3000/x"), true);
});

test("host publico com dominio nao e interno", () => {
  assert.equal(hostSoAlcancavelNoDeploy("https://deck.exemplo.com/api/v1/decks/b/a.html"), false);
  assert.equal(hostSoAlcancavelNoDeploy("https://projeto.supabase.co/x"), false);
});

test("localhost e IP de rede local passam", () => {
  // Sao legitimos em desenvolvimento; marcar como interno quebraria o fluxo
  // local sem consertar producao.
  assert.equal(hostSoAlcancavelNoDeploy("http://localhost:3000/x"), false);
  assert.equal(hostSoAlcancavelNoDeploy("http://192.168.0.14:3000/x"), false);
});

test("valor sem URL valida nao vira interno", () => {
  assert.equal(hostSoAlcancavelNoDeploy("nao-e-url"), false);
  assert.equal(hostSoAlcancavelNoDeploy(""), false);
  assert.equal(hostSoAlcancavelNoDeploy(null), false);
});

test("reancora o deck trocando SO o host", () => {
  // A rota /api/v1/decks tem que ser mantida: e ela que devolve text/html de
  // verdade, baixando do bucket via service role.
  const url = reancorarDeckNaOrigemPublica({
    deckUrl: `${DECK_INTERNO}?hideQuiz=1`,
    publicOrigin: "https://deck.exemplo.com",
  });

  assert.equal(
    url,
    "https://deck.exemplo.com/api/v1/decks/conteudo_aluno/" +
      "brainhex/survivor/classe-32/topico-125/conteudo-174/generation-d536/" +
      "apresentacao/material-3572_b5101f4e-parte-01.html?hideQuiz=1"
  );
});

test("origem publica com caminho e reduzida a origem", () => {
  const url = reancorarDeckNaOrigemPublica({
    deckUrl: DECK_INTERNO,
    publicOrigin: "https://deck.exemplo.com/qualquer/coisa",
  });

  assert.ok(url?.startsWith("https://deck.exemplo.com/api/v1/decks/"));
});

test("sem origem publica configurada nao fabrica URL", () => {
  assert.equal(
    reancorarDeckNaOrigemPublica({ deckUrl: DECK_INTERNO, publicOrigin: null }),
    null
  );
  assert.equal(
    reancorarDeckNaOrigemPublica({ deckUrl: DECK_INTERNO, publicOrigin: "  " }),
    null
  );
});

test("URL que nao e de deck nao e reancorada", () => {
  assert.equal(
    reancorarDeckNaOrigemPublica({
      deckUrl: "https://host/storage/v1/object/public/b/a.html",
      publicOrigin: "https://deck.exemplo.com",
    }),
    null
  );
});

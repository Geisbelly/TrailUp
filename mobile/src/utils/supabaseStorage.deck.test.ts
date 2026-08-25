import assert from "node:assert/strict";
import test from "node:test";

// Este teste cobre o CONTRATO da conversao (deck -> storage publico) usando as
// funcoes puras, porque supabaseStorage.ts importa o cliente do Supabase e nao
// carrega no harness do node. A composicao usada aqui e exatamente a de
// deckComoUrlPublicaDeStorage.
import { extrairReferenciaDeDeck, reancorarNaOrigemDoApp } from "./storageOrigin";

const APP = "https://xrebtkmdewolzmpsdwgh.supabase.co";

function converter(rawUrl: string, appOrigin: string | null) {
  const referencia = extrairReferenciaDeDeck(rawUrl);
  if (!referencia) return null;
  return reancorarNaOrigemDoApp({
    appOrigin,
    bucket: referencia.bucket,
    objectPath: referencia.objectPath,
    search: referencia.search,
  });
}

test("deck com host interno vira URL publica de storage", () => {
  // O deck mora no MESMO bucket publico do resto do material: o microservice
  // sobe tudo com getPublicUrl. O endpoint /api/v1/decks existe por causa do
  // Content-Type, e o app ja contorna isso baixando o HTML e injetando inline.
  const url = converter(
    "https://trailup-microservice-gmgqkw:3000/api/v1/decks/conteudo_aluno/" +
      "brainhex/survivor/classe-32/topico-125/apresentacao/parte-01.html?hideQuiz=1",
    APP
  );

  assert.equal(
    url,
    `${APP}/storage/v1/object/public/conteudo_aluno/` +
      "brainhex/survivor/classe-32/topico-125/apresentacao/parte-01.html?hideQuiz=1"
  );
});

test("as flags do modo de operacao sobrevivem a conversao", () => {
  // baseUrl do WebView vem dessa URL; sem a query o deck mostraria widget que o
  // modo de operacao do aluno manda esconder.
  const url = converter(
    "https://host-interno:3000/api/v1/decks/conteudo_aluno/a/b.html" +
      "?hideQuiz=1&hideChecklist=1&hideNotes=1",
    APP
  );

  assert.ok(url?.endsWith("?hideQuiz=1&hideChecklist=1&hideNotes=1"));
});

test("sem origem do Supabase conhecida nao converte", () => {
  assert.equal(converter("https://host/api/v1/decks/conteudo_aluno/a/b.html", null), null);
});

test("URL de storage ja correta nao e mexida pela conversao", () => {
  assert.equal(converter(`${APP}/storage/v1/object/public/conteudo_aluno/a/b.html`, APP), null);
});

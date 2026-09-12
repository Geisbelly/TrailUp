import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupabasePublicStorageUrl,
  looksLikeStorageObjectPath,
  normalizeObjectPath,
  parseSupabaseStorageUrl,
} from "./storageUrlShape";

const APP = "https://xrebtkmdewolzmpsdwgh.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_URL = APP;

const CAMINHO = "brainhex/seeker/classe-54/topico-131/apresentacao/material-1.html";
const GATEWAY = `${APP}/functions/v1/storage-redirect?path=${CAMINHO}`;

// Com os arquivos indo para o R2, o material passa a ser referenciado por uma
// URL da Edge Function `storage-redirect`, que responde 302. O app NAO pode
// reescrever essa URL: qualquer "correcao" para o formato de Storage apontaria
// para um objeto que nao existe mais. Estes testes fixam a passagem intacta.

test("gateway: a URL atravessa buildSupabasePublicStorageUrl sem ser reescrita", () => {
  assert.equal(buildSupabasePublicStorageUrl(GATEWAY), GATEWAY);
});

test("gateway: a query (?path=...) sobrevive, com barras e tudo", () => {
  const saida = buildSupabasePublicStorageUrl(GATEWAY);
  assert.ok(saida.includes(`?path=${CAMINHO}`), saida);
});

test("gateway: e' recusada pelos dois testes de forma, que e' o motivo de passar intacta", () => {
  // looksLikeStorageObjectPath recusa qualquer coisa absoluta; parse so' aceita
  // /storage/v1/object/. Com os dois nulos, resolveSupabaseStorageUrl cai em
  // buildSupabasePublicStorageUrl, que devolve a entrada.
  assert.equal(looksLikeStorageObjectPath(GATEWAY), false);
  assert.equal(parseSupabaseStorageUrl(GATEWAY), null);
  assert.equal(normalizeObjectPath(GATEWAY), null);
});

test("gateway: bucket informado nas options nao muda nada", () => {
  assert.equal(buildSupabasePublicStorageUrl(GATEWAY, { bucket: "conteudo_aluno" }), GATEWAY);
});

// --- regressao: o que ja funcionava continua funcionando ---

test("URL publica de storage continua passando intacta", () => {
  const publica = `${APP}/storage/v1/object/public/conteudo_aluno/${CAMINHO}`;
  assert.equal(buildSupabasePublicStorageUrl(publica), publica);
});

test("caminho cru de objeto continua virando URL publica", () => {
  assert.equal(
    buildSupabasePublicStorageUrl(CAMINHO, { bucket: "conteudo_aluno" }),
    `${APP}/storage/v1/object/public/conteudo_aluno/${CAMINHO}`,
  );
});

// DEFEITO CONHECIDO, fixado aqui como caracterizacao - nao e' o comportamento
// desejado. parseSupabaseStorageUrl assume que o 4o segmento do caminho e' o
// MODO (`public`/`sign`), o que so' vale para as rotas que tem modo. Na rota
// autenticada (`/storage/v1/object/<bucket>/<path>`) nao ha modo, entao o
// bucket e' lido como modo e o primeiro segmento do caminho vira o "bucket" -
// gerando /object/public/brainhex/... , que aponta para bucket inexistente.
//
// Latente, nao vivo: nenhuma URL gravada no banco usa essa forma (medido: 595
// publicas e 157 de deck, zero autenticadas). Se alguem corrigir o parse, este
// teste falha - e' o sinal para atualiza-lo, nao para reverter a correcao.
test("DEFEITO: rota autenticada e' reescrita com o bucket errado", () => {
  assert.equal(
    buildSupabasePublicStorageUrl(`${APP}/storage/v1/object/conteudo_aluno/${CAMINHO}`),
    `${APP}/storage/v1/object/public/brainhex/seeker/classe-54/topico-131/apresentacao/material-1.html`,
  );
});

test("deck com host interno continua sendo reancorado no app", () => {
  const saida = buildSupabasePublicStorageUrl(
    `https://trailup-microservice-gmgqkw:3000/api/v1/decks/conteudo_aluno/${CAMINHO}`,
  );
  assert.equal(saida, `${APP}/storage/v1/object/public/conteudo_aluno/${CAMINHO}`);
});

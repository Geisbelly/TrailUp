import assert from "node:assert/strict";
import test from "node:test";

import {
  baixarTextoPeloGateway,
  caminhoDoGateway,
  FUNCAO_DE_UPLOAD,
  FuncaoDeUploadNaoPublicada,
  linkDeLeitura,
  uploadPeloSupabase,
  urlDoGateway,
  urlParaBaixar,
} from "./r2Upload";

const SUPA = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico" };
const ASSINADA = "https://conta.r2.cloudflarestorage.com/trailup/deck.html?X-Amz-Signature=abc";
const DECK = "brainhex/seeker/classe-54/topico-1/markdown/material-1.md";

type Chamada = { url: string; init: RequestInit };

function fetchFalso(respostas: Response[]): { fetchImpl: typeof fetch; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas.shift();
    if (!r) throw new Error("chamada a mais");
    return r;
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

async function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("pede a URL ao Supabase com a chave de servico e sobe o arquivo direto no R2", async () => {
  const { fetchImpl, chamadas } = fetchFalso([
    new Response(JSON.stringify({ url: ASSINADA }), { status: 200 }),
    new Response("", { status: 200 }),
  ]);

  await comEnv(SUPA, () => uploadPeloSupabase(DECK, Buffer.from("<html>"), "text/html; charset=utf-8", fetchImpl));

  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].url, `https://proj.supabase.co/functions/v1/${FUNCAO_DE_UPLOAD}`);
  assert.equal(chamadas[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(chamadas[0].init.body)), { path: DECK });
  assert.equal((chamadas[0].init.headers as Record<string, string>).Authorization, "Bearer chave-de-servico");
  assert.equal(chamadas[1].url, ASSINADA);
  assert.equal(chamadas[1].init.method, "PUT");
  // O PUT vai ao R2 sem a chave de servico.
  assert.deepEqual(chamadas[1].init.headers, { "Content-Type": "text/html; charset=utf-8" });
  assert.equal(Buffer.from(chamadas[1].init.body as Uint8Array).toString(), "<html>");
});

test("funcao nao publicada (404 da plataforma) lanca FuncaoDeUploadNaoPublicada", async () => {
  const { fetchImpl, chamadas } = fetchFalso([new Response('{"code":"NOT_FOUND"}', { status: 404 })]);

  await assert.rejects(
    comEnv(SUPA, () => uploadPeloSupabase(DECK, Buffer.from("x"), "text/html", fetchImpl)),
    FuncaoDeUploadNaoPublicada,
  );
  assert.equal(chamadas.length, 1);
});

const FALHAS: Array<[string, () => Response[]]> = [
  ["funcao recusa (500)", () => [new Response('{"error":"nao configurado"}', { status: 500 })]],
  ["resposta sem url", () => [new Response("{}", { status: 200 })]],
  ["R2 recusa o PUT", () => [new Response(JSON.stringify({ url: ASSINADA }), { status: 200 }), new Response("no", { status: 403 })]],
];
for (const [nome, respostas] of FALHAS) {
  test(`falha lanca erro comum, nao FuncaoDeUploadNaoPublicada: ${nome}`, async () => {
    const { fetchImpl } = fetchFalso(respostas());
    await assert.rejects(
      comEnv(SUPA, () => uploadPeloSupabase(DECK, Buffer.from("x"), "text/html", fetchImpl)),
      (e: unknown) => e instanceof Error && !(e instanceof FuncaoDeUploadNaoPublicada),
    );
  });
}

test("sem SUPABASE_URL ou chave de servico nem pede a URL", async () => {
  const { fetchImpl, chamadas } = fetchFalso([]);
  await assert.rejects(
    comEnv({ ...SUPA, SUPABASE_SERVICE_ROLE_KEY: undefined }, () =>
      uploadPeloSupabase(DECK, Buffer.from("x"), "text/html", fetchImpl),
    ),
  );
  assert.equal(chamadas.length, 0);
});

test("urlDoGateway monta a URL de leitura, e sem SUPABASE_URL devolve null", async () => {
  assert.equal(
    await comEnv(SUPA, () => urlDoGateway(DECK)),
    `https://proj.supabase.co/functions/v1/storage-redirect?path=${DECK}`,
  );
  assert.equal(await comEnv({ SUPABASE_URL: undefined }, () => urlDoGateway(DECK)), null);
});

const GATEWAY = "https://proj.supabase.co/functions/v1/storage-redirect";
const LINK = `${GATEWAY}?path=${DECK}&u=00000000-0000-0000-0000-000000000000&exp=1800000000&sig=abc`;
const comLink = () => new Response(JSON.stringify({ expira_em: 1800000000, links: { [DECK]: LINK } }), { status: 200 });
const semLink = () => new Response(JSON.stringify({ expira_em: 1800000000, links: {} }), { status: 200 });

test("baixarTextoPeloGateway pede o link com a chave e baixa sem ela, seguindo o 302", async () => {
  const { fetchImpl, chamadas } = fetchFalso([comLink(), new Response("## Parte 2", { status: 200 })]);
  const texto = await comEnv(SUPA, () => baixarTextoPeloGateway(DECK, fetchImpl));
  assert.equal(texto, "## Parte 2");

  assert.equal(chamadas[0].url, GATEWAY);
  assert.equal(chamadas[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(chamadas[0].init.body)), { paths: [DECK] });
  assert.equal((chamadas[0].init.headers as Record<string, string>).Authorization, "Bearer chave-de-servico");

  assert.equal(chamadas[1].url, LINK);
  assert.equal(chamadas[1].init.redirect, "follow");
  // O 302 aponta para o R2: a chave de servico nao pode ir neste pedido.
  assert.equal(chamadas[1].init.headers, undefined);
});

test("baixarTextoPeloGateway: caminho desconhecido ou 404 vira null, outro erro lanca, sem env nem chama", async () => {
  const desconhecido = fetchFalso([semLink()]);
  assert.equal(await comEnv(SUPA, () => baixarTextoPeloGateway(DECK, desconhecido.fetchImpl)), null);
  assert.equal(desconhecido.chamadas.length, 1);

  const nao = fetchFalso([comLink(), new Response("", { status: 404 })]);
  assert.equal(await comEnv(SUPA, () => baixarTextoPeloGateway(DECK, nao.fetchImpl)), null);

  const quebrado = fetchFalso([comLink(), new Response("erro", { status: 502 })]);
  await assert.rejects(comEnv(SUPA, () => baixarTextoPeloGateway(DECK, quebrado.fetchImpl)));

  // Gateway publicado sem aceitar a chave: lanca, e `downloadStorageText` cai no Storage.
  const recusado = fetchFalso([new Response("nao", { status: 401 })]);
  await assert.rejects(comEnv(SUPA, () => baixarTextoPeloGateway(DECK, recusado.fetchImpl)), /401/);

  const sem = fetchFalso([]);
  assert.equal(await comEnv({ SUPABASE_URL: undefined }, () => baixarTextoPeloGateway(DECK, sem.fetchImpl)), null);
  assert.equal(sem.chamadas.length, 0);
});

test("linkDeLeitura pega o link mesmo se o gateway normalizou o caminho", async () => {
  const { fetchImpl } = fetchFalso([comLink()]);
  assert.equal(await comEnv(SUPA, () => linkDeLeitura(`/${DECK}`, fetchImpl)), LINK);
});

test("caminhoDoGateway so' reconhece o gateway deste projeto", async () => {
  await comEnv(SUPA, () => {
    assert.equal(caminhoDoGateway(`${GATEWAY}?path=fontes/classe-1/a%20b.pdf`), "fontes/classe-1/a b.pdf");
    assert.equal(caminhoDoGateway(`https://outro.supabase.co/functions/v1/storage-redirect?path=${DECK}`), null);
    assert.equal(caminhoDoGateway(`https://proj.supabase.co.exemplo.test/functions/v1/storage-redirect?path=${DECK}`), null);
    assert.equal(caminhoDoGateway(`${GATEWAY}?outro=1`), null);
    assert.equal(caminhoDoGateway("https://exemplo.test/a.pdf"), null);
  });
});

test("urlParaBaixar troca a URL do gateway pelo link e nao mexe em link externo", async () => {
  const gateway = fetchFalso([comLink()]);
  assert.equal(await comEnv(SUPA, () => urlParaBaixar(`${GATEWAY}?path=${DECK}`, gateway.fetchImpl)), LINK);

  const desconhecido = fetchFalso([semLink()]);
  assert.equal(await comEnv(SUPA, () => urlParaBaixar(`${GATEWAY}?path=${DECK}`, desconhecido.fetchImpl)), null);

  // Link de fora nao recebe a chave de servico: nem chega a chamar.
  const externo = fetchFalso([]);
  assert.equal(await comEnv(SUPA, () => urlParaBaixar("https://exemplo.test/a.pdf", externo.fetchImpl)), "https://exemplo.test/a.pdf");
  assert.equal(externo.chamadas.length, 0);
});

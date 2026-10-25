import assert from "node:assert/strict";
import test from "node:test";

import { assinarUrlsDoStorageNoTexto, urlsDoStorageQueExigemAssinatura } from "./urlsDoStorageNoTexto";

const BASE = "https://abc.supabase.co/storage/v1/object";

test("acha as URLs de bucket privado no markdown, publicas e autenticadas, sem repetir", () => {
  const md = [
    `![figura](${BASE}/authenticated/conteudos/prof/1/fig.png)`,
    `Veja ${BASE}/public/conteudo_aluno/classe-1/x.png.`,
    `<img src="${BASE}/public/perfil_fotos/a/b.jpg">`,
    `![de novo](${BASE}/authenticated/conteudos/prof/1/fig.png)`,
  ].join("\n");
  assert.deepEqual(urlsDoStorageQueExigemAssinatura(md), [
    `${BASE}/authenticated/conteudos/prof/1/fig.png`,
    `${BASE}/public/conteudo_aluno/classe-1/x.png`,
    `${BASE}/public/perfil_fotos/a/b.jpg`,
  ]);
});

test("bucket publico de verdade, URL ja assinada e texto sem URL ficam de fora", () => {
  const md = [
    `![slide](${BASE}/public/trailup-slides/a.png)`,
    `![ok](${BASE}/sign/conteudos/a.png?token=t)`,
    "texto sem link nenhum",
  ].join("\n");
  assert.deepEqual(urlsDoStorageQueExigemAssinatura(md), []);
  assert.deepEqual(urlsDoStorageQueExigemAssinatura(""), []);
  assert.deepEqual(urlsDoStorageQueExigemAssinatura(null), []);
});

test("troca cada URL privada pela assinada, em todas as ocorrencias", async () => {
  const url = `${BASE}/authenticated/conteudos/prof/1/fig.png`;
  const md = `![a](${url})\n\n![b](${url})`;
  const pedidas: string[] = [];
  const out = await assinarUrlsDoStorageNoTexto(md, async (u) => {
    pedidas.push(u);
    return `${BASE}/sign/conteudos/prof/1/fig.png?token=T`;
  });
  assert.deepEqual(pedidas, [url]);
  assert.equal(out, `![a](${BASE}/sign/conteudos/prof/1/fig.png?token=T)\n\n![b](${BASE}/sign/conteudos/prof/1/fig.png?token=T)`);
});

test("a que nao assina (erro ou vazio) fica como estava, sem derrubar o texto", async () => {
  const boa = `${BASE}/public/conteudos/p/boa.png`;
  const ruim = `${BASE}/public/conteudos/p/ruim.png`;
  const md = `![1](${boa}) ![2](${ruim})`;
  const out = await assinarUrlsDoStorageNoTexto(md, async (u) => {
    if (u === ruim) throw new Error("sem permissao");
    return `${u}?assinada`;
  });
  assert.equal(out, `![1](${boa}?assinada) ![2](${ruim})`);
  assert.equal(await assinarUrlsDoStorageNoTexto(md, async () => null), md);
});

test("URL que e' prefixo de outra nao estraga a maior", async () => {
  const curta = `${BASE}/public/conteudos/p/a.png`;
  const longa = `${BASE}/public/conteudos/p/a.png.bak`;
  const out = await assinarUrlsDoStorageNoTexto(`${curta} e ${longa}`, async (u) => `${u}#S`);
  assert.equal(out, `${curta}#S e ${longa}#S`);
});

test("sem URL privada nao chama quem assina", async () => {
  let chamadas = 0;
  const md = "# Titulo\n\nnada aqui";
  assert.equal(await assinarUrlsDoStorageNoTexto(md, async () => { chamadas += 1; return "x"; }), md);
  assert.equal(chamadas, 0);
});

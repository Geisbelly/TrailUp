import assert from "node:assert/strict";
import test from "node:test";

import { extensaoDoMime, nomeDoArquivoDeFoto, refDeImagem } from "./fotoPerfil";
import { limparCacheDeImagens, resolverUrlDeImagem, urlDeImagemEmCache } from "./imagemPrivada";

const UID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

test("ref nova e URLs antigas do Storage viram {bucket, caminho}", () => {
  assert.deepEqual(refDeImagem(`perfil_fotos/${UID}/1.jpg`), { bucket: "perfil_fotos", caminho: `${UID}/1.jpg` });
  assert.deepEqual(
    refDeImagem(`https://x.supabase.co/storage/v1/object/public/banners_fotos/${UID}-17.png?v=2#a`),
    { bucket: "banners_fotos", caminho: `${UID}-17.png` },
  );
  assert.deepEqual(
    refDeImagem(`https://x.supabase.co/storage/v1/object/sign/perfil_fotos/a%20b.jpg?token=t`),
    { bucket: "perfil_fotos", caminho: "a b.jpg" },
  );
});

test("o que nao e' foto do Storage nao vira ref", () => {
  assert.equal(refDeImagem("https://x.supabase.co/storage/v1/object/public/conteudos/a.jpg"), null);
  assert.equal(refDeImagem("file:///data/perfil_fotos/a.jpg"), null);
  assert.equal(refDeImagem("blob:https://app/123"), null);
  assert.equal(refDeImagem("https://cdn.com/perfil_fotos/a.jpg"), null);
  assert.equal(refDeImagem("outro_bucket/a.jpg"), null);
  assert.equal(refDeImagem("perfil_fotos/"), null);
  assert.equal(refDeImagem("perfil_fotos/../x"), null);
  assert.equal(refDeImagem(null), null);
});

test("nome do arquivo fica na pasta do aluno, com extensao pelo mime", () => {
  assert.equal(nomeDoArquivoDeFoto(UID, "image/png", 1700), `${UID}/1700.png`);
  assert.equal(nomeDoArquivoDeFoto(UID, "image/jpeg; charset=x", 1), `${UID}/1.jpg`);
  assert.equal(extensaoDoMime("application/octet-stream"), "jpg");
});

test("assina uma vez, reaproveita do cache e renova perto de expirar", async () => {
  limparCacheDeImagens();
  let relogio = 1_000_000;
  const pedidos: string[] = [];
  const assinar = async (bucket: string, caminho: string, segundos: number) => {
    pedidos.push(`${bucket}/${caminho}:${segundos}`);
    return `https://x/sign/${bucket}/${caminho}?n=${pedidos.length}`;
  };
  const ref = `perfil_fotos/${UID}/1.jpg`;
  const [a, b] = await Promise.all([
    resolverUrlDeImagem(ref, assinar, () => relogio),
    resolverUrlDeImagem(ref, assinar, () => relogio),
  ]);
  assert.equal(a, `https://x/sign/perfil_fotos/${UID}/1.jpg?n=1`);
  assert.equal(b, a);
  assert.equal(urlDeImagemEmCache(ref, relogio), a);
  assert.deepEqual(pedidos, [`perfil_fotos/${UID}/1.jpg:3600`]);
  relogio += 56 * 60 * 1000;
  assert.equal(urlDeImagemEmCache(ref, relogio), null);
  assert.equal(await resolverUrlDeImagem(ref, assinar, () => relogio), `https://x/sign/perfil_fotos/${UID}/1.jpg?n=2`);
});

test("valor que nao e' ref passa direto; falha de assinatura vira null", async () => {
  limparCacheDeImagens();
  const assinar = async () => {
    throw new Error("rls");
  };
  assert.equal(await resolverUrlDeImagem("file:///tmp/a.jpg", assinar), "file:///tmp/a.jpg");
  assert.equal(urlDeImagemEmCache("https://cdn.com/a.jpg"), "https://cdn.com/a.jpg");
  assert.equal(await resolverUrlDeImagem(`banners_fotos/${UID}/1.jpg`, assinar), null);
});

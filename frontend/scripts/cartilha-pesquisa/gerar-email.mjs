// Grava scripts/apps-script-formulario-professores/CartilhaNoEmail.gs: a cartilha em HTML e em
// texto para o corpo do e-mail de acesso, a partir de src/features/pesquisa/cartilhaNoEmail.ts.
//
// Uso (na pasta frontend):
//   node scripts/cartilha-pesquisa/gerar-email.mjs
// Depois, cole o CartilhaNoEmail.gs no projeto do Apps Script (arquivo com o mesmo nome).
// O teste cartilhaNoEmail.test.ts falha enquanto o .gs estiver atrás da cartilha.

import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(AQUI, "../..");
const SAIDA = resolve(FRONTEND, "../scripts/apps-script-formulario-professores/CartilhaNoEmail.gs");

const tmp = await mkdtemp(join(tmpdir(), "cartilha-email-"));
const arquivo = join(tmp, "cartilhaNoEmail.mjs");
await build({
  entryPoints: [join(FRONTEND, "src/features/pesquisa/cartilhaNoEmail.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: arquivo,
  logLevel: "silent",
});
const { arquivoGsDaCartilha } = await import(pathToFileURL(arquivo).href);
await rm(tmp, { recursive: true, force: true });

const conteudo = arquivoGsDaCartilha();
await writeFile(SAIDA, conteudo);
console.log(`${SAIDA}: ${(Buffer.byteLength(conteudo) / 1024).toFixed(1)} KB`);

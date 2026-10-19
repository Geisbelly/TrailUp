import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashDoConteudo, renomearScriptsPorConteudo } from "./aluno-web-hash.mjs";

function montarExport(arquivos) {
  const dir = mkdtempSync(join(tmpdir(), "aluno-web-"));
  const js = join(dir, "_expo", "static", "js", "web");
  mkdirSync(js, { recursive: true });
  const tags = [];
  for (const [nome, conteudo, hash] of arquivos) {
    const h = hash ?? hashDoConteudo(Buffer.from(conteudo));
    writeFileSync(join(js, `${nome}-${h}.js`), conteudo);
    tags.push(`<script src="/aluno/_expo/static/js/web/${nome}-${h}.js" defer></script>`);
  }
  writeFileSync(join(dir, "index.html"), `<html><body>${tags.join("")}</body></html>`);
  return { dir, js };
}

describe("renomearScriptsPorConteudo", () => {
  it("entry com o mesmo nome e conteúdo novo ganha nome novo (cache do deploy anterior não serve mais)", () => {
    const hashAntigo = "436bf094a99b719a9406e0b60dc805bf";
    const { dir, js } = montarExport([
      ["__common", "var common=1;"],
      ["entry", 'var chunks={"692":"/aluno/_expo/static/js/web/_layout-novo.js"};', hashAntigo],
    ]);

    const renomeados = renomearScriptsPorConteudo(dir);

    const novo = readdirSync(js).find((f) => f.startsWith("entry-"));
    const real = hashDoConteudo(readFileSync(join(js, novo)));
    expect(novo).toBe(`entry-${real}.js`);
    expect(renomeados).toEqual([{ de: `entry-${hashAntigo}.js`, para: `entry-${real}.js` }]);
    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain(`/aluno/_expo/static/js/web/entry-${real}.js`);
    expect(html).not.toContain(hashAntigo);
    expect(readdirSync(js)).not.toContain(`entry-${hashAntigo}.js`);
  });

  it("scripts cujo nome já bate com o conteúdo ficam como estão", () => {
    const { dir, js } = montarExport([
      ["__expo-metro-runtime", "var r=1;"],
      ["entry", "var e=2;"],
    ]);
    const antes = readFileSync(join(dir, "index.html"), "utf8");
    const arquivos = readdirSync(js).sort();

    expect(renomearScriptsPorConteudo(dir)).toEqual([]);
    expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(antes);
    expect(readdirSync(js).sort()).toEqual(arquivos);
  });
});

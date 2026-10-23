import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

/**
 * Arquivo de teste NÃO pode morar em `src/app`.
 *
 * O expo-router monta as rotas com `require.context` sobre essa pasta inteira: tudo que está lá
 * entra no bundle do app. Um `.test.ts` ali arrasta `node:test` para dentro do pacote, e o
 * build quebra com "Unable to resolve node:test" — **só no `expo export`**, nunca nos testes,
 * que rodam no Node e acham o módulo normalmente.
 *
 * Aconteceu de verdade: `src/app/perfilColunaGrudada.test.ts` passou em 984 testes e derrubou
 * o bundle de produção. Este guarda custa 5 ms e cobre o ponto cego inteiro.
 */
const APP = join(process.cwd(), "src", "app");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test("nenhum arquivo de teste dentro de src/app", () => {
  const intrusos = arquivos(APP)
    .filter((c) => /\.(test|spec)\.[jt]sx?$/.test(c))
    .map((c) => relative(process.cwd(), c));

  assert.deepEqual(
    intrusos,
    [],
    "o expo-router empacota src/app inteiro; mova para src/utils, src/styles ou ao lado do componente:\n  " +
      intrusos.join("\n  "),
  );
});

test("nenhum modulo so-de-Node e importado de dentro de src/app", () => {
  // Mesma raiz, outra forma: `node:fs` num arquivo de rota tambem quebra o bundle.
  const SO_DE_NODE = /from\s+["']node:(test|fs|path|assert|os|child_process)["']/;
  const culpados = arquivos(APP)
    .filter((c) => [".ts", ".tsx"].includes(extname(c)))
    .filter((c) => SO_DE_NODE.test(readFileSync(c, "utf8")))
    .map((c) => relative(process.cwd(), c));

  assert.deepEqual(culpados, [], "modulo de Node nao existe no navegador nem no aparelho");
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Todo arquivo .test.ts(x) tem de estar em ALGUM script de teste.
 *
 * Diferente dos outros serviços, aqui a lista de testes é escrita à mão no
 * `package.json` — `node --test` recebe cada caminho. O resultado previsível:
 * em 2026-10-01 havia 24 arquivos de teste no disco que nunca rodavam, 104
 * casos, incluindo a guarda de mojibake (`semMojibake.test.ts`) e os testes do
 * ciclo de sessão de telemetria (`cicloSessao.test.ts`). Todos passavam —
 * ninguém os executava.
 *
 * A lista é à mão de propósito: um glob `src/**\/*.test.ts` roda tudo junto, e
 * alguns grupos compartilham estado e se poluem. Então a lista fica, e este
 * teste cobre o buraco que ela abre.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACOTE = JSON.parse(
  readFileSync(resolve(RAIZ, "..", "package.json"), "utf8")
) as { scripts: Record<string, string> };

function arquivosDeTeste(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeTeste(caminho);
    return /\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

test("nenhum arquivo de teste fica de fora dos scripts do package.json", () => {
  const registrados = new Set(
    Object.entries(PACOTE.scripts)
      .filter(([nome]) => nome === "test" || nome.startsWith("test:"))
      .flatMap(([, comando]) => comando.match(/src\/\S+?\.tsx?/g) ?? [])
  );

  const orfaos = arquivosDeTeste(RAIZ)
    .map((caminho) => `src/${relative(RAIZ, caminho).split("\\").join("/")}`)
    .filter((caminho) => !registrados.has(caminho))
    .sort();

  assert.deepEqual(
    orfaos,
    [],
    `teste no disco que nenhum script roda:\n${orfaos.join("\n")}`
  );
});

test("nenhum script aponta para arquivo de teste que nao existe", () => {
  const noDisco = new Set(
    arquivosDeTeste(RAIZ).map(
      (caminho) => `src/${relative(RAIZ, caminho).split("\\").join("/")}`
    )
  );

  const fantasmas = Object.entries(PACOTE.scripts)
    .filter(([nome]) => nome === "test" || nome.startsWith("test:"))
    .flatMap(([, comando]) => comando.match(/src\/\S+?\.tsx?/g) ?? [])
    .filter((caminho) => !noDisco.has(caminho))
    .sort();

  // Caminho morto num script faz o `node --test` abortar o grupo inteiro.
  assert.deepEqual(fantasmas, [], `script aponta para arquivo inexistente: ${fantasmas}`);
});

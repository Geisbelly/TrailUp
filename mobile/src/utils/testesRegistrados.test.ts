import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Cada arquivo de teste deve aparecer em exatamente um manifesto. Listas por
 * linha evitam que PRs independentes disputem a mesma linha do package.json;
 * grupos separados mantêm o isolamento necessário entre suites.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACOTE = JSON.parse(
  readFileSync(resolve(RAIZ, "..", "package.json"), "utf8")
) as { scripts: Record<string, string> };
const DIRETORIO_LISTAS = resolve(RAIZ, "..", "testes");
const GRUPOS = [
  "principal",
  "social-chat",
  "class-selection",
  "engagement",
  "presence",
  "trail-resume",
] as const;

function arquivosDeTeste(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeTeste(caminho);
    return /\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

function lerManifesto(grupo: string): string[] {
  return readFileSync(resolve(DIRETORIO_LISTAS, `${grupo}.txt`), "utf8")
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith("#"));
}

const caminhoRelativo = (caminho: string) =>
  `src/${relative(RAIZ, caminho).split("\\").join("/")}`;

test("todo arquivo de teste esta registrado e nenhum grupo repete caminhos", () => {
  const registrosPorGrupo = GRUPOS.map((grupo) => [grupo, lerManifesto(grupo)] as const);
  const registrados = new Set(registrosPorGrupo.flatMap(([, caminhos]) => caminhos));
  const orfaos = arquivosDeTeste(RAIZ)
    .map(caminhoRelativo)
    .filter((caminho) => !registrados.has(caminho))
    .sort();
  const duplicadosPorGrupo = registrosPorGrupo.flatMap(([grupo, caminhos]) => {
    const vistos = new Set<string>();
    return caminhos
      .filter((caminho) => {
        if (vistos.has(caminho)) return true;
        vistos.add(caminho);
        return false;
      })
      .map((caminho) => `${grupo}: ${caminho}`);
  });

  assert.deepEqual(orfaos, [], `testes fora dos manifestos:\n${orfaos.join("\n")}`);
  assert.deepEqual(
    duplicadosPorGrupo,
    [],
    `caminhos repetidos no mesmo grupo:\n${duplicadosPorGrupo.join("\n")}`
  );
});

test("manifestos so apontam para arquivos de teste existentes", () => {
  const noDisco = new Set(arquivosDeTeste(RAIZ).map(caminhoRelativo));
  const fantasmas = GRUPOS.flatMap((grupo) => lerManifesto(grupo))
    .filter((caminho) => !noDisco.has(caminho))
    .sort();

  assert.deepEqual(
    fantasmas,
    [],
    `manifesto aponta para arquivo inexistente:\n${fantasmas.join("\n")}`
  );
});

test("cada grupo tem script npm correspondente e manifesto nao vazio", () => {
  const semScript = GRUPOS.filter(
    (grupo) => !PACOTE.scripts[`test${grupo === "principal" ? "" : `:${grupo}`}`]
  );
  const vazios = GRUPOS.filter((grupo) => lerManifesto(grupo).length === 0);

  assert.deepEqual(semScript, [], `grupos sem script npm: ${semScript}`);
  assert.deepEqual(vazios, [], `grupos sem testes: ${vazios}`);
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = resolve(fileURLToPath(new URL("..", import.meta.url)));
const grupos = new Set([
  "principal",
  "social-chat",
  "class-selection",
  "engagement",
  "presence",
  "trail-resume",
]);
const grupo = process.argv[2] ?? "principal";

if (!grupos.has(grupo)) {
  console.error(`Grupo de testes desconhecido: ${grupo}`);
  process.exit(2);
}

const manifesto = resolve(raiz, "testes", `${grupo}.txt`);
const caminhos = (await readFile(manifesto, "utf8"))
  .split(/\r?\n/)
  .map((linha) => linha.trim())
  .filter((linha) => linha && !linha.startsWith("#"));

if (caminhos.length === 0) {
  console.error(`Grupo de testes vazio: ${grupo}`);
  process.exit(2);
}

const resultado = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...caminhos],
  { cwd: raiz, stdio: "inherit" }
);

if (resultado.error) throw resultado.error;
process.exit(resultado.status ?? 1);

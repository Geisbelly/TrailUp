import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Português salvo em UTF-8 e lido de volta como Windows-1252 vira mojibake:
 * o "ó" (bytes C3 B3) vira os dois caracteres "Ã" e "³". O CLAUDE.md exige
 * UTF-8 sem BOM, e mojibake já foi commitado mais de uma vez.
 *
 * O padrão procura o byte inicial (Â ou Ã; â nas sequências de 3 bytes, como
 * o travessão) seguido de byte(s) de continuação — nunca a letra sozinha:
 * "NÃO", "QUESTÃO" e "câmera" são português correto.
 *
 * Os caracteres corrompidos são montados por código (`cp`) para que este
 * arquivo não contenha mojibake e não acuse a si mesmo.
 */
const cp = (...codigos: number[]) => String.fromCharCode(...codigos);

/** Bytes 0x80–0x9F como o Windows-1252 os mostra (os indefinidos ficam na faixa crua). */
const ESPECIAIS_CP1252 = cp(
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
);
const CONTINUACAO = `[${cp(0x80)}-${cp(0xbf)}${ESPECIAIS_CP1252}]`;
const MOJIBAKE = new RegExp(`[${cp(0xc2, 0xc3)}]${CONTINUACAO}|${cp(0xe2)}${CONTINUACAO}${CONTINUACAO}`);

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSOES = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md"]);

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return EXTENSOES.has(extname(nome)) ? [caminho] : [];
  });
}

test("nenhum arquivo de mobile/src tem mojibake (UTF-8 lido como Windows-1252)", () => {
  const achados: string[] = [];
  for (const arquivo of arquivos(RAIZ)) {
    readFileSync(arquivo, "utf8")
      .split("\n")
      .forEach((linha, indice) => {
        if (MOJIBAKE.test(linha)) {
          achados.push(`${relative(RAIZ, arquivo)}:${indice + 1}: ${linha.trim().slice(0, 90)}`);
        }
      });
  }
  assert.deepEqual(achados, []);
});

test("o detector pega o texto corrompido e poupa o português correto", () => {
  // "Tópico" e "fim —" depois de passar por Windows-1252.
  assert.match(`T${cp(0xc3, 0xb3)}pico`, MOJIBAKE);
  assert.match(`fim ${cp(0xe2, 0x20ac, 0x201d)}`, MOJIBAKE);
  for (const certo of ["Tópico", "não", "NÃO", "QUESTÃO", "PERSONALIZAÇÃO", "câmera", "você", "—"]) {
    assert.doesNotMatch(certo, MOJIBAKE, certo);
  }
});

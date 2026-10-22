import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Os blocos de material são a tela em que o aluno passa o tempo de estudo, e têm de parecer o
 * mesmo produto. A fonte do sistema sai de `FontFamily` (`styles/GlobalStyle`), que resolve por
 * plataforma — sem ela o texto cai no padrão do SO, e aí o mesmo bloco tem uma cara no iPhone,
 * outra no Android e outra na web.
 *
 * O `VideoPlayer` não importava `FontFamily` em estilo nenhum (0 de 9) enquanto o
 * `PresentationSlidesBlock` usava em 13. É o tipo de divergência que não aparece em typecheck
 * nem em teste de comportamento: só na tela, e só para quem compara dois blocos lado a lado.
 *
 * Convenção dos blocos: título em `inikaBold` (serifa ornamental), corpo em `interMedium`.
 */
const BLOCOS = [
  "funcionais/AudioPlayer.tsx",
  "funcionais/VideoPlayer.tsx",
  "PresentationSlidesBlock.tsx",
  "StudyCardsBlock.tsx",
];

const RAIZ = join(process.cwd(), "src", "components");

/** Cada `nome: { ... }` de primeiro nível dentro de um StyleSheet do arquivo. */
function estilos(texto: string): [string, string][] {
  return [...texto.matchAll(/^ {2}(\w+): \{\n(.*?)^ {2}\},/gms)].map((m) => [m[1], m[2]]);
}

for (const bloco of BLOCOS) {
  const texto = readFileSync(join(RAIZ, bloco), "utf8");

  test(`${bloco}: todo estilo de texto declara a fonte do sistema`, () => {
    const semFonte = estilos(texto)
      .filter(([, corpo]) => /fontSize|fontWeight/.test(corpo) && !corpo.includes("fontFamily"))
      .map(([nome]) => nome);

    assert.deepEqual(semFonte, [], `estilos de texto sem FontFamily: ${semFonte.join(", ")}`);
  });

  test(`${bloco}: a fonte vem de FontFamily, nao de string solta`, () => {
    // `fontFamily: "Georgia"` passaria no teste acima e furaria a resolução por plataforma.
    const soltas = estilos(texto)
      .filter(([, corpo]) => /fontFamily:\s*["']/.test(corpo))
      .map(([nome]) => nome);

    assert.deepEqual(soltas, [], `fonte escrita à mão em: ${soltas.join(", ")}`);
  });
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Os botões do tópico pintam com a paleta do perfil, e a cor NÃO pode morar no stylesheet.
 *
 * "Guardar na Bag" era o único secundário que só trocava a borda: o preenchimento vinha de
 * `Color.colorDarkslategray200` no estilo, então numa tela azul de conqueror ele aparecia como
 * um bloco roxo-escuro. O texto do botão principal era `Color.colorWhite` fixo sobre o accent —
 * em perfil de accent claro (achiever dourado, survivor cinza) branco sobre claro não passa
 * contraste. O par que `paletaPorPerfil.test.ts` mede é `background` sobre `accent`.
 */
const ESTILOS = readFileSync(join(process.cwd(), "src", "styles", "trilhaTopicoStyles.ts"), "utf8");
const TELA = readFileSync(join(process.cwd(), "src", "app", "(tabs)", "trilha", "[id].tsx"), "utf8");

/** O corpo de um estilo de primeiro nível do StyleSheet. */
function estilo(nome: string): string {
  const achado = new RegExp(`^ {2}${nome}: \\{\\n(.*?)^ {2}\\},`, "ms").exec(ESTILOS);
  assert.ok(achado, `estilo ${nome} sumiu do stylesheet`);
  return achado[1];
}

for (const nome of ["button", "secondaryButton", "buttonText", "secondaryButtonText"]) {
  test(`${nome} nao carrega cor propria`, () => {
    const corpo = estilo(nome);
    for (const chave of ["backgroundColor", "color", "borderColor"]) {
      assert.ok(
        !corpo.includes(chave),
        `${nome} define ${chave} no estilo — a cor tem de vir da paleta no ponto de uso`
      );
    }
  });
}

test("todo uso de secondaryButton preenche com a paleta", () => {
  // Um `styles.secondaryButton` sem `backgroundColor` logo em seguida volta a herdar cor fixa
  // se alguem repuser um default -- e foi exatamente assim que a Bag ficou roxa.
  const usos = [...TELA.matchAll(/styles\.secondaryButton,\n([\s\S]{0,320}?)\]/g)];
  // Eram 3 com o "Guardar na Bag"; ele virou os ícones discretos de `botaoBagIcone` (06/11).
  assert.ok(usos.length >= 2, `esperava ao menos 2 usos, achei ${usos.length}`);
  usos.forEach((uso, i) => {
    assert.ok(
      /backgroundColor: profilePalette\./.test(uso[1]),
      `uso #${i + 1} de secondaryButton nao define backgroundColor da paleta`
    );
  });
});

test("o texto do botao principal usa o par de contraste testado", () => {
  assert.ok(
    TELA.includes("styles.buttonText, { color: profilePalette.background }"),
    "texto do principal precisa ser `background` sobre o accent, nao branco fixo"
  );
});

test("o fundo do botao principal continua sendo o accent do perfil", () => {
  assert.ok(TELA.includes("backgroundColor: profilePalette.accent"), "o principal perdeu o accent");
});

test("os ícones da Bag no tópico pintam com a paleta, não com cor fixa", () => {
  const corpo = estilo("botaoBagIcone");
  for (const chave of ["backgroundColor", "color", "borderColor"]) {
    assert.ok(!corpo.includes(chave), `botaoBagIcone define ${chave} no estilo`);
  }
  const usos = [...TELA.matchAll(/styles\.botaoBagIcone, \{ borderColor: profilePalette\./g)];
  assert.equal(usos.length, 2, "salvar material e criar anotação: os dois com a borda da paleta");
});

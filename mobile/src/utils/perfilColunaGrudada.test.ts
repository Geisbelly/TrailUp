import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Na web em tela larga o Perfil tem duas colunas dentro do MESMO `ScrollView`: identidade
 * (flex 4) e conteúdo (flex 8). A identidade é bem mais curta — medido no navegador, 631 px
 * contra 1989 px —, então rolando as duas juntas a esquerda acabava e deixava meia tela vazia
 * ao lado do que ainda estava rolando.
 *
 * A correção é `position: sticky`. O que estes testes protegem é o que sumiria num refactor
 * sem ninguém notar, porque não quebra nada: o estilo deixar de ser aplicado, ou o `top` sumir
 * (sticky sem `top` não gruda em lugar nenhum).
 *
 * Medido no navegador depois da mudança:
 *   coluna esquerda -> position: sticky, top: 16px, maxHeight: 900px, overflowY: auto
 *   coluna direita  -> position: relative, altura 1989px
 */
const TELA = readFileSync(join(process.cwd(), "src", "app", "(tabs)", "perfil", "index.tsx"), "utf8");

function estilo(nome: string): string {
  const achado = new RegExp(`^ {2}${nome}: \\{\\n(.*?)^ {2}\\},`, "ms").exec(TELA);
  assert.ok(achado, `estilo ${nome} sumiu`);
  return achado[1];
}

test("a coluna da identidade gruda no topo", () => {
  const corpo = estilo("colunaIdentidadeGrudada");
  assert.ok(corpo.includes('position: "sticky"'), "sem sticky a coluna volta a rolar junto");
  assert.ok(/top: \d+/.test(corpo), "sticky sem `top` nao gruda em lugar nenhum");
});

test("identidade mais alta que a janela ainda rola por dentro", () => {
  // E' o modo de falha do sticky: sem `maxHeight` + `overflowY`, o fim de uma coluna alta
  // fica inalcancavel, porque ela nao rola junto nem rola sozinha.
  const corpo = estilo("colunaIdentidadeGrudada");
  assert.ok(corpo.includes("maxHeight"), "falta o teto de altura");
  assert.ok(corpo.includes("overflowY"), "falta deixar a propria coluna rolar");
});

test("o estilo e aplicado na coluna, e so na da identidade", () => {
  assert.ok(
    TELA.includes("styles.colunaIdentidade, styles.colunaIdentidadeGrudada"),
    "o estilo existe mas nao foi aplicado"
  );
  // A coluna de conteudo e' a que ROLA: grudar as duas nao deixaria nada rolar.
  assert.ok(
    !/colunaPrincipal, styles\.colunaIdentidadeGrudada/.test(TELA),
    "a coluna de conteudo nao pode grudar"
  );
});

test("so a web larga ve isso", () => {
  // `position: sticky` nao existe no React Native. O bloco das colunas inteiro esta' atras de
  // `desktop ?`, entao o celular nunca monta este ramo.
  const colunas = TELA.indexOf("styles.colunas");
  const desktopAntes = TELA.lastIndexOf("desktop ? (", colunas);
  assert.ok(desktopAntes > 0 && colunas - desktopAntes < 200, "as colunas sairam de tras do `desktop ?`");
});

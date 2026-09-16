import assert from "node:assert/strict";
import test from "node:test";

import tinycolor from "tinycolor2";

import { Fontes, Noite, Texto } from "./identidade";
// `GlobalStyle.ts` nao importa mais react-native: a pilha de fontes por
// `Platform` saiu quando as familias viraram nomes de fonte carregada. Sem
// stub, entao — import direto.
import { Color, FontFamily } from "./GlobalStyle";

const razao = (a: string, b: string) => tinycolor.readability(a, b);

test("o fundo das telas e' o chao novo, nao o #111936 antigo", () => {
  // `Color.background` pinta a pagina da trilha, do ranking, das notificacoes e
  // do topico (16 lugares). Enquanto ele nao mudasse, trocar a paleta do PERFIL
  // nao aparecia na tela: o app continuava com o chao antigo.
  assert.equal(Color.background, Noite.n900);
  assert.notEqual(Color.background.toLowerCase(), "#111936");
});

test("as superficies legadas apontam para a escada da identidade", () => {
  const daEscada = new Set<string>(Object.values(Noite));
  for (const chave of [
    "colorGray",
    "colorDarkslateblue",
    "colorMidnightblue100",
    "colorDarkslategray",
    "colorDarkslategray100",
    "colorDarkslategray200",
  ] as const) {
    assert.ok(
      daEscada.has(Color[chave]),
      `${chave} = ${Color[chave]} nao esta na escada Noite`
    );
  }
});

test("o texto secundario deixou de reprovar em contraste", () => {
  // `colorSlategray` era `#5d6579` e dava 2,96 sobre o fundo antigo, usado como
  // `color:` em 27 lugares. Reprovava em AA desde antes desta migracao.
  assert.equal(Color.colorSlategray, Texto.medio);
  assert.ok(razao("#5d6579", "#111936") < 4.5, "premissa mudou");
  assert.ok(razao(Color.colorSlategray, Color.background) >= 4.5);
});

test("todo texto legado passa em AA sobre o chao novo", () => {
  const comoTexto = [
    Color.colorAliceblue,
    Color.colorAliceblue100,
    Color.colorSlategray,
    Color.colorBlueviolet100,
    Color.colorWhite,
  ];
  for (const cor of comoTexto) {
    for (const fundo of [Color.background, Noite.n800, Noite.n700]) {
      const r = razao(cor, fundo);
      assert.ok(r >= 4.5, `${cor} da ${r.toFixed(2)} sobre ${fundo}`);
    }
  }
});

test("o accent de fallback manteve a matiz roxa, so subiu a luminosidade", () => {
  // A regra do repo e' elevar luminosidade HSL, nunca misturar com branco —
  // misturar "apaga" a cor mesmo passando no contraste.
  const antes = tinycolor("#9747ff").toHsl();
  const depois = tinycolor(Color.colorBlueviolet100).toHsl();
  assert.ok(Math.abs(antes.h - depois.h) < 2, "a matiz mudou");
  assert.ok(depois.l > antes.l, "a luminosidade deveria ter subido");
  assert.ok(depois.s > 0.5, "saturacao caiu: parece mistura com branco");
});


test("FontFamily aponta para familias que a identidade declara", () => {
  // Um typo aqui nao quebra nada: o React Native cai na fonte do sistema e o
  // app renderiza inteiro, so' que com a tipografia errada. E' um defeito que
  // so' aparece olhando o aparelho — por isso vira teste.
  const declaradas = new Set<string>(Object.values(Fontes));
  for (const [chave, familia] of Object.entries(FontFamily)) {
    assert.ok(declaradas.has(familia), `${chave} = ${familia} nao esta em Fontes`);
  }
});

test("a serifa saiu de todas as chaves", () => {
  const serifas = ["Georgia", "Palatino", "serif"];
  for (const [chave, familia] of Object.entries(FontFamily)) {
    assert.ok(
      !serifas.some((s) => familia.toLowerCase().includes(s.toLowerCase())),
      `${chave} ainda aponta para serifa: ${familia}`
    );
  }
});

test("titulo e corpo sao familias diferentes", () => {
  // Hoje as tres chaves ornamentais apontavam para a MESMA serifa do corpo:
  // a hierarquia vinha so' do tamanho. Jost x Karla e' o que a devolve.
  assert.notEqual(FontFamily.inikaBold, FontFamily.interMedium);
});

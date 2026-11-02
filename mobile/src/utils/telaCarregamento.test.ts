import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import tinycolor from "tinycolor2";
import * as nucleo from "./telaCarregamento";
import {
  CARREGAMENTO_POR_PERFIL,
  FUNDO_DO_SPLASH,
  INTENSIDADE_PARADA,
  MARCOS_NA_TRILHA,
  RITMO_MS,
  curvaDoMarco,
  escolherFrase,
  intensidadeEm,
  paletaDoCarregamento,
  perfilDoCarregamento,
  rotuloDoGuia,
  type ModoDoMarco,
  type PerfilDoCarregamento,
} from "./telaCarregamento";

const ASSINATURAS: Record<Exclude<PerfilDoCarregamento, "neutro">, string> = {
  seeker: "#17a398",
  survivor: "#4e5a66",
  daredevil: "#d7263d",
  mastermind: "#5b3fd9",
  conqueror: "#1e4fd6",
  socializer: "#f4623a",
  achiever: "#c9a227",
};
const PERFIS = Object.keys(ASSINATURAS) as Exclude<PerfilDoCarregamento, "neutro">[];
const TODAS: PerfilDoCarregamento[] = [...PERFIS, "neutro"];

for (const perfil of TODAS) {
  test(`${perfil}: todo texto da tela passa de 7:1 sobre o fundo e sobre o cartão`, () => {
    const p = paletaDoCarregamento(perfil);
    for (const [nome, cor] of Object.entries({ destaque: p.destaque, texto: p.texto, textoSuave: p.textoSuave })) {
      assert.ok(tinycolor.readability(cor, p.fundo) >= 7, `${perfil}.${nome} sobre fundo: ${tinycolor.readability(cor, p.fundo)}`);
      assert.ok(tinycolor.readability(cor, p.superficie) >= 7, `${perfil}.${nome} sobre cartão: ${tinycolor.readability(cor, p.superficie)}`);
    }
    // Marco apagado é componente de interface (1.4.11): 3:1 contra o fundo.
    assert.ok(tinycolor.readability(p.marcoApagado, p.fundo) >= 3, perfil);
  });
}

for (const perfil of PERFIS) {
  test(`${perfil}: o destaque é a cor-assinatura com a luminosidade elevada, não misturada com branco`, () => {
    const original = tinycolor(ASSINATURAS[perfil]).toHsl();
    const destaque = tinycolor(paletaDoCarregamento(perfil).destaque).toHsl();
    const distancia = Math.abs(destaque.h - original.h);
    assert.ok(Math.min(distancia, 360 - distancia) < 4, `${perfil}: matiz ${destaque.h} ≠ ${original.h}`);
    // Misturar com branco derrubaria a saturação; elevar L a mantém (tolerância de arredondamento do hex).
    assert.ok(Math.abs(destaque.s - original.s) < 0.04, `${perfil}: saturação ${destaque.s} ≠ ${original.s}`);
    assert.ok(destaque.l >= original.l, perfil);
  });
}

test("cada perfil tem um destaque diferente dos outros e da variante neutra", () => {
  const destaques = TODAS.map((perfil) => paletaDoCarregamento(perfil).destaque);
  assert.equal(new Set(destaques).size, TODAS.length, destaques.join(", "));
});

test("a variante neutra começa no fundo do splash nativo e mostra o cenário público", () => {
  const p = paletaDoCarregamento("neutro");
  assert.equal(p.fundo, FUNDO_DO_SPLASH);
  // HallBackground mostra o cenário público quando a paleta não tem perfil.
  assert.equal(p.base.profile, undefined);
  const appJson = JSON.parse(readFileSync(resolve(__dirname, "../../app.json"), "utf8"));
  assert.equal(appJson.expo.splash.backgroundColor.toLowerCase(), FUNDO_DO_SPLASH);
});

test("sem perfil conhecido, a tela é neutra; apelidos em PT-BR resolvem para o perfil", () => {
  assert.equal(perfilDoCarregamento(null), "neutro");
  assert.equal(perfilDoCarregamento(""), "neutro");
  assert.equal(perfilDoCarregamento("desconhecido"), "neutro");
  assert.equal(perfilDoCarregamento("Explorador"), "seeker");
  assert.equal(perfilDoCarregamento("Socialiser"), "socializer");
  assert.equal(rotuloDoGuia("neutro"), null);
  assert.equal(rotuloDoGuia("seeker"), "Explorador · Amara");
  assert.equal(rotuloDoGuia("socializer"), "Socializador · Mateo e Zuri");
});

test("o ritmo de cada perfil é o da assinatura editorial da API", () => {
  const python = readFileSync(resolve(__dirname, "../../../api/app/services/personalizacao.py"), "utf8");
  const bloco = python.slice(
    python.indexOf("_BRAINHEX_EDITORIAL_SIGNATURES"),
    python.indexOf("_BRAINHEX_GUIDE_PERSONAS"),
  );
  const nomeNaApi: Record<string, string> = {
    seeker: "Seeker", survivor: "Survivor", daredevil: "Daredevil", mastermind: "Mastermind",
    conqueror: "Conqueror", socializer: "Socialiser", achiever: "Achiever",
  };
  for (const perfil of PERFIS) {
    const trecho = bloco.slice(bloco.indexOf(`"${nomeNaApi[perfil]}": {`));
    const ritmo = /"ritmo":\s*"([^"]+)"/.exec(trecho)?.[1];
    const { movimento } = CARREGAMENTO_POR_PERFIL[perfil];
    assert.equal(movimento.ritmo, ritmo, perfil);
    assert.equal(movimento.cicloMs, RITMO_MS[movimento.ritmo], perfil);
  }
});

test("os 7 perfis se movem de jeitos distintos", () => {
  const assinaturas = PERFIS.map((perfil) => {
    const { modo, cicloMs } = CARREGAMENTO_POR_PERFIL[perfil].movimento;
    return `${modo}@${cicloMs}`;
  });
  assert.equal(new Set(assinaturas).size, PERFIS.length, assinaturas.join(", "));
});

test("toda voz tem frases e um aviso de demora, sem prometer o que a tela não faz", () => {
  for (const perfil of TODAS) {
    const { frases, demora } = CARREGAMENTO_POR_PERFIL[perfil].voz;
    assert.ok(frases.length >= 2, perfil);
    for (const frase of [...frases, demora]) {
      assert.ok(frase.trim().length > 0 && frase.length <= 90, `${perfil}: "${frase}"`);
      // A tela não salva nem tenta de novo: nenhuma frase pode dizer isso.
      assert.doesNotMatch(frase, /salv|tentando de novo|tentando novamente/i, `${perfil}: "${frase}"`);
    }
    assert.match(demora, /conex/i, perfil);
  }
});

test("escolherFrase nunca sai do intervalo", () => {
  for (const perfil of TODAS) {
    const { frases } = CARREGAMENTO_POR_PERFIL[perfil].voz;
    assert.equal(escolherFrase(perfil, 0), frases[0]);
    assert.equal(escolherFrase(perfil, 0.9999), frases[frases.length - 1]);
    assert.equal(escolherFrase(perfil, 1), frases[frases.length - 1]);
    assert.equal(escolherFrase(perfil, -1), frases[0]);
  }
});

const MODOS: ModoDoMarco[] = ["viajante", "respira", "passo", "par", "acumula"];
const AMOSTRAS = Array.from({ length: 1000 }, (_, k) => k / 999);

for (const modo of MODOS) {
  test(`${modo}: curvas válidas para o interpolate e todo marco acende`, () => {
    for (let i = 0; i < MARCOS_NA_TRILHA; i += 1) {
      const curva = curvaDoMarco(modo, i);
      assert.equal(curva.inputRange.length, curva.outputRange.length);
      assert.equal(curva.inputRange[0], 0, `${modo}#${i}`);
      assert.equal(curva.inputRange[curva.inputRange.length - 1], 1, `${modo}#${i}`);
      for (let k = 1; k < curva.inputRange.length; k += 1) {
        assert.ok(curva.inputRange[k] > curva.inputRange[k - 1], `${modo}#${i}: entrada não crescente`);
      }
      for (const v of curva.outputRange) assert.ok(v >= 0 && v <= 1, `${modo}#${i}: ${v}`);
      const maximo = Math.max(...AMOSTRAS.map((t) => intensidadeEm(curva, t)));
      assert.ok(maximo >= 0.95, `${modo}#${i} nunca acende (${maximo})`);
    }
  });
}

test("viajante e passo: a luz anda para a frente, de marco em marco", () => {
  for (const modo of ["viajante", "passo"] as const) {
    const curvas = Array.from({ length: MARCOS_NA_TRILHA }, (_, i) => curvaDoMarco(modo, i));
    // O marco mais aceso em cada trecho da volta é o daquele trecho.
    for (let i = 0; i < MARCOS_NA_TRILHA; i += 1) {
      const t = (i + 0.5) / MARCOS_NA_TRILHA;
      const intensidades = curvas.map((c) => intensidadeEm(c, t));
      assert.equal(intensidades.indexOf(Math.max(...intensidades)), i, `${modo} em t=${t}`);
    }
  }
});

test("passo: só um marco aceso por vez (degrau seco)", () => {
  const curvas = Array.from({ length: MARCOS_NA_TRILHA }, (_, i) => curvaDoMarco("passo", i));
  for (const t of AMOSTRAS) {
    const acesos = curvas.filter((c) => intensidadeEm(c, t) > 0.5).length;
    assert.ok(acesos <= 1 || [0.2, 0.4, 0.6, 0.8, 1].some((b) => Math.abs(t - b) < 0.002), `t=${t}: ${acesos}`);
  }
});

test("acumula: os marcos só se somam até o fim da volta, nunca regridem no meio", () => {
  const curvas = Array.from({ length: MARCOS_NA_TRILHA }, (_, i) => curvaDoMarco("acumula", i));
  let anterior = 0;
  for (const t of AMOSTRAS.filter((t) => t <= 0.85)) {
    const acesos = curvas.filter((c) => intensidadeEm(c, t) > 0.5).length;
    assert.ok(acesos >= anterior, `t=${t}: ${acesos} < ${anterior}`);
    anterior = acesos;
  }
  assert.equal(anterior, MARCOS_NA_TRILHA);
});

test("par: duas luzes, meia volta de distância", () => {
  const curvas = Array.from({ length: MARCOS_NA_TRILHA }, (_, i) => curvaDoMarco("par", i));
  // Com 5 marcos, quando uma luz está no 1º a outra cai entre o 3º e o 4º; os vizinhos da
  // primeira ficam apagados, então são duas luzes separadas e não uma luz larga.
  const t = 0.5 / MARCOS_NA_TRILHA;
  const [m0, m1, m2, m3, m4] = curvas.map((c) => intensidadeEm(c, t));
  assert.ok(m0 >= 0.99, `m0=${m0}`);
  assert.ok(m1 < 0.5 && m4 < 0.5, `vizinhos: ${m1}, ${m4}`);
  assert.ok(m2 > 0.5 && m3 > 0.5, `luz oposta: ${m2}, ${m3}`);
});

test("o quadro parado do movimento reduzido não sugere porcentagem", () => {
  assert.ok(INTENSIDADE_PARADA > 0 && INTENSIDADE_PARADA < 1);
});

test("transição: as fases cabem na volta e entram na ordem certa", () => {
  const f = nucleo.FASES_DA_TRANSICAO;
  for (const [nome, [ini, fim]] of Object.entries(f)) {
    assert.ok(ini >= 0 && fim <= 1 && ini < fim, `${nome}: [${ini}, ${fim}]`);
  }
  // O símbolo do perfil só aparece depois que o círculo começou a cobrir a tela...
  assert.ok(f.medalhaoEntra[0] > f.circulo[0]);
  // ...o texto vem depois do guia...
  assert.ok(f.textoEntra[0] > f.medalhaoEntra[0]);
  // ...o cenário só entra com a tela já coberta, e o círculo só some com o cenário entrando.
  assert.ok(f.fundoEntra[0] >= f.circulo[1]);
  assert.ok(f.circuloSai[0] > f.fundoEntra[0]);
  assert.equal(f.circuloSai[1], 1);
  // O círculo só nasce com a estrela quase apagada: antes, ele a cobriria e o giro sumiria.
  assert.ok(f.circulo[0] >= f.estrelaSai[0] + 0.7 * (f.estrelaSai[1] - f.estrelaSai[0]));
  // A estrela já saiu quando o símbolo do perfil termina de entrar.
  assert.ok(f.estrelaSai[1] <= f.medalhaoEntra[1]);
});

test("transição: só neutro → perfil anima, e nunca com movimento reduzido", () => {
  assert.equal(nucleo.deveAnimarTransicao("neutro", "seeker", false), true);
  assert.equal(nucleo.deveAnimarTransicao("neutro", "seeker", true), false);
  assert.equal(nucleo.deveAnimarTransicao("seeker", "achiever", false), false);
  assert.equal(nucleo.deveAnimarTransicao("seeker", "neutro", false), false);
  assert.equal(nucleo.deveAnimarTransicao("neutro", "neutro", false), false);
  // Primeira montagem já com perfil: nada para revelar.
  assert.equal(nucleo.deveAnimarTransicao(null, "seeker", false), false);
});

test("transição: o círculo nasce do tamanho da moldura e cobre a tela de qualquer ponto", () => {
  for (const [w, h] of [[320, 640], [390, 780], [1440, 900]]) {
    const { diametro, escalaInicial } = nucleo.circuloDaTransicao(140, w, h);
    assert.ok(Math.abs(diametro * escalaInicial - 140) < 1e-9, `${w}x${h}`);
    // Pior caso: centro num canto, o raio precisa chegar ao canto oposto.
    assert.ok(diametro / 2 >= Math.hypot(w, h) - 1e-9, `${w}x${h}`);
  }
  assert.equal(nucleo.circuloDaTransicao(140, 0, 0).escalaInicial, 1);
});

test("faseDaTransicao: parada antes, curva no trecho, parada depois", () => {
  const c = nucleo.faseDaTransicao([0.2, 0.6], 0.1, 1, nucleo.desacelerar);
  assert.equal(c.inputRange[0], 0);
  assert.equal(c.inputRange[c.inputRange.length - 1], 1);
  for (let k = 1; k < c.inputRange.length; k += 1) assert.ok(c.inputRange[k] > c.inputRange[k - 1]);
  assert.equal(nucleo.intensidadeEm(c, 0.1), 0.1);
  assert.equal(nucleo.intensidadeEm(c, 0.8), 1);
  // Ease-out: na metade do trecho já andou mais que a metade.
  assert.ok(nucleo.intensidadeEm(c, 0.4) > 0.1 + 0.9 * 0.5);
  const inteira = nucleo.faseDaTransicao([0, 1], 1, 0);
  assert.deepEqual([inteira.inputRange[0], inteira.inputRange[inteira.inputRange.length - 1]], [0, 1]);
});

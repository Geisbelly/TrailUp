// Configuração do Metro: a padrão do Expo, mais uma tradução.
//
// O MathJax 4 (`@mathjax/src`, usado pelo texto rico em `src/utils/textoRico/formulaParaSvg.ts`)
// importa por "subpath imports" do Node (`require("#default-font/svg/default.js")`,
// `require("#mhchem/mhchemParser.js")`), e o Metro não lê o campo `imports` do package.json. Sem
// isto o bundle quebra na primeira fórmula com "Unable to resolve module #default-font/…".
//
// A tradução vale só para quem importa de dentro de `@mathjax/src/cjs` e usa o mapa que o próprio
// pacote publica em `cjs/package.json`, então acompanha uma atualização do MathJax sozinha.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const PASTA_CJS = path.join("node_modules", "@mathjax", "src", "cjs") + path.sep;
const MAPA = Object.entries(require("@mathjax/src/cjs/package.json").imports ?? {}).map(([de, para]) => [
  de.replace(/\*$/, ""),
  para.replace(/\*$/, ""),
]);

const resolverAnterior = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, nome, plataforma) => {
  if (nome.startsWith("#") && context.originModulePath.includes(PASTA_CJS)) {
    const regra = MAPA.find(([de]) => nome.startsWith(de));
    if (regra) nome = regra[1] + nome.slice(regra[0].length);
  }
  return resolverAnterior
    ? resolverAnterior(context, nome, plataforma)
    : context.resolveRequest(context, nome, plataforma);
};

module.exports = config;

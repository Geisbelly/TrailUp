// Barra ciclo entre chunks do build de producao.
//
// Um ciclo entre chunks NAO falha o build do Vite: sai tudo verde e a tela
// morre so no navegador, com
//
//   Uncaught TypeError: Cannot read properties of undefined (reading 'forwardRef')
//     at vendor-*.js
//
// porque um chunk avalia antes do outro terminar e recebe React como
// `undefined`. Foi assim que o console do professor parou em producao: o
// `manualChunks` punha react-router junto do React, mas `scheduler`
// (dependencia do react-dom), `@remix-run/router` e o helper de interop CJS
// caiam no `vendor` generico -- e o `vendor` importava React de volta.
//
// Como o sintoma e invisivel em tempo de build, a checagem roda DEPOIS dele,
// no mesmo `npm run build` que o deploy executa.
//
// ESCOPO: so ciclo entre os chunks que o `manualChunks` cria (prefixo
// `vendor`). Ciclo entre chunks de codigo do APP e' saida normal do Rollup e
// NAO quebra nada -- conferido: o build corrigido tem
// `index -> Index -> button -> index` e a tela renderiza sem um erro no
// console. Acusar esses derrubaria deploy valido. O que provou ser fatal foi o
// ciclo entre chunks FORCADOS a mao, onde a dependencia de um deles foi parar
// em outro e a ordem de avaliacao deixa de ser satisfazivel.
//
// Deliberadamente tolerante com o ambiente: sem `dist/assets` ele avisa e sai
// com 0, para nao derrubar um deploy por uma diferenca de caminho. Sai com 1
// so quando um ciclo e' de fato detectado.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(AQUI, "..", "dist", "assets");

if (!existsSync(ASSETS)) {
  console.warn(`[verifica-chunks] ${ASSETS} nao encontrado; nada a checar.`);
  process.exit(0);
}

// `manualChunks` nomeia tudo com este prefixo; se ele mudar em
// vite.config.ts, mude aqui tambem.
const PREFIXO_MANUAL = "vendor";

const arquivos = readdirSync(ASSETS)
  .filter((nome) => nome.endsWith(".js"))
  .filter((nome) => nome.startsWith(PREFIXO_MANUAL));

if (arquivos.length === 0) {
  console.warn(
    `[verifica-chunks] nenhum chunk "${PREFIXO_MANUAL}*" em ${ASSETS};` +
      " o prefixo do manualChunks mudou? nada checado.",
  );
  process.exit(0);
}

// Import/export relativo entre chunks: `from"./outro.js"`, `import"./outro.js"`,
// e a forma dinamica `import("./outro.js")`.
const RELATIVO = /["'`]\.\/([A-Za-z0-9_.-]+\.js)["'`]/g;

const grafo = new Map();
for (const nome of arquivos) {
  const codigo = readFileSync(join(ASSETS, nome), "utf8");
  const destinos = new Set();
  for (const achado of codigo.matchAll(RELATIVO)) {
    const alvo = achado[1];
    if (alvo !== nome && arquivos.includes(alvo)) destinos.add(alvo);
  }
  grafo.set(nome, destinos);
}

// DFS com pilha: devolve o primeiro ciclo encontrado, ou null.
function acharCiclo() {
  const VISITANDO = 1;
  const PRONTO = 2;
  const estado = new Map();
  const pilha = [];

  function visita(no) {
    estado.set(no, VISITANDO);
    pilha.push(no);
    for (const proximo of grafo.get(no) ?? []) {
      if (estado.get(proximo) === VISITANDO) {
        return [...pilha.slice(pilha.indexOf(proximo)), proximo];
      }
      if (!estado.has(proximo)) {
        const ciclo = visita(proximo);
        if (ciclo) return ciclo;
      }
    }
    pilha.pop();
    estado.set(no, PRONTO);
    return null;
  }

  for (const no of grafo.keys()) {
    if (!estado.has(no)) {
      const ciclo = visita(no);
      if (ciclo) return ciclo;
    }
  }
  return null;
}

const ciclo = acharCiclo();

if (ciclo) {
  console.error("\n[verifica-chunks] CICLO entre chunks do build:\n");
  console.error("  " + ciclo.join("\n    -> ") + "\n");
  console.error(
    "Um chunk manual so pode existir com TODAS as dependencias dele dentro.\n" +
      "Corrija `manualChunks` em vite.config.ts: ou agrupe a dependencia que\n" +
      "esta faltando, ou pare de separar esse grupo.\n\n" +
      "O build do Vite passa mesmo assim, mas a tela quebra no navegador com\n" +
      "\"Cannot read properties of undefined\" ao ler algo de React.\n",
  );
  process.exit(1);
}

console.log(
  `[verifica-chunks] ${arquivos.length} chunk(s) sem ciclo de importacao.`,
);

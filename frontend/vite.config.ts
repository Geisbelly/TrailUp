import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Framework/libs mudam bem menos que o codigo do app - separar deles
        // deixa o cache do navegador reaproveitavel entre deploys e evita um
        // unico vendor chunk > 500 kB (issue #29).
        //
        // REGRA: um chunk manual so pode ser criado com TODAS as dependencias
        // dele dentro. Senao ele importa o `vendor` generico, o `vendor`
        // importa React de volta, e os dois viram um CICLO -- na producao um
        // avalia antes do outro terminar, React chega como `undefined` e a
        // tela morre com
        //
        //   Uncaught TypeError: Cannot read properties of undefined
        //     (reading 'forwardRef')   at vendor-*.js
        //
        // O console do professor quebrou exatamente assim: `scheduler`
        // (dependencia de react-dom) e `@remix-run/router` (dependencia de
        // react-router) caiam no catch-all, e `vendor-react` importava 15
        // bindings de la.
        manualChunks(id) {
          // Helper de interop CJS do Rollup. E um modulo VIRTUAL, entao nao
          // tem `node_modules` no id e caia na linha de baixo, que devolve
          // undefined e deixa o Rollup escolher -- ele o punha no `vendor`.
          // Como react, react-dom e scheduler sao CommonJS e precisam dele,
          // `vendor-react` voltava a importar do `vendor`: o ciclo sobrevivia
          // reduzido a um unico binding. Ancorar o helper no chunk-folha
          // resolve, e os outros chunks passam a busca-lo aqui (uma direcao).
          if (id.includes("commonjsHelpers")) return "vendor-react";
          if (!id.includes("node_modules")) return undefined;
          // Folha de verdade: react, react-dom e o scheduler que o react-dom
          // exige. Nada aqui importa de fora deste chunk.
          if (id.match(/node_modules\/(react|react-dom|scheduler)\//)) {
            return "vendor-react";
          }
          // O router vai com a propria dependencia, e nao junto do React: ele
          // depende de React (uma direcao so, sem ciclo).
          if (id.includes("react-router") || id.includes("@remix-run/router")) {
            return "vendor-router";
          }
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          return "vendor";
        },
      },
    },
  },
}));

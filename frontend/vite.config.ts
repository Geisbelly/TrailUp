import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { buildRevision, revisionManifest } from "./config/revision";

// O que toda página usa: React, rotas, a camada de consultas e os utilitários pequenos que o app e as
// bibliotecas dividem (`clsx` também é do recharts: sem ele aqui, a landing baixava o `vendor-charts`
// só por causa dele). Fica num pedaço estável, que o navegador reaproveita entre deploys. A lista é
// fechada em dependências (nada aqui importa pacote de fora dela), senão o Rollup forma ciclo.
const NUCLEO =
  /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router|@tanstack\/(react-query|query-core)|clsx|tailwind-merge|class-variance-authority|react-is)\//;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __TRAILUP_VERSAO__: JSON.stringify(buildRevision(process.env).build_commit?.slice(0, 8) ?? null),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), revisionManifest(), mode === "development" && componentTagger()].filter(Boolean),
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
        // `vendor` é só o núcleo que toda página usa. O resto do node_modules fica sem nome (o Rollup o
        // põe junto da tela que o importa) ou ganha pedaço próprio. Antes, tudo caía em `vendor`, e o
        // MathJax com a fonte (4 MB), o pdf.js, o markdown e o Prism desciam em toda página, até na
        // landing, apesar dos `import()` dinâmicos: `manualChunks` vence a divisão do `import()`.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          // O mathjs (spec B) só carrega quando o professor abre um gabarito de numérica ou expressão
          // (`import()` em conferenciaNoConsole.ts). No `vendor` ele iria para toda página.
          if (/node_modules\/(mathjs|complex\.js|decimal\.js|fraction\.js|typed-function|escape-latex|javascript-natural-sort|seedrandom|tiny-emitter)\//.test(id)) {
            return "vendor-mathjs";
          }
          // MathJax: motor, TeX e mhchem num pedaço, baixado na primeira fórmula (`formulaParaSvg.ts`).
          // As faixas da fonte (`svg/dynamic/*`) ficam sem nome: cada uma vira um pedaço e só desce
          // quando a fórmula pede aquela faixa.
          if (id.includes("/@mathjax/")) return id.includes("/svg/dynamic/") ? undefined : "vendor-mathjax";
          if (id.includes("/node_modules/prismjs/")) return "vendor-prism";
          // Markdown (texto rico e material personalizado): as dependências do react-markdown e dos
          // plugins vêm junto, porque o `manualChunks` puxa para o pedaço o que o módulo importa.
          if (/node_modules\/(react-markdown|remark-gfm|remark-math)\//.test(id)) return "vendor-markdown";
          if (NUCLEO.test(id)) return "vendor";
          return undefined;
        },
      },
    },
  },
}));

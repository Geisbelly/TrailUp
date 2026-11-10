import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { buildRevision, revisionManifest } from "./config/revision";

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
          return "vendor";
        },
      },
    },
  },
}));

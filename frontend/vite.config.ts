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
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router") || id.match(/node_modules\/(react|react-dom)\//)) {
            return "vendor-react";
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

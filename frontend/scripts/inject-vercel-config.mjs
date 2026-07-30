import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Preenche o destino do rewrite /trailup-api em vercel.json a partir da env var
// API_PROXY_TARGET (configurada no dashboard da Vercel), para nao commitar a URL
// do backend (Traefik/Coolify) direto no repo.
const target = String(process.env.API_PROXY_TARGET ?? "")
  .trim()
  .replace(/\/+$/, "");

const configPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "vercel.json"
);

if (!target) {
  console.warn(
    "[vercel.json] API_PROXY_TARGET nao definida — mantendo vercel.json como esta " +
      "(normal em build local; defina a env var no projeto da Vercel para deploy)."
  );
  process.exit(0);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const rewrite = config.rewrites?.find((r) => r.source === "/trailup-api/:path*");

if (!rewrite) {
  throw new Error("[vercel.json] rewrite de /trailup-api nao encontrado — verifique o arquivo.");
}

rewrite.destination = `${target}/:path*`;
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[vercel.json] /trailup-api agora aponta para ${target}`);

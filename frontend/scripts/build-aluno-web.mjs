#!/usr/bin/env node
// Gera o app do aluno (Expo, em ../mobile) em modo web e coloca o resultado em
// dist/aluno, para a Vercel servir em trailup.vercel.app/aluno junto do site.
//
// Roda depois do `vite build` (script `build:vercel`). Variaveis:
// - EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY /
//   EXPO_PUBLIC_APITRAIUP_URL: se nao vierem definidas, usam as VITE_* que o
//   projeto da Vercel ja tem (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
//   VITE_APITRAIUP_URL). Nenhum valor e impresso.
// - ALUNO_WEB_SKIP=1 pula o app do aluno (so o site e gerado).
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileDir = resolve(frontendDir, "..", "mobile");
const outDir = resolve(frontendDir, "dist", "aluno");
const BASE_URL = "/aluno";

if (process.env.ALUNO_WEB_SKIP === "1") {
  console.log("[aluno-web] ALUNO_WEB_SKIP=1: app do aluno nao gerado.");
  process.exit(0);
}

if (!existsSync(resolve(mobileDir, "package.json"))) {
  console.error(
    `[aluno-web] ${mobileDir} nao existe. Na Vercel, o Root Directory e "frontend": ` +
      'ative "Include files outside of the Root Directory in the Build Step" ' +
      "(Settings > Build and Deployment > Root Directory).",
  );
  process.exit(1);
}

const env = { ...process.env };
const mapa = {
  EXPO_PUBLIC_SUPABASE_URL: "VITE_SUPABASE_URL",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "VITE_SUPABASE_PUBLISHABLE_KEY",
  EXPO_PUBLIC_APITRAIUP_URL: "VITE_APITRAIUP_URL",
};
for (const [expo, vite] of Object.entries(mapa)) {
  if (!env[expo] && env[vite]) {
    env[expo] = env[vite];
    console.log(`[aluno-web] ${expo} <- ${vite}`);
  }
}

// Na Vercel nao existe mobile/.env: sem Supabase o app abre e nao loga ninguem,
// sem erro visivel. Melhor o deploy falhar aqui.
const obrigatorias = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
const faltando = obrigatorias.filter((nome) => !env[nome]);
if (faltando.length && (env.VERCEL || env.CI)) {
  console.error(
    `[aluno-web] Faltam variaveis: ${faltando.join(", ")} ` +
      `(ou as VITE_* equivalentes: ${faltando.map((n) => mapa[n]).join(", ")}).`,
  );
  process.exit(1);
}
if (!env.EXPO_PUBLIC_APITRAIUP_URL) {
  console.warn("[aluno-web] EXPO_PUBLIC_APITRAIUP_URL ausente: o app usa so o proxy /trailup-api.");
}

function run(cmd, args, cwd) {
  console.log(`[aluno-web] $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`[aluno-web] falhou: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(resolve(mobileDir, "node_modules", "expo")) || env.VERCEL) {
  // devDependencies (eas-cli, eslint, tsx...) nao entram no export web.
  run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], mobileDir);
}

env.EXPO_WEB_BASE_URL = BASE_URL;
env.EXPO_WEB_OUTPUT = "single";
env.CI = "1"; // sem prompts nem watch

rmSync(outDir, { recursive: true, force: true });
run("npx", ["expo", "export", "--platform", "web", "--output-dir", outDir, "--clear"], mobileDir);

if (!existsSync(resolve(outDir, "index.html"))) {
  console.error("[aluno-web] export terminou sem dist/aluno/index.html");
  process.exit(1);
}
console.log(`[aluno-web] app do aluno pronto em dist/aluno (${BASE_URL}).`);

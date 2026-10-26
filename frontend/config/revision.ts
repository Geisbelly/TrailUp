import type { Plugin } from "vite";

export function buildRevision(environment: NodeJS.ProcessEnv) {
  // Uma configuração explícita inválida não é ocultada pelo fallback da Vercel.
  const value = (environment.TRAILUP_BUILD_COMMIT ?? environment.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  return {
    service: "frontend",
    build_commit: /^[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null,
  };
}

export function revisionManifest(): Plugin {
  return {
    name: "trailup-build-revision",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(buildRevision(process.env)) + "\n",
      });
    },
  };
}

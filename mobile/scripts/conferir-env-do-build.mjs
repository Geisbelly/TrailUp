#!/usr/bin/env node
// Roda no `eas-build-post-install`: as EAS Environment Variables já estão no ambiente, e o
// build ainda não começou a compilar. Já foi `eas-build-pre-install`, e todo build EAS
// quebrava ali: antes do `npm ci` não existe `tsx`, e o Node do EAS (20) não importa `.ts`
// sozinho (`ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`).
//
// A regra mora em `src/utils/envDoBuild.ts`, que tem teste. Aqui só se lê o ambiente e se
// decide o código de saída.
import { conferirEnvDoBuild, mensagemDaConferencia } from "../src/utils/envDoBuild.ts";

const conferencia = conferirEnvDoBuild(process.env);
const mensagem = mensagemDaConferencia(conferencia);

if (conferencia.ok) {
  console.log(mensagem);
  process.exit(0);
}

console.error(mensagem);
process.exit(1);

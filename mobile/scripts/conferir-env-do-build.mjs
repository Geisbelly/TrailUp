#!/usr/bin/env node
// Roda no `eas-build-pre-install`, antes de instalar dependência: as EAS Environment
// Variables já estão no ambiente, e o build ainda não gastou tempo nenhum.
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

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  CONTENT_ENRICHMENT_PROVIDER,
  MEDIA_PIPELINE_VERSION,
  PRESENTATION_DESIGN_VERSION,
  PRESENTATION_ENGINE_VERSION,
} from "./pipelineVersions";

// A API (Python) guarda a MESMA lista de versoes em
// api/app/services/media_contract.py e compara com a resposta de /api/health
// deste microservice antes de iniciar qualquer geracao
// (brainhex_contract_ready, em api/app/services/media_agents.py).
//
// Divergiu, nao gera - e o modo de falha e SILENCIOSO: a checagem so loga um
// warning e devolve False, o job fica "pending" com reason
// "microservice_midia_incompativel_ou_indisponivel" e o professor nao ve erro
// nenhum, so nada acontecendo. Ja aconteceu em producao ao subir a versao de um
// lado so. Este teste existe pra que isso quebre aqui, na hora, em vez de la.

const CAMINHOS_CANDIDATOS = [
  path.resolve(process.cwd(), "../api/app/services/media_contract.py"),
  path.resolve(process.cwd(), "api/app/services/media_contract.py"),
  path.resolve(__dirname, "../../../api/app/services/media_contract.py"),
];

function lerContratoPython(): string | null {
  for (const caminho of CAMINHOS_CANDIDATOS) {
    try {
      return fs.readFileSync(caminho, "utf-8");
    } catch {
      // tenta o proximo caminho
    }
  }
  return null;
}

function constantePython(fonte: string, nome: string): string | null {
  const match = fonte.match(new RegExp(`^${nome}\\s*=\\s*["']([^"']+)["']`, "m"));
  return match ? match[1] : null;
}

test("as versoes do contrato batem com as da API (divergir para a geracao em silencio)", () => {
  const fonte = lerContratoPython();
  assert.ok(
    fonte,
    `media_contract.py da API nao encontrado. Procurado em:\n${CAMINHOS_CANDIDATOS.join("\n")}`,
  );

  const esperado: Record<string, string> = {
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_ENGINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    CONTENT_ENRICHMENT_PROVIDER,
  };

  for (const [nome, valorTs] of Object.entries(esperado)) {
    const valorPy = constantePython(fonte!, nome);
    assert.ok(valorPy, `${nome} nao encontrado em api/app/services/media_contract.py`);
    assert.equal(
      valorPy,
      valorTs,
      `${nome} divergente: microservice="${valorTs}" e API="${valorPy}". ` +
        "Suba os dois juntos - com valores diferentes a API recusa gerar e nao reporta erro.",
    );
  }
});

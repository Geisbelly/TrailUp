import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ETAPAS_DO_ROTEIRO } from "./roteiroDaPesquisa";

// O Guia e a Lumi de quem avalia o TrailUp leem o roteiro de uma cópia na API
// (`api/app/agent/prompts/pesquisa_roteiro.json`, `app/services/avaliacao_trailup.py`).
// Mudou uma etapa ou uma tarefa aqui, gere a cópia de novo: este teste falha se elas se separarem.
const COPIA = resolve(__dirname, "../../../../api/app/agent/prompts/pesquisa_roteiro.json");

describe("cópia do roteiro na API", () => {
  it("é igual ao roteiro do console", () => {
    const daApi = JSON.parse(readFileSync(COPIA, "utf-8"));
    const doConsole = ETAPAS_DO_ROTEIRO.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      onde: e.onde,
      passos: e.passos,
      observar: e.observar ?? null,
      tarefa: e.tarefa ?? null,
    }));
    expect(daApi).toEqual(doConsole);
  });
});
